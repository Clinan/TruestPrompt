import type { Diagnostic } from '@codemirror/lint';
import type { ToolConfig } from '../../../../lib/toolExecutor';

// 为什么：validateRegistry 是纯函数（输入 JSON 字符串，输出校验结果），
// 原本 70 行嵌在 ToolsDrawer.vue 里，和 CodeMirror linter 配置耦合。
// 抽出来后：
//  - ToolsDrawer 只调用 validateRegistry + toolRegistryLinter 组装 extensions；
//  - 未来如果要在「导入 API 工具定义」时做同类型校验，可以复用。

export function validateRegistry(jsonStr: string): {
  valid: boolean;
  error?: string;
  data?: Record<string, ToolConfig>;
} {
  if (!jsonStr.trim()) {
    return { valid: true, data: {} };
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed !== 'object' || Array.isArray(parsed || parsed === null)) {
      return { valid: false, error: '工具配置必须是对象格式 { "toolName": {...} }' };
    }

    const errors: string[] = [];
    for (const [toolName, config] of Object.entries(parsed)) {
      if (typeof config !== 'object' || config === null) {
        errors.push(`工具 "${toolName}" 的配置必须是对象`);
        continue;
      }

      const tc = config as any;

      if (!tc.name || typeof tc.name !== 'string') {
        errors.push(`工具 "${toolName}" 缺少必需字段 "name" (string)`);
      }
      if (!tc.url || typeof tc.url !== 'string') {
        errors.push(`工具 "${toolName}" 缺少必需字段 "url" (string)`);
      }
      if (!tc.method || typeof tc.method !== 'string') {
        errors.push(`工具 "${toolName}" 缺少必需字段 "method" (string)`);
      }

      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      if (tc.method && !validMethods.includes(tc.method)) {
        errors.push(`工具 "${toolName}" 的 method 必须是 ${validMethods.join('|')} 之一`);
      }

      if (tc.description !== undefined && typeof tc.description !== 'string') {
        errors.push(`工具 "${toolName}" 的 "description" 必须是字符串`);
      }
      if (tc.responsePath !== undefined && typeof tc.responsePath !== 'string') {
        errors.push(`工具 "${toolName}" 的 "responsePath" 必须是字符串`);
      }
      if (tc.bodyType !== undefined && !['json', 'form', 'query'].includes(tc.bodyType)) {
        errors.push(`工具 "${toolName}" 的 "bodyType" 必须是 json|form|query 之一`);
      }
      if (tc.paramMapping !== undefined) {
        if (typeof tc.paramMapping !== 'object' || Array.isArray(tc.paramMapping)) {
          errors.push(`工具 "${toolName}" 的 "paramMapping" 必须是对象`);
        }
      }
      if (tc.headers !== undefined) {
        if (typeof tc.headers !== 'object' || Array.isArray(tc.headers)) {
          errors.push(`工具 "${toolName}" 的 "headers" 必须是对象`);
        }
      }
    }

    if (errors.length > 0) {
      return { valid: false, error: errors.join('\n') };
    }

    return { valid: true, data: parsed as Record<string, ToolConfig> };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'JSON 解析失败' };
  }
}

export function toolRegistryLinter(view: any): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const content = view.state.doc.toString();

  const result = validateRegistry(content);
  if (!result.valid && result.error) {
    diagnostics.push({
      from: 0,
      to: content.length,
      severity: 'error',
      message: result.error,
    });
  }

  return diagnostics;
}