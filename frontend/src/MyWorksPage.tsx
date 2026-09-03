import { useEffect, useState } from "react";
import { circuitFromCode, listSavedWorks } from "./api";
import type { Circuit, SavedWork } from "./types";

export default function MyWorksPage({ token, onOpenCircuit }: { token: string; onOpenCircuit: (circuit: Circuit) => void }) {
  const [works, setWorks] = useState<SavedWork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSavedWorks(token).then(setWorks).catch((err) => setError(err instanceof Error ? err.message : "Could not load saved works")).finally(() => setLoading(false));
  }, [token]);

  async function openWork(work: SavedWork) {
    try {
      onOpenCircuit(await circuitFromCode(work.code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open saved circuit");
    }
  }

  return <div className="space-y-4"><div><p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Your workspace</p><h1 className="font-display text-3xl mt-2">My Works</h1><p className="text-sm text-[var(--bp-text-dim)] mt-2">Saved Qiskit circuits linked to your account.</p></div>{loading && <p className="text-xs font-mono text-[var(--bp-text-faint)]">Loading saved works...</p>}{error && <p className="text-sm text-[var(--bp-coral)]">{error}</p>}{!loading && !works.length && <section className="bp-panel p-6 text-sm text-[var(--bp-text-dim)]">No saved circuits yet. Build one in Circuit Builder and select Save.</section>}<div className="grid sm:grid-cols-2 gap-3">{works.map((work) => <button key={work.id} onClick={() => openWork(work)} className="bp-panel p-4 text-left hover:border-[var(--bp-cyan)] transition-colors"><p className="font-mono text-sm text-[var(--bp-cyan)]">{work.title}</p><p className="text-xs text-[var(--bp-text-faint)] mt-2">Saved {new Date(work.updated_at).toLocaleString()}</p><pre className="mt-3 max-h-24 overflow-hidden text-[10px] font-mono text-[var(--bp-text-dim)] whitespace-pre-wrap">{work.code}</pre></button>)}</div></div>;
}
