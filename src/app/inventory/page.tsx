"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { InventoryItemRow } from "@/components/inventory/InventoryItemRow";
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

export default function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [totalVibes, setTotalVibes] = useState(0);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    void loadInventory();
  }, [loadInventory]);

  const onToggleActive = useCallback(
    async (row: InventoryRow) => {
      const supabase = getSupabaseBrowserClient();
      setActingId(row.id);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc("toggle_item_active", {
        p_inventory_id: row.id,
      });
      setActingId(null);
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
      await loadInventory();
    },
    [loadInventory]
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <Link href="/shop" className="text-sm text-zinc-500 transition hover:text-white">
            ← 상점
          </Link>
          <Link href="/profile" className="text-sm text-zinc-400 transition hover:text-white">
            프로필
          </Link>
        </div>

        <header className="mt-6">
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-sync-purple/90">
            Inventory
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">내 인벤토리</h1>
          <p className="mt-2 text-sm text-zinc-500">
            구매한 아이템을 확인하고, 카테고리별로 하나의 아이템만 적용할 수 있습니다.
          </p>
          <p className="mt-4 text-sm text-zinc-300">
            현재 잔액:{" "}
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

        {!loggedIn ? (
          <p className="mt-8 text-sm text-zinc-500">로그인 후 인벤토리를 확인할 수 있어요.</p>
        ) : loading ? (
          <p className="mt-8 text-sm text-zinc-500">불러오는 중…</p>
        ) : inventory.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">구매한 아이템이 없습니다.</p>
        ) : (
          <ul className="mt-8 space-y-3">
            {inventory.map((row) => (
              <InventoryItemRow
                key={row.id}
                row={row}
                acting={actingId === row.id}
                onToggle={onToggleActive}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
