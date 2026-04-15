"use client";

type ShopItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
};

type ShopItemCardProps = {
  item: ShopItem;
  loggedIn: boolean;
  owned: boolean;
  cannotAfford: boolean;
  buying: boolean;
  onBuy: (itemId: string) => Promise<void> | void;
};

export function ShopItemCard({
  item,
  loggedIn,
  owned,
  cannotAfford,
  buying,
  onBuy,
}: ShopItemCardProps) {
  const disabled = !loggedIn || owned || cannotAfford || buying;

  return (
    <li className="rounded-2xl border border-white/10 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-500">{item.category ?? "기타"}</p>
      <p className="mt-1 text-lg font-semibold text-white">{item.name}</p>
      <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{item.description?.trim() || "설명 없음"}</p>
      <p className="mt-4 text-base font-semibold tabular-nums text-sync-purple">
        {item.price.toLocaleString("ko-KR")} VIBE
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onBuy(item.id)}
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-white/15 text-sm font-medium text-zinc-200 transition hover:border-sync-purple/45 hover:text-white disabled:opacity-50"
      >
        {!loggedIn
          ? "로그인 필요"
          : owned
            ? "보유 중"
            : cannotAfford
              ? "VIBE 부족"
              : buying
                ? "구매 중…"
                : "구매"}
      </button>
    </li>
  );
}
