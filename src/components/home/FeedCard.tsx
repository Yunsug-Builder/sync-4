"use client";

import Link from "next/link";
import { Globe, Heart, MessageCircle, Music2 } from "lucide-react";

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
  content: string;
  translations: Record<string, string> | null;
  proof_url: string | null;
  image_url: string | null;
  activityName: string;
  reward_vibes: number;
  sync_count: number;
};

export type LanguageCode = "KO" | "EN" | "ZH" | "JA";

export type FeedCardProps = {
  entry: FeedCardEntry;
  preferredLanguage?: LanguageCode;
};

function getTranslationByLanguage(
  translations: Record<string, string> | null,
  language: LanguageCode
): string {
  const key = language.toLowerCase();
  const value = translations?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function FeedCard({ entry, preferredLanguage = "EN" }: FeedCardProps) {
  const detailHref = `/activities/${encodeURIComponent(entry.id)}`;
  const source = getProofSourceMeta(entry.proof_url);
  const { Icon } = source;
  const imageUrl = entry.image_url?.trim() ?? "";
  const hasImage = imageUrl.length > 0;
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
          </div>
        </div>

        <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- 외부 썸네일 URL 가변
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-700"
              aria-hidden
            />
          )}
        </div>

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
