"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileNicknameGate } from "@/components/auth/ProfileNicknameGate";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ActivityTypeRow = {
  id: string;
  name: string;
};

function mapInsertError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("activity_logs_content_nonempty")) {
    return "인증 내용을 입력해 주세요.";
  }
  if (lower.includes("이미 등록된 게시글")) {
    return "이미 등록된 게시글입니다.";
  }
  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("23505")) {
    return "이미 등록된 게시글입니다.";
  }
  if (lower.includes("foreign key") || lower.includes("23503")) {
    return "저장에 실패했습니다. 활동 유형 또는 아티스트 데이터를 확인해 주세요.";
  }
  if (lower.includes("row-level security") || lower.includes("42501")) {
    return "저장 권한이 없습니다. 로그인 상태를 확인해 주세요.";
  }
  return message;
}

export default function SubmitActivityPage() {
  const router = useRouter();
  const [btsArtistId, setBtsArtistId] = useState<string | null>(null);
  const [types, setTypes] = useState<ActivityTypeRow[]>([]);
  const [activityTypeId, setActivityTypeId] = useState("");
  const [content, setContent] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async () => {
      setLoadingCatalog(true);
      setFetchError(null);

      const [btsRes, typesRes] = await Promise.all([
        supabase.from("artists").select("id").eq("name", "BTS").limit(1).maybeSingle(),
        supabase.from("activity_types").select("id,name").order("name"),
      ]);

      if (btsRes.error) {
        setFetchError(btsRes.error.message);
        setLoadingCatalog(false);
        return;
      }
      if (!btsRes.data?.id) {
        setFetchError(
          "DB에 이름이 ‘BTS’인 아티스트가 없습니다. artists 테이블을 확인해 주세요."
        );
        setLoadingCatalog(false);
        return;
      }

      if (typesRes.error) {
        setFetchError(typesRes.error.message);
        setLoadingCatalog(false);
        return;
      }

      setBtsArtistId(btsRes.data.id as string);
      setTypes((typesRes.data ?? []) as ActivityTypeRow[]);
      setLoadingCatalog(false);
    };

    void load();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const text = content.trim();
    const artistId = btsArtistId;

    if (!artistId) {
      setFormError("BTS 아티스트 정보를 불러올 수 없습니다.");
      setSubmitting(false);
      return;
    }
    if (!activityTypeId.trim()) {
      setFormError("활동 유형을 선택해 주세요.");
      setSubmitting(false);
      return;
    }
    if (!text) {
      setFormError("인증 내용을 입력해 주세요.");
      setSubmitting(false);
      return;
    }

    let proofUrlNormalized: string | null = null;
    const rawUrl = proofUrl.trim();
    if (rawUrl.length > 0) {
      try {
        const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        proofUrlNormalized = new URL(withScheme).toString();
      } catch {
        setFormError("원문 링크(URL) 형식을 확인해 주세요.");
        setSubmitting(false);
        return;
      }
    }

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setFormError("로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요.");
      setSubmitting(false);
      return;
    }

    const insertPayload = {
      artist_id: artistId,
      activity_type_id: activityTypeId.trim(),
      content: text,
      proof_url: proofUrlNormalized,
    };

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setFormError("로그인 정보를 찾을 수 없습니다. 다시 로그인해 주세요.");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/activity-logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(insertPayload),
    });

    const body = (await response.json()) as {
      ok?: boolean;
      id?: string | null;
      error?: string;
    };

    if (!response.ok || !body.ok) {
      setFormError(mapInsertError(body.error ?? "저장에 실패했습니다."));
      setSubmitting(false);
      return;
    }
    console.log("[activity_logs] 새 행 1건이 API를 통해 DB에 생성되었습니다.", {
      id: body.id ?? null,
      artist_id: insertPayload.artist_id,
      activity_type_id: insertPayload.activity_type_id,
      contentPreview:
        insertPayload.content.length > 80
          ? `${insertPayload.content.slice(0, 80)}…`
          : insertPayload.content,
    });

    router.replace("/?submission=success");
  };

  return (
    <RequireAuth>
      <ProfileNicknameGate>
        <div className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
          <div className="mx-auto max-w-lg">
            <Link
              href="/"
              className="text-sm text-zinc-500 transition hover:text-zinc-300"
            >
              ← 메인
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">
              활동 인증 제출
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              MVP는 <span className="text-zinc-200">BTS</span> 팬덤 전용입니다. 활동 유형과
              인증 내용만 제출해 주세요.
            </p>

            {loadingCatalog ? (
              <p className="mt-10 text-sm text-zinc-500">불러오는 중…</p>
            ) : fetchError ? (
              <p className="mt-8 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                {fetchError}
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-10 space-y-5">
                <div className="rounded-2xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    대상 아티스트
                  </span>
                  <p className="mt-1 font-medium text-white">BTS</p>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    활동 유형
                  </label>
                  <select
                    required
                    value={activityTypeId}
                    onChange={(e) => setActivityTypeId(e.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-zinc-900 px-4 text-sm outline-none focus:border-fuchsia-400/50"
                  >
                    <option value="">선택</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    인증 내용
                  </label>
                  <textarea
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={5}
                    placeholder="수행한 활동과 인증 내용을 적어 주세요."
                    className="mt-2 w-full resize-none rounded-2xl border border-white/15 bg-zinc-900 px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-fuchsia-400/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    원문 링크 <span className="font-normal text-zinc-600">(선택)</span>
                  </label>
                  <input
                    type="url"
                    inputMode="url"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    placeholder="https://…"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-zinc-900 px-4 text-sm outline-none placeholder:text-zinc-500 focus:border-fuchsia-400/50"
                  />
                  <p className="mt-1.5 text-xs text-zinc-600">
                    피드에서 &ldquo;원문 보러가기&rdquo;로 열립니다.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !btsArtistId}
                  className="h-12 w-full rounded-2xl bg-white text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-60"
                >
                  {submitting ? "제출 중…" : "인증 제출"}
                </button>

                {formError ? (
                  <p className="text-sm text-red-300" role="alert">
                    {formError}
                  </p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      </ProfileNicknameGate>
    </RequireAuth>
  );
}
