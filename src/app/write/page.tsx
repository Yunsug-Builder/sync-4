"use client";

import { Suspense } from "react";
import { ProfileNicknameGate } from "@/components/auth/ProfileNicknameGate";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { WriteContent } from "./WriteContent";

export default function WritePage() {
  return (
    <RequireAuth>
      <ProfileNicknameGate>
        <Suspense fallback={<div>로딩 중...</div>}>
          <WriteContent />
        </Suspense>
      </ProfileNicknameGate>
    </RequireAuth>
  );
}
