import type { SupabaseClient } from "@supabase/supabase-js";

/** 테스트용으로 반복 실행 시 같은 제목으로 찾기 쉽게 고정 */
export const TEST_SPOT_TITLE = "[SYNC 테스트] 성지순례 01: 밤의 종소리";

export type SeedTestSpotResult = {
  data: Record<string, unknown> | null;
  error: { message: string; code?: string; details?: string } | null;
};

/**
 * spots 테이블에 테스트 행 1건 insert (임시 검증용).
 * RLS 가 INSERT 를 막으면 error 가 채워집니다.
 */
export async function insertTestSpotRow(
  client: SupabaseClient
): Promise<SeedTestSpotResult> {
  const { data, error } = await client
    .from("spots")
    .insert({
      title: TEST_SPOT_TITLE,
      subtitle: "서울 · 광화문 인근",
      region: "서울",
      reward_points: 120,
      note: "Supabase 연동 테스트용 강제 삽입 행입니다. Table Editor에서 삭제해도 됩니다.",
    })
    .select()
    .single();

  if (error) {
    return {
      data: null,
      error: {
        message: error.message,
        code: error.code,
        details: error.details ?? undefined,
      },
    };
  }

  return { data: data as Record<string, unknown>, error: null };
}
