"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ProfileNicknameGate } from "@/components/auth/ProfileNicknameGate";
import { RequireAuth } from "@/components/auth/RequireAuth";
import {
  getFanImageExtension,
  inferFanImageContentType,
  validateFanImage,
} from "@/lib/utils/file-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { normalizeProofUrl } from "@/lib/utils/proof-url";

type ArtistRow = {
  id: string;
  name: string;
};

type ActivityTypeRow = {
  id: string;
  name: string;
};

type WriteTab = "direct" | "x_import";

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

function extractXHandleFromUrl(rawUrl: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (host !== "x.com" && host !== "www.x.com" && host !== "twitter.com" && host !== "www.twitter.com") {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const first = segments[0]?.trim();
    if (!first || first.toLowerCase() === "home" || first.toLowerCase() === "i") {
      return null;
    }
    return first.replace(/^@+/, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string | null {
  return normalizeProofUrl(raw);
}

const ACTIVITY_IMAGES_BUCKET = "activity-images";
const MAX_ACTIVITY_IMAGES = 20;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_FORMAT_ERROR_FALLBACK =
  "JPG, JPEG, PNG, WebP, GIF 파일만 업로드 가능합니다.";

function publicObjectPathFromUrl(publicUrl: string, supabaseUrl: string): string | null {
  const base = supabaseUrl.replace(/\/$/, "");
  const needle = `${base}/storage/v1/object/public/${ACTIVITY_IMAGES_BUCKET}/`;
  if (!publicUrl.startsWith(needle)) return null;
  return decodeURIComponent(publicUrl.slice(needle.length));
}

function mapInsertError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("이미 인증 완료된 트윗입니다") ||
    lower.includes("삭제 후 재등록은 불가능")
  ) {
    return "이미 인증 완료된 트윗입니다. 삭제 후 재등록은 불가능합니다.";
  }
  if (lower.includes("이미 등록된 활동")) {
    return "이미 등록된 활동입니다. 다른 트윗으로 인증해 주세요.";
  }
  if (lower.includes("이미 등록된 게시글")) {
    return "이미 등록된 글입니다.";
  }
  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("23505")) {
    if (lower.includes("proof_url") || lower.includes("unique_proof_url")) {
      return "이미 등록된 글입니다.";
    }
    return "등록 처리 중입니다.";
  }
  if (lower.includes("activity_logs_content_nonempty")) {
    return "내용을 입력해 주세요.";
  }
  return message;
}

export default function WritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = (searchParams.get("edit") ?? "").trim();
  const isEditMode = editId.length > 0;
  const [tab, setTab] = useState<WriteTab>("direct");
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [types, setTypes] = useState<ActivityTypeRow[]>([]);
  const [artistId, setArtistId] = useState("");
  const [activityTypeId, setActivityTypeId] = useState("");
  const [content, setContent] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [isXVerified, setIsXVerified] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingEditDraft, setLoadingEditDraft] = useState(false);
  const [xImporting, setXImporting] = useState(false);
  const [imagePublicUrls, setImagePublicUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [editingProofUrl, setEditingProofUrl] = useState<string | null>(null);
  const [importedProofUrl, setImportedProofUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragImageIdxRef = useRef<number | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const load = async () => {
      setLoadingCatalog(true);
      setLoadError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setLoadError("로그인 정보를 찾을 수 없습니다.");
        setLoadingCatalog(false);
        return;
      }

      const [artistsRes, typesRes, profileRes] = await Promise.all([
        supabase.from("artists").select("id,name").order("name", { ascending: true }),
        supabase.from("activity_types").select("id,name").order("name", { ascending: true }),
        supabase
          .from("profiles")
          .select("x_handle, is_x_verified")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      if (artistsRes.error) {
        setLoadError(artistsRes.error.message);
        setLoadingCatalog(false);
        return;
      }
      if (typesRes.error) {
        setLoadError(typesRes.error.message);
        setLoadingCatalog(false);
        return;
      }
      if (profileRes.error) {
        setLoadError(profileRes.error.message);
        setLoadingCatalog(false);
        return;
      }

      const nextArtists = (artistsRes.data ?? []) as ArtistRow[];
      const nextTypes = (typesRes.data ?? []) as ActivityTypeRow[];
      const profile = profileRes.data as { x_handle?: string | null; is_x_verified?: boolean } | null;
      setArtists(nextArtists);
      setTypes(nextTypes);
      setArtistId(nextArtists[0]?.id ?? "");
      setActivityTypeId(nextTypes[0]?.id ?? "");
      setXHandle(profile?.x_handle ? normalizeHandle(profile.x_handle) : null);
      setIsXVerified(Boolean(profile?.is_x_verified));
      setLoadingCatalog(false);
    };

    void load();
  }, []);

  useEffect(() => {
    if (!isEditMode || !editId) {
      setEditingProofUrl(null);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    void (async () => {
      setLoadingEditDraft(true);
      setFormError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        if (!cancelled) {
          setFormError("로그인이 필요합니다.");
          setLoadingEditDraft(false);
        }
        return;
      }
      const { data: row, error } = await supabase
        .from("activity_logs")
        .select("id, user_id, artist_id, activity_type_id, content, image_urls, proof_url")
        .eq("id", editId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setFormError(error.message);
        setLoadingEditDraft(false);
        return;
      }
      if (!row) {
        setFormError("수정할 활동을 찾을 수 없거나 권한이 없습니다.");
        setLoadingEditDraft(false);
        return;
      }
      setArtistId(typeof row.artist_id === "string" ? row.artist_id : "");
      setActivityTypeId(typeof row.activity_type_id === "string" ? row.activity_type_id : "");
      setContent(typeof row.content === "string" ? row.content : "");
      setImagePublicUrls(
        Array.isArray(row.image_urls)
          ? row.image_urls.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          : []
      );
      setEditingProofUrl(typeof row.proof_url === "string" ? row.proof_url : null);
      setImportedProofUrl(null);
      setTab("direct");
      setLoadingEditDraft(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, isEditMode]);

  const xHandleMatched = useMemo(() => {
    const parsed = extractXHandleFromUrl(xUrl);
    if (!xUrl.trim()) return true;
    if (!parsed || !xHandle) return false;
    return parsed === normalizeHandle(xHandle);
  }, [xUrl, xHandle]);

  const xHandleMismatchMessage = useMemo(() => {
    if (tab !== "x_import" || !xUrl.trim()) return null;
    const parsed = extractXHandleFromUrl(xUrl);
    if (!parsed) return "X(트위터) 게시글 URL 형식을 확인해 주세요.";
    if (!xHandle) return "프로필에 연동된 X 아이디가 없습니다.";
    if (parsed !== normalizeHandle(xHandle)) {
      return `URL의 계정(@${parsed})이 내 연동 계정(@${normalizeHandle(xHandle)})과 일치하지 않습니다.`;
    }
    return null;
  }, [tab, xUrl, xHandle]);

  const handleImageFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;

    const rawFiles = Array.from(list);

    const supabase = getSupabaseBrowserClient();
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    const validation = rawFiles.map((f) => ({ file: f, result: validateFanImage(f) }));
    const validFiles = validation.filter((v) => v.result?.valid === true).map((v) => v.file);
    const firstInvalidMessage =
      validation.find((v) => v.result?.valid !== true)?.result?.message ?? IMAGE_FORMAT_ERROR_FALLBACK;
    if (validFiles.length === 0) {
      toast.error(firstInvalidMessage);
      return;
    }
    if (validFiles.length < rawFiles.length) {
      toast.error(firstInvalidMessage);
    }
    const remaining = MAX_ACTIVITY_IMAGES - imagePublicUrls.length;
    if (remaining <= 0) {
      toast.error(
        `이미지는 최대 ${MAX_ACTIVITY_IMAGES}장까지 첨부할 수 있습니다. (현재 ${imagePublicUrls.length}장)`
      );
      return;
    }
    if (validFiles.length > remaining) {
      toast.error(
        `이미지는 최대 ${MAX_ACTIVITY_IMAGES}장까지 첨부할 수 있습니다. 현재 ${imagePublicUrls.length}장이 있어 ${remaining}장만 추가할 수 있습니다.`
      );
    }
    const take = validFiles.slice(0, remaining);
    for (const f of take) {
      if (f.size > MAX_IMAGE_BYTES) {
        toast.error(
          `"${f.name}"은(는) 5MB를 초과합니다. JPG/JPEG, PNG, WebP, GIF는 장당 최대 5MB까지 업로드할 수 있습니다.`
        );
        return;
      }
    }
    setImageUploading(true);
    try {
      const nextUrls: string[] = [];
      for (const file of take) {
        const extRaw = getFanImageExtension(file) ?? "jpg";
        const safeExt =
          extRaw === "jpg"
            ? "jpg"
            : ["png", "webp", "gif"].includes(extRaw)
              ? extRaw
              : "jpg";
        const path = `${userId}/${crypto.randomUUID()}.${safeExt}`;
        const contentType = inferFanImageContentType(file);
        const { error: upErr } = await supabase.storage.from(ACTIVITY_IMAGES_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType,
        });
        if (upErr) {
          toast.error(upErr.message || "이미지 업로드에 실패했습니다.");
          return;
        }
        const { data: pub } = supabase.storage.from(ACTIVITY_IMAGES_BUCKET).getPublicUrl(path);
        nextUrls.push(pub.publicUrl);
      }
      setImagePublicUrls((prev) => [...prev, ...nextUrls]);
    } finally {
      setImageUploading(false);
    }
  };

  const onImageDragStart = (idx: number) => {
    dragImageIdxRef.current = idx;
  };

  const onImageDragOver = (e: DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onImageDrop = (idx: number) => {
    const from = dragImageIdxRef.current;
    dragImageIdxRef.current = null;
    if (from === null || from === idx || imageUploading) return;
    setImagePublicUrls((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(idx, 0, item);
      return next;
    });
  };

  const onImageDragEnd = () => {
    dragImageIdxRef.current = null;
  };

  const removeImageAt = (index: number) => {
    const url = imagePublicUrls[index];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const path = publicObjectPathFromUrl(url, supabaseUrl);
      if (path) {
        const supabase = getSupabaseBrowserClient();
        void supabase.storage.from(ACTIVITY_IMAGES_BUCKET).remove([path]);
      }
    }
    setImagePublicUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleXImport = async () => {
    setFormError(null);

    if (!isXVerified) {
      setFormError("본인 인증 완료된 계정만 연동할 수 있습니다.");
      return;
    }

    const normalized = normalizeUrl(xUrl);
    if (!normalized) {
      setFormError("X(트위터) 게시글 URL 형식을 확인해 주세요.");
      return;
    }

    if (!xHandleMatched) {
      setFormError(xHandleMismatchMessage ?? "연동된 계정과 URL 계정이 일치하지 않습니다.");
      return;
    }

    const hasDraft = content.trim().length > 0 || imagePublicUrls.length > 0;
    if (hasDraft) {
      const confirmed = window.confirm(
        "현재 작성 중인 내용/이미지가 있습니다. 가져온 데이터로 덮어쓸까요?"
      );
      if (!confirmed) return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    if (!accessToken) {
      setFormError("로그인이 필요합니다.");
      return;
    }

    setXImporting(true);
    try {
      const response = await fetch("/api/scraping/x", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ tweetUrl: normalized }),
      });

      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        proof_url?: unknown;
        full_text?: unknown;
        image_urls?: unknown;
      };

      if (!response.ok || !body.ok) {
        const message = body.error ?? "트윗 데이터를 가져오지 못했습니다.";
        setFormError(message);
        toast.error(message);
        return;
      }

      const importedText = typeof body.full_text === "string" ? body.full_text : "";
      const importedImageUrls = Array.isArray(body.image_urls)
        ? body.image_urls.filter((v): v is string => typeof v === "string")
        : [];
      const importedProof =
        typeof body.proof_url === "string" ? normalizeProofUrl(body.proof_url) : null;
      if (!importedProof) {
        const message = "원문 URL 정보가 누락되어 가져오기에 실패했습니다.";
        setFormError(message);
        toast.error(message);
        return;
      }

      setContent(importedText);
      setImagePublicUrls(importedImageUrls);
      setImportedProofUrl(importedProof);
      setTab("direct");
      toast.success("내 트윗을 성공적으로 가져왔습니다. 내용을 수정하여 정성을 더해보세요!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "트윗 데이터를 가져오는 중 오류가 발생했습니다.";
      setFormError(message);
      toast.error(message);
    } finally {
      setXImporting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);

    if (!artistId || !activityTypeId) {
      setFormError("아티스트와 활동 유형을 선택해 주세요.");
      setSubmitting(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    if (!accessToken) {
      setFormError("로그인이 필요합니다.");
      setSubmitting(false);
      return;
    }

    let submitContent = "";
    let proofUrl: string | null = isEditMode ? editingProofUrl : importedProofUrl;

    if (tab === "direct" || isEditMode) {
      const trimmed = content.trim();
      if (!trimmed) {
        setFormError("직접 기록할 내용을 입력해 주세요.");
        setSubmitting(false);
        return;
      }
      submitContent = trimmed;
    } else {
      if (!isXVerified) {
        setFormError("본인 인증 완료된 계정만 연동할 수 있습니다.");
        setSubmitting(false);
        return;
      }
      const normalized = normalizeUrl(xUrl);
      if (!normalized) {
        setFormError("X(트위터) 게시글 URL 형식을 확인해 주세요.");
        setSubmitting(false);
        return;
      }
      if (!xHandleMatched) {
        setFormError(xHandleMismatchMessage ?? "연동된 계정과 URL 계정이 일치하지 않습니다.");
        setSubmitting(false);
        return;
      }
      proofUrl = normalized;
      submitContent = `X 글 가져오기: ${normalized}`;
    }

    const response = await fetch("/api/activity-logs", {
      method: isEditMode ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...(isEditMode ? { id: editId } : {}),
        artist_id: artistId,
        activity_type_id: activityTypeId,
        content: submitContent,
        proof_url: proofUrl,
        ...((tab === "direct" || isEditMode) && imagePublicUrls.length > 0
          ? { image_urls: imagePublicUrls }
          : {}),
      }),
    });

    const body = (await response.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok || !body.ok) {
      const message = mapInsertError(body.error ?? "글 등록에 실패했습니다.");
      setFormError(message);
      toast.error(message);
      setSubmitting(false);
      return;
    }

    toast.success(isEditMode ? "수정이 저장되어 재심사 대기 상태가 되었습니다." : "글이 성공적으로 등록되었습니다.");
    router.replace(isEditMode ? `/activities/${encodeURIComponent(editId)}` : "/");
  };

  return (
    <RequireAuth>
      <ProfileNicknameGate>
        <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-white">글쓰기</h1>
              <Link
                href="/"
                className="text-sm text-zinc-400 transition hover:text-zinc-200"
              >
                메인으로
              </Link>
            </div>

            {loadError ? (
              <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {loadError}
              </p>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">아티스트</label>
                  <select
                    value={artistId}
                    onChange={(e) => setArtistId(e.target.value)}
                    disabled={loadingCatalog}
                    className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50 disabled:opacity-60"
                  >
                    {artists.map((artist) => (
                      <option key={artist.id} value={artist.id}>
                        {artist.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">활동 유형</label>
                  <select
                    value={activityTypeId}
                    onChange={(e) => setActivityTypeId(e.target.value)}
                    disabled={loadingCatalog}
                    className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50 disabled:opacity-60"
                  >
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isEditMode ? (
                <p className="mt-5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  수정 저장 시 상태가 심사 대기(pending)로 변경됩니다.
                </p>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-zinc-950 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTab("direct");
                      setImportedProofUrl(null);
                    }}
                    className={`h-10 rounded-lg text-sm font-medium transition ${
                      tab === "direct"
                        ? "bg-white text-zinc-900"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    직접 기록하기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab("x_import");
                    }}
                    className={`h-10 rounded-lg text-sm font-medium transition ${
                      tab === "x_import"
                        ? "bg-white text-zinc-900"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    X(트위터) 글 가져오기
                  </button>
                </div>
              )}

              {tab === "direct" || isEditMode ? (
                <div className="mt-4">
                  <p className="mb-3 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-sm font-medium text-fuchsia-200">
                    ✨ SYNC에 직접 작성 시 1.5배 VIBE 지급
                  </p>
                  {isEditMode && editingProofUrl ? (
                    <p className="mb-3 text-xs text-zinc-500">
                      원문 URL은 수정할 수 없습니다. 본문만 수정 후 재심사됩니다.
                    </p>
                  ) : null}
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={7}
                    placeholder="활동 내용을 직접 기록해 주세요."
                    className="w-full resize-none rounded-xl border border-white/15 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleImageFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="mt-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          imageUploading || imagePublicUrls.length >= MAX_ACTIVITY_IMAGES
                        }
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl border border-white/20 bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:border-fuchsia-400/40 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        사진 선택
                      </button>
                      <span className="text-xs text-zinc-500">
                        JPG/JPEG, PNG, WebP, GIF · 장당 최대 5MB · 최대 {MAX_ACTIVITY_IMAGES}장
                      </span>
                    </div>
                    {imageUploading ? (
                      <p className="text-sm font-medium text-fuchsia-200">업로드 중...</p>
                    ) : null}
                    {imagePublicUrls.length > 0 ? (
                      <>
                        <p className="mb-2 text-xs text-zinc-500">
                          썸네일을 드래그하여 순서를 바꿀 수 있습니다.
                        </p>
                        <ul className="mt-1 flex flex-wrap gap-2">
                          {imagePublicUrls.map((url, idx) => (
                            <li
                              key={url}
                              draggable={!imageUploading}
                              onDragStart={() => onImageDragStart(idx)}
                              onDragOver={onImageDragOver}
                              onDrop={() => onImageDrop(idx)}
                              onDragEnd={onImageDragEnd}
                              className={`relative h-24 w-24 shrink-0 cursor-grab overflow-hidden rounded-lg border border-white/15 bg-zinc-900 active:cursor-grabbing ${
                                imageUploading ? "cursor-not-allowed opacity-60" : ""
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" className="pointer-events-none h-full w-full object-cover" />
                              <button
                                type="button"
                                disabled={imageUploading}
                                onClick={() => removeImageAt(idx)}
                                className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-sm font-semibold leading-none text-white transition hover:bg-black/90 disabled:opacity-50"
                                aria-label="이미지 제거"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="mb-3 text-sm text-zinc-400">
                    본인 인증 완료된 계정의 글만 연동 가능
                  </p>
                  <input
                    type="url"
                    inputMode="url"
                    value={xUrl}
                    onChange={(e) => setXUrl(e.target.value)}
                    placeholder="https://x.com/username/status/..."
                    className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-fuchsia-400/50"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    인증 완료된 트윗은 삭제 후 재등록 및 추가 VIBE 지급이 제한됩니다.
                  </p>
                  {!isXVerified ? (
                    <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                      <p className="text-sm text-amber-200">X 계정 인증이 필요합니다.</p>
                      <Link
                        href="/profile"
                        className="mt-2 inline-flex rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-400/10"
                      >
                        프로필에서 X 계정 인증하기
                      </Link>
                    </div>
                  ) : null}
                  {isXVerified && xHandle ? (
                    <p className="mt-2 text-xs text-zinc-500">연동 계정: @{normalizeHandle(xHandle)}</p>
                  ) : null}
                  {xHandleMismatchMessage ? (
                    <p className="mt-2 text-xs text-red-300">{xHandleMismatchMessage}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleXImport()}
                    disabled={xImporting || !isXVerified || Boolean(xHandleMismatchMessage)}
                    className="mt-4 h-11 w-full rounded-xl border border-white/20 bg-zinc-900 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {xImporting ? "데이터 가져오는 중..." : "내 트윗 가져오기"}
                  </button>
                </div>
              )}

              {formError ? <p className="mt-3 text-sm text-red-300">{formError}</p> : null}

              <button
                type="submit"
                disabled={
                  submitting ||
                  loadingEditDraft ||
                  xImporting ||
                  imageUploading ||
                  loadingCatalog ||
                  artists.length === 0 ||
                  types.length === 0 ||
                  (!isEditMode && tab === "x_import")
                }
                className="mt-5 h-11 w-full rounded-xl bg-white text-sm font-semibold text-zinc-900 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingEditDraft
                  ? "기존 글 불러오는 중..."
                  : imageUploading
                  ? "업로드 중..."
                  : submitting
                    ? "등록 중..."
                    : !isEditMode && tab === "x_import"
                      ? "트윗 가져오기 후 등록 가능"
                      : isEditMode
                        ? "수정 저장하기"
                        : "등록하기"}
              </button>
            </form>
          </div>
        </div>
      </ProfileNicknameGate>
    </RequireAuth>
  );
}
