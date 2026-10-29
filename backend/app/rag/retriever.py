"""Hybrid RAG retriever combining quantum domain BM25/lexical matching with optional semantic embeddings."""

from collections import Counter
from dataclasses import dataclass
import math
import os
import re
import time
from typing import Any, Optional

import requests

from .indexer import CurriculumChunk, _tokenize, load_curriculum_chunks

# Domain synonym & concept expansion map for quantum queries
_CONCEPT_SYNONYMS: dict[str, list[str]] = {
    "bloch": ["bloch sphere", "sphere", "pole", "equator", "rotations", "state vector"],
    "bell": ["bell state", "entanglement", "epr", "maximally entangled", "cnot"],
    "entangle": ["entanglement", "bell states", "tensor product", "non-separable"],
    "cnot": ["two-qubit gates", "controlled-not", "cx", "entanglement"],
    "hadamard": ["superposition", "h gate", "basis change", "standard gate"],
    "superposition": ["hadamard", "linear combination", "state vector", "basis"],
    "phase": ["relative phase", "global phase", "phase kickback", "s gate", "t gate"],
    "grover": ["grover search", "amplitude amplification", "oracle", "unstructured search"],
    "deutsch": ["deutsch-jozsa", "oracle", "constant", "balanced", "quantum parallelism"],
    "teleport": ["teleportation", "superdense coding", "bell state", "entanglement"],
    "noise": ["decoherence", "relaxation", "t1", "t2", "nisq", "error mitigation"],
    "decoherence": ["noise", "t1", "t2", "relaxation", "pure state", "mixed"],
    "qft": ["quantum fourier transform", "fourier", "phase estimation"],
    "measurement": ["probabilities", "collapse", "born rule", "computational basis"],
    "basis": ["computational basis", "hadamard basis", "x basis", "z basis"],
}

# Focus tag boosts to directly align with user interface buttons
_FOCUS_BOOSTS: dict[str, list[str]] = {
    "bloch": ["2.3", "2.4", "2.1"],
    "q_sphere": ["2.2", "2.3", "4.1"],
    "gate": ["3.2", "3.3", "2.4", "4.2"],
    "bell": ["4.3", "4.4", "4.2"],
    "deutsch": ["6.2", "6.1"],
    "grover": ["6.4", "6.1"],
    "teleport": ["5.3", "4.3"],
    "circuit": ["3.1", "3.4", "4.4"],
}


@dataclass
class RetrievedSource:
    module_title: str
    subtopic_id: str
    concept: str
    concept_id: str
    snippet: str
    score: float


class CurriculumIndex:
    """In-memory inverted index and BM25 scorer over quantum curriculum chunks."""

    def __init__(self, chunks: list[CurriculumChunk]):
        self.chunks = chunks
        self.doc_count = len(chunks)
        self.doc_tokens: list[list[str]] = []
        self.doc_lens: list[int] = []
        self.df: Counter[str] = Counter()
        self.avg_doc_len: float = 1.0

        for chunk in self.chunks:
            tokens = _tokenize(chunk.searchable_text)
            self.doc_tokens.append(tokens)
            self.doc_lens.append(len(tokens))
            unique_tokens = set(tokens)
            for token in unique_tokens:
                self.df[token] += 1

        if self.doc_lens:
            self.avg_doc_len = sum(self.doc_lens) / max(1, len(self.doc_lens))

    def bm25_score(self, query_tokens: list[str], doc_idx: int, k1: float = 1.5, b: float = 0.75) -> float:
        """Standard BM25 relevance score."""
        score = 0.0
        doc_tokens = self.doc_tokens[doc_idx]
        doc_len = self.doc_lens[doc_idx]
        tf_counter = Counter(doc_tokens)

        for token in query_tokens:
            tf = tf_counter.get(token, 0)
            if tf == 0:
                continue
            df_val = self.df.get(token, 0)
            # Standard smoothed IDF
            idf = math.log(1.0 + (self.doc_count - df_val + 0.5) / (df_val + 0.5))
            numerator = tf * (k1 + 1.0)
            denominator = tf + k1 * (1.0 - b + b * (doc_len / self.avg_doc_len))
            score += idf * (numerator / denominator)

        return score

    def retrieve(
        self,
        query: str,
        focus: Optional[str] = None,
        circuit_gates: Optional[list[str]] = None,
        top_k: int = 2,
    ) -> list[RetrievedSource]:
        if not self.chunks:
            return []

        # 1. Expand query tokens with quantum domain synonyms
        raw_tokens = _tokenize(query)
        expanded_tokens = list(raw_tokens)
        query_lower = query.lower()

        for term, synonyms in _CONCEPT_SYNONYMS.items():
            if term in query_lower:
                for syn in synonyms:
                    expanded_tokens.extend(_tokenize(syn))

        # Add circuit gate signals if present
        if circuit_gates:
            for g in circuit_gates:
                g_upper = g.upper()
                if g_upper == "H":
                    expanded_tokens.extend(["hadamard", "superposition"])
                elif g_upper in ("CNOT", "CX"):
                    expanded_tokens.extend(["cnot", "entanglement", "bell"])
                elif g_upper in ("X", "Y", "Z"):
                    expanded_tokens.extend(["pauli", "rotations", "standard"])
                elif g_upper in ("S", "T"):
                    expanded_tokens.extend(["phase", "rotations"])

        scored: list[tuple[float, int]] = []
        for i, chunk in enumerate(self.chunks):
            base_score = self.bm25_score(expanded_tokens, i)

            # Boost if subtopic matches query directly (e.g. user mentions "Module 4" or "3.2")
            if chunk.subtopic_id in query:
                base_score += 4.0
            if chunk.concept.lower() in query_lower:
                base_score += 5.0

            # Boost if UI focus corresponds to this chunk
            if focus and focus in _FOCUS_BOOSTS:
                boosted_ids = _FOCUS_BOOSTS[focus]
                if chunk.subtopic_id in boosted_ids:
                    rank_idx = boosted_ids.index(chunk.subtopic_id)
                    base_score += max(1.5, 4.0 - rank_idx * 1.0)

            scored.append((base_score, i))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Select top_k with positive score
        results: list[RetrievedSource] = []
        for score, idx in scored[:top_k]:
            if score <= 0.05:
                continue
            chunk = self.chunks[idx]
            results.append(
                RetrievedSource(
                    module_title=chunk.module_title,
                    subtopic_id=chunk.subtopic_id,
                    concept=chunk.concept,
                    concept_id=chunk.concept_id,
                    snippet=chunk.pedagogical_snippet,
                    score=round(score, 3),
                )
            )

        return results


# Global cached index instance
_GLOBAL_INDEX: Optional[CurriculumIndex] = None


def get_curriculum_index() -> CurriculumIndex:
    global _GLOBAL_INDEX
    if _GLOBAL_INDEX is None:
        chunks = load_curriculum_chunks()
        _GLOBAL_INDEX = CurriculumIndex(chunks)
    return _GLOBAL_INDEX


def retrieve_curriculum(
    query: str,
    focus: Optional[str] = None,
    circuit: Optional[Any] = None,
    top_k: int = 2,
) -> list[RetrievedSource]:
    """Retrieve the top matching curriculum chunks for a student query."""
    index = get_curriculum_index()
    gates: list[str] = []
    if circuit is not None and hasattr(circuit, "gates") and circuit.gates:
        gates = [getattr(g, "type", "") for g in circuit.gates if getattr(g, "type", "")]

    return index.retrieve(query, focus=focus, circuit_gates=gates, top_k=top_k)
