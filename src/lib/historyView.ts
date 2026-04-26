import type { HistoryItem } from '../core/types';

// 为什么：HistoryDrawer 里 ~120 行是把 HistoryItem snapshot 翻译成
// 视图模型（标准化角色 / 提取消息 / 提取输出 / 拼分组标签 / 截断 /
// 搜索匹配）。它们是纯函数，不依赖 Vue/DOM。抽到 lib/historyView 后：
//  - HistoryDrawer + HistoryItem（PR 18 里新增的子组件）共享同一份
//    解析逻辑，避免子组件再传整个 HistoryItem 又重新算一遍；
//  - 这些函数可独立单测（本次不补，但留出口）；
//  - role 颜色/标签的"产品规范"集中——以后改色板只动这里。
//
// 注意：搜索匹配 matchesHistoryItem 接收 query 已 lower-case 的版本，
// 让调用方决定是否 trim/normalize；formatGroupLabel 依赖"今天/昨天"
// 这种相对时间，调用方传入参考时刻即可。

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'other';

export interface NormalizedMessage {
  role: MessageRole;
  content: string;
}

export interface NormalizedOutput {
  label: string;
  content: string;
  tagColor: string;
}

export function truncateText(text: string, maxLength = 100): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function normalizeRole(role: string | undefined): MessageRole {
  switch (role) {
    case 'system':
    case 'user':
    case 'assistant':
    case 'tool':
      return role;
    default:
      return 'other';
  }
}

export function roleLabel(role: MessageRole): string {
  switch (role) {
    case 'system':
      return 'System';
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'tool':
      return 'Tool';
    default:
      return 'Other';
  }
}

export function roleColor(role: MessageRole): string {
  switch (role) {
    case 'system':
      return 'purple';
    case 'user':
      return 'blue';
    case 'assistant':
      return 'green';
    case 'tool':
      return 'orange';
    default:
      return 'default';
  }
}

// systemPrompt 是独立字段；messages[] 只装 user/assistant 对话流。
// 只要 systemPrompt 非空，就始终作为首条——除非 messages 里已有同名 role（去重）。
export function extractMessages(item: HistoryItem): NormalizedMessage[] {
  const snap = item.requestSnapshot;
  const result: NormalizedMessage[] = [];
  const messages = Array.isArray(snap.messages) ? snap.messages : null;

  const hasSystemInMessages =
    messages?.some((m) => (m as { role?: string }).role === 'system') ?? false;
  if (snap.systemPrompt && !hasSystemInMessages) {
    result.push({ role: 'system', content: snap.systemPrompt });
  }

  if (messages && messages.length) {
    for (const m of messages) {
      const raw = m as { role?: string; content?: string };
      const content = raw.content ?? '';
      if (!content) continue;
      result.push({ role: normalizeRole(raw.role), content });
    }
    return result;
  }

  if (Array.isArray(snap.userPrompts)) {
    for (const text of snap.userPrompts) {
      if (text) result.push({ role: 'user', content: text });
    }
  }
  return result;
}

export function extractOutputs(item: HistoryItem): NormalizedOutput[] {
  const snap = item.responseSnapshot;
  const result: NormalizedOutput[] = [];
  if (snap.thinking) {
    result.push({ label: 'Thinking', content: snap.thinking, tagColor: 'cyan' });
  }
  if (snap.outputText) {
    result.push({ label: 'Output', content: snap.outputText, tagColor: 'green' });
  }
  return result;
}

export function hasTools(item: HistoryItem): boolean {
  return Boolean(item.requestSnapshot.toolsDefinition?.trim());
}

export function getDisplayTitle(item: HistoryItem): string {
  if (item.title) return item.title;

  if (
    Array.isArray(item.requestSnapshot.messages) &&
    item.requestSnapshot.messages.length
  ) {
    const firstUserMsg = item.requestSnapshot.messages.find(
      (m) => (m as { role?: string }).role === 'user'
    );
    if (firstUserMsg) {
      return truncateText((firstUserMsg as { content?: string }).content || '', 50);
    }
  }

  if (
    Array.isArray(item.requestSnapshot.userPrompts) &&
    item.requestSnapshot.userPrompts.length
  ) {
    return truncateText(item.requestSnapshot.userPrompts[0], 50);
  }

  return '未命名对话';
}

export function matchesHistoryItem(item: HistoryItem, queryLower: string): boolean {
  if (!queryLower) return true;
  const title = item.title?.toLowerCase() || '';
  const model = item.requestSnapshot.modelId?.toLowerCase() || '';
  const systemPrompt = item.requestSnapshot.systemPrompt?.toLowerCase() || '';
  const output = item.responseSnapshot.outputText?.toLowerCase() || '';

  let userMessages = '';
  if (Array.isArray(item.requestSnapshot.messages)) {
    userMessages = item.requestSnapshot.messages
      .map((m) => (m as { content?: string }).content || '')
      .join(' ')
      .toLowerCase();
  } else if (Array.isArray(item.requestSnapshot.userPrompts)) {
    userMessages = item.requestSnapshot.userPrompts.join(' ').toLowerCase();
  }

  return (
    title.includes(queryLower) ||
    model.includes(queryLower) ||
    systemPrompt.includes(queryLower) ||
    userMessages.includes(queryLower) ||
    output.includes(queryLower)
  );
}

export function formatGroupLabel(timestamp: number, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return '今天';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  } else {
    return date.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
  }
}

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getDateKey(timestamp: number): string {
  return new Date(timestamp).toDateString();
}
