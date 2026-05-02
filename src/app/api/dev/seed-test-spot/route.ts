import { NextResponse } from "next/server";
import { createSupabaseAnonClient } from "@/lib/supabase";
import { insertTestSpotRow } from "@/lib/seed-test-spot";

/**
 * 개발 전용: spots 테스트 1건 삽입.
 * 터미널: curl -X POST http://localhost:3000/api/dev/seed-test-spot
 * 배포 전 이 라우트를 제거하거나 인증을 붙이세요.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "This endpoint is disabled in production." },
      { status: 403 }
    );
  }

  const supabase = createSupabaseAnonClient();

  const result = await insertTestSpotRow(supabase);

  if (result.error) {
    console.error("[seed-test-spot] insert failed:", result.error);
    return NextResponse.json(
      { ok: false, inserted: false, ...result },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, inserted: true, ...result });
}

export async function GET() {
  return NextResponse.json({
    hint: "POST this URL to insert one test row into public.spots",
    curl: 'curl -X POST http://localhost:3000/api/dev/seed-test-spot',
  });
}
