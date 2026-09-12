import AuthForm from "./AuthForm";
import type { AuthResponse } from "./types";

type Props = {
  initialMode: "signin" | "signup";
  onAuthenticated: (auth: AuthResponse) => void;
  onClose: () => void;
};

export default function AuthModal({ initialMode, onAuthenticated, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute -top-3 -right-3 w-8 h-8 rounded-full border border-[var(--bp-border-strong)] bg-[var(--bp-panel)] text-sm font-mono text-[var(--bp-text-dim)] hover:text-[var(--bp-cyan)] z-10">
          ✕
        </button>
        <AuthForm
          initialMode={initialMode}
          title="QuantumLab access"
          description="Log in or create a role-based account — pick Student or Instructor when signing up."
          onAuthenticated={onAuthenticated}
        />
      </div>
    </div>
  );
}
