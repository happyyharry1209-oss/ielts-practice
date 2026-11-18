export function closedObject(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

export function groqStructuredOutput(name: string, schema: ReturnType<typeof closedObject>) {
  return {
    max_completion_tokens: 2048,
    reasoning_effort: 'low',
    include_reasoning: false,
    response_format: {
      type: 'json_schema',
      json_schema: { name, strict: true, schema },
    },
  };
}
