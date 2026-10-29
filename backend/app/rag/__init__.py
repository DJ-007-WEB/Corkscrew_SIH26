"""RAG (Retrieval-Augmented Generation) package for QuantumLab Corkscrew.

Provides syllabus-grounded retrieval from the 7 curated quantum curriculum modules,
pairing verified Qiskit simulation facts with formal pedagogy, analogies, and misconceptions.
"""

from .retriever import retrieve_curriculum, get_curriculum_index

__all__ = ["retrieve_curriculum", "get_curriculum_index"]
