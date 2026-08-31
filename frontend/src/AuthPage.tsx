import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type Props = { onAuthenticated: (token: string) => void };

export default function AuthPage({ onAuthenticated }: Props) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogle(credential: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? "Google sign-in failed");
      localStorage.setItem("quantum-token", data.token);
      onAuthenticated(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto py-10">
      <section className="bp-panel p-8 text-center">
        <p className="text-xs font-mono uppercase tracking-wider text-[var(--bp-cyan)]">Learning Access</p>
        <h1 className="font-display text-3xl mt-2">Start learning quantum computing</h1>
        <p className="text-sm text-[var(--bp-text-dim)] mt-3 leading-relaxed">
          Create a free account to access the complete Quantum Computing Fundamentals course,
          including gates, circuits, Bloch sphere and Q-sphere lessons.
        </p>

        <div className="mt-7 flex justify-center">
          {GOOGLE_CLIENT_ID ? (
            <GoogleLogin onSuccess={(response) => response.credential && handleGoogle(response.credential)} onError={() => setError("Google sign-in was cancelled or failed.")} />
          ) : (
            <div className="w-full rounded border border-[var(--bp-border-strong)] p-4 text-xs font-mono text-[var(--bp-text-dim)]">
              Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID to frontend/.env.
            </div>
          )}
        </div>

        {loading && <p className="mt-4 text-xs font-mono text-[var(--bp-cyan)]">AUTHENTICATING...</p>}
        {error && <p className="mt-4 text-xs text-[var(--bp-coral)]">{error}</p>}

        <div className="mt-7 pt-5 border-t border-[var(--bp-border)] text-left space-y-2 text-xs text-[var(--bp-text-faint)]">
          <p>✓ Free access to all fundamentals</p>
          <p>✓ Learn at your own pace</p>
          <p>✓ Practice concepts with the Corkscrew simulator</p>
        </div>
      </section>
    </div>
  );
}
