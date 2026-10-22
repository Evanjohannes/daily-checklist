"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMsg({ text: error.message, error: true });
    router.push("/");
  }

  async function signUp() {
    setLoading(true);
    setMsg(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setMsg({ text: error.message, error: true });
    if (data.session) router.push("/");
    else setMsg({ text: "Account created. Now press Sign in.", error: false });
  }

  return (
    <main className="login">
      <div className="login-card">
        <h1 className="login-title">Daily Checklist</h1>
        <p className="login-sub">Plan each day. Check it off. Reach the goal.</p>

        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            signIn();
          }}
        >
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password (at least 6 characters)"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn block" disabled={loading}>
            Sign in
          </button>
          <button type="button" className="btn ghost block" onClick={signUp} disabled={loading}>
            Create account
          </button>
          {msg && <p className={`msg ${msg.error ? "" : "info"}`}>{msg.text}</p>}
        </form>
      </div>
    </main>
  );
}