export type ArtistRow = Record<string, unknown>;

export function getArtistDisplayName(artist: ArtistRow): string {
  const candidates = ["name", "artist_name", "display_name", "title"] as const;
  for (const key of candidates) {
    const value = artist[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "Unknown Artist";
}

export function getArtistImageUrl(artist: ArtistRow): string | null {
  const candidates = ["image_url", "avatar_url", "photo_url", "thumbnail_url"] as const;
  for (const key of candidates) {
    const value = artist[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

export function getArtistId(artist: ArtistRow): string | null {
  const id = artist.id;
  return typeof id === "string" ? id : null;
}
