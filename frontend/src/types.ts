// Shared Circuit IR contract. The backend is authoritative for gate definitions,
// validation, code <-> circuit translation and simulation results.

export type GateType = "H" | "X" | "Y" | "Z" | "S" | "T" | "RX" | "RY" | "RZ" | "CNOT" | "CZ" | "SWAP";
export type GateFamily = "basis" | "pauli" | "phase" | "rotation" | "multi";

export interface Gate {
  type: GateType;
  targets: number[];
  controls?: number[];
  params?: number[];
}

export interface Circuit {
  qubits: number;
  gates: Gate[];
}

export interface GateDefinition {
  type: GateType;
  label: string;
  family: GateFamily;
  description: string;
}

export interface CodeRequest {
  code: string;
}

export type BackendId = "qiskit_aer" | "pennylane" | "cirq"; // "qbraid" disabled server-side, see backend/app/backends.py

export interface BackendInfo {
  id: BackendId;
  label: string;
  description: string;
  available: boolean;
  unavailable_reason?: string | null;
}

export interface CircuitIssue {
  gate_index: number | null;
  message: string;
  suggestion: string;
}

export interface CircuitDiagnosis {
  valid: boolean;
  issues: CircuitIssue[];
  fixed_circuit: Circuit | null;
}

export interface SavedWork {
  id: string;
  title: string;
  description: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface ComplexAmplitude {
  real: number;
  imag: number;
}

export interface StateSnapshot {
  statevector: Record<string, ComplexAmplitude>;
  probabilities: Record<string, number>;
}

export interface SimulationStep {
  step: number;
  gate_index?: number | null;
  after_gate: Gate | null;
  state: StateSnapshot;
}

export interface SimulationResult {
  steps: SimulationStep[];
  final_statevector: Record<string, ComplexAmplitude>;
  final_probabilities: Record<string, number>;
  explanation: string;
  backend: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GroundedFact {
  name: string;
  value: string;
}

export interface UserStats {
  user_id: string;
  name: string;
  total_xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next_level: number;
  streak_count: number;
  best_streak: number;
  contests_played: number;
  duels_won: number;
  rank: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  name: string;
  total_xp: number;
  level: number;
  streak_count: number;
  is_me: boolean;
}

export interface ProfileActivity {
  kind: string;
  points: number;
  created_at: string;
}

export interface UserProfile {
  user_id: string;
  name: string;
  picture: string | null;
  total_xp: number;
  level: number;
  xp_into_level: number;
  xp_for_next_level: number;
  streak_count: number;
  best_streak: number;
  contests_played: number;
  duels_won: number;
  rank: number | null;
  is_me: boolean;
  recent_activity: ProfileActivity[];
}

export interface QuizQuestion {
  id: string;
  tag: string;
  question: string;
  options: string[];
}

export interface SprintStart {
  attempt_id: string;
  questions: QuizQuestion[];
  duration_sec: number;
  started_at: string;
}

export interface SprintQuestionResult {
  id: string;
  tag: string;
  question: string;
  options: string[];
  your_option: number | null;
  correct_option: number;
  is_correct: boolean;
  answered: boolean;
  explanation: string;
}

export interface SprintResult {
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  time_sec: number;
  base_score: number;
  time_bonus: number;
  xp_earned: number;
  already_solved?: boolean;
  results: SprintQuestionResult[];
  stats: UserStats;
}

export interface ChallengeTask {
  id: string;
  title: string;
  description: string;
  qubits: number;
  max_gates: number;
  hint: string;
}

export interface ChallengeResult {
  passed: boolean;
  message: string;
  probabilities: Record<string, number>;
  gates_used: number;
  xp_earned: number;
  already_solved?: boolean;
  stats: UserStats;
}

export interface DuelPlayerResult {
  name: string;
  correct: number;
  wrong: number;
  answered: number;
  elapsed_sec: number;
  xp_earned: number;
}

export interface DuelState {
  code: string;
  status: string;
  host_name: string;
  guest_name: string;
  is_host: boolean;
  questions: QuizQuestion[];
  duration_sec: number;
  time_left_sec: number;
  my_answers: Record<string, number>;
  my_submitted: boolean;
  opponent_name: string;
  opponent_answered: number;
  opponent_submitted: boolean;
  winner: string;
  winner_name: string;
  is_winner: boolean | null;
  host_result: DuelPlayerResult | null;
  guest_result: DuelPlayerResult | null;
  results: SprintQuestionResult[];
  stats: UserStats | null;
}

export interface TutorResponse {
  answer: string;
  mode: "grounded" | "conceptual";
  tools_used: string[];
  facts: GroundedFact[];
  provider: string;
  recommendation?: string | null;
}

export type Role = "student" | "instructor";

export interface PublicUser {
  name: string;
  email?: string | null;
  role: Role;
  picture?: string | null;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface AssessmentResult {
  id: string;
  score: number;
  total: number;
  percentage: number;
  created_at: string;
}

export interface TopPerformer {
  name: string;
  email?: string | null;
  attempts: number;
  average_percentage: number;
  best_percentage: number;
}

export interface InstructorDashboard {
  generated_at: string;
  total_signups: number;
  active_learners: number;
  active_window_days: number;
  total_assessment_attempts: number;
  average_assessment_score: number;
  top_performers: TopPerformer[];
  note?: string | null;
}
