import React from "react";

type Stamp = {
  id: string;
  label: string;
  visited: boolean;
};

export type ActiveInventoryItem = {
  id: string;
  name: string;
  category: string | null;
};

const stampIcons: Array<{
  bgFrom: string;
  bgTo: string;
  icon: (props: { className: string }) => React.ReactNode;
}> = [
  {
    bgFrom: "from-fuchsia-500",
    bgTo: "to-rose-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 21s7-4.35 7-11a7 7 0 0 0-14 0c0 6.65 7 11 7 11Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-cyan-500",
    bgTo: "to-emerald-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M6 20V9l6-4 6 4v11"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 20v-6h6v6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-amber-400",
    bgTo: "to-orange-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M4 12l5-7 6 7-6 7-5-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M16 5l4 2v10l-4 2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-violet-500",
    bgTo: "to-indigo-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 3v18"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M4.5 8.5c2-2 6-2 7.5 0 1.5 2 5.5 2 7.5 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 15.5c2-2 6-2 7.5 0 1.5 2 5.5 2 7.5 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-emerald-400",
    bgTo: "to-teal-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M20 12c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8 8 3.6 8 8Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8 12h8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 8v8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-rose-500",
    bgTo: "to-pink-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 21s-7-4.35-7-11a7 7 0 0 1 14 0c0 6.65-7 11-7 11Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 10.2c.6-1.1 1.55-1.7 2.5-1.7 1.2 0 2.3.9 2.5 2.2.25 1.6-1 2.7-2.4 3.1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-blue-500",
    bgTo: "to-cyan-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M3 12s3-7 9-7 9 7 9 7-3 7-9 7-9-7-9-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-lime-400",
    bgTo: "to-emerald-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M7 7h10v10H7V7Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M5 12H3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M21 12h-2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 5V3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 21v-2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    bgFrom: "from-purple-500",
    bgTo: "to-fuchsia-500",
    icon: ({ className }) => (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <path
          d="M12 2 2 7l10 5 10-5-10-5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M2 17l10 5 10-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M2 12l10 5 10-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function StampIcon({ idx, visited, label }: { idx: number; visited: boolean; label: string }) {
  const pick = stampIcons[idx % stampIcons.length];

  if (!visited) {
    return (
      <div
        className="grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-500"
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 opacity-50" aria-hidden="true">
          <path
            d="M12 2 2 7l10 5 10-5-10-5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M2 17l10 5 10-5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`relative grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br ${pick.bgFrom} ${pick.bgTo} p-[1px] ring-1 ring-white/10`}
      aria-label={label}
      title={label}
    >
      <div className="grid h-full w-full place-items-center rounded-xl bg-black/40">
        <div className="drop-shadow-[0_10px_25px_rgba(0,0,0,0.55)]">
          {pick.icon({ className: "h-7 w-7 text-white" })}
        </div>
      </div>
    </div>
  );
}

export default function Passport({
  artistName,
  levelTitle,
  stamps,
  avatarUrl,
  activeItems = [],
}: {
  artistName: string;
  levelTitle: string;
  stamps: Stamp[];
  avatarUrl?: string | null;
  activeItems?: ActiveInventoryItem[];
}) {
  const stampsSafe = stamps.slice(0, 9);
  const visitedCount = stampsSafe.filter((s) => s.visited).length;
  const borderItem = activeItems.find((item) => item.category === "border");
  const titleItem = activeItems.find((item) => item.category === "title");

  const borderTone =
    borderItem?.name === "네온 핑크"
      ? "border-pink-500 shadow-[0_0_28px_rgba(236,72,153,0.45)]"
      : borderItem?.name === "SYNC 퍼플"
        ? "border-sync-purple shadow-[0_0_28px_rgba(139,92,246,0.45)]"
        : "border-white/20 shadow-[0_0_18px_rgba(139,92,246,0.24)]";

  return (
    <section
      className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
      aria-label="Digital passport"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-sync-purple">DIGITAL PASSPORT</p>
          {titleItem ? (
            <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-sync-purple/85">
              {titleItem.name}
            </p>
          ) : null}
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{artistName}</h2>
          <p className="mt-1 text-sm text-zinc-300">{levelTitle}</p>
        </div>

        <div className="flex items-start gap-3">
          <div
            className={`relative h-14 w-14 overflow-hidden rounded-2xl border-2 bg-zinc-900/70 ${borderTone} transition-shadow duration-500 ${
              borderItem ? "animate-pulse" : ""
            }`}
          >
            {avatarUrl?.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={`${artistName} avatar`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-lg font-semibold text-zinc-200">
                {artistName.slice(0, 1)}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-right">
            <p className="text-[11px] text-zinc-400">완료</p>
            <p className="text-lg font-semibold text-emerald-200">
              {visitedCount}/9
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="my-4 h-px w-full bg-white/10" />

      {/* Grid */}
      <div className="grid grid-cols-3 gap-3" role="grid" aria-label="Stamps grid">
        {Array.from({ length: 9 }).map((_, idx) => {
          const s = stampsSafe[idx];
          if (!s) {
            return (
              <div
                key={`empty-${idx}`}
                className="grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-white/5"
                aria-hidden="true"
              />
            );
          }
          return <StampIcon key={s.id} idx={idx} visited={s.visited} label={s.label} />;
        })}
      </div>

      {/* Footer hint */}
      <p className="mt-4 text-xs text-zinc-400">
        스탬프를 모아 다음 레벨로 업그레이드하세요.
      </p>
    </section>
  );
}

