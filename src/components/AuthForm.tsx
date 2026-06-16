"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { hasSupabaseConfig, supabase } from "@/lib/supabase/client";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!hasSupabaseConfig) {
      setMessage("Faltan las variables de Supabase en .env.local.");
      return;
    }
    setLoading(true);
    setMessage("");

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Revisa tu email para confirmar la cuenta.");
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <section className="auth-card">
      <div>
        <p className="eyebrow">Cuenta personal</p>
        <h1>{mode === "signin" ? "Iniciar sesion" : "Crear cuenta"}</h1>
        <p className="muted">Tus gastos quedan guardados en Supabase y separados por usuario.</p>
      </div>

      <div className="segmented">
        <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")} type="button">
          Entrar
        </button>
        <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")} type="button">
          Registrarme
        </button>
      </div>

      <form onSubmit={submit} className="form-stack">
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>
        <label>
          Contrasena
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            minLength={6}
            required
          />
        </label>
        <button className="primary-button" disabled={loading} type="submit">
          <LogIn size={18} /> {loading ? "Procesando..." : mode === "signin" ? "Entrar" : "Crear cuenta"}
        </button>
      </form>

      {message ? <p className="form-message">{message}</p> : null}
    </section>
  );
}
