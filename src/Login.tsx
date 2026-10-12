import React, { useState } from "react";
import { Eye } from "lucide-react";
import { login, type User } from "./api";
const companyLogo = new URL("../images/logo.png", import.meta.url).href;
export default function Login({ onAuthenticated, checking = false }: { onAuthenticated: (user: User) => void; checking?: boolean }) {
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isLoading = checking || submitting;
  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;
    setSubmitting(true);
    setErrorMessage("");
    try { onAuthenticated(await login(loginIdentifier.trim(), loginPassword)); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : "Unable to sign in."); }
    finally { setSubmitting(false); }
  };
    return (
      <main className="min-h-screen font-sans grid lg:grid-cols-[minmax(0,1fr)_minmax(400px,520px)]">
        {/* Left panel — purple/indigo gradient */}
        <section className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #312e81 0%, #4338ca 40%, #6366f1 70%, #818cf8 100%)" }}>
          {/* decorative blobs */}
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #a5b4fc, transparent)" }} />
          <div className="absolute bottom-10 -left-16 w-56 h-56 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #c7d2fe, transparent)" }} />


<div className="relative flex items-center gap-6">
  <img
    src={companyLogo}
    alt="Dectrocel logo"
    className="h-24 w-24 shrink-0 rounded-2xl bg-white p-2 object-contain shadow-xl"
  />
  <div>
    <p className="text-4xl font-extrabold tracking-tight">
      Dectrocel
    </p>
    <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-indigo-200">
      Healthcare and Research
    </p>
  </div>
</div>



<div className="relative max-w-2xl">
  <span className="mb-4 inline-block text-sm font-bold uppercase tracking-[0.2em] text-indigo-300">
    DecTrack
  </span>

  <h1 className="text-5xl font-black leading-tight tracking-tight xl:text-6xl">
    One workspace for the teams moving care forward.
  </h1>

  <p className="mt-5 max-w-xl text-lg leading-relaxed text-indigo-100">
    Sign in with the username or email provided by your administrator.
  </p>

  <div className="mt-8 flex flex-wrap gap-6 text-sm font-semibold text-indigo-200">
    <span>🔒 Secure sessions</span>
    <span>🏥 Healthcare grade</span>
    <span>⚡ Real-time sync</span>
  </div>
</div>


          <p className="relative text-xs text-indigo-300">© {new Date().getFullYear()} Dectrocel Healthcare and Research</p>
        </section>

        {/* Right panel — form */}
        <section className="flex min-h-screen items-center justify-center bg-slate-50 p-6 sm:p-10">
          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src={companyLogo} alt="Dectrocel logo" className="h-12 w-12 rounded-xl object-contain shadow" />
              <div>
                <p className="font-extrabold text-slate-900">Dectrocel</p>
                <p className="text-[10px] font-bold uppercase text-indigo-600 tracking-widest">Healthcare and Research</p>
              </div>
            </div>

            <span className="inline-block text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">Secure sign in</span>
            <h1 className="text-2xl font-black text-slate-900">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">Use your assigned username or work email.</p>

            {errorMessage && (
              <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                {errorMessage}
              </p>
            )}

            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-identifier" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Username or email
                </label>
                <input
                  id="login-identifier"
                  autoComplete="username"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  placeholder="e.g. animesh3"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-11 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    aria-label={showLoginPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowLoginPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-700"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #4338ca, #6366f1)" }}
              >
                {isLoading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </main>
    );
}
