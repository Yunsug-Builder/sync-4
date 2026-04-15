"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
import { ShopItemCard } from "@/components/shop/ShopItemCard";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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

export default function ShopPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [totalVibes, setTotalVibes] = useState(0);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const ownedItemIds = useMemo(() => {
    const out = new Set<string>();
    for (const row of inventory) out.add(row.item_id);
    return out;
  }, [inventory]);

  const loadAll = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    const { data: shopRows, error: shopErr } = await supabase
      .from("shop_items")
      .select("id, name, description, price, image_url, category")
      .order("created_at", { ascending: false });

    if (shopErr) {
      setError(shopErr.message);
      setItems([]);
      setInventory([]);
      setTotalVibes(0);
      setLoggedIn(Boolean(user?.id));
      setLoading(false);
      return;
    }

    setItems((shopRows ?? []) as ShopItem[]);

    if (!user?.id) {
      setLoggedIn(false);
      setInventory([]);
      setTotalVibes(0);
      setLoading(false);
      return;
    }

    setLoggedIn(true);

    const [{ data: pRow, error: pErr }, { data: invRows, error: invErr }] = await Promise.all([
      supabase.from("profiles").select("total_vibes").eq("id", user.id).maybeSingle(),
      supabase
        .from("user_inventory")
        .select(
          `
          id,
          item_id,
          is_active,
          purchased_at,
          shop_items (
            id, name, description, price, image_url, category
          )
        `
        )
        .eq("user_id", user.id)
        .order("purchased_at", { ascending: false }),
    ]);

    if (pErr) {
      setError(pErr.message);
      setTotalVibes(0);
    } else {
      const n =
        typeof (pRow as { total_vibes?: number } | null)?.total_vibes === "number"
          ? (pRow as { total_vibes: number }).total_vibes
          : 0;
      setTotalVibes(n);
    }

    if (invErr) {
      setError(invErr.message);
      setInventory([]);
    } else {
      setInventory((invRows ?? []) as InventoryRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onBuy = useCallback(
    async (itemId: string) => {
      const supabase = getSupabaseBrowserClient();
      setBuyingId(itemId);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc("purchase_item", {
        p_item_id: itemId,
      });

      setBuyingId(null);

      if (rpcErr) {
        const msg = rpcErr.message || "구매 처리 중 오류가 발생했습니다.";
        setError(msg);
        toast.error(msg);
        return;
      }

      const payload =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;
      if (payload && payload.ok === false) {
        const msg = typeof payload.error === "string" ? payload.error : "purchase_failed";
        setError(msg);
        toast.error(msg);
        return;
      }

      const successMsg =
        payload && typeof payload.message === "string" ? payload.message : "구매가 완료되었습니다.";
      toast.success(successMsg);
      await loadAll();
    },
    [loadAll]
  );

  const onActivate = useCallback(
    async (row: InventoryRow) => {
      const supabase = getSupabaseBrowserClient();
      setActivatingId(row.id);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc("toggle_item_active", {
        p_inventory_id: row.id,
      });
      setActivatingId(null);
      if (rpcErr) {
        const msg = rpcErr.message || "적용 상태 변경 중 오류가 발생했습니다.";
        setError(msg);
        toast.error(msg);
        return;
      }

      const payload =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null;
      if (payload && payload.ok === false) {
        const msg = typeof payload.error === "string" ? payload.error : "toggle_failed";
        setError(msg);
        toast.error(msg);
        return;
      }

      const successMsg =
        payload && typeof payload.message === "string"
          ? payload.message
          : row.is_active
            ? "아이템 적용을 해제했습니다."
            : "아이템을 프로필에 적용했습니다.";
      toast.success(successMsg);
      await loadAll();
    },
    [loadAll]
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-zinc-500 transition hover:text-white">
            ← 메인
          </Link>
          <Link href="/profile" className="text-sm text-zinc-400 transition hover:text-white">
            프로필
          </Link>
          <Link href="/inventory" className="text-sm text-zinc-400 transition hover:text-white">
            인벤토리
          </Link>
        </div>

        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-sync-purple/90">
            Shop
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">VIBE 상점</h1>
          <p className="mt-2 text-sm text-zinc-500">
            보유한 VIBE로 아이템을 구매하고, 인벤토리에서 프로필 적용 상태를 관리하세요.
          </p>
          <p className="mt-4 text-sm text-zinc-300">
            보유 VIBE:{" "}
            <span className="font-semibold tabular-nums text-sync-purple">
              {loggedIn ? totalVibes.toLocaleString("ko-KR") : "로그인 필요"} VIBE
            </span>
          </p>
        </header>

        {error ? (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">상품 목록</h2>
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">등록된 상품이 없습니다.</p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const owned = ownedItemIds.has(item.id);
                const cannotAfford = loggedIn && totalVibes < item.price;
                return (
                  <ShopItemCard
                    key={item.id}
                    item={item}
                    loggedIn={loggedIn}
                    owned={owned}
                    cannotAfford={cannotAfford}
                    buying={buyingId === item.id}
                    onBuy={onBuy}
                  />
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            내 인벤토리
          </h2>
          {!loggedIn ? (
            <p className="mt-4 text-sm text-zinc-500">로그인 후 인벤토리를 확인할 수 있어요.</p>
          ) : loading ? (
            <p className="mt-4 text-sm text-zinc-500">불러오는 중…</p>
          ) : inventory.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">아직 구매한 아이템이 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {inventory.map((row) => (
                <InventoryItemRow
                  key={row.id}
                  row={row}
                  acting={activatingId === row.id}
                  showPrice={false}
                  onToggle={onActivate}
                />
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-600">
            적용 로직: 같은 카테고리에서는 마지막으로 적용한 아이템 1개만 `is_active=true`가 되도록
            처리합니다.
          </p>
        </section>
      </div>
    </div>
  );
}
