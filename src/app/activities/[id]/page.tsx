"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { ActivityCommentsSection } from "@/components/activities/ActivityCommentsSection";
import { ActivityRewardSection } from "@/components/activities/ActivityRewardSection";
import { ActivitySyncControl } from "@/components/activities/ActivitySyncControl";
import type { LanguageCode } from "@/components/home/FeedCard";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { markActivityViewBumped, shouldSkipActivityViewBump } from "@/lib/view-logic";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Row = {
  id: string;
  user_id: string;
  content: string;
  translations?: Record<string, unknown> | null;
  image_urls?: string[] | null;
  proof_url: string | null;
  status: string;
  created_at: string;
  view_count?: number;
  is_settled?: boolean;
  profiles: unknown;
  activity_types: unknown;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const LANGUAGE_TABS: LanguageCode[] = ["KO", "EN", "ZH", "JA"];

function getTranslation(
  translations: Record<string, unknown> | null,
  language: LanguageCode
): string {
  const raw = translations?.[language.toLowerCase()];
  if (typeof raw !== "string") return "";
  return raw.trim();
}

type DetailData = {
  authorUserId: string;
  content: string;
  translations: Record<string, unknown> | null;
  imageUrls: string[];
  proofUrl: string | null;
  nickname: string;
  activityName: string;
  vibes: number;
  status: string;
  viewCount: number;
  isSettled: boolean;
};

export default function ActivityDetailPage() {
  const { language: selectedLanguage, setLanguage } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailData | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id.trim()) {
      void (async () => {
        setLoading(false);
        setError("잘못된 주소입니다.");
        setData(null);
      })();
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    void (async () => {
      setLoading(true);
      setError(null);
      setData(null);
      setSyncCount(0);

      const { data: row, error: qErr } = await supabase
        .from("activity_logs")
        .select(
          `
          id,
          user_id,
          content,
          translations,
          image_urls,
          proof_url,
          status,
          created_at,
          view_count,
          is_settled,
          profiles ( nickname ),
          activity_types ( name, base_vibes )
        `
        )
        .eq("id", id.trim())
        .maybeSingle();

      if (cancelled) return;

      if (qErr) {
        setError(qErr.message);
        setData(null);
        setLoading(false);
        return;
      }

      if (!row) {
        setError(null);
        setData(null);
        setLoading(false);
        return;
      }

      const r = row as Row;
      const prof = firstOrNull(r.profiles as { nickname: string | null } | null);
      const at = firstOrNull(
        r.activity_types as { name: string; base_vibes?: number } | null
      );

      const vc =
        typeof r.view_count === "number" && !Number.isNaN(r.view_count)
          ? r.view_count
          : 0;

      const imageUrls = Array.isArray(r.image_urls)
        ? r.image_urls
            .map((url) => (typeof url === "string" ? url.trim() : ""))
            .filter((url) => url.length > 0)
        : [];
      setData({
        authorUserId: r.user_id,
        content: r.content ?? "",
        translations: r.translations ?? null,
        imageUrls,
        proofUrl: r.proof_url,
        nickname: prof?.nickname?.trim() || "익명",
        activityName: at?.name?.trim() || "활동",
        vibes: typeof at?.base_vibes === "number" ? at.base_vibes : 0,
        status: r.status,
        viewCount: vc,
        isSettled: Boolean(r.is_settled),
      });
      setLoading(false);
      setCurrentImageIndex(0);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const logId = id.trim();
    if (!logId) return;

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const userId = user?.id ?? null;
      setViewerUserId(userId);
      const viewerKey = userId ?? "anon";
      if (shouldSkipActivityViewBump(logId, viewerKey)) {
        return;
      }

      const rpcPayload: { p_log_id: string; p_user_id: string | null } = {
        p_log_id: logId,
        p_user_id: userId,
      };
      const { error: rpcErr } = await supabase.rpc("increment_view_count_v4", rpcPayload);
      if (cancelled) return;
      if (rpcErr) {
        return;
      }

      markActivityViewBumped(logId, viewerKey);
      const { data: vcRow } = await supabase
        .from("activity_logs")
        .select("view_count")
        .eq("id", logId)
        .maybeSingle();
      if (cancelled) return;
      const nextVc =
        vcRow && typeof (vcRow as { view_count?: number }).view_count === "number"
          ? (vcRow as { view_count: number }).view_count
          : null;
      if (nextVc != null) {
        setData((d) => (d ? { ...d, viewCount: nextVc } : d));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const isApproved = data?.status === "approved";
  const isMine = Boolean(data?.authorUserId && viewerUserId && data.authorUserId === viewerUserId);
  const hasImages = (data?.imageUrls.length ?? 0) > 0;
  const safeImageIndex =
    hasImages && data ? currentImageIndex % data.imageUrls.length : 0;
  const currentImageUrl = hasImages && data ? data.imageUrls[safeImageIndex] : null;
  const selectedTranslation = data ? getTranslation(data.translations, selectedLanguage) : "";
  const useTranslatedAsPrimary =
    Boolean(data) && selectedLanguage !== "KO" && selectedTranslation.length > 0;

  const refreshSyncCount = useCallback(() => {
    if (!id.trim()) return;
    const supabase = getSupabaseBrowserClient();
    void supabase
      .from("activity_syncs")
      .select("*", { count: "exact", head: true })
      .eq("activity_id", id.trim())
      .then(({ count, error }) => {
        if (!error) {
          setSyncCount(count ?? 0);
        }
      });
  }, [id]);

  const handleDelete = useCallback(async () => {
    const logId = id.trim();
    if (!logId || !isMine) return;
    const confirmed = window.confirm("이 활동을 삭제 처리하시겠습니까?");
    if (!confirmed) return;

    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      toast.error("로그인이 필요합니다.");
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch("/api/activity-logs", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: logId }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        toast.error(body.error ?? "삭제 처리에 실패했습니다.");
        return;
      }
      toast.success("활동이 삭제 처리되었습니다.");
      router.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제 처리 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }, [id, isMine, router]);

  useEffect(() => {
    if (!id.trim() || data?.status !== "approved") {
      return;
    }
    refreshSyncCount();
    const t = window.setInterval(refreshSyncCount, 4000);
    return () => window.clearInterval(t);
  }, [id, data?.status, refreshSyncCount]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
        >
          <span aria-hidden>←</span>
          메인 피드로
        </Link>

        {loading ? (
          <p className="mt-12 text-sm text-zinc-500">불러오는 중…</p>
        ) : error ? (
          <p className="mt-12 rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
            {error}
          </p>
        ) : !data ? (
          <div className="mt-12 rounded-2xl border border-white/10 bg-zinc-900/50 p-8 text-center">
            <p className="text-lg font-medium text-zinc-200">인증을 찾을 수 없습니다</p>
            <p className="mt-2 text-sm text-zinc-500">
              삭제되었거나 볼 권한이 없을 수 있어요.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium text-zinc-950"
            >
              메인으로 돌아가기
            </Link>
          </div>
        ) : (
          <article className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-sm sm:p-8">
            <header className="space-y-4 border-b border-white/10 pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-1 text-sm font-medium text-fuchsia-100">
                  {data.activityName}
                </span>
                {isMine ? (
                  <div className="ml-auto flex items-center gap-2">
                    <Link
                      href={`/write?edit=${encodeURIComponent(id.trim())}`}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/20 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 transition hover:border-fuchsia-400/40"
                    >
                      수정
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-red-400/35 bg-red-500/10 px-3 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleting ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    작성자
                  </p>
                  <p className="mt-1 text-xl font-semibold text-white">{data.nickname}</p>
                </div>
                <div className="rounded-2xl border border-fuchsia-600/40 bg-fuchsia-600/10 px-5 py-3 text-center sm:text-right">
                  <p className="text-xs font-medium text-zinc-400">획득 VIBE</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-fuchsia-600">
                    +{data.vibes.toLocaleString("ko-KR")}
                    <span className="ml-1 text-lg font-semibold text-fuchsia-200/80">V</span>
                  </p>
                </div>
              </div>

              {isApproved ? (
                <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-sm text-zinc-500">
                  <span>
                    조회{" "}
                    <span className="tabular-nums font-medium text-zinc-300">
                      {data.viewCount.toLocaleString("ko-KR")}
                    </span>
                    회
                  </span>
                  {viewerUserId === null ? (
                    <span className="text-[10px] leading-tight text-zinc-600">
                      로그인 후 Sync와 조회가 가능합니다
                    </span>
                  ) : null}
                </p>
              ) : null}
            </header>

            <div className="py-10">
              {hasImages && currentImageUrl ? (
                <div className="mb-6">
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-900">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 외부 이미지 URL 가변 */}
                    <img src={currentImageUrl} alt="" className="h-full w-full object-cover" />
                    {(data.imageUrls.length ?? 0) > 1 ? (
                      <>
                        <button
                          type="button"
                          className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white transition hover:bg-black/75"
                          onClick={() =>
                            setCurrentImageIndex((prev) =>
                              prev <= 0 ? data.imageUrls.length - 1 : prev - 1
                            )
                          }
                          aria-label="이전 이미지"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white transition hover:bg-black/75"
                          onClick={() =>
                            setCurrentImageIndex((prev) => (prev + 1) % data.imageUrls.length)
                          }
                          aria-label="다음 이미지"
                        >
                          ›
                        </button>
                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                          {data.imageUrls.map((_, idx) => (
                            <button
                              key={`${data.authorUserId}-detail-dot-${idx}`}
                              type="button"
                              className={`h-2 w-2 rounded-full transition ${
                                idx === safeImageIndex
                                  ? "bg-white"
                                  : "bg-white/45 hover:bg-white/70"
                              }`}
                              onClick={() => setCurrentImageIndex(idx)}
                              aria-label={`${idx + 1}번 이미지로 이동`}
                            />
                          ))}
                        </div>
                        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-xs font-medium text-white">
                          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                          +{Math.max(0, data.imageUrls.length - 1)}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mb-6">
                <div className="inline-flex items-center rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
                  {LANGUAGE_TABS.map((lang) => {
                    const active = selectedLanguage === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          void setLanguage(lang);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
                          active
                            ? "bg-fuchsia-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-lg font-semibold leading-relaxed text-zinc-100 sm:text-xl sm:leading-relaxed">
                {useTranslatedAsPrimary ? selectedTranslation : data.content}
              </p>
              {useTranslatedAsPrimary ? (
                <p className="mt-3 whitespace-pre-wrap text-sm font-normal italic leading-relaxed text-zinc-500">
                  {data.content}
                </p>
              ) : null}
            </div>

            {isApproved ? (
              <section className="border-t border-white/10 pt-8">
                <ActivitySyncControl
                  activityLogId={id.trim()}
                  isApproved={isApproved}
                  authorUserId={data.authorUserId}
                  onCountsUpdated={refreshSyncCount}
                />
              </section>
            ) : null}

            {isApproved ? (
              <ActivityRewardSection
                baseVibes={data.vibes}
                viewCount={data.viewCount}
                syncCount={syncCount}
                isSettled={data.isSettled}
                isApproved={isApproved}
              />
            ) : null}

            <footer className="border-t border-white/10 pt-8">
              {data.proofUrl && data.proofUrl.trim().length > 0 ? (
                <a
                  href={data.proofUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/15 bg-zinc-900 px-6 text-sm font-medium text-white transition hover:border-fuchsia-400/40"
                >
                  원문 보러가기
                </a>
              ) : (
                <p className="text-sm text-zinc-500">등록된 원문 링크가 없습니다.</p>
              )}
            </footer>

            {isApproved ? (
              <ActivityCommentsSection activityLogId={id.trim()} isApproved={isApproved} />
            ) : null}
          </article>
        )}
      </div>
    </div>
  );
}
