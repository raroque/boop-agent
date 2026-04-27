/**
 * Claude provider — thin passthrough to @anthropic-ai/claude-agent-sdk.
 * The claude-agent-sdk's SDKMessage is structurally compatible with BoopMessage
 * for the fields that boop-agent reads.
 */
export { query } from "@anthropic-ai/claude-agent-sdk";
