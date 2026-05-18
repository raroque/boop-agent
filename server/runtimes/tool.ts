import { z } from "zod";
import { zodShapeToJsonSchema } from "./json-schema.js";
import type { RuntimeTool, RuntimeToolResult } from "./types.js";

export function defineRuntimeTool<T extends z.ZodRawShape>(
  namespace: string,
  name: string,
  description: string,
  inputSchema: T,
  handle: (args: z.infer<z.ZodObject<T>>) => Promise<RuntimeToolResult>,
  jsonSchema: Record<string, unknown> = zodShapeToJsonSchema(inputSchema),
): RuntimeTool {
  const parser = z.object(inputSchema);
  return {
    namespace,
    name,
    description,
    inputSchema,
    jsonSchema,
    handle: async (args) => handle(parser.parse(args)),
  };
}
