"use client";

import { FileText, Link2 } from "lucide-react";

export type UserSubmissionCardProps = {
  nickname: string;
  categoryLabel: string;
  content: string;
  imageUrls: string[];
  proofUrl: string | null;
};

export function UserSubmissionCard({
  nickname,
  categoryLabel,
  content,
  imageUrls,
  proofUrl,
}: UserSubmissionCardProps) {
  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <FileText className="h-5 w-5" />
        사용자 제출 내용
      </h2>
      <p className="mb-3 text-sm text-zinc-400">
        작성자: {nickname} · 유형: {categoryLabel}
      </p>
      <p className="whitespace-pre-wrap rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm">
        {content || "내용 없음"}
      </p>
      {imageUrls.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {imageUrls.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-40 w-full rounded-xl border border-white/10 object-cover"
            />
          ))}
        </div>
      ) : null}
      {proofUrl ? (
        <a
          href={proofUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm text-sky-300"
        >
          <Link2 className="h-4 w-4" />
          원본 트윗 링크 열기
        </a>
      ) : null}
    </section>
  );
}
