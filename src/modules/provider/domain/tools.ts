type ToolsParseResult = {
  tools?: Record<string, unknown>[];
  error?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseToolsDefinition(source: string): ToolsParseResult {
  const raw = source?.trim();
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JSON 解析失败';
    return { error: `Tools JSON 解析失败：${message}` };
  }

  const rawTools = Array.isArray(parsed)
    ? parsed
    : isPlainObject(parsed) && Array.isArray(parsed.tools)
      ? parsed.tools
      : null;

  if (!rawTools) {
    return { error: 'Tools JSON 应为数组或 { "tools": [] } 结构' };
  }

  if (rawTools.length === 0) return {};

  const invalidIndex = rawTools.findIndex((item) => !isPlainObject(item));
  if (invalidIndex !== -1) {
    return { error: `tools[${invalidIndex}] 必须是对象` };
  }

  return { tools: rawTools as Record<string, unknown>[] };
}

export function assertToolsDefinition(source: string): Record<string, unknown>[] | undefined {
  const { tools, error } = parseToolsDefinition(source);
  if (error) {
    throw new Error(error);
  }
  return tools;
}
