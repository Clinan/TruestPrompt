/**
 * 测试 Slot 停止功能的修复
 * 验证流式读取器能够正确响应 AbortSignal
 */
import { describe, it, expect, vi } from 'vitest';
import { streamOpenAIStyle } from '../modules/provider/domain/strategies/common';

function createMockStreamResponse(chunks: string[]) {
  const mockReader = {
    read: vi.fn(),
    cancel: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn()
  };

  chunks.forEach((chunk) => {
    mockReader.read.mockResolvedValueOnce({
      value: new TextEncoder().encode(chunk),
      done: false
    });
  });
  mockReader.read.mockResolvedValueOnce({ value: undefined, done: true });

  const mockResponse = {
    body: {
      getReader: () => mockReader
    }
  } as unknown as Response;

  return { mockReader, mockResponse };
}

async function collectOpenAIStreamChunks(response: Response) {
  const chunks: any[] = [];
  for await (const chunk of streamOpenAIStyle(response)) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('Stop Functionality Fix', () => {
  it('should abort stream reading when signal is aborted', async () => {
    // 创建一个模拟的 Response 对象
    const mockReader = {
      read: vi.fn(),
      releaseLock: vi.fn()
    };

    const mockResponse = {
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response;

    // 创建 AbortController
    const controller = new AbortController();

    // 模拟读取器返回数据然后被中止
    mockReader.read
      .mockResolvedValueOnce({ value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"test"}}]}\n\n'), done: false })
      .mockImplementation(() => {
        // 在第二次调用时中止
        controller.abort();
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(new DOMException('Stream reading aborted', 'AbortError'));
          }, 10);
        });
      });

    const chunks: any[] = [];
    let error: any = null;

    try {
      for await (const chunk of streamOpenAIStyle(mockResponse, controller.signal)) {
        chunks.push(chunk);
      }
    } catch (err) {
      error = err;
    }

    // 验证：
    // 1. 应该收到第一个 chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ type: 'content', text: 'test' });

    // 2. 应该抛出 AbortError
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');

    // 3. reader 应该被释放
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });

  it('should check abort signal before each read operation', async () => {
    const mockReader = {
      read: vi.fn(),
      releaseLock: vi.fn()
    };

    const mockResponse = {
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response;

    // 创建已经中止的 AbortController
    const controller = new AbortController();
    controller.abort();

    let error: any = null;

    try {
      for await (const chunk of streamOpenAIStyle(mockResponse, controller.signal)) {
        // 不应该执行到这里
      }
    } catch (err) {
      error = err;
    }

    // 验证：
    // 1. 应该立即抛出 AbortError，不调用 read
    expect(mockReader.read).not.toHaveBeenCalled();
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');

    // 2. reader 仍应该被释放
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });

  it('should work normally without abort signal', async () => {
    const mockReader = {
      read: vi.fn(),
      releaseLock: vi.fn()
    };

    const mockResponse = {
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response;

    // 模拟正常的流式数据
    mockReader.read
      .mockResolvedValueOnce({ 
        value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'), 
        done: false 
      })
      .mockResolvedValueOnce({ 
        value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n\n'), 
        done: false 
      })
      .mockResolvedValueOnce({ value: undefined, done: true });

    const chunks: any[] = [];

    for await (const chunk of streamOpenAIStyle(mockResponse)) {
      chunks.push(chunk);
    }

    // 验证正常流式处理
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: 'content', text: 'hello' });
    expect(chunks[1]).toEqual({ type: 'content', text: ' world' });
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });

  it('should parse the final SSE data line when it has no trailing newline', async () => {
    const { mockReader, mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"先思考"}}]}\n\n',
      'data: {"choices":[{"message":{"content":"最终回答"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([
      { type: 'thinking', text: '先思考' },
      { type: 'usage', tokens: { prompt: 1, completion: 2, total: 3 } },
      { type: 'content', text: '最终回答' }
    ]);
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });

  it('should append only the missing suffix from a final message snapshot', async () => {
    const { mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: {"choices":[{"message":{"content":"hello world"},"finish_reason":"stop"}]}'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([
      { type: 'content', text: 'hello' },
      { type: 'content', text: ' world' }
    ]);
  });

  it('should fall back to message content when the final delta is empty', async () => {
    const { mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\n\n',
      'data: {"choices":[{"delta":{},"message":{"reasoning_content":"思考完整","content":"回答"},"finish_reason":"stop"}]}'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([
      { type: 'thinking', text: '思考' },
      { type: 'thinking', text: '完整' },
      { type: 'content', text: '回答' }
    ]);
  });

  it('should preserve repeated text deltas', async () => {
    const { mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":{"content":"ha"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"ha"}}]}\n\n'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([
      { type: 'content', text: 'ha' },
      { type: 'content', text: 'ha' }
    ]);
  });

  it('should finish immediately when DONE marker is received', async () => {
    const mockReader = {
      read: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn()
    };

    mockReader.read
      .mockResolvedValueOnce({
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n'
        ),
        done: false
      })
      .mockImplementation(() => new Promise(() => undefined));

    const mockResponse = {
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response;

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([{ type: 'content', text: 'answer' }]);
    expect(mockReader.read).toHaveBeenCalledTimes(1);
    expect(mockReader.cancel).toHaveBeenCalledTimes(1);
    expect(mockReader.releaseLock).toHaveBeenCalled();
  });

  it('should parse multi-line SSE data events as one payload', async () => {
    const { mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":\n' +
        'data: {"content":"split payload"}}]}\n\n'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([{ type: 'content', text: 'split payload' }]);
  });

  it('should flush pending content when DONE arrives without a blank separator', async () => {
    const mockReader = {
      read: vi.fn(),
      cancel: vi.fn().mockResolvedValue(undefined),
      releaseLock: vi.fn()
    };

    mockReader.read
      .mockResolvedValueOnce({
        value: new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"before done"}}]}\ndata: [DONE]\n'
        ),
        done: false
      })
      .mockImplementation(() => new Promise(() => undefined));

    const mockResponse = {
      body: {
        getReader: () => mockReader
      }
    } as unknown as Response;

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([{ type: 'content', text: 'before done' }]);
    expect(mockReader.read).toHaveBeenCalledTimes(1);
    expect(mockReader.cancel).toHaveBeenCalledTimes(1);
  });

  it('should parse newline-only separated data events from OpenAI-compatible proxies', async () => {
    const { mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n' +
        'data: {"choices":[{"delta":{"content":" world"}}]}\n' +
        'data: [DONE]\n'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([
      { type: 'content', text: 'hello' },
      { type: 'content', text: ' world' }
    ]);
  });

  it('should read object-shaped text parts', async () => {
    const { mockResponse } = createMockStreamResponse([
      'data: {"choices":[{"delta":{"content":{"text":"object payload"}}}]}\n\n'
    ]);

    const chunks = await collectOpenAIStreamChunks(mockResponse);

    expect(chunks).toEqual([{ type: 'content', text: 'object payload' }]);
  });
});
