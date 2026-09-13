import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";
import { googleAuth, login, signup } from "./api";
import type { AuthResponse } from "./types";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type Mode = "signin" | "signup";

type Props = {
  onAuthenticated: (auth: AuthResponse) => void;
  initialMode?: Mode;
  title?: string;
  description?: string;
};

export default function AuthForm({ onAuthenticated, initialMode = "signin", title, description }: Props) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function fail(err: unknown, fallback: string) {
    setError(err instanceof Error ? err.message : fallback);
    setLoading(false);
  }

  async function handleGoogle(credential: string) {
    setLoading(true);
    setError("");
    try {
      const auth = await googleAuth(credential);
      localStorage.setItem("quantum-token", auth.token);
      localStorage.setItem("quantum-user", JSON.stringify(auth.user));
      onAuthenticated(auth);
    } catch (err) {
      fail(err, "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const auth = mode === "signup" ? await signup(name, email, password) : await login(email, password);
      localStorage.setItem("quantum-token", auth.token);
      localStorage.setItem("quantum-user", JSON.stringify(auth.user));
      onAuthenticated(auth);
    } catch (err) {
      fail(err, mode === "signup" ? "Could not create account" : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bp-panel p-6 sm:p-8 text-center">
      {title && <h1 className="font-display text-2xl sm:text-3xl mt-1">{title}</h1>}
      {description && <p className="text-sm text-[var(--bp-text-dim)] mt-3 leading-relaxed">{description}</p>}

      <div className="mt-6 flex justify-center gap-1 rounded-md border border-[var(--bp-border)] p-1 max-w-xs mx-auto">
        <button type="button" onClick={() => { setMode("signin"); setError(""); }} className="flex-1 px-3 py-1.5 rounded text-xs font-mono transition-colors" style={{ background: mode === "signin" ? "var(--bp-cyan)" : "transparent", color: mode === "signin" ? "#081527" : "var(--bp-text-dim)" }}>
          Log in
        </button>
        <button type="button" onClick={() => { setMode("signup"); setError(""); }} className="flex-1 px-3 py-1.5 rounded text-xs font-mono transition-colors" style={{ background: mode === "signup" ? "var(--bp-cyan)" : "transparent", color: mode === "signup" ? "#081527" : "var(--bp-text-dim)" }}>
          Sign up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 text-left max-w-sm mx-auto space-y-3">
        {mode === "signup" && (
          <label className="block text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)]" />
          </label>
        )}
        <label className="block text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)]" />
        </label>
        <label className="block text-xs font-mono uppercase tracking-wider text-[var(--bp-text-dim)]">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === "signup" ? 8 : undefined} maxLength={200} className="mt-1.5 w-full bg-[var(--bp-bg)] border border-[var(--bp-border)] rounded px-3 py-2 text-sm normal-case tracking-normal outline-none focus:border-[var(--bp-cyan)]" />
          {mode === "signup" && <span className="block mt-1 text-[10px] normal-case tracking-normal text-[var(--bp-text-faint)]">At least 8 characters.</span>}
        </label>
        <button type="submit" disabled={loading} className="w-full px-4 py-2 rounded-md font-mono text-sm font-medium disabled:opacity-50" style={{ background: "var(--bp-cyan)", color: "#081527" }}>
          {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>

      <div className="mt-5 flex items-center gap-3 max-w-sm mx-auto">
        <div className="h-px flex-1 bg-[var(--bp-border)]" />
        <span className="text-[10px] font-mono text-[var(--bp-text-faint)]">OR</span>
        <div className="h-px flex-1 bg-[var(--bp-border)]" />
      </div>

      <div className="mt-4 flex justify-center">
        {GOOGLE_CLIENT_ID ? (
          <GoogleLogin onSuccess={(response) => response.credential && handleGoogle(response.credential)} onError={() => setError("Google sign-in was cancelled or failed.")} />
        ) : (
          <div className="w-full max-w-sm rounded border border-[var(--bp-border-strong)] p-4 text-xs font-mono text-[var(--bp-text-dim)]">
            Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID to frontend/.env.
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] font-mono text-[var(--bp-text-faint)]">
        {mode === "signup" ? "New accounts are always student accounts." : "Instructors: log in with your provided instructor email and password."}
      </p>

      {loading && <p className="mt-4 text-xs font-mono text-[var(--bp-cyan)]">AUTHENTICATING...</p>}
      {error && <p className="mt-4 text-xs text-[var(--bp-coral)]">{error}</p>}
    </section>
  );
}
