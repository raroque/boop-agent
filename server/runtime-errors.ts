function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function isUsageLimitError(err: unknown): boolean {
  const text = errorText(err);
  return /usage limit/i.test(text) || /purchase more credits/i.test(text);
}

export function usageLimitReply(err: unknown, runtimeName: string): string | null {
  const text = errorText(err);
  if (!isUsageLimitError(text)) return null;

  const retryAt = text.match(/try again at\s+(.+?)(?:\.|$)/i)?.[1]?.trim();
  const creditsUrl =
    text.match(/https:\/\/chatgpt\.com\/codex\/settings\/usage/i)?.[0] ??
    null;

  const retryText = retryAt
    ? ` It says to try again at ${retryAt}.`
    : " Try again later.";
  const actionText = creditsUrl
    ? ` Add credits here: ${creditsUrl}, or switch me to Claude.`
    : " You can switch runtimes or try again later.";

  return `${runtimeName} hit its usage limit, so I can't process that right now.${retryText}${actionText}`;
}
