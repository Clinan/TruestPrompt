import type { ToolCall, ToolCallExecution } from '../core/types';
import { executeToolFromRegistry, type ToolRegistry } from './toolExecutor';

// 为什么：executeToolCall 原本 90 行混了「解析参数 / 执行 / 格式化错误 /
// 写 slot 状态」四件事。后三件里前两件是纯逻辑，只有状态写回需要 Slot。
// 抽到 runToolCall 之后：
//  - 纯函数：接收 toolCall + registry，返回 ToolCallExecution（success
//    或 error），调用方拿到就直接塞进 slot.toolCalls；
//  - 错误消息里保留 HTTP 状态码 / URL / 方法 / 响应体的详细字段，保持
//    原来历史上的信息密度——便于用户调试 HTTP 工具失败。
//
// 解析参数失败也归入 'error' 分支，而不是提前 return：这样调用方只需要
// 关心一条路径（拿到 execution 就 update）。

export async function runToolCall(
  toolCall: ToolCall,
  registry: ToolRegistry
): Promise<ToolCallExecution> {
  const toolName = toolCall.function?.name;
  if (!toolName) {
    return {
      status: 'error',
      error: '工具名称缺失',
    };
  }

  let args: Record<string, unknown> = {};
  try {
    const argsRaw = toolCall.function?.arguments;
    if (typeof argsRaw === 'string') {
      args = JSON.parse(argsRaw);
    } else if (typeof argsRaw === 'object' && argsRaw !== null) {
      args = argsRaw as Record<string, unknown>;
    }
  } catch (err) {
    return {
      status: 'error',
      error: '参数解析失败：' + (err instanceof Error ? err.message : String(err)),
    };
  }

  try {
    const result = await executeToolFromRegistry(toolName, args, registry);
    return {
      status: 'success',
      result,
      executedAt: Date.now(),
    };
  } catch (err) {
    let errorMessage = err instanceof Error ? err.message : String(err);
    let errorDetails: unknown = null;

    if (err instanceof Error && (err as unknown as { details?: unknown }).details) {
      const details = (err as unknown as {
        details: { status?: number; url?: string; method?: string; response?: unknown };
      }).details;
      errorDetails = details;
      errorMessage = `${errorMessage}\n\n状态码: ${details.status}\nURL: ${details.url}\n方法: ${details.method}`;
      if (details.response) {
        errorMessage += `\n\n响应内容:\n${
          typeof details.response === 'string'
            ? details.response
            : JSON.stringify(details.response, null, 2)
        }`;
      }
    }

    return {
      status: 'error',
      error: errorMessage,
      result: errorDetails,
    } as ToolCallExecution;
  }
}
