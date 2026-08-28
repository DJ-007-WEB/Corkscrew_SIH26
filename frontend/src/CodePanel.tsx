import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Editor from "@monaco-editor/react";
import { circuitFromCode, circuitToCode } from "./api";
import type { Circuit } from "./types";

interface Props {
  circuit: Circuit;
  onCircuitChange: Dispatch<SetStateAction<Circuit>>;
  theme: "dark" | "light";
}

export default function CodePanel({ circuit, onCircuitChange, theme }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const circuitSignature = JSON.stringify(circuit);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    circuitToCode(circuit)
      .then((nextCode) => {
        if (!cancelled) {
          setCode(nextCode);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not generate code");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [circuitSignature]);

  async function applyCode() {
    setApplying(true);
    setError(null);
    try {
      const nextCircuit = await circuitFromCode(code);
      onCircuitChange(nextCircuit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build circuit from code");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="bp-panel p-4 w-full sm:w-80 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Code builder</p>
        <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">QISKIT</span>
      </div>

      <div className="rounded-md border border-[var(--bp-border)]" style={{ height: 320, overflow: "visible" }}>
        <Editor
          height="100%"
          language="python"
          theme={theme === "light" ? "vs" : "vs-dark"}
          value={loading ? "# Generating from circuit…" : code}
          onChange={(value) => setCode(value ?? "")}
          options={{
            readOnly: loading || applying,
            minimap: { enabled: false },
            lineNumbers: "on",
            wordWrap: "on",
            fontSize: 12,
            tabSize: 4,
            automaticLayout: true,
            fixedOverflowWidgets: true,
            scrollBeyondLastLine: false,
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-[10px] text-[var(--bp-text-faint)] leading-relaxed">
          Supported: QuantumCircuit, H, X, Y, Z and CNOT.
        </p>
        <button
          onClick={applyCode}
          disabled={loading || applying || !code.trim()}
          className="shrink-0 px-3 py-2 rounded-md font-mono text-xs font-medium disabled:opacity-40"
          style={{ background: "var(--bp-cyan)", color: "#081527" }}
        >
          {applying ? "Building…" : "Build circuit"}
        </button>
      </div>

      {error && <p className="text-xs text-[var(--bp-coral)] mt-2 leading-relaxed">{error}</p>}
    </div>
  );
}
