"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check, AlertTriangle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type MFAStatus = "loading" | "disabled" | "enabled" | "enrolling" | "verifying";

interface Factor {
  id: string;
  friendly_name: string;
  factor_type: string;
  status: string;
  created_at: string;
}

export default function SettingsPage() {
  const supabase = createClient();
  const [mfaStatus, setMfaStatus] = useState<MFAStatus>("loading");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollData, setEnrollData] = useState<{
    id: string;
    qr: string;
    secret: string;
    uri: string;
  } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  const checkMFA = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const totpFactors = (data?.totp || []) as Factor[];
      setFactors(totpFactors);

      const verified = totpFactors.filter((f) => f.status === "verified");
      setMfaStatus(verified.length > 0 ? "enabled" : "disabled");
    } catch (err) {
      console.error("[2FA] check error:", err);
      setMfaStatus("disabled");
    }
  }, [supabase]);

  useEffect(() => {
    checkMFA();
  }, [checkMFA]);

  // Start enrollment
  const handleEnroll = async () => {
    setError(null);
    setMfaStatus("enrolling");

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Mission Control",
      });

      if (error) throw error;

      setEnrollData({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start 2FA setup");
      setMfaStatus("disabled");
    }
  };

  // Verify the TOTP code to complete enrollment
  const handleVerify = async () => {
    if (verifyCode.length !== 6) return;
    setVerifying(true);
    setError(null);

    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: enrollData!.id });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollData!.id,
        challengeId: challenge.id,
        code: verifyCode,
      });

      if (verifyError) throw verifyError;

      toast.success("2FA enabled successfully!");
      setEnrollData(null);
      setVerifyCode("");
      setMfaStatus("enabled");
      checkMFA();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code, try again");
    } finally {
      setVerifying(false);
    }
  };

  // Remove 2FA
  const handleUnenroll = async (factorId: string) => {
    setUnenrolling(true);
    setError(null);

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;

      toast.success("2FA has been disabled");
      setMfaStatus("disabled");
      checkMFA();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setUnenrolling(false);
    }
  };

  const copySecret = () => {
    if (enrollData?.secret) {
      navigator.clipboard.writeText(enrollData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-montserrat font-bold text-navy-500">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage authentication and account security
        </p>
      </div>

      {/* 2FA Section */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              mfaStatus === "enabled" ? "bg-emerald-50" : "bg-slate-50"
            )}>
              {mfaStatus === "enabled" ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              ) : (
                <Shield className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold text-navy-500">Two-Factor Authentication</h2>
              <p className="text-xs text-muted-foreground">
                Add an extra layer of security with a TOTP authenticator app
              </p>
            </div>
            <div className="ml-auto">
              {mfaStatus === "loading" ? (
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              ) : mfaStatus === "enabled" ? (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Enabled
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Disabled
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Disabled state — show enable button */}
          {mfaStatus === "disabled" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <ShieldOff className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">2FA is not enabled</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Your account is protected by password only. Enable 2FA for stronger security
                      using an authenticator app like Google Authenticator, Authy, or 1Password.
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleEnroll}
                className="bg-teal-500 hover:bg-teal-600 text-white gap-2"
              >
                <Smartphone className="w-4 h-4" />
                Set Up 2FA
              </Button>
            </div>
          )}

          {/* Enrolling — show QR code */}
          {mfaStatus === "enrolling" && enrollData && (
            <div className="space-y-5">
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Smartphone className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Scan this QR code</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Open your authenticator app and scan the QR code below, or enter the secret key manually.
                  </p>
                </div>
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enrollData.qr}
                    alt="2FA QR Code"
                    className="w-48 h-48"
                  />
                </div>
              </div>

              {/* Secret key */}
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                  Manual entry key
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-navy-500 bg-white px-3 py-1.5 rounded border border-slate-200 flex-1 select-all break-all">
                    {enrollData.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="p-2 rounded-lg hover:bg-slate-200 transition-colors flex-shrink-0"
                    title="Copy secret"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>

              {/* Verification code input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Enter the 6-digit code from your authenticator app
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && verifyCode.length === 6 && handleVerify()}
                    placeholder="000000"
                    autoFocus
                    className="w-40 h-12 px-4 text-center text-xl font-mono tracking-[0.5em] bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  />
                  <Button
                    onClick={handleVerify}
                    disabled={verifyCode.length !== 6 || verifying}
                    className="bg-teal-500 hover:bg-teal-600 text-white gap-2 h-12 px-6"
                  >
                    {verifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Verify & Enable
                  </Button>
                </div>
              </div>

              <button
                onClick={() => {
                  setMfaStatus("disabled");
                  setEnrollData(null);
                  setVerifyCode("");
                  setError(null);
                }}
                className="text-sm text-muted-foreground hover:text-navy-500 transition-colors"
              >
                Cancel setup
              </button>
            </div>
          )}

          {/* Enabled — show status + disable option */}
          {mfaStatus === "enabled" && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-800">2FA is active</p>
                    <p className="text-xs text-emerald-600 mt-1">
                      Your account requires a verification code from your authenticator app when signing in.
                    </p>
                  </div>
                </div>
              </div>

              {factors.filter((f) => f.status === "verified").map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-4 h-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-navy-500">
                        {factor.friendly_name || "Authenticator App"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Added {new Date(factor.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnenroll(factor.id)}
                    disabled={unenrolling}
                    className="text-red-600 hover:bg-red-50 border-red-200 text-xs"
                  >
                    {unenrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Session info */}
      <div className="bg-white rounded-xl border border-border p-5">
        <h2 className="text-base font-semibold text-navy-500 mb-3">Session</h2>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Signed in as <span className="font-medium text-navy-500">sean@bodylytics.coach</span></p>
          <p>Auth provider: Supabase (email/password{mfaStatus === "enabled" ? " + 2FA" : ""})</p>
        </div>
      </div>
    </div>
  );
}
