import AuthForm from "./AuthForm";
import type { AuthResponse } from "./types";

type Props = { onAuthenticated: (token: string) => void };

export default function AuthPage({ onAuthenticated }: Props) {
  return (
    <div className="max-w-lg mx-auto py-10">
      <AuthForm
        title="Start learning quantum computing"
        description="Create a free account to access the complete Quantum Computing Fundamentals course, including gates, circuits, Bloch sphere and Q-sphere lessons."
        onAuthenticated={(auth: AuthResponse) => onAuthenticated(auth.token)}
      />
      <div className="mt-5 pt-5 border-t border-[var(--bp-border)] text-left space-y-2 text-xs text-[var(--bp-text-faint)] max-w-sm mx-auto">
        <p>✓ Free access to all fundamentals</p>
        <p>✓ Learn at your own pace</p>
        <p>✓ Practice concepts with the Corkscrew simulator</p>
      </div>
    </div>
  );
}
