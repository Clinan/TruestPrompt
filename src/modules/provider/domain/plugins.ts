import type { Plugin } from '../../../core/types';
import { createOpenAICompatiblePlugin } from './strategies/openai';
import { createGeminiPlugin } from './strategies/gemini';
export * from './strategies/common';

export const plugins: Plugin[] = [
  createOpenAICompatiblePlugin({
    id: 'openai-compatible',
    name: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    apiKeyPlaceholder: '{{OPENAI_API_KEY}}',
    fallbackModels: [
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { id: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' }
    ]
  }),
  createGeminiPlugin({
    id: 'gemini-native',
    name: 'Gemini (Native)',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyPlaceholder: '{{GEMINI_API_KEY}}',
    fallbackModels: [
      { id: 'gemini-2.0-flash-exp', label: 'gemini-2.0-flash-exp' },
      { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
      { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'Gemini',
    name: 'Gemini (OpenAI Compatible)',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions',
    apiKeyPlaceholder: '{{GEMINI_API_KEY}}',
    defaultModelsUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/v1/models',
    fallbackModels: [
      { id: 'gemini-2.0-flash-exp', label: 'gemini-2.0-flash-exp' },
      { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'aliyun-dashscope',
    name: 'Aliyun DashScope (通义)',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyPlaceholder: '{{ALIYUN_API_KEY}}',
    defaultModelsUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    fallbackModels: [
      { id: 'qwen-plus', label: 'qwen-plus' },
      { id: 'qwen-max', label: 'qwen-max' },
      { id: 'qwen-vl-max', label: 'qwen-vl-max' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'kimi-moonshot',
    name: 'Kimi (Moonshot)',
    defaultUrl: 'https://api.moonshot.cn/v1/chat/completions',
    apiKeyPlaceholder: '{{KIMI_API_KEY}}',
    defaultModelsUrl: 'https://api.moonshot.cn/v1/models',
    fallbackModels: [
      { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
      { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
      { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k' }
    ]
  }),
  createOpenAICompatiblePlugin({
    id: 'ark-bytedance',
    name: '方舟 Ark (ByteDance)',
    defaultUrl: 'https://ark.cn-beijing.volces.com/api/v1/chat/completions',
    apiKeyPlaceholder: '{{ARK_API_KEY}}',
    // 跨域了，走代理
    defaultModelsUrl: '/proxy/ark/api/v3/models',
    fallbackModels: [
      { id: 'doubao-pro-32k', label: 'doubao-pro-32k' },
      { id: 'doubao-vision', label: 'doubao-vision' },
      { id: 'doubao-lite-128k', label: 'doubao-lite-128k' }
    ],
    authHeader: 'Authorization',
    authPrefix: 'Bearer '
  })
];
