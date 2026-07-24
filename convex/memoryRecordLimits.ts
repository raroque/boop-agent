const DEFAULT_MEMORY_LIST_LIMIT = 100;

export function normalizeMemoryListLimit(
  requestedLimit: number | undefined,
  maximumLimit: number,
): number {
  const integerLimit = Math.trunc(requestedLimit ?? DEFAULT_MEMORY_LIST_LIMIT);
  if (Number.isNaN(integerLimit)) return 0;
  return Math.max(0, Math.min(integerLimit, maximumLimit));
}
