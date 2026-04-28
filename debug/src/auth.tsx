import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

export function LoginForm() {
  const { signIn } = useAuthActions();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn("password", {
        email: "admin@boop.local",
        password,
        flow: "signIn",
      });
    } catch (err) {
      setError("Wrong password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <img src="/lunagotchi.png" alt="Boop" className="w-12 h-12 mx-auto rounded-lg" />
          <h1 className="mt-3 text-lg font-semibold">Boop Debug</h1>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoFocus
          className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm"
        />
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded px-3 py-2 text-sm font-medium"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
