"use client";

import { useMemo, useState } from "react";
import { TestSpotSeedPanel } from "@/components/dev/TestSpotSeedPanel";

function CoinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3c4.418 0 8 1.79 8 4s-3.582 4-8 4-8-1.79-8-4 3.582-4 8-4Z" />
      <path d="M20 7v5c0 2.21-3.582 4-8 4s-8-1.79-8-4V7" />
      <path d="M20 12v5c0 2.21-3.582 4-8 4s-8-1.79-8-4v-5" />
    </svg>
  );
}

type Place = {
  id: string;
  title: string;
  subtitle: string;
  fandom: string;
  rewardPoints: number;
  note: string;
  photos: string[];
};

function PhotoCarousel({ photos, placeTitle }: { photos: string[]; placeTitle: string }) {
  const safePhotos = useMemo(() => photos.slice(0, 3), [photos]);
  const [active, setActive] = useState(0);

  if (safePhotos.length === 0) return null;

  const prev = () => {
    setActive((v) => (v - 1 + safePhotos.length) % safePhotos.length);
  };
  const next = () => {
    setActive((v) => (v + 1) % safePhotos.length);
  };

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/15 bg-black/20">
      <div className="relative aspect-[16/10]">
        <img
          src={safePhotos[active]}
          alt={`${placeTitle} 사진 ${active + 1}`}
          className="h-full w-full object-cover"
          loading="eager"
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget;
            // If remote image fails, show a visible placeholder instead of broken UI.
            img.src =
              "https://placehold.co/800x500/png?text=Image+Unavailable";
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/10" />

        <button
          type="button"
          onClick={prev}
          aria-label="이전 사진"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-white/90 backdrop-blur transition hover:bg-black/45"
        >
          &lt;
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="다음 사진"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-white/90 backdrop-blur transition hover:bg-black/45"
        >
          &gt;
        </button>

        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
          {safePhotos.map((_, i) => (
            <span
              key={`dot-${i}`}
              className={`h-1.5 w-1.5 rounded-full transition ${
                i === active ? "bg-white" : "bg-white/35"
              }`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  // TODO: 실제 유저 포인트/레벨과 “오늘의 추천 장소”를 API/DB에서 가져오도록 연결하세요.
  const user = { nickname: "덕후님", points: 1840, nextLevelAt: 2500 };

  const places: Place[] = [
    {
      id: "honor-01",
      title: "성지순례 01: 밤의 종소리",
      subtitle: "서울 · 광화문 인근",
      fandom: "팬덤 리워드 탐험",
      rewardPoints: 120,
      note: "이곳에서 오늘의 체크인을 하면 리워드 점수가 누적돼요.",
      photos: [
        "https://commons.wikimedia.org/wiki/Special:FilePath/Gwanghwamun_Plaza,_Seoul.jpg?width=800",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Gwanghuimun_gate_of_the_Seoul_Fortress_Wall_during_night_in_Seoul,_South_Korea.jpg?width=800",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Gwanghwamun_Gate_(%EA%B4%91%ED%99%94%EB%AC%B8),_Seoul,_South_Korea_(Unsplash).jpg?width=800",
      ],
    },
    {
      id: "honor-02",
      title: "성지순례 02: 별빛 굿즈길",
      subtitle: "부산 · 해운대 거리",
      fandom: "굿즈 인증 챕터",
      rewardPoints: 90,
      note: "사진/방문 인증으로 팬덤 포인트를 더 빠르게 모아요.",
      photos: [
        "https://commons.wikimedia.org/wiki/Special:FilePath/Haeundae_Beach.jpg?width=800",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Korea-Busan-Haeundae-Beach-02.jpg?width=800",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Haeundae_Beach_Night_View.jpg?width=800",
      ],
    },
    {
      id: "honor-03",
      title: "성지순례 03: 바람의 무대뒤",
      subtitle: "대구 · 공연장 골목",
      fandom: "스포일러 없는 감상록",
      rewardPoints: 150,
      note: "짧은 후기까지 남기면 추가 보너스가 붙습니다.",
      photos: [
        "https://commons.wikimedia.org/wiki/Special:FilePath/Daegu_city_hall_context.jpg?width=800",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Daegu_Stadium.original.2167.jpg?width=800",
        "https://commons.wikimedia.org/wiki/Special:FilePath/Daegu_Metropolitan_Office_of_Education.JPG?width=800",
      ],
    },
  ];

  const progress = Math.max(
    0,
    Math.min(1, user.points / Math.max(1, user.nextLevelAt))
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,rgba(139,92,246,0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        <section className="flex min-h-[38vh] flex-col items-center justify-center px-2 pb-14 pt-6 text-center sm:min-h-[42vh] sm:pb-20 sm:pt-10">
          <h1 className="font-sans text-5xl font-semibold tracking-[-0.04em] text-sync-purple sm:text-7xl md:text-8xl [text-shadow:0_0_36px_rgba(139,92,246,0.42),0_0_72px_rgba(139,92,246,0.28),0_0_120px_rgba(139,92,246,0.12)]">
            SYNC
          </h1>
          <p className="mt-7 max-w-lg text-balance text-[0.95rem] font-medium leading-relaxed tracking-[0.02em] text-zinc-400 sm:mt-9 sm:text-lg">
            Sync Your Fandom Life.
          </p>
        </section>

        {/* Top: Points Bar */}
        <section
          aria-label="User points"
          className="relative overflow-hidden rounded-2xl border border-white/25 bg-zinc-950/70"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500/30 via-cyan-500/15 to-amber-500/30" />
          <div className="relative flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-amber-200 ring-1 ring-white/20">
                <CoinIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-zinc-200">현재 포인트</p>
                <p className="text-2xl font-semibold tracking-tight">
                  {user.points.toLocaleString()}
                  <span className="ml-2 text-sm font-medium text-zinc-300">
                    P
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-300">
                  {user.nickname} · 다음 레벨까지{" "}
                  {(user.nextLevelAt - user.points).toLocaleString()}P
                </p>
              </div>
            </div>

            <div className="flex-1 sm:max-w-[420px]">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>LV 업</span>
                <span className="font-medium text-zinc-200">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div
                className="mt-2 h-3 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full w-full origin-left bg-gradient-to-r from-fuchsia-400 via-cyan-400 to-amber-300"
                  style={{ transform: `scaleX(${progress})` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-300">
                <span className="rounded-full bg-zinc-950/55 px-2 py-1 ring-1 ring-white/20">
                  체크인
                </span>
                <span className="rounded-full bg-zinc-950/55 px-2 py-1 ring-1 ring-white/20">
                  후기 보너스
                </span>
                <span className="rounded-full bg-zinc-950/55 px-2 py-1 ring-1 ring-white/20">
                  팬덤 보급
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Middle: Today recommended places */}
        <main className="mt-10">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full bg-fuchsia-500/10 px-3 py-1 text-xs font-medium tracking-wide text-fuchsia-800 dark:text-fuchsia-200 ring-1 ring-fuchsia-500/20">
                Fandom Reward
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
                오늘의 성지순례 추천 장소
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-white">
                오늘의 동선으로 빠르게 리워드를 모아보세요. 카드에서
                보상 포인트를 확인하고 가벼운 인증을 남겨요.
              </p>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-200 sm:mt-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-zinc-950/55 px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                오늘 추천 3곳
              </span>
            </div>
          </header>

          <div
            className="mt-6 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory"
            aria-label="Recommended places"
          >
            {places.map((p, idx) => (
              <article
                key={p.id}
                className="min-w-[320px] flex-shrink-0 snap-start rounded-2xl border border-white/25 bg-zinc-950/60 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition hover:border-white/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-50 ring-1 ring-white/20">
                        {idx === 0 ? "TOP PICK" : idx === 1 ? "GUIDE" : "BONUS"}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-gradient-to-r from-fuchsia-500/45 to-cyan-500/35 px-2.5 py-1 text-[11px] font-medium text-fuchsia-100 ring-1 ring-white/20">
                        {p.fandom}
                      </span>
                    </div>

                    <h2 className="mt-3 text-lg font-semibold tracking-tight">
                      {p.title}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-200">
                      {p.subtitle}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-zinc-950/55 p-3 ring-1 ring-white/25">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-zinc-200">예상 리워드</p>
                    <p className="text-xl font-semibold text-amber-200">
                      {p.rewardPoints.toLocaleString()}
                      <span className="ml-2 text-sm font-medium text-zinc-200">
                        P
                      </span>
                    </p>
                  </div>

                  <div className="mt-3 text-xs leading-relaxed text-zinc-200">
                    {p.note}
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 via-cyan-500 to-amber-300 px-4 text-sm font-semibold text-black transition hover:brightness-110"
                    onClick={() => {
                      // TODO: 상세 페이지/체크인 플로우 연결
                      // eslint-disable-next-line no-alert
                      alert(`"${p.title}" 체크인 준비 화면으로 이동 (구현 필요)`);
                    }}
                  >
                    <span>리워드 받기</span>
                  </button>
                </div>

                {/* Bottom photos: per-course 3-step carousel */}
                <PhotoCarousel photos={p.photos} placeTitle={p.title} />
              </article>
            ))}
          </div>
        </main>
      </div>

      <TestSpotSeedPanel />
    </div>
  );
}
