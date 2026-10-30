/** HR must never see an internal claim stamp in place of a recommendation. */
export function visibleRecommendation(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("SCORING:")) return null;
  return trimmed;
}
