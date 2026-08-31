import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askTutor } from "./api";
import type { ChatMessage, Circuit } from "./types";

interface Props {
  circuit: Circuit;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
}

export default function QuantumTutor({ circuit, isOpen, onToggle }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [conversationId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, isOpen]);

  async function send(preset?: string, focus?: string) {
    const question = preset ?? input.trim();
    if (!question || loading) return;
    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const response = await askTutor(question, circuit, messages, conversationId, focus);
      setMessages([...next, { role: "assistant", content: response.answer }]);
      setRecommendation(response.recommendation ?? null);
    } catch {
      setMessages([...next, { role: "assistant", content: "I could not reach the tutor service. Please ensure the FastAPI backend is running and try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setMessages([]);
    setRecommendation(null);
  }

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => onToggle(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full font-mono text-xs font-semibold shadow-2xl transition-all duration-300 hover:scale-105 group border border-[var(--bp-cyan)]/50 cursor-pointer"
          style={{ background: "var(--bp-panel)", color: "var(--bp-text)", boxShadow: "0 0 24px rgba(79, 216, 240, 0.25), 0 8px 32px rgba(8, 21, 39, 0.6)" }}
          title="Open Quantum Tutor"
        >
          <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--bp-cyan)] opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--bp-cyan)]" /></span>
          <span className="flex items-center gap-1.5 text-[var(--bp-text)] group-hover:text-[var(--bp-cyan)] transition-colors"><span className="text-sm">⚡</span><span>Quantum Tutor</span></span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bp-cyan-dim)] text-[var(--bp-cyan)] border border-[var(--bp-cyan)]/30 font-mono">{circuit.qubits}Q</span>
        </button>
      )}

      {isOpen && (
        <aside
          className="flex flex-col border-l border-[var(--bp-border-strong)] shadow-2xl overflow-hidden h-full"
          style={{ background: "var(--bp-panel)", boxShadow: "-18px 0 45px rgba(8, 21, 39, 0.55), -2px 0 18px rgba(79, 216, 240, 0.10)", minWidth: "min(440px, 92vw)", maxWidth: "min(440px, 92vw)" }}
          role="dialog"
          aria-label="Quantum Tutor"
        >
            <div className="px-4 py-3 border-b border-[var(--bp-border)] flex items-center justify-between bg-[var(--bp-panel-raised)] shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-base">⚡</span>
                <div>
                  <div className="flex items-center gap-2"><p className="font-mono text-sm font-semibold text-[var(--bp-cyan)]">Quantum Tutor</p><span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[var(--bp-mint)]/15 text-[var(--bp-mint)] border border-[var(--bp-mint)]/30">Qiskit Verified</span></div>
                  <p className="text-[10px] text-[var(--bp-text-faint)]">Circuit context: {circuit.qubits} qubit{circuit.qubits > 1 ? "s" : ""} · {circuit.gates.length} gate{circuit.gates.length !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {messages.length > 0 && <button type="button" onClick={clearHistory} className="px-2 py-1 text-[10px] font-mono text-[var(--bp-text-faint)] hover:text-[var(--bp-text)] rounded border border-transparent hover:border-[var(--bp-border)] transition-colors cursor-pointer">↺ Clear</button>}
                <button type="button" onClick={() => onToggle(false)} className="w-7 h-7 flex items-center justify-center text-sm font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)] rounded hover:bg-[var(--bp-border)]/50 transition-colors cursor-pointer" title="Close tutor">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bp-scrollbar">
              {!messages.length && (
                <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-3 my-auto">
                  <div className="w-10 h-10 rounded-full bg-[var(--bp-cyan-dim)] flex items-center justify-center text-lg text-[var(--bp-cyan)] border border-[var(--bp-cyan)]/30">⚛</div>
                  <div><p className="text-sm font-medium text-[var(--bp-text)]">Ask the Quantum Tutor</p><p className="text-xs text-[var(--bp-text-dim)] mt-1 max-w-xs">Ask about quantum states, Bloch sphere poles, Q-Sphere phases, or circuit gates. Every circuit calculation is mathematically verified by Qiskit.</p></div>
                  <div className="w-full pt-2 space-y-1.5 text-left">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--bp-text-faint)]">Suggested starters:</p>
                    <button type="button" onClick={() => void send("Why is q[0] at the top of the Bloch sphere?", "bloch")} className="w-full text-left p-2 rounded border border-[var(--bp-border)] text-xs text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] transition-colors bg-[var(--bp-panel-raised)]/50 cursor-pointer">→ Why is q[0] at the top of the Bloch sphere?</button>
                    <button type="button" onClick={() => void send("Explain the Q-Sphere points and phases for this circuit.", "q_sphere")} className="w-full text-left p-2 rounded border border-[var(--bp-border)] text-xs text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] transition-colors bg-[var(--bp-panel-raised)]/50 cursor-pointer">→ Explain the Q-Sphere points and phases</button>
                    <button type="button" onClick={() => void send("What does superposition mean in quantum mechanics?")} className="w-full text-left p-2 rounded border border-[var(--bp-border)] text-xs text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] transition-colors bg-[var(--bp-panel-raised)]/50 cursor-pointer">→ What does superposition mean?</button>
                  </div>
                </div>
              )}
              {messages.map((message, index) => (
                <div key={index} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--bp-text-faint)]">
                      {message.role === "user" ? "You" : "Quantum AI Tutor · Qiskit"}
                    </span>
                  </div>
                  {message.role === "user" ? (
                    <div className="rounded-lg p-3 text-xs sm:text-sm leading-relaxed max-w-[90%] whitespace-pre-wrap bg-[var(--bp-cyan-dim)] text-[var(--bp-text)] border border-[var(--bp-cyan)]/30 rounded-tr-none">
                      {message.content}
                    </div>
                  ) : (
                    <div className="rounded-lg p-3.5 text-xs sm:text-sm leading-relaxed max-w-[95%] bg-[var(--bp-panel-raised)] text-[var(--bp-text)] border border-[var(--bp-border)] rounded-tl-none space-y-2 shadow-lg">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => <h1 className="font-display font-bold text-base text-[var(--bp-cyan)] mt-3 mb-1.5 pb-1 border-b border-[var(--bp-border)]">{children}</h1>,
                          h2: ({ children }) => <h2 className="font-display font-semibold text-sm text-[var(--bp-cyan)] mt-2.5 mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="font-display font-semibold text-xs text-[var(--bp-cyan)] mt-2 mb-0.5">{children}</h3>,
                          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-[var(--bp-text)]">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2 text-[var(--bp-text-dim)]">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2 text-[var(--bp-text-dim)]">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed pl-0.5"><span className="text-[var(--bp-text)]">{children}</span></li>,
                          strong: ({ children }) => <strong className="font-semibold text-[var(--bp-cyan)]">{children}</strong>,
                          em: ({ children }) => <em className="italic text-[var(--bp-text)]">{children}</em>,
                          code: ({ children }) => <code className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--bp-panel)] text-[var(--bp-amber)] border border-[var(--bp-border)]">{children}</code>,
                          hr: () => <hr className="border-[var(--bp-border)] my-2.5" />,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--bp-cyan)] pl-2.5 my-2 italic text-[var(--bp-text-dim)]">{children}</blockquote>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              {loading && <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bp-panel-raised)] border border-[var(--bp-border)] max-w-[70%]"><span className="animate-spin text-xs text-[var(--bp-cyan)]">✦</span><p className="text-xs font-mono text-[var(--bp-text-dim)]">Simulating in Qiskit…</p></div>}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-3 py-2 border-t border-[var(--bp-border)] bg-[var(--bp-panel-raised)]/40 flex flex-wrap gap-1.5 shrink-0">
              <button type="button" disabled={loading} onClick={() => void send("Explain the latest gate in my circuit.", "gate")} className="text-[10px] font-mono border border-[var(--bp-border)] rounded px-2 py-1 text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] transition-colors disabled:opacity-50 cursor-pointer">Explain gates</button>
              <button type="button" disabled={loading} onClick={() => void send("Explain my current Bloch sphere values.", "bloch")} className="text-[10px] font-mono border border-[var(--bp-border)] rounded px-2 py-1 text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] transition-colors disabled:opacity-50 cursor-pointer">Explain Bloch sphere</button>
              <button type="button" disabled={loading} onClick={() => void send("Explain the Q-Sphere points and phases for this circuit.", "q_sphere")} className="text-[10px] font-mono border border-[var(--bp-border)] rounded px-2 py-1 text-[var(--bp-text-dim)] hover:border-[var(--bp-cyan)] hover:text-[var(--bp-cyan)] transition-colors disabled:opacity-50 cursor-pointer">Explain Q-Sphere</button>
            </div>
            {recommendation && <div className="px-3 py-1.5 border-t border-[var(--bp-border)] bg-[var(--bp-violet)]/10 text-[11px] font-mono text-[var(--bp-violet)] flex items-center gap-1.5 shrink-0"><span>💡</span><span className="truncate">Next: {recommendation}</span></div>}
            <form className="p-3 border-t border-[var(--bp-border)] flex gap-2 bg-[var(--bp-panel)] shrink-0" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about this circuit or quantum theory…" className="min-w-0 flex-1 rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)] px-3 py-2 text-xs sm:text-sm text-[var(--bp-text)] placeholder-[var(--bp-text-faint)] focus:outline-none focus:border-[var(--bp-cyan)] transition-colors" />
              <button type="submit" disabled={loading || !input.trim()} className="rounded px-3.5 py-2 text-xs font-mono font-semibold transition-all disabled:opacity-40 hover:opacity-90 cursor-pointer" style={{ background: "var(--bp-cyan)", color: "#081527" }}>Send</button>
            </form>
        </aside>
      )}
    </>
  );
}
