"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function ProfileNicknameGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"loading" | "onboarding" | "ready">("loading");
  const [nicknameInput, setNicknameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setPhase("ready");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        setError(profileError.message);
        setPhase("onboarding");
        return;
      }

      if (!profile) {
        setPhase("onboarding");
        return;
      }

      const nn = typeof profile.nickname === "string" ? profile.nickname.trim() : "";
      setPhase(nn ? "ready" : "onboarding");
    };

    void run();
  }, []);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("로그인 정보를 찾을 수 없습니다.");
      setSaving(false);
      return;
    }

    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      setError("닉네임을 입력해 주세요.");
      setSaving(false);
      return;
    }

    if (trimmed.length > 40) {
      setError("닉네임은 40자 이하로 입력해 주세요.");
      setSaving(false);
      return;
    }

    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        nickname: trimmed,
      },
      { onConflict: "id" }
    );

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    const { data: saved, error: verifyError } = await supabase
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (verifyError) {
      setError(`저장은 되었으나 확인 단계에서 오류가 났습니다: ${verifyError.message}`);
      setSaving(false);
      return;
    }

    const savedNickname =
      typeof saved?.nickname === "string" ? saved.nickname.trim() : "";
    if (savedNickname !== trimmed) {
      setError("닉네임이 서버에 반영되지 않았습니다. 새로고침 후 다시 시도해 주세요.");
      setSaving(false);
      return;
    }

    setPhase("ready");
    setSaving(false);
  };

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        프로필 확인 중…
      </div>
    );
  }

  if (phase === "onboarding") {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-100">
        <div className="mx-auto w-full max-w-md">
          <p className="text-xs tracking-[0.2em] text-zinc-500">SYNC</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            닉네임을 정해 주세요
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            커뮤니티에서 사용할 닉네임입니다. 나중에 프로필에서 바꿀 수 있어요.
          </p>

          <form onSubmit={handleSave} className="mt-10 space-y-4">
            <input
              type="text"
              placeholder="닉네임"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              className="h-12 w-full rounded-2xl border border-white/15 bg-zinc-900 px-4 text-sm outline-none transition placeholder:text-zinc-500 focus:border-fuchsia-400/50"
              maxLength={40}
              autoComplete="nickname"
            />
            <button
              type="submit"
              disabled={saving}
              className="h-12 w-full rounded-2xl bg-white text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "저장 중…" : "시작하기"}
            </button>
          </form>

          {error ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
