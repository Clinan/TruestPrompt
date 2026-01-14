/**
 * Tool Executor - 工具执行服务
 * 
 * 支持基于HTTP的工具调用执行
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type ToolConfig = {
    name: string;
    description?: string;
    url: string;
    method: HttpMethod;
    // 参数映射：从 function.arguments 的字段名映射到 HTTP 请求参数名
    paramMapping?: Record<string, string>;
    // Headers 配置
    headers?: Record<string, string>;
    // 请求体类型（仅用于POST/PUT/PATCH）
    bodyType?: 'json' | 'form' | 'query';
    // 响应数据提取路径（支持点号路径，如 'data.result'）
    responsePath?: string;
};

export type ToolRegistry = {
    [toolName: string]: ToolConfig;
};

/**
 * 从对象中提取嵌套路径的值
 * 例如: extractPath({ data: { result: 'ok' } }, 'data.result') => 'ok'
 */
function extractPath(obj: any, path: string): any {
    if (!path) return obj;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        } else {
            return undefined;
        }
    }
    return current;
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
    toolConfig: ToolConfig,
    args: Record<string, unknown>
): Promise<unknown> {
    const { url, method, paramMapping, headers, bodyType = 'json', responsePath } = toolConfig;

    // 应用参数映射
    const mappedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
        const mappedKey = paramMapping?.[key] || key;
        mappedArgs[mappedKey] = value;
    }

    let finalUrl = url;
    let requestInit: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };

    if (method === 'GET' || bodyType === 'query') {
        // GET 请求或query模式：参数拼接到 URL
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(mappedArgs)) {
            if (value !== undefined && value !== null) {
                params.append(key, String(value));
            }
        }
        const separator = url.includes('?') ? '&' : '?';
        finalUrl = `${url}${params.toString() ? separator + params.toString() : ''}`;
    } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        // POST/PUT/PATCH: 根据 bodyType 处理请求体
        if (bodyType === 'form') {
            const formData = new URLSearchParams();
            for (const [key, value] of Object.entries(mappedArgs)) {
                if (value !== undefined && value !== null) {
                    formData.append(key, String(value));
                }
            }
            requestInit.body = formData.toString();
            requestInit.headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
                ...headers,
            };
        } else {
            // JSON body
            requestInit.body = JSON.stringify(mappedArgs);
        }
    }

    try {
        const response = await fetch(finalUrl, requestInit);

        // 尝试解析响应内容
        let responseData: any;
        let responseText = '';

        try {
            responseText = await response.text();
            responseData = responseText ? JSON.parse(responseText) : null;
        } catch (parseError) {
            // 如果不是JSON，保留原始文本
            responseData = responseText || null;
        }

        if (!response.ok) {
            // 构造包含详细信息的错误
            const errorDetails = {
                status: response.status,
                statusText: response.statusText,
                url: finalUrl,
                method: method,
                response: responseData || '(空响应)',
                responseText: responseText || '(无内容)',
            };

            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            // 将详细信息附加到错误对象
            (error as any).details = errorDetails;
            throw error;
        }

        // 提取指定路径的数据
        if (responsePath) {
            const extractedData = extractPath(responseData, responsePath);

            // 如果配置了响应路径但提取失败或提取到无效值，视为错误
            // 无效值包括：undefined, null, 空字符串
            if (extractedData === undefined || extractedData === null || extractedData === '') {
                const errorDetails = {
                    status: response.status,
                    statusText: response.statusText,
                    url: finalUrl,
                    method: method,
                    responsePath: responsePath,
                    extractedValue: extractedData === undefined ? '(不存在)' : (extractedData === null ? 'null' : '(空字符串)'),
                    response: responseData || '(空响应)',
                    reason: extractedData === undefined ? `在响应中找不到路径 "${responsePath}"` : `路径 "${responsePath}" 提取到无效值`,
                };

                const error = new Error(`响应路径提取失败: 路径 "${responsePath}" ${extractedData === undefined ? '不存在' : '提取到无效值'}`);
                (error as any).details = errorDetails;
                throw error;
            }

            return extractedData;
        }

        return responseData;
    } catch (error) {
        // 如果错误已经包含details，直接抛出
        if (error instanceof Error && (error as any).details) {
            throw error;
        }

        // 其他错误（网络错误等）
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(String(error));
    }
}

/**
 * 内置工具注册表（示例）
 */
export const builtInTools: ToolRegistry = {
    // 可以在这里添加内置工具，但默认为空
};

/**
 * 从工具注册表执行工具
 */
export async function executeToolFromRegistry(
    toolName: string,
    args: Record<string, unknown>,
    registry: ToolRegistry
): Promise<unknown> {
    const toolConfig = registry[toolName];

    if (!toolConfig) {
        throw new Error(`Tool "${toolName}" not found in registry`);
    }

    return executeToolCall(toolConfig, args);
}
