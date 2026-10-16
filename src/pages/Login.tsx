import { useState } from "react";
import { useStore } from "../data/store";
import { supabase } from "../lib/supabase";
import { Field } from "../components/ui";

type Mode = "signin" | "signup";

/** Instagram, Facebook, Messenger and similar in-app browsers block Google sign-in and app installs. */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|Snapchat|TikTok|BytedanceWebview/i.test(navigator.userAgent);
const LIVE_URL = window.location.origin + import.meta.env.BASE_URL;
const friendly = (m: string) => (/Database error|not allowed/i.test(m) ? "That account isn't allowed in. Only the Cambo Poker Google account can sign in." : m);

/** Sign-in screen and the "waiting for approval" screen. One shared login is fine: the first account is approved automatically. */
export default function Login() {
  const { status, profile, error, refresh, signOut } = useStore();
  const [mode] = useState<Mode>("signin");
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } });
        if (error) throw error;
        if (!data.session) setMsg("Account created. Check the inbox for a confirmation email, tap the link, then sign in here.");
      } else {
        const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      setMsg(friendly(err instanceof Error ? err.message : String(err)));
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand" style={{ justifyContent: "center", marginBottom: 18 }}>
          <span className="brand-spade" aria-hidden>♠</span>
          <span className="brand-lockup"><span className="brand-top">CAMBO</span><span className="brand-bottom"><i /> POKER <i /></span></span>
        </div>

        {status === "pending" && (
          <>
            <h2 style={{ textAlign: "center", marginBottom: 8 }}>Waiting for approval</h2>
            <p className="muted" style={{ textAlign: "center" }}>Signed in as <strong>{profile?.email}</strong>. Someone who already has access needs to approve this account in Settings → People with access.</p>
            <div className="hero-actions" style={{ justifyContent: "center", marginTop: 14 }}>
              <button className="btn" onClick={() => void refresh()}>Check again</button>
              <button className="btn btn-ghost" onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <h2 style={{ textAlign: "center", marginBottom: 8 }}>Could not load the records</h2>
            <p className="error" style={{ textAlign: "center" }}>{error}</p>
            <div className="hero-actions" style={{ justifyContent: "center", marginTop: 14 }}>
              <button className="btn btn-primary" onClick={() => void refresh()}>Try again</button>
              <button className="btn btn-ghost" onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        )}

        {(status === "signed_out" || status === "loading") && IN_APP_BROWSER && (
          <div className="review-list" style={{ marginBottom: 14 }}>
            <li style={{ flexDirection: "column", alignItems: "stretch" }}>
              <strong>Open this in Safari or Chrome</strong>
              <span>You're inside the Instagram/Facebook browser, which blocks Google sign-in. Tap the ··· menu and choose "Open in browser", or copy the link below.</span>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input className="input" readOnly value={LIVE_URL} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(LIVE_URL).catch(() => {}); }}>Copy</button>
              </div>
            </li>
          </div>
        )}
        {(status === "signed_out" || status === "loading") && (
          <>
            <button type="button" className="btn btn-lg google-btn" disabled={busy} onClick={async () => {
              setBusy(true); setMsg(null);
              const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + import.meta.env.BASE_URL } });
              if (error) { setMsg(error.message); setBusy(false); }
            }}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
              Continue with Google
            </button>
            {!showEmail && <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowEmail(true)}>Sign in with email instead</button>}
            {showEmail && <><div className="or"><span>email sign-in</span></div>
            <form onSubmit={submit} className="stack" style={{ gap: 12 }}>
              <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label="Password" hint={mode === "signup" ? "At least 6 characters. One shared login for both hosts is fine." : undefined}><input className="input" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
              {msg && <p className={msg.startsWith("Account created") ? "muted" : "error"} style={{ margin: 0 }}>{msg}</p>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy || status === "loading"} style={{ width: "100%" }}>{busy ? "…" : "Sign in"}</button>
            </form></>}
            <p className="rule" style={{ textAlign: "center", marginTop: 14 }}>Only the Cambo Poker account can sign in. Records live in one shared database, so every phone sees the same games.</p>
          </>
        )}
      </div>
    </div>
  );
}
