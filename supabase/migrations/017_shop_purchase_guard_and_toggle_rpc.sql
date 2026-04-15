-- Harden shop purchase flow and centralize inventory activation toggle.
CREATE OR REPLACE FUNCTION public.purchase_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_item_price bigint;
    v_user_vibes bigint;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
    END IF;

    SELECT price INTO v_item_price
    FROM public.shop_items
    WHERE id = p_item_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '상품을 찾을 수 없습니다.');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.user_inventory ui
        WHERE ui.user_id = v_user_id
          AND ui.item_id = p_item_id
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', '이미 보유한 아이템입니다.');
    END IF;

    SELECT p.total_vibes INTO v_user_vibes
    FROM public.profiles p
    WHERE p.id = v_user_id
    FOR UPDATE;

    IF v_user_vibes IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '프로필 정보를 찾을 수 없습니다.');
    END IF;

    IF v_user_vibes < v_item_price THEN
        RETURN jsonb_build_object('ok', false, 'error', '바이브가 부족합니다.');
    END IF;

    UPDATE public.profiles
    SET total_vibes = total_vibes - v_item_price
    WHERE id = v_user_id;

    INSERT INTO public.user_inventory (user_id, item_id)
    VALUES (v_user_id, p_item_id);

    RETURN jsonb_build_object('ok', true, 'message', '구매가 완료되었습니다.');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', '처리 중 오류가 발생했습니다.');
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_item_active(p_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_item_id uuid;
    v_category text;
    v_current_active boolean;
    v_next_active boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
    END IF;

    SELECT ui.item_id, COALESCE(ui.is_active, false), si.category
    INTO v_item_id, v_current_active, v_category
    FROM public.user_inventory ui
    JOIN public.shop_items si ON si.id = ui.item_id
    WHERE ui.id = p_inventory_id
      AND ui.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', '인벤토리 아이템을 찾을 수 없습니다.');
    END IF;

    IF v_category IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', '카테고리 없는 아이템은 적용할 수 없습니다.');
    END IF;

    v_next_active := NOT v_current_active;

    IF v_next_active THEN
        UPDATE public.user_inventory ui
        SET is_active = false
        FROM public.shop_items si
        WHERE ui.user_id = v_user_id
          AND ui.item_id = si.id
          AND si.category = v_category;
    END IF;

    UPDATE public.user_inventory
    SET is_active = v_next_active
    WHERE id = p_inventory_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
        'ok', true,
        'is_active', v_next_active,
        'message', CASE WHEN v_next_active
            THEN '아이템을 프로필에 적용했습니다.'
            ELSE '아이템 적용을 해제했습니다.'
        END
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('ok', false, 'error', '처리 중 오류가 발생했습니다.');
END;
$$;
