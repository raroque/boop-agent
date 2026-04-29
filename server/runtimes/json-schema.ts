import { z } from "zod";

type JsonSchema = Record<string, unknown>;

export const stringSchema = (description?: string): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {}),
});

export const numberSchema = (description?: string): JsonSchema => ({
  type: "number",
  ...(description ? { description } : {}),
});

export const booleanSchema = (description?: string): JsonSchema => ({
  type: "boolean",
  ...(description ? { description } : {}),
});

export const stringArraySchema = (description?: string): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  ...(description ? { description } : {}),
});

export const enumSchema = (values: string[], description?: string): JsonSchema => ({
  type: "string",
  enum: values,
  ...(description ? { description } : {}),
});

export function objectSchema(
  properties: Record<string, JsonSchema>,
  required: string[] = Object.keys(properties),
): JsonSchema {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

export function optional<T extends z.ZodTypeAny>(schema: T): z.ZodOptional<T> {
  return schema.optional();
}
