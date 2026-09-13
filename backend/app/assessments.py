"""Instructor-authored assessments: pure grading + PDF question-bank parsing.

Kept dependency-light and side-effect-free so it's easy to unit test; HTTP +
Mongo wiring lives in main.py, PDF text extraction uses pypdf at the call site.
"""

import re
import uuid

_Q_START_RE = re.compile(r"^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[\.\):]\s*(.*)$", re.IGNORECASE)
_OPTION_RE = re.compile(r"^\(?([A-Da-d])\)?[\.\):]\s*(.+)$")
_ANSWER_RE = re.compile(r"^\s*(?:Ans(?:wer)?|Correct(?:\s*Answer)?)\s*[:\-]\s*\(?([A-Da-d])\)?", re.IGNORECASE)


def new_question_id() -> str:
    return uuid.uuid4().hex[:10]


def grade_assessment(questions: list[dict], answers: dict[str, int]) -> tuple[int, int, list[dict]]:
    """Grade one attempt against a stored answer key. Returns (correct, total, per-question results)."""
    correct = 0
    results: list[dict] = []
    for question in questions:
        raw = answers.get(question["id"])
        picked = raw if isinstance(raw, int) and 0 <= raw < len(question["options"]) else None
        ok = picked is not None and picked == question["answer"]
        if ok:
            correct += 1
        results.append(
            {
                "id": question["id"],
                "tag": question.get("tag", "General"),
                "question": question["question"],
                "options": question["options"],
                "your_option": picked,
                "correct_option": question["answer"],
                "is_correct": ok,
                "answered": picked is not None,
                "explanation": question.get("explanation", ""),
            }
        )
    return correct, len(questions), results


def parse_questions_from_text(text: str) -> tuple[list[dict], list[str]]:
    """Best-effort heuristic parser for a plain-text question dump (typically
    extracted from an instructor's PDF). Expects roughly:

        1. What does a Hadamard gate do?
        A) Flips the qubit
        B) Creates superposition
        C) Measures the qubit
        D) Does nothing
        Answer: B

    Numbering, "Q1"/"Question 1" prefixes, and A)/A./(A) option styles are
    all accepted. Anything that can't be confidently parsed is skipped and
    reported in the returned warnings so the instructor can review or add it
    by hand before publishing — nothing is silently guessed past a clearly
    flagged default.
    """
    warnings: list[str] = []
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if _Q_START_RE.match(line):
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            current.append(line)
    if current:
        blocks.append(current)

    questions: list[dict] = []
    for block in blocks:
        start = _Q_START_RE.match(block[0])
        question_text = (start.group(2).strip() if start else block[0].strip())
        options: list[str] = []
        answer_letter: str | None = None

        for line in block[1:]:
            option_match = _OPTION_RE.match(line)
            answer_match = _ANSWER_RE.match(line)
            if answer_match:
                answer_letter = answer_match.group(1).upper()
            elif option_match:
                options.append(option_match.group(2).strip())
            elif not options:
                # Continuation of a multi-line question, before any options appear.
                question_text = f"{question_text} {line}".strip()

        preview = question_text[:70] + ("…" if len(question_text) > 70 else "")
        if len(options) < 2:
            warnings.append(f'Skipped "{preview}" — fewer than 2 options were detected.')
            continue

        if answer_letter is None:
            warnings.append(f'"{preview}" has no "Answer: X" line — defaulted to option A. Please review before publishing.')
            answer_index = 0
        else:
            answer_index = ord(answer_letter) - ord("A")
            if answer_index >= len(options):
                warnings.append(f'"{preview}" — answer letter is out of range for its options — defaulted to option A. Please review.')
                answer_index = 0

        questions.append(
            {
                "question": question_text,
                "options": options[:6],
                "answer": answer_index,
                "tag": "General",
                "explanation": "",
            }
        )

    if not questions:
        warnings.append(
            'No numbered questions were detected. Use the format "1. Question text" followed by '
            '"A) option" lines and an "Answer: B" line, one question per block.'
        )

    return questions, warnings
