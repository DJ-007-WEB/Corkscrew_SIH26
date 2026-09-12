import module1 from "../modules/module1_intro_classical_vs_quantum.json";
import module2 from "../modules/module2_single_qubit_bloch_sphere.json";
import module3 from "../modules/module3_gates_and_circuits.json";
import module4 from "../modules/module4_multiqubit_entanglement.json";
import module5 from "../modules/module5_measurement_protocols.json";
import module6 from "../modules/module6_intro_quantum_algorithms.json";
import module7 from "../modules/module7_noise_error_mitigation_real_hardware.json";

type RawRecord = Record<string, unknown>;

export type ModuleQuestion = {
  id: string;
  question: string;
  options: string[];
  answer: number;
  difficulty?: string;
};

export type ModuleTopic = {
  id: string;
  title: string;
  moduleTitle: string;
  summary: string;
  objectives: string[];
  formula?: string;
  intuition?: string;
  examples: string[];
  visualizations: string[];
  misconceptions: string[];
  questions: ModuleQuestion[];
};

export type LearningModule = {
  id: string;
  title: string;
  goal: string;
  prerequisites: string[];
  topics: ModuleTopic[];
  finalQuestions: ModuleQuestion[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function question(raw: RawRecord): ModuleQuestion {
  const rawOptions = raw.OPTIONS;
  const options = Array.isArray(rawOptions)
    ? rawOptions.filter((option): option is string => typeof option === "string")
    : rawOptions && typeof rawOptions === "object"
      ? Object.values(rawOptions).filter((option): option is string => typeof option === "string")
      : [];
  const correct = text(raw.CORRECT_ANSWER);
  const answer = options.findIndex((option) => option === correct);
  const keyedAnswer = rawOptions && !Array.isArray(rawOptions) && typeof rawOptions === "object"
    ? Object.keys(rawOptions).indexOf(correct)
    : -1;

  return {
    id: text(raw.ID),
    question: text(raw.QUESTION),
    options,
    answer: answer >= 0 ? answer : keyedAnswer,
    difficulty: text(raw.DIFFICULTY_LEVEL) || text(raw.DIFFICULTY),
  };
}

function examples(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as RawRecord;
    const nested = Object.values(record).find((entry) => entry && typeof entry === "object") as RawRecord | undefined;
    const source = nested ?? record;
    const description = text(source.DESCRIPTION);
    const expected = text(source.EXPECTED_SIMULATION);
    return [description, expected].filter(Boolean);
  });
}

function moduleId(title: string) {
  return title.match(/Module\s+(\d+)/i)?.[1] ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function normaliseModule(raw: RawRecord): LearningModule {
  const title = text(raw.MODULE);
  const rawTopics = Array.isArray(raw.CONCEPTS) ? raw.CONCEPTS : Array.isArray(raw.SUBTOPICS) ? raw.SUBTOPICS : [];
  const finalAssessment = (raw.FINAL_MODULE_ASSESSMENT ?? raw.MODULE_FINAL_ASSESSMENT ?? {}) as RawRecord;
  const finalRawQuestions = Array.isArray(finalAssessment.QUESTIONS) ? finalAssessment.QUESTIONS : [];

  return {
    id: `module-${moduleId(title)}`,
    title,
    goal: text(raw.MODULE_GOAL),
    prerequisites: stringList(raw.MODULE_PREREQUISITES),
    topics: rawTopics.filter((topic): topic is RawRecord => Boolean(topic) && typeof topic === "object").map((topic) => ({
      id: text(topic.SUBTOPIC_ID) || text(topic.SUBTOPIC_NUMBER),
      title: text(topic.CONCEPT),
      moduleTitle: title,
      summary: text(topic.CORE_EXPLANATION),
      objectives: stringList(topic.LEARNING_OBJECTIVES),
      formula: text(topic.MATHEMATICAL_REPRESENTATION) || undefined,
      intuition: text(topic.INTUITION_ANALOGY) || undefined,
      examples: examples(topic.EXAMPLES),
      visualizations: stringList(topic.VISUALIZATIONS),
      misconceptions: stringList(topic.COMMON_MISCONCEPTIONS),
      questions: Array.isArray(topic.MCQS) ? topic.MCQS.filter((item): item is RawRecord => Boolean(item) && typeof item === "object").map(question) : [],
    })),
    finalQuestions: finalRawQuestions.filter((item): item is RawRecord => Boolean(item) && typeof item === "object").map(question),
  };
}

export const learningModules = [module1, module2, module3, module4, module5, module6, module7].map((item) => normaliseModule(item as RawRecord));
