import { z } from "zod";

type JsonSchema = Record<string, unknown>;

export function zodShapeToJsonSchema(shape: z.ZodRawShape): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(shape)) {
    const { schema: json, optional } = zodToJsonSchema(schema);
    properties[key] = json;
    if (!optional) required.push(key);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function zodToJsonSchema(schema: z.ZodTypeAny): { schema: JsonSchema; optional: boolean } {
  if (schema instanceof z.ZodOptional) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { schema: inner.schema, optional: true };
  }
  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { schema: inner.schema, optional: true };
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { schema: { ...inner.schema, nullable: true }, optional: inner.optional };
  }
  if (schema instanceof z.ZodString) {
    return { schema: withDescription(schema, { type: "string" }), optional: false };
  }
  if (schema instanceof z.ZodNumber) {
    return { schema: withDescription(schema, { type: "number" }), optional: false };
  }
  if (schema instanceof z.ZodBoolean) {
    return { schema: withDescription(schema, { type: "boolean" }), optional: false };
  }
  if (schema instanceof z.ZodEnum) {
    return {
      schema: withDescription(schema, { type: "string", enum: schema._def.values }),
      optional: false,
    };
  }
  if (schema instanceof z.ZodArray) {
    const item = zodToJsonSchema(schema._def.type);
    return {
      schema: withDescription(schema, { type: "array", items: item.schema }),
      optional: false,
    };
  }
  if (schema instanceof z.ZodObject) {
    return {
      schema: withDescription(schema, zodShapeToJsonSchema(schema.shape)),
      optional: false,
    };
  }
  if (schema instanceof z.ZodRecord) {
    return {
      schema: withDescription(schema, { type: "object", additionalProperties: true }),
      optional: false,
    };
  }
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) {
    return { schema: withDescription(schema, {}), optional: false };
  }

  return { schema: withDescription(schema, {}), optional: false };
}

function withDescription(schema: z.ZodTypeAny, json: JsonSchema): JsonSchema {
  return schema.description ? { ...json, description: schema.description } : json;
}
