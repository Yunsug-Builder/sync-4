-- 아이템 구매를 처리하는 RPC 함수 (실제 설치 명세와 동일)
CREATE OR REPLACE FUNCTION public.purchase_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid(); -- 현재 로그인한 유저 ID
    v_item_price bigint;
    v_user_vibes bigint;
BEGIN
    -- 1. 상품 가격 확인
    SELECT price INTO v_item_price FROM shop_items WHERE id = p_item_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '상품을 찾을 수 없습니다.');
    END IF;

    -- 2. 유저의 현재 바이브 잔액 확인
    SELECT total_vibes INTO v_user_vibes FROM profiles WHERE id = v_user_id;
    IF v_user_vibes < v_item_price THEN
        RETURN jsonb_build_object('ok', false, 'error', '바이브가 부족합니다.');
    END IF;

    -- 3. 트랜잭션 처리: 바이브 차감 및 인벤토리 추가
    -- 바이브 차감
    UPDATE profiles 
    SET total_vibes = total_vibes - v_item_price 
    WHERE id = v_user_id;

    -- 인벤토리 추가
    INSERT INTO user_inventory (user_id, item_id)
    VALUES (v_user_id, p_item_id);

    RETURN jsonb_build_object('ok', true, 'message', '구매가 완료되었습니다.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', '처리 중 오류가 발생했습니다.');
END;
$$;
