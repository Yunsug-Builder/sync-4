"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ProfileNicknameGate } from "@/components/auth/ProfileNicknameGate";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ArtistRow = {
  id: string;
  name: string;
};

type ActivityTypeRow = {
  id: string;
  name: string;
};

type WriteTab = "direct" | "x_import";

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

function extractXHandleFromUrl(rawUrl: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (host !== "x.com" && host !== "www.x.com" && host !== "twitter.com" && host !== "www.twitter.com") {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const first = segments[0]?.trim();
    if (!first || first.toLowerCase() === "home" || first.toLowerCase() === "i") {
      return null;
    }
    return first.replace(/^@+/, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

function mapInsertError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("이미 등록된 게시글")) {
    return "이미 등록된 게시글입니다.";
  }
  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("23505")) {
    return "이미 등록된 게시글입니다.";
  }
  if (lower.includes("activity_logs_content_nonempty")) {
    return "내용을 입력해 주세요.";
  }
  return message;
}

export default function WritePage() {
  const router = useRouter();
  const [tab, setTab] = useState<WriteTab>("direct");
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [types, setTypes] = useState<ActivityTypeRow[]>([]);
  const [artistId, setArtistId] = useState("");
  const [activityTypeId, setActivityTypeId] = useState("");
  const [content, setContent] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [isXVerified, setIsXVerified] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const load = async () => {
      setLoadingCatalog(true);
      setLoadError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setLoadError("로그인 정보를 찾을 수 없습니다.");
        setLoadingCatalog(false);
        return;
      }

      const [artistsRes, typesRes, profileRes] = await Promise.all([
        supabase.from("artists").select("id,name").order("name", { ascending: true }),
        supabase.from("activity_types").select("id,name").order("name", { ascending: true }),
        supabase
          .from("profiles")
          .select("x_handle, is_x_verified")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (artistsRes.error) {
        setLoadError(artistsRes.error.message);
        setLoadingCatalog(false);
        return;
      }
      if (typesRes.error) {
        setLoadError(typesRes.error.message);
        setLoadingCatalog(false);
        return;
      }
      if (profileRes.error) {
        setLoadError(profileRes.error.message);
        setLoadingCatalog(false);
        return;
      }

      const nextArtists = (artistsRes.data ?? []) as ArtistRow[];
      const nextTypes = (typesRes.data ?? []) as ActivityTypeRow[];
      const profile = profileRes.data as { x_handle?: string | null; is_x_verified?: boolean } | null;
      setArtists(nextArtists);
      setTypes(nextTypes);
      setArtistId(nextArtists[0]?.id ?? "");
      setActivityTypeId(nextTypes[0]?.id ?? "");
      setXHandle(profile?.x_handle ? normalizeHandle(profile.x_handle) : null);
      setIsXVerified(Boolean(profile?.is_x_verified));
      setLoadingCatalog(false);
    };

    void load();
  }, []);

  const xHandleMatched = useMemo(() => {
    const parsed = extractXHandleFromUrl(xUrl);
    if (!xUrl.trim()) return true;
    if (!parsed || !xHandle) return false;
    return parsed === normalizeHandle(xHandle);
  }, [xUrl, xHandle]);

  const xHandleMismatchMessage = useMemo(() => {
    if (tab !== "x_import" || !xUrl.trim()) return null;
    const parsed = extractXHandleFromUrl(xUrl);
    if (!parsed) return "X(트위터) 게시글 URL 형식을 확인해 주세요.";
    if (!xHandle) return "프로필에 연동된 X 아이디가 없습니다.";
    if (parsed !== normalizeHandle(xHandle)) {
      return `URL의 계정(@${parsed})이 내 연동 계정(@${normalizeHandle(xHandle)})과 일치하지 않습니다.`;
    }
    return null;
  }, [tab, xUrl, xHandle]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    if (!artistId || !activityTypeId) {
      setFormError("아티스트와 활동 유형을 선택해 주세요.");
      setSubmitting(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    if (!accessToken) {
      setFormError("로그인이 필요합니다.");
      setSubmitting(false);
      return;
    }

    let submitContent = "";
    let proofUrl: string | null = null;

    if (tab === "direct") {
      const trimmed = content.trim();
      if (!trimmed) {
        setFormError("직접 기록할 내용을 입력해 주세요.");
        setSubmitting(false);
        return;
      }
      submitContent = trimmed;
    } else {
      if (!isXVerified) {
        setFormError("본인 인증 완료된 계정만 연동할 수 있습니다.");
        setSubmitting(false);
        return;
      }
      const normalized = normalizeUrl(xUrl);
      if (!normalized) {
        setFormError("X(트위터) 게시글 URL 형식을 확인해 주세요.");
        setSubmitting(false);
        return;
      }
      if (!xHandleMatched) {
        setFormError(xHandleMismatchMessage ?? "연동된 계정과 URL 계정이 일치하지 않습니다.");
        setSubmitting(false);
        return;
      }
      proofUrl = normalized;
      submitContent = `X 글 가져오기: ${normalized}`;
    }

    const response = await fetch("/api/activity-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        artist_id: artistId,
        activity_type_id: activityTypeId,
        content: submitContent,
        proof_url: proofUrl,
      }),
    });

    const body = (await response.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok || !body.ok) {
      const message = mapInsertError(body.error ?? "글 등록에 실패했습니다.");
      setFormError(message);
      toast.error(message);
      setSubmitting(false);
      return;
    }

    toast.success("글이 성공적으로 등록되었습니다.");
    router.replace("/");
  };

  return (
    <RequireAuth>
      <ProfileNicknameGate>
        <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-white">글쓰기</h1>
              <Link
                href="/"
                className="text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                메인으로
              </Link>
            </div>

            {loadError ? (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {loadError}
              </p>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">아티스트</label>
                  <select
                    value={artistId}
                    onChange={(e) => setArtistId(e.target.value)}
                    disabled={loadingCatalog}
                    className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50 disabled:opacity-60"
                  >
                    {artists.map((artist) => (
                      <option key={artist.id} value={artist.id}>
                        {artist.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">활동 유형</label>
                  <select
                    value={activityTypeId}
                    onChange={(e) => setActivityTypeId(e.target.value)}
                    disabled={loadingCatalog}
                    className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50 disabled:opacity-60"
                  >
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-zinc-950 p-1">
                <button
                  type="button"
                  onClick={() => setTab("direct")}
                  className={`h-10 rounded-lg text-sm font-medium transition ${
                    tab === "direct"
                      ? "bg-white text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  직접 기록하기
                </button>
                <button
                  type="button"
                  onClick={() => setTab("x_import")}
                  className={`h-10 rounded-lg text-sm font-medium transition ${
                    tab === "x_import"
                      ? "bg-white text-zinc-900"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  X(트위터) 글 가져오기
                </button>
              </div>

              {tab === "direct" ? (
                <div className="mt-4">
                  <p className="mb-3 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm font-medium text-fuchsia-200">
                    ✨ SYNC에 직접 작성 시 1.5배 VIBE 지급
                  </p>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={7}
                    placeholder="활동 내용을 직접 기록해 주세요."
                    className="w-full resize-none rounded-xl border border-white/15 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50"
                  />
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-3 text-sm text-zinc-400">
                    본인 인증 완료된 계정의 글만 연동 가능
                  </p>
                  <input
                    type="url"
                    inputMode="url"
                    value={xUrl}
                    onChange={(e) => setXUrl(e.target.value)}
                    placeholder="https://x.com/username/status/..."
                    className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50"
                  />
                  {!isXVerified ? (
                    <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                      <p className="text-sm text-amber-200">X 계정 인증이 필요합니다.</p>
                      <Link
                        href="/profile"
                        className="mt-2 inline-flex rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/10"
                      >
                        프로필에서 X 계정 인증하기
                      </Link>
                    </div>
                  ) : null}
                  {isXVerified && xHandle ? (
                    <p className="mt-2 text-xs text-zinc-500">연동 계정: @{normalizeHandle(xHandle)}</p>
                  ) : null}
                  {xHandleMismatchMessage ? (
                    <p className="mt-2 text-xs text-red-300">{xHandleMismatchMessage}</p>
                  ) : null}
                </div>
              )}

              {formError ? <p className="mt-3 text-sm text-red-300">{formError}</p> : null}

              <button
                type="submit"
                disabled={
                  submitting ||
                  loadingCatalog ||
                  artists.length === 0 ||
                  types.length === 0 ||
                  (tab === "x_import" && (!isXVerified || Boolean(xHandleMismatchMessage)))
                }
                className="mt-5 h-11 w-full rounded-xl bg-white text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "등록 중..." : "등록하기"}
              </button>
            </form>
          </div>
        </div>
      </ProfileNicknameGate>
    </RequireAuth>
  );
}
