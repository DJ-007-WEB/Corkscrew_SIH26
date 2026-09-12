import { useEffect, useState } from "react";
import { circuitFromCode, deleteWork, listSavedWorks, updateWork } from "./api";
import type { Circuit, SavedWork } from "./types";

export default function MyWorksPage({ token, onOpenCircuit }: { token: string; onOpenCircuit: (circuit: Circuit) => void }) {
  const [works, setWorks] = useState<SavedWork[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedWork | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  function startRename(work: SavedWork) {
    setEditing(work);
    setEditTitle(work.title);
    setEditDescription(work.description ?? "");
  }

  async function confirmRename() {
    if (!editing) return;
    const title = editTitle.trim();
    if (!title) {
      setError("Name cannot be empty.");
      return;
    }
    setBusyId(editing.id);
    setError(null);
    try {
      const updated = await updateWork(token, editing.id, { title, description: editDescription.trim() });
      setWorks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename circuit");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete(work: SavedWork) {
    if (!window.confirm(`Delete "${work.title}"? This cannot be undone.`)) return;
    setBusyId(work.id);
    setError(null);
    try {
      await deleteWork(token, work.id);
      setWorks((prev) => prev.filter((w) => w.id !== work.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete circuit");
    } finally {
      setBusyId(null);
    }
  }

  return <div className="space-y-4"><div><p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Your workspace</p><h1 className="font-display text-3xl mt-2">My Works</h1><p className="text-sm text-[var(--bp-text-dim)] mt-2">Saved Qiskit circuits linked to your account. Click a card to open it, or rename / delete it.</p></div>{loading && <p className="text-xs font-mono text-[var(--bp-text-faint)]">Loading saved works...</p>}{error && <p className="text-sm text-[var(--bp-coral)]">{error}</p>}{!loading && !works.length && <section className="bp-panel p-6 text-sm text-[var(--bp-text-dim)]">No saved circuits yet. Build one in Circuit Builder and select Save — you'll be asked for a name and an optional description.</section>}<div className="grid sm:grid-cols-2 gap-3">{works.map((work) => <div key={work.id} className="bp-panel p-4 hover:border-[var(--bp-cyan)] transition-colors"><button onClick={() => openWork(work)} className="w-full text-left"><p className="font-mono text-sm text-[var(--bp-cyan)]">{work.title}</p>{work.description && <p className="text-xs text-[var(--bp-text-dim)] mt-1 leading-relaxed">{work.description}</p>}<p className="text-xs text-[var(--bp-text-faint)] mt-2">Saved {new Date(work.updated_at).toLocaleString()}</p><pre className="mt-3 max-h-24 overflow-hidden text-[10px] font-mono text-[var(--bp-text-dim)] whitespace-pre-wrap">{work.code}</pre></button><div className="mt-3 flex gap-2"><button onClick={() => startRename(work)} disabled={busyId === work.id} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono hover:border-[var(--bp-cyan)] disabled:opacity-40">Rename</button><button onClick={() => confirmDelete(work)} disabled={busyId === work.id} className="px-3 py-1.5 rounded border border-[var(--bp-border)] text-[11px] font-mono text-[var(--bp-coral)] hover:border-[var(--bp-coral)] disabled:opacity-40">{busyId === work.id ? "Working…" : "Delete"}</button></div></div>)}</div>
  {editing && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
      <div className="bp-panel w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg">Rename saved circuit</h3>
        <label className="block mt-4 text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Name *<input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)]" /></label>
        <label className="block mt-3 text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">Description<textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} maxLength={500} rows={3} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)] resize-y" /></label>
        <div className="mt-4 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="px-4 py-2 rounded border border-[var(--bp-border)] text-xs font-mono">Cancel</button><button onClick={confirmRename} disabled={busyId === editing.id || !editTitle.trim()} className="px-4 py-2 rounded bg-[var(--bp-cyan)] text-[#081527] text-xs font-mono font-semibold disabled:opacity-40">{busyId === editing.id ? "Saving…" : "Save changes"}</button></div>
      </div>
    </div>
  )}
  </div>;
}
