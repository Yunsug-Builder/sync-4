"use client";

type ShopItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
};

type InventoryRow = {
  id: string;
  item_id: string;
  is_active: boolean;
  purchased_at: string;
  shop_items: ShopItem | ShopItem[] | null;
};

type InventoryItemRowProps = {
  row: InventoryRow;
  acting: boolean;
  showPrice?: boolean;
  onToggle: (row: InventoryRow) => Promise<void> | void;
};

function firstOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function InventoryItemRow({ row, acting, showPrice = true, onToggle }: InventoryItemRowProps) {
  const item = firstOrNull(row.shop_items);
  const active = Boolean(row.is_active);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-900/40 px-4 py-3">
      <div>
        <p className="text-sm text-zinc-500">{item?.category ?? "기타"}</p>
        <p className="text-base font-semibold text-white">{item?.name ?? "아이템"}</p>
        {showPrice ? (
          <p className="text-xs text-zinc-500">
            구매가 {(item?.price ?? 0).toLocaleString("ko-KR")} VIBE · 구매일{" "}
            {new Date(row.purchased_at).toLocaleString("ko-KR", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            구매일{" "}
            {new Date(row.purchased_at).toLocaleString("ko-KR", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={acting}
        onClick={() => void onToggle(row)}
        className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
          active
            ? "border border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
            : "border border-white/15 text-zinc-200 hover:border-sync-purple/45 hover:text-white"
        } disabled:opacity-60`}
      >
        {acting ? "처리 중…" : active ? "적용 해제" : "프로필 적용"}
      </button>
    </li>
  );
}
