export function formatError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    return cause ? `${err.message}\nCause: ${formatError(cause)}` : err.message;
  }
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail ?? record.details;
    const status = record.status ?? record.statusCode ?? record.code;
    const body = record.body ?? record.response ?? record.data;
    const parts = [
      status ? `status=${String(status)}` : "",
      message ? String(message) : "",
      body ? safeJson(body) : "",
    ].filter(Boolean);
    return parts.join(" - ") || safeJson(record);
  }
  return String(err);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
