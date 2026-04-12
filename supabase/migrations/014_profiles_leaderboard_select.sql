-- 누적 랭킹: 닉네임·total_points 등 공개 조회 (anon/authenticated)

drop policy if exists "profiles_select_leaderboard_public" on public.profiles;
create policy "profiles_select_leaderboard_public"
  on public.profiles for select
  to anon, authenticated
  using (true);
