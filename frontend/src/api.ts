import type {
  AssessmentResult,
  AdaptiveAssessment,
  AuthResponse,
  BackendId,
  BackendInfo,
  ChallengeResult,
  ChallengeTask,
  ChatMessage,
  Circuit,
  CircuitDiagnosis,
  CodeRequest,
  DuelState,
  GateDefinition,
  InstructorDashboard,
  LeaderboardEntry,
  Role,
  SavedWork,
  SimulationResult,
  SprintResult,
  SprintStart,
  TutorResponse,
  UserProfile,
  UserStats,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

export function getGateDefinitions(): Promise<GateDefinition[]> {
  return request<GateDefinition[]>("/api/gates");
}

export function validateCircuit(circuit: Circuit): Promise<Circuit> {
  return request<Circuit>("/api/circuits/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(circuit),
  });
}

export function circuitFromCode(code: string): Promise<Circuit> {
  const payload: CodeRequest = { code };
  return request<Circuit>("/api/circuits/from-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function circuitToCode(circuit: Circuit): Promise<string> {
  const result = await request<{ code: string }>("/api/circuits/to-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(circuit),
  });
  return result.code;
}

export function getBackends(): Promise<BackendInfo[]> {
  return request<BackendInfo[]>("/api/backends");
}

export async function circuitToQasm(circuit: Circuit): Promise<string> {
  const result = await request<{ qasm: string }>("/api/circuits/to-qasm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(circuit),
  });
  return result.qasm;
}

export function simulateCircuit(circuit: Circuit, backend: BackendId = "qiskit_aer"): Promise<SimulationResult> {
  return request<SimulationResult>("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...circuit, backend }),
  });
}

export function diagnoseCircuit(circuit: Circuit): Promise<CircuitDiagnosis> {
  return request<CircuitDiagnosis>("/api/circuits/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(circuit),
  });
}

export function askTutor(message: string, circuit: Circuit, history: ChatMessage[], conversationId: string, focus?: string): Promise<TutorResponse> {
  return request<TutorResponse>("/api/tutor/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, circuit, history, conversation_id: conversationId, focus }),
  });
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function listSavedWorks(token: string): Promise<SavedWork[]> {
  return request<SavedWork[]>("/api/works", { headers: authHeaders(token) });
}

export function saveWork(token: string, code: string, title: string, description = ""): Promise<SavedWork> {
  return request<SavedWork>("/api/works", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ code, title, description }),
  });
}

export function updateWork(token: string, id: string, patch: { title?: string; description?: string }): Promise<SavedWork> {
  return request<SavedWork>(`/api/works/${id}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export function deleteWork(token: string, id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/works/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function getMyStats(token: string): Promise<UserStats> {
  return request<UserStats>("/api/gamification/me", { headers: authHeaders(token) });
}

export function getLeaderboard(token: string, period: "all" | "weekly" = "all"): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>(`/api/leaderboard?period=${period}`, { headers: authHeaders(token) });
}

export function getUserProfile(token: string, userId: string): Promise<UserProfile> {
  return request<UserProfile>(`/api/users/${encodeURIComponent(userId)}`, { headers: authHeaders(token) });
}

/** Fire-and-forget XP/streak ping. Never throws — safe to call from any learning action. */
export async function recordActivity(token: string | null, kind: string, detail = ""): Promise<UserStats | null> {
  if (!token) return null;
  try {
    return await request<UserStats>("/api/gamification/activity", {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ kind, detail }),
    });
  } catch {
    return null;
  }
}

export function startSprint(token: string): Promise<SprintStart> {
  return request<SprintStart>("/api/contests/sprint/start", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function submitSprint(token: string, attemptId: string, answers: Record<string, number>): Promise<SprintResult> {
  return request<SprintResult>("/api/contests/sprint/submit", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ attempt_id: attemptId, answers }),
  });
}

export function listChallenges(): Promise<ChallengeTask[]> {
  return request<ChallengeTask[]>("/api/contests/challenges");
}

export function submitChallenge(token: string, taskId: string, circuit: Circuit): Promise<ChallengeResult> {
  return request<ChallengeResult>("/api/contests/challenges/submit", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, circuit }),
  });
}

export function createDuel(token: string): Promise<{ code: string }> {
  return request<{ code: string }>("/api/duels/create", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function joinDuel(token: string, code: string): Promise<DuelState> {
  return request<DuelState>("/api/duels/join", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

export function getDuel(token: string, code: string): Promise<DuelState> {
  return request<DuelState>(`/api/duels/${code}`, { headers: authHeaders(token) });
}

export function answerDuel(token: string, code: string, questionId: string, option: number): Promise<DuelState> {
  return request<DuelState>(`/api/duels/${code}/answer`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: questionId, option }),
  });
}

export function submitDuel(token: string, code: string): Promise<DuelState> {
  return request<DuelState>(`/api/duels/${code}/submit`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function cancelDuel(token: string, code: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/duels/${code}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export function signup(name: string, email: string, password: string, role: Role): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role }),
  });
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function googleAuth(credential: string, role?: Role): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential, role }),
  });
}

export function submitAssessment(token: string, score: number, total: number): Promise<AssessmentResult> {
  return request<AssessmentResult>("/api/assessment/submit", {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ score, total }),
  });
}

export function getCurrentAssessment(token: string): Promise<AdaptiveAssessment | null> {
  return request<AdaptiveAssessment | null>("/api/assessment/current", { headers: authHeaders(token) });
}

export function startAdaptiveAssessment(token: string): Promise<AdaptiveAssessment> {
  return request<AdaptiveAssessment>("/api/assessment/start", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export function submitAdaptiveAssessment(token: string, assessmentId: string, answers: Record<string, string>): Promise<AdaptiveAssessment> {
  return request<AdaptiveAssessment>(`/api/assessment/${assessmentId}/submit`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}

export function getAssessmentHistory(token: string): Promise<{ assessments: AdaptiveAssessment[] }> {
  return request<{ assessments: AdaptiveAssessment[] }>("/api/assessment/history", { headers: authHeaders(token) });
}

export function getAssessmentDetail(token: string, assessmentId: string): Promise<AdaptiveAssessment> {
  return request<AdaptiveAssessment>(`/api/assessment/${assessmentId}`, { headers: authHeaders(token) });
}

export async function reportLearningQuiz(token: string | null, quizId: string, answers: Record<string, string>): Promise<void> {
  if (!token) return;
  try {
    await request("/api/learning/quiz/submit", {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId, answers }),
    });
  } catch {
    // Learning progression should not fail if adaptive analytics are unavailable.
  }
}

export function getInstructorDashboard(token: string): Promise<InstructorDashboard> {
  return request<InstructorDashboard>("/api/instructor/dashboard", { headers: authHeaders(token) });
}

