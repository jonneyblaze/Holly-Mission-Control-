"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Bot, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";

type Step = "login" | "mfa";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Check if MFA is required
    // After signInWithPassword, if MFA is enrolled, the session
    // has an aal1 level. We need to check and elevate to aal2.
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactors = factorsData?.totp?.filter((f: { status: string }) => f.status === "verified") || [];

      if (totpFactors.length > 0) {
        // MFA is enabled — need verification
        setMfaFactorId(totpFactors[0].id);
        setStep("mfa");
        setLoading(false);
        return;
      }
    } catch {
      // MFA check failed — proceed without it
    }

    // No MFA — go straight to dashboard
    router.push("/");
    router.refresh();
  };

  const handleMFAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaCode.length !== 6) return;
    setLoading(true);
    setError(null);

    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode,
      });

      if (verifyError) throw verifyError;

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setMfaCode("");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B3A57] flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25px 25px, white 1px, transparent 0)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/30">
            {step === "mfa" ? (
              <ShieldCheck className="w-9 h-9 text-white" />
            ) : (
              <Bot className="w-9 h-9 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-montserrat font-bold text-white tracking-tight">
            Mission Control
          </h1>
          <p className="text-sm text-teal-300 font-medium mt-1">
            {step === "mfa" ? "Two-Factor Authentication" : "Holly's Command Centre"}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {step === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sean@bodylytics.coach"
                  autoComplete="email"
                  className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-teal-500/20 transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          ) : (
            /* MFA Verification Step */
            <form onSubmit={handleMFAVerify} className="space-y-5">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6 text-teal-600" />
                </div>
                <p className="text-sm text-slate-600">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <div className="flex justify-center">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                  className="w-48 h-14 px-4 text-center text-2xl font-mono tracking-[0.5em] bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="w-full h-11 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-teal-500/20 transition-all hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Verify
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("login");
                  setMfaCode("");
                  setError(null);
                  supabase.auth.signOut();
                }}
                className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Back to login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-teal-300/60 mt-6">
          BodyLytics &middot; Non-verbal Communication Training
        </p>
      </div>
    </div>
  );
}
