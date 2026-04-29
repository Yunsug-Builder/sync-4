"use client";

import Link from "next/link";
import { useState } from "react";
import { Globe, Heart, Image as ImageIcon, MessageCircle, Music2 } from "lucide-react";

export type ProofSourceMeta = {
  key: string;
  label: string;
  Icon: typeof Globe;
  iconWrapClass: string;
};

export function getProofSourceMeta(proofUrl: string | null): ProofSourceMeta {
  if (!proofUrl?.trim()) {
    return {
      key: "none",
      label: "출처 없음",
      Icon: Music2,
      iconWrapClass: "border-white/15 bg-zinc-800/80 text-zinc-400",
    };
  }
  try {
    const raw = proofUrl.trim();
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    if (host.includes("weverse")) {
      return {
        key: "weverse",
        label: "Weverse",
        Icon: MessageCircle,
        iconWrapClass: "border-emerald-400/35 bg-emerald-500/15 text-emerald-200",
      };
    }
    if (host === "x.com" || host.includes("twitter.")) {
      return {
        key: "x",
        label: "X",
        Icon: MessageCircle,
        iconWrapClass: "border-zinc-500/50 bg-zinc-800/90 text-zinc-100",
      };
    }
    if (host.includes("theqoo")) {
      return {
        key: "theqoo",
        label: "TheQoo",
        Icon: MessageCircle,
        iconWrapClass: "border-amber-400/35 bg-amber-500/15 text-amber-100",
      };
    }
    if (host.includes("instagram.")) {
      return {
        key: "instagram",
        label: "Instagram",
        Icon: MessageCircle,
        iconWrapClass: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100",
      };
    }
    if (host.includes("youtube.") || host === "youtu.be") {
      return {
        key: "youtube",
        label: "YouTube",
        Icon: Music2,
        iconWrapClass: "border-red-400/35 bg-red-500/15 text-red-100",
      };
    }
    if (host.includes("naver.")) {
      return {
        key: "naver",
        label: "Naver",
        Icon: Globe,
        iconWrapClass: "border-green-400/30 bg-green-500/10 text-green-100",
      };
    }
    const short = host.replace(/^www\./, "");
    return {
      key: "web",
      label: short.length > 24 ? `${short.slice(0, 22)}…` : short,
      Icon: Globe,
      iconWrapClass: "border-white/15 bg-zinc-800/80 text-zinc-300",
    };
  } catch {
    return {
      key: "web",
      label: "Web",
      Icon: Globe,
      iconWrapClass: "border-white/15 bg-zinc-800/80 text-zinc-400",
    };
  }
}

export type FeedCardEntry = {
  id: string;
  user_id: string;
  content: string;
  translations: Record<string, string> | null;
  proof_url: string | null;
  image_urls: string[];
  activityName: string;
  reward_vibes: number;
  sync_count: number;
};

export type LanguageCode = "KO" | "EN" | "ZH" | "JA";

export type FeedCardProps = {
  entry: FeedCardEntry;
  preferredLanguage?: LanguageCode;
  isMine?: boolean;
  onDelete?: (id: string) => void;
  deleting?: boolean;
};

function getTranslationByLanguage(
  translations: Record<string, string> | null,
  language: LanguageCode
): string {
  const key = language.toLowerCase();
  const value = translations?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function FeedCard({
  entry,
  preferredLanguage = "EN",
  isMine = false,
  onDelete,
  deleting = false,
}: FeedCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const detailHref = `/activities/${encodeURIComponent(entry.id)}`;
  const source = getProofSourceMeta(entry.proof_url);
  const { Icon } = source;
  const hasImage = entry.image_urls.length > 0;
  const safeImageIndex = hasImage ? currentImageIndex % entry.image_urls.length : 0;
  const imageUrl = hasImage ? entry.image_urls[safeImageIndex]?.trim() ?? "" : "";
  const extraImageCount = Math.max(0, entry.image_urls.length - 1);
  const translated = getTranslationByLanguage(entry.translations, preferredLanguage);
  const useTranslatedAsPrimary = preferredLanguage !== "KO" && translated.length > 0;
  const primaryText = useTranslatedAsPrimary ? translated : entry.content;
  const reward = Math.max(0, Math.round(entry.reward_vibes));
  const syncCount = Math.max(0, Math.round(entry.sync_count));

  return (
    <li className="relative">
      <Link
        href={detailHref}
        className="absolute inset-0 z-0 rounded-2xl outline-offset-2 ring-offset-zinc-950 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-fuchsia-400/50"
      >
        <span className="sr-only">{entry.activityName} 인증 상세 보기</span>
      </Link>
      <article className="pointer-events-none relative z-[1] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-sm shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <div className="border-b border-zinc-800 px-5 py-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${source.iconWrapClass}`}
              title={source.label}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="truncate text-xs font-medium text-zinc-400">{source.label}</span>
            <span className="rounded-full border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-0.5 text-xs font-medium text-fuchsia-100">
              #{entry.activityName}
            </span>
            {isMine && onDelete ? (
              <button
                type="button"
                className="pointer-events-auto ml-auto rounded-lg border border-red-400/35 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(entry.id);
                }}
              >
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            ) : null}
          </div>
        </div>

        {hasImage ? (
          <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 썸네일 URL 가변 */}
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            {entry.image_urls.length > 1 ? (
              <>
                <button
                  type="button"
                  className="pointer-events-auto absolute left-3 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white transition hover:bg-black/75"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentImageIndex((prev) =>
                      prev <= 0 ? entry.image_urls.length - 1 : prev - 1
                    );
                  }}
                  aria-label="이전 이미지"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="pointer-events-auto absolute right-3 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white transition hover:bg-black/75"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCurrentImageIndex((prev) => (prev + 1) % entry.image_urls.length);
                  }}
                  aria-label="다음 이미지"
                >
                  ›
                </button>
                <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
                  {entry.image_urls.map((_, idx) => (
                    <button
                      key={`${entry.id}-dot-${idx}`}
                      type="button"
                      className={`h-2 w-2 rounded-full transition ${
                        idx === safeImageIndex ? "bg-white" : "bg-white/40 hover:bg-white/70"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCurrentImageIndex(idx);
                      }}
                      aria-label={`${idx + 1}번 이미지로 이동`}
                    />
                  ))}
                </div>
                <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-1 text-xs font-medium text-white">
                  <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                  +{extraImageCount}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 px-5 py-5">
          <p className="whitespace-pre-wrap text-base font-semibold leading-relaxed text-zinc-100">
            {primaryText}
          </p>
          {useTranslatedAsPrimary ? (
            <p className="whitespace-pre-wrap text-sm font-normal italic leading-relaxed text-zinc-500">
              {entry.content}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-5 py-4">
          <p className="tabular-nums text-sm font-bold text-fuchsia-600">
            +{reward.toLocaleString("ko-KR")}V
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300">
            <Heart className="h-4 w-4 text-zinc-400" aria-hidden />
            {syncCount.toLocaleString("ko-KR")}
          </p>
        </div>
      </article>
    </li>
  );
}
