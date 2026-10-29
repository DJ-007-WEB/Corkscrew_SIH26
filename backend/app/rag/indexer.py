"""Indexes the platform's 7 structured curriculum modules for RAG retrieval."""

from dataclasses import dataclass, field
import glob
import json
import logging
import os
from pathlib import Path
import re
from typing import Any

logger = logging.getLogger("quantum_rag")


@dataclass
class CurriculumChunk:
    chunk_id: str
    module_title: str
    subtopic_id: str
    concept: str
    concept_id: str
    core_explanation: str
    analogy: str
    mathematical_representation: str
    misconceptions: list[str] = field(default_factory=list)
    learning_objectives: list[str] = field(default_factory=list)
    skills_tagged: list[str] = field(default_factory=list)
    keywords: set[str] = field(default_factory=set)

    @property
    def searchable_text(self) -> str:
        parts = [
            self.module_title,
            self.subtopic_id,
            self.concept,
            self.concept_id,
            " ".join(self.skills_tagged),
            " ".join(self.learning_objectives),
            self.core_explanation,
            self.analogy,
            self.mathematical_representation,
            " ".join(self.misconceptions),
        ]
        return " ".join(p for p in parts if p)

    @property
    def pedagogical_snippet(self) -> str:
        """Concise pedagogical block formatted for LLM context injection."""
        lines = [
            f"**{self.module_title} — Subtopic {self.subtopic_id}: {self.concept}**",
        ]
        if self.core_explanation:
            # First 2 sentences or 350 chars of core explanation
            short_core = self.core_explanation.strip()
            if len(short_core) > 400:
                short_core = short_core[:400].rsplit(".", 1)[0] + "."
            lines.append(f"• Core Concept: {short_core}")
        if self.analogy:
            short_analogy = self.analogy.strip()
            if len(short_analogy) > 250:
                short_analogy = short_analogy[:250].rsplit(".", 1)[0] + "."
            lines.append(f"• Intuition Analogy: {short_analogy}")
        if self.mathematical_representation:
            math_line = self.mathematical_representation.replace("\n", "; ")
            if len(math_line) > 180:
                math_line = math_line[:180] + "..."
            lines.append(f"• Math Formulation: {math_line}")
        if self.misconceptions:
            lines.append(f"• Common Trap: {self.misconceptions[0]}")
        return "\n".join(lines)


def _tokenize(text: str) -> list[str]:
    """Tokenize and normalize text for lexical indexing."""
    cleaned = re.sub(r"[^a-zA-Z0-9_\-\+]", " ", text.lower())
    tokens = [t.strip() for t in cleaned.split() if len(t.strip()) > 1]
    return tokens


def find_modules_dir() -> Path:
    """Locate frontend/modules across common execution contexts."""
    env_path = os.getenv("MODULES_DIR")
    if env_path and Path(env_path).is_dir():
        return Path(env_path)

    # 1. Relative to this file: backend/app/rag/indexer.py -> repo root -> frontend/modules
    repo_root = Path(__file__).resolve().parent.parent.parent.parent
    candidate = repo_root / "frontend" / "modules"
    if candidate.is_dir():
        return candidate

    # 2. Current working directory checks
    cwd = Path.cwd()
    for cand in [cwd / "frontend" / "modules", cwd / "modules", cwd.parent / "frontend" / "modules"]:
        if cand.is_dir():
            return cand

    raise FileNotFoundError("Could not find frontend/modules directory for curriculum RAG indexing.")


def load_curriculum_chunks() -> list[CurriculumChunk]:
    """Parse all 7 curriculum module JSON files into structured chunks."""
    modules_dir = find_modules_dir()
    json_files = sorted(glob.glob(str(modules_dir / "module*.json")))
    if not json_files:
        logger.warning("No module JSON files found in %s", modules_dir)
        return []

    chunks: list[CurriculumChunk] = []
    for fpath in json_files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data: dict[str, Any] = json.load(f)
        except Exception as exc:
            logger.error("Failed to read curriculum file %s: %s", fpath, exc)
            continue

        module_title = data.get("MODULE", "").strip() or Path(fpath).stem
        # Extract module number if available (e.g., "Module 7")
        mod_num_match = re.search(r"Module\s*(\d+)", module_title, re.IGNORECASE)
        default_mod_num = mod_num_match.group(1) if mod_num_match else "1"

        items = data.get("SUBTOPICS") or data.get("CONCEPTS") or []
        for idx, item in enumerate(items, start=1):
            subtopic_id = str(item.get("SUBTOPIC_ID") or f"{default_mod_num}.{idx}").strip()
            if subtopic_id == "None":
                subtopic_id = f"{default_mod_num}.{idx}"

            concept = str(item.get("CONCEPT") or item.get("NAME") or "Quantum Concept").strip()
            concept_id = str(item.get("CONCEPT_ID") or f"C_{subtopic_id.replace('.', '_')}").strip()
            core_explanation = str(item.get("CORE_EXPLANATION") or "").strip()
            analogy = str(item.get("INTUITION_ANALOGY") or "").strip()
            mathematical_representation = str(item.get("MATHEMATICAL_REPRESENTATION") or "").strip()

            misconceptions_raw = item.get("COMMON_MISCONCEPTIONS", [])
            misconceptions: list[str] = []
            if isinstance(misconceptions_raw, list):
                for m in misconceptions_raw:
                    if isinstance(m, str):
                        misconceptions.append(m.strip())
                    elif isinstance(m, dict):
                        misconceptions.append(m.get("MISCONCEPTION") or m.get("text") or str(m))
            elif isinstance(misconceptions_raw, str):
                misconceptions.append(misconceptions_raw.strip())

            learning_objectives = [str(x).strip() for x in item.get("LEARNING_OBJECTIVES", []) if str(x).strip()]
            skills_tagged = [str(x).strip() for x in item.get("SKILLS_TAGGED", []) if str(x).strip()]

            chunk_id = f"{subtopic_id}_{concept_id}"
            chunk = CurriculumChunk(
                chunk_id=chunk_id,
                module_title=module_title,
                subtopic_id=subtopic_id,
                concept=concept,
                concept_id=concept_id,
                core_explanation=core_explanation,
                analogy=analogy,
                mathematical_representation=mathematical_representation,
                misconceptions=misconceptions,
                learning_objectives=learning_objectives,
                skills_tagged=skills_tagged,
                keywords=set(_tokenize(f"{module_title} {concept} {concept_id} {' '.join(skills_tagged)}")),
            )
            chunks.append(chunk)

    logger.info("Successfully indexed %d curriculum chunks for RAG from %s", len(chunks), modules_dir)
    return chunks
