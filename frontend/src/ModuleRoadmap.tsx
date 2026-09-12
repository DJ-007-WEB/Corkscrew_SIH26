import type { LearningModule } from "./moduleData";

type Props = {
  modules: LearningModule[];
  expandedModuleId: string | null;
  selectedTopicId?: string;
  onExpandModule: (moduleId: string | null) => void;
  onSelectTopic: (module: LearningModule, topicId: string) => void;
  onSelectFinal?: (module: LearningModule) => void;
};

export default function ModuleRoadmap({ modules, expandedModuleId, selectedTopicId, onExpandModule, onSelectTopic, onSelectFinal }: Props) {
  return (
    <aside className="scrollbar-hidden bp-panel p-4 lg:sticky lg:top-5 lg:self-start max-h-[calc(100vh-120px)] overflow-y-auto">
      <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Learning roadmap</p>
      <h2 className="font-display text-lg mt-1">Modules 1–7</h2>
      <div className="mt-4 space-y-2">
        {modules.map((module) => {
          const open = expandedModuleId === module.id;
          return (
            <section key={module.id} className="rounded border border-[var(--bp-border)] bg-[var(--bp-panel-raised)]">
              <button onClick={() => onExpandModule(open ? null : module.id)} className="w-full flex items-center justify-between gap-2 p-3 text-left">
                <span className="text-xs font-semibold leading-snug">{module.title}</span>
                <span className="font-mono text-xs text-[var(--bp-cyan)]">{open ? "−" : "+"}</span>
              </button>
              {open && <div className="border-t border-[var(--bp-border)] p-2">
                <p className="px-1 pb-2 text-[11px] leading-relaxed text-[var(--bp-text-dim)]">{module.goal}</p>
                <div className="space-y-1">
                  {module.topics.map((topic) => {
                    const topicKey = `${module.id}-${topic.id}`;
                    return <button key={topicKey} onClick={() => onSelectTopic(module, topic.id)} className={`w-full rounded px-2 py-2 text-left text-xs leading-snug transition-colors ${selectedTopicId === topicKey ? "bg-[var(--bp-cyan-dim)] text-[var(--bp-cyan)]" : "text-[var(--bp-text-dim)] hover:bg-[var(--bp-border)]/40 hover:text-[var(--bp-text)]"}`}>{topic.id} · {topic.title}</button>;
                  })}
                  {onSelectFinal && <button onClick={() => onSelectFinal(module)} className="w-full rounded border border-[var(--bp-amber)]/40 px-2 py-2 text-left text-xs font-mono text-[var(--bp-amber)] hover:bg-[var(--bp-amber)]/10">Module final assessment →</button>}
                </div>
              </div>}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
