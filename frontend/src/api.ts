import type { ChatMessage, Circuit, CodeRequest, GateDefinition, SimulationResult, TutorResponse } from "./types";

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

export function simulateCircuit(circuit: Circuit): Promise<SimulationResult> {
  return request<SimulationResult>("/api/simulate", {
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
