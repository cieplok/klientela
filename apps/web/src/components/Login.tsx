import { useState, type FormEvent } from "react";
import { trpc } from "../trpc";

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("admin@salon.local");
  const [password, setPassword] = useState("admin1234");
  const login = trpc.auth.login.useMutation({ onSuccess: onDone });

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1 style={{ fontSize: 20, marginTop: 0 }}>Klientela</h1>
        <p className="muted">Sign in to manage the salon.</p>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {login.error && <p className="error">{login.error.message}</p>}
        <button className="primary" type="submit" disabled={login.isPending} style={{ width: "100%" }}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
