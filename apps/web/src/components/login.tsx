"use client";
import { useState } from "react";
import { HeartPulse, ArrowRight } from "lucide-react";

export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-brand">
        <HeartPulse size={28} /> careflow<span>Better together.</span>
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const data = new FormData(e.currentTarget);
          try {
            const response = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(Object.fromEntries(data)),
            });
            if (!response.ok) throw new Error((await response.json()).detail);
            window.location.reload();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to sign in.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">YOUR CLINIC, CONNECTED</span>
        <h1>Welcome back.</h1>
        <p>A little more care. A lot less admin.</p>
        <label>
          Work email
          <input name="email" type="email" required autoComplete="username" />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in to your workspace"}
          <ArrowRight size={16} />
        </button>
        <small>Use the staff credentials configured for your clinic.</small>
      </form>
      <div className="login-foot">Thoughtfully built for the people who care.</div>
    </main>
  );
}
