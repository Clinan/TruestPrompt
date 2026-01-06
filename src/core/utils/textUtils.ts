/**
 * 文本内容有效性检测工具
 * 零依赖实现，覆盖常见无意义字符
 */

/**
 * 无意义字符正则
 * - \s: 标准空白（空格、tab、换行、回车等）
 * - \u00A0: 不换行空格 (NBSP)
 * - \u2000-\u200B: 各种宽度空格 + 零宽空格
 * - \u200C-\u200D: 零宽非连接符/连接符
 * - \u2028-\u2029: 行/段分隔符
 * - \u202F: 窄不换行空格
 * - \u205F: 中等数学空格
 * - \u3000: 全角空格
 * - \uFEFF: BOM / 零宽不换行空格
 */
const WHITESPACE_ONLY = /^[\s\u00A0\u2000-\u200D\u2028-\u2029\u202F\u205F\u3000\uFEFF]*$/;

/**
 * 检查文本是否包含有意义的内容
 */
export function hasMeaningfulContent(text: string | null | undefined): boolean {
  if (text == null) return false;
  return !WHITESPACE_ONLY.test(text);
}
