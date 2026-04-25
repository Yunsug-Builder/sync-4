"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { estimatedBonusVibes } from "@/lib/rewards";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState<string | null>(null);
  const [xHandleInput, setXHandleInput] = useState("");
  const [xSaving, setXSaving] = useState(false);
  const [xVerifying, setXVerifying] = useState(false);
  const [xSaveError, setXSaveError] = useState<string | null>(null);
  const [xVerifyError, setXVerifyError] = useState<string | null>(null);
  const [xSaveMessage, setXSaveMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [totalVibes, setTotalVibes] = useState<number | null>(null);
  const [expectedBonusVibesSum, setExpectedBonusVibesSum] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // TODO: Replace with DB-backed value once `profiles.is_x_verified` is selected.
  const [isXVerified, setIsXVerified] = useState(false);
  const shouldShowPendingBadge = Boolean(xHandle) && !isXVerified;

  const loadProfile = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    setLoadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setLoggedIn(false);
      setNickname(null);
      setXHandle(null);
      setVerificationCode(null);
      setXHandleInput("");
      setXSaveError(null);
      setXVerifyError(null);
      setXSaveMessage(null);
      setTotalVibes(null);
      setExpectedBonusVibesSum(null);
      setIsXVerified(false);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("nickname, total_vibes, x_handle, verification_code")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      setLoadError(profileErr.message);
      setNickname(null);
      setXHandle(null);
      setVerificationCode(null);
      setXHandleInput("");
      setTotalVibes(null);
      setExpectedBonusVibesSum(null);
      setIsXVerified(false);
      setLoading(false);
      return;
    }

    const tp =
      typeof (profile as { total_vibes?: number } | null)?.total_vibes === "number"
        ? (profile as { total_vibes: number }).total_vibes
        : 0;
    const nn =
      typeof (profile as { nickname?: string } | null)?.nickname === "string"
        ? (profile as { nickname: string }).nickname
        : null;
    const rawXHandle =
      typeof (profile as { x_handle?: string | null } | null)?.x_handle === "string"
        ? (profile as { x_handle: string }).x_handle
        : null;
    const rawVerificationCode =
      typeof (profile as { verification_code?: string | null } | null)?.verification_code ===
      "string"
        ? (profile as { verification_code: string }).verification_code
        : null;
    setNickname(nn?.trim() || null);
    setXHandle(rawXHandle?.trim() || null);
    setXHandleInput(rawXHandle?.trim() || "");
    setVerificationCode(rawVerificationCode?.trim() || null);
    setTotalVibes(tp);

    const { data: logs, error: qErr } = await supabase
      .from("activity_logs")
      .select("id, view_count")
      .eq("user_id", user.id)
      .eq("status", "approved")
      .eq("is_settled", false);

    if (qErr) {
      setLoadError(qErr.message);
      setExpectedBonusVibesSum(null);
      setLoading(false);
      return;
    }

    const normalizedLogs = (logs ?? []) as Array<{ id: string; view_count?: number }>;
    let sum = 0;
    for (const row of normalizedLogs) {
      const vc =
        typeof row.view_count === "number" && !Number.isNaN(row.view_count)
          ? row.view_count
          : 0;
      sum += estimatedBonusVibes(0, vc);
    }

    setExpectedBonusVibesSum(sum);
    setLoading(false);
  }, []);

  const handleSaveXHandle = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setXSaving(true);
    setXSaveError(null);
    setXSaveMessage(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setXSaveError("로그인이 필요합니다.");
        return;
      }

      const trimmed = xHandleInput.trim();
      if (trimmed.length > 32) {
        setXSaveError("X 아이디는 32자 이하로 입력해 주세요.");
        return;
      }
      if (/\s/.test(trimmed)) {
        setXSaveError("공백 없이 입력해 주세요.");
        return;
      }

      const normalized =
        trimmed === ""
          ? null
          : `@${trimmed.replace(/^@+/, "").toLowerCase()}`;

      const { data: updated, error } = await supabase
        .from("profiles")
        .update({ x_handle: normalized })
        .eq("id", user.id)
        .select("x_handle, verification_code")
        .maybeSingle();

      if (error) {
        setXSaveError(error.message);
        return;
      }

      if (!updated) {
        setXSaveError("프로필을 찾을 수 없습니다.");
        return;
      }

      const savedHandle =
        typeof (updated as { x_handle?: unknown }).x_handle === "string"
          ? String((updated as { x_handle: string }).x_handle).trim()
          : null;
      const savedCode =
        typeof (updated as { verification_code?: unknown }).verification_code === "string"
          ? String((updated as { verification_code: string }).verification_code).trim()
          : null;

      setXHandle(savedHandle || null);
      setXHandleInput(savedHandle || "");
      setVerificationCode(savedCode || null);
      setIsXVerified(false);
      setXSaveMessage("X 계정이 저장되었습니다.");
    } finally {
      setXSaving(false);
    }
  }, [xHandleInput]);

  const handleCopyVerificationCode = useCallback(async () => {
    if (!verificationCode) return;
    try {
      await navigator.clipboard.writeText(verificationCode);
      setCopyMessage("인증 코드가 복사되었습니다.");
    } catch {
      setCopyMessage("복사에 실패했습니다. 코드를 직접 복사해 주세요.");
    }
  }, [verificationCode]);

  const handleVerifyProcessStart = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setXVerifying(true);
    setXVerifyError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("로그인이 필요합니다.");
      }

      const response = await fetch("/api/auth/x-verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "인증 확인에 실패했습니다.");
      }

      setIsXVerified(true);
      const successMessage = body.message ?? "X 계정 인증이 완료되었습니다.";
      toast.success(successMessage);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "인증 확인 중 오류가 발생했습니다.";
      setXVerifyError(message);
      toast.error(message);
    } finally {
      setXVerifying(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadProfile());
  }, [loadProfile]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void loadProfile();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold text-white">프로필</h1>
          {loggedIn ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadProfile()}
              className="shrink-0 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-sync-purple/40 hover:text-white disabled:opacity-50"
            >
              {loading ? "불러오는 중…" : "VIBE 새로고침"}
            </button>
          ) : null}
        </div>

        {!loading && !loggedIn ? (
          <p className="mt-6 text-sm text-zinc-400">
            로그인 후 마이페이지 기능을 이용할 수 있어요.{" "}
            <Link href="/login?next=/profile" className="text-sync-purple underline">
              로그인
            </Link>
          </p>
        ) : null}

        {loadError ? (
          <p className="mt-6 text-sm text-red-300">{loadError}</p>
        ) : null}

        {loggedIn ? (
          <>
            <section
              className={`mt-8 rounded-2xl border px-5 py-5 ${
                shouldShowPendingBadge
                  ? "border-amber-400/30 bg-zinc-900"
                  : "border-white/10 bg-zinc-900/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-200">계정 연동 및 인증</h2>
                {isXVerified ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
                    인증 완료
                  </span>
                ) : shouldShowPendingBadge ? (
                  <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
                    인증 대기 중
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {nickname ? `${nickname} 님` : "내 계정"}의 X(트위터) 아이디를 저장하고 인증 코드를
                복사해 인증 글에 포함해 주세요.
              </p>
              <label className="mt-4 block text-xs font-medium text-zinc-400">X 아이디</label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={xHandleInput}
                  onChange={(e) => setXHandleInput(e.target.value)}
                  placeholder="@username"
                  className="h-11 flex-1 rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-sync-purple/40"
                  maxLength={32}
                />
                <button
                  type="button"
                  disabled={xSaving}
                  onClick={() => void handleSaveXHandle()}
                  className="h-11 rounded-xl bg-white px-4 text-sm font-medium text-zinc-900 transition hover:opacity-90 disabled:opacity-50"
                >
                  {xSaving ? "저장 중…" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={handleVerifyProcessStart}
                  disabled={xVerifying || !xHandle || !verificationCode || isXVerified}
                  className="h-11 rounded-xl border border-white/15 bg-zinc-800 px-4 text-sm font-medium text-zinc-100 transition hover:border-sync-purple/40 hover:text-white"
                >
                  {xVerifying ? "검증 중..." : "인증 완료 확인"}
                </button>
              </div>
              {xHandle ? <p className="mt-2 text-xs text-zinc-400">현재 저장값: {xHandle}</p> : null}
              {xSaveError ? <p className="mt-2 text-xs text-red-300">{xSaveError}</p> : null}
              {xVerifyError ? <p className="mt-2 text-xs text-red-300">{xVerifyError}</p> : null}
              {xSaveMessage ? <p className="mt-2 text-xs text-emerald-300">{xSaveMessage}</p> : null}

              <div className="mt-4 rounded-xl border border-white/15 bg-zinc-950 px-4 py-4">
                <p className="text-[11px] text-zinc-500">
                  아래 코드를 귀하의 X(트위터) 프로필 소개(Bio)에 포함해 주세요.
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-white/15 bg-zinc-900/70 px-3 py-2">
                  <p className="break-all font-mono text-sm text-zinc-200">
                    {verificationCode ?? "아직 발급된 인증 코드가 없습니다."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopyVerificationCode()}
                    disabled={!verificationCode}
                    className="shrink-0 rounded-lg border border-white/15 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-sync-purple/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    복사
                  </button>
                </div>
                {copyMessage ? <p className="mt-2 text-xs text-zinc-400">{copyMessage}</p> : null}
              </div>
            </section>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-zinc-900/50 px-5 py-5">
                <h2 className="text-sm font-semibold text-zinc-300">누적 VIBE (total_vibes)</h2>
                <p className="mt-3 text-3xl font-bold tabular-nums text-white">
                  {loading && totalVibes == null ? "…" : (totalVibes ?? 0).toLocaleString("ko-KR")}
                  <span className="ml-1 text-base font-medium text-zinc-400">V</span>
                </p>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                  승인 시 기본 점수와 주간 정산으로 반영된 가중 보너스 VIBE가 합산된 값입니다.
                </p>
              </section>

              <section className="rounded-2xl border border-sync-purple/25 bg-sync-purple/5 px-5 py-5">
                <h2 className="text-sm font-semibold text-sync-purple">이번 주 획득 예정 VIBE</h2>
                <p className="mt-3 text-3xl font-bold tabular-nums text-white">
                  {loading
                    ? "…"
                    : expectedBonusVibesSum != null
                      ? `+${expectedBonusVibesSum.toLocaleString("ko-KR")}`
                      : "0"}
                  <span className="ml-1 text-base font-medium text-zinc-400">V</span>
                </p>
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                  승인되었고 아직 정산되지 않은 내 활동의 예상 가중 보너스 합계입니다.
                </p>
              </section>
            </div>

            <Link
              href="/settlements"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-medium text-zinc-200 transition hover:border-sync-purple/40 hover:text-white"
            >
              정산 이력 보기
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
