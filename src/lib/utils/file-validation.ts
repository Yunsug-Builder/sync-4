const FAN_IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/;

export const validateFanImage = (file: File) => {
  const fileName = file.name.toLowerCase();
  // 확장자가 jpg, jpeg, png, webp, gif 중 하나인지 엄격히 체크
  const isValid = /\.(jpg|jpeg|png|webp|gif)$/.test(fileName);

  if (!isValid) {
    return { valid: false, message: "JPG, PNG, WebP, GIF 파일만 업로드 가능합니다." };
  }
  return { valid: true };
};

export function getFanImageExtension(file: File): string | null {
  const match = file.name.toLowerCase().match(FAN_IMAGE_EXT_RE);
  if (!match) return null;
  const ext = match[1];
  return ext === "jpeg" ? "jpg" : ext;
}

export function inferFanImageContentType(file: File): string | undefined {
  const mime = (file.type || "").trim().toLowerCase();
  if (mime && mime !== "application/octet-stream") return file.type;

  const ext = getFanImageExtension(file);
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return undefined;
}
