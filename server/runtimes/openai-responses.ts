import type { RuntimeRunRequest, RuntimeRunResult, RuntimeTool } from "./types.js";
import { estimateOpenAITextCostUsd } from "../model-pricing.js";
import { EMPTY_RUNTIME_USAGE } from "./types.js";

interface OpenAIResponse {
  id: string;
  output?: Array<any>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

interface ToolMapping {
  runtimeTool: RuntimeTool;
  openaiName: string;
}

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_TOOL_ROUNDS = 12;

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "tool";
}

function buildToolMappings(tools: RuntimeTool[]): ToolMapping[] {
  return tools.map((runtimeTool, index) => ({
    runtimeTool,
    openaiName: `boop_${index}_${sanitizeToolName(runtimeTool.name)}`.slice(0, 64),
  }));
}

function extractText(response: OpenAIResponse): string {
  if (response.output_text) return response.output_text;
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (typeof content?.text === "string") chunks.push(content.text);
      if (typeof content?.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("");
}

function usageFrom(response: OpenAIResponse, model: string): RuntimeRunResult["usage"] {
  const usage = response.usage;
  const result = {
    model,
    inputTokens: Number(usage?.input_tokens ?? 0),
    outputTokens: Number(usage?.output_tokens ?? 0),
    cacheReadTokens: Number(usage?.input_tokens_details?.cached_tokens ?? 0),
    cacheCreationTokens: 0,
    costUsd: 0,
  };
  result.costUsd = estimateOpenAITextCostUsd(result) ?? 0;
  return result;
}

function addUsage(
  current: RuntimeRunResult["usage"],
  next: RuntimeRunResult["usage"],
): RuntimeRunResult["usage"] {
  return {
    model: next.model,
    inputTokens: current.inputTokens + next.inputTokens,
    outputTokens: current.outputTokens + next.outputTokens,
    cacheReadTokens: current.cacheReadTokens + next.cacheReadTokens,
    cacheCreationTokens: current.cacheCreationTokens + next.cacheCreationTokens,
    costUsd: current.costUsd + next.costUsd,
  };
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function supportsReasoning(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.startsWith("gpt-5") || lower.startsWith("o");
}

async function createResponse(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<OpenAIResponse> {
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(process.env.OPENAI_ORG_ID ? { "OpenAI-Organization": process.env.OPENAI_ORG_ID } : {}),
      ...(process.env.OPENAI_PROJECT_ID ? { "OpenAI-Project": process.env.OPENAI_PROJECT_ID } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Responses API failed (${response.status}): ${text.slice(0, 1200)}`);
  }
  return (await response.json()) as OpenAIResponse;
}

export async function runOpenAIResponsesAgent(
  request: RuntimeRunRequest,
): Promise<RuntimeRunResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for the openai runtime");

  const mappings = buildToolMappings(request.tools);
  const mappingByName = new Map(mappings.map((mapping) => [mapping.openaiName, mapping]));
  const tools = [
    ...(request.mode === "execution" ? [{ type: "web_search" }] : []),
    ...mappings.map(({ runtimeTool, openaiName }) => ({
      type: "function",
      name: openaiName,
      description: `[${runtimeTool.namespace}.${runtimeTool.name}] ${runtimeTool.description}`,
      parameters: runtimeTool.jsonSchema,
      strict: false,
    })),
  ];

  let previousResponseId: string | undefined;
  let input: unknown = request.prompt;
  let finalText = "";
  let usage = { ...EMPTY_RUNTIME_USAGE, model: request.model };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await createResponse(apiKey, {
      model: request.model,
      instructions: request.systemPrompt,
      input,
      tools,
      ...(request.reasoningEffort && supportsReasoning(request.model)
        ? { reasoning: { effort: request.reasoningEffort } }
        : {}),
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    });
    previousResponseId = response.id;
    usage = addUsage(usage, usageFrom(response, request.model));
    await request.onUsage?.(usage);

    const functionCalls = (response.output ?? []).filter((item) => item?.type === "function_call");
    if (functionCalls.length === 0) {
      finalText = extractText(response);
      request.onText?.(finalText);
      return { text: finalText, usage };
    }

    const outputs = [];
    for (const call of functionCalls) {
      const mapping = mappingByName.get(String(call.name ?? ""));
      if (!mapping) {
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: `Unknown tool ${call.name}`,
        });
        continue;
      }
      const args = parseArguments(call.arguments);
      await request.onToolUse?.(
        `mcp__${mapping.runtimeTool.namespace}__${mapping.runtimeTool.name}`,
        args,
      );
      const result = await mapping.runtimeTool.handle(args);
      await request.onToolResult?.(
        `mcp__${mapping.runtimeTool.namespace}__${mapping.runtimeTool.name}`,
        result.text,
      );
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: result.text,
      });
    }
    input = outputs;
  }

  return {
    text: finalText || "OpenAI runtime stopped after too many tool calls.",
    usage,
  };
}
