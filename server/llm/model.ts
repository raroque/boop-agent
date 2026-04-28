const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_DEFAULT_ADVERSARY_MODEL = "claude-haiku-4-5";

export function aiProvider(): "anthropic" | "codex" {
  return process.env.AI_PROVIDER === "codex" ? "codex" : "anthropic";
}

export function defaultModel(): string | undefined {
  return aiProvider() === "codex"
    ? process.env.CODEX_MODEL
    : (process.env.BOOP_MODEL ?? ANTHROPIC_DEFAULT_MODEL);
}

export function defaultAdversaryModel(): string | undefined {
  return aiProvider() === "codex"
    ? (process.env.CODEX_ADVERSARY_MODEL ?? process.env.CODEX_MODEL)
    : (process.env.BOOP_ADVERSARY_MODEL ?? ANTHROPIC_DEFAULT_ADVERSARY_MODEL);
}
