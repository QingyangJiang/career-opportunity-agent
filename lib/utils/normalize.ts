export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[，。！？；：“”‘’、,.!?;:'"()[\]{}<>【】《》\-_/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameNormalizedText(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeText(a) === normalizeText(b);
}
