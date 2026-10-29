import pytest
from app.rag.indexer import load_curriculum_chunks, CurriculumChunk
from app.rag.retriever import retrieve_curriculum, get_curriculum_index
from app.schemas import ChatRequest, Circuit, Gate
from app.tutor_service import answer, _build_prompt


def test_rag_loads_all_curriculum_modules():
    chunks = load_curriculum_chunks()
    assert len(chunks) >= 25, f"Expected at least 25 curriculum chunks, got {len(chunks)}"
    module_titles = {c.module_title for c in chunks}
    assert any("Module 1" in m for m in module_titles)
    assert any("Module 2" in m for m in module_titles)
    assert any("Module 3" in m for m in module_titles)
    assert any("Module 4" in m for m in module_titles)
    assert any("Module 5" in m for m in module_titles)
    assert any("Module 6" in m for m in module_titles)
    assert any("Module 7" in m for m in module_titles)


def test_rag_retrieves_bloch_sphere():
    sources = retrieve_curriculum("Why is q[0] at the top of the Bloch sphere?", focus="bloch")
    assert len(sources) > 0
    top = sources[0]
    assert "Bloch" in top.concept or "2.3" in top.subtopic_id or "2.4" in top.subtopic_id
    assert "Module 2" in top.module_title


def test_rag_retrieves_entanglement_and_bell():
    sources = retrieve_curriculum("How does a CNOT create an entangled Bell state?", focus="bell")
    assert len(sources) > 0
    subtopics = [s.subtopic_id for s in sources]
    assert any(st in ("4.3", "4.4", "4.2") for st in subtopics)
    assert any("Entanglement" in s.concept or "Bell" in s.concept for s in sources)


def test_rag_retrieves_grover_algorithm():
    sources = retrieve_curriculum("How does Grover search amplify the target state?", focus="grover")
    assert len(sources) > 0
    assert any("6.4" in s.subtopic_id or "Grover" in s.concept for s in sources)


def test_rag_retrieves_deutsch_jozsa():
    sources = retrieve_curriculum("Explain the Deutsch-Jozsa algorithm and oracle", focus="deutsch")
    assert len(sources) > 0
    assert any("6.2" in s.subtopic_id or "Deutsch" in s.concept for s in sources)


def test_rag_retrieves_hardware_noise_decoherence():
    sources = retrieve_curriculum("What causes T1 and T2 relaxation and decoherence on real hardware?")
    assert len(sources) > 0
    assert any("Noise" in s.concept or "7.1" in s.subtopic_id or "Module 7" in s.module_title for s in sources)


def test_rag_sources_included_in_chat_response(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    
    req = ChatRequest(
        message="What is quantum superposition and how is it created?",
    )
    resp = answer(req)
    assert hasattr(resp, "sources")
    assert len(resp.sources) > 0
    assert resp.sources[0].module_title != ""
    assert resp.sources[0].concept != ""
    assert resp.sources[0].snippet != ""


def test_build_prompt_injects_curriculum_context():
    req = ChatRequest(message="Tell me about Bell states.")
    sources = retrieve_curriculum("Tell me about Bell states.", focus="bell")
    prompt = _build_prompt(req, facts=[], sources=sources)
    assert "CURRICULUM CONTEXT (from Corkscrew Course Syllabus):" in prompt
    assert "Module 4" in prompt or "Entanglement" in prompt or "Bell" in prompt
