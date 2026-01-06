/**
 * 测试 Slot 停止功能的修复
 * 验证流式读取器能够正确响应 AbortSignal
 */
import { describe, it, expect, vi } from 'vitest';
import { streamOpenAIStyle } from '../modules/provider/domain/strategies/common';

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
});