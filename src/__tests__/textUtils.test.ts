import { describe, it, expect } from 'vitest';
import { hasMeaningfulContent } from '../core/utils/textUtils';

describe('hasMeaningfulContent', () => {
  describe('返回 false（无意义内容）', () => {
    it('null 和 undefined', () => {
      expect(hasMeaningfulContent(null)).toBe(false);
      expect(hasMeaningfulContent(undefined)).toBe(false);
    });

    it('空字符串', () => {
      expect(hasMeaningfulContent('')).toBe(false);
    });

    it('纯空格', () => {
      expect(hasMeaningfulContent(' ')).toBe(false);
      expect(hasMeaningfulContent('   ')).toBe(false);
    });

    it('纯换行符', () => {
      expect(hasMeaningfulContent('\n')).toBe(false);
      expect(hasMeaningfulContent('\n\n\n')).toBe(false);
      expect(hasMeaningfulContent('\r\n')).toBe(false);
    });

    it('纯 tab', () => {
      expect(hasMeaningfulContent('\t')).toBe(false);
      expect(hasMeaningfulContent('\t\t')).toBe(false);
    });

    it('混合空白字符', () => {
      expect(hasMeaningfulContent(' \n\t\r\n ')).toBe(false);
    });

    it('全角空格', () => {
      expect(hasMeaningfulContent('\u3000')).toBe(false);
      expect(hasMeaningfulContent('\u3000\u3000')).toBe(false);
    });

    it('不换行空格 (NBSP)', () => {
      expect(hasMeaningfulContent('\u00A0')).toBe(false);
    });

    it('零宽空格', () => {
      expect(hasMeaningfulContent('\u200B')).toBe(false);
    });

    it('BOM', () => {
      expect(hasMeaningfulContent('\uFEFF')).toBe(false);
    });

    it('多种无意义字符混合', () => {
      // 空格 + 换行 + tab
      expect(hasMeaningfulContent(' \n\t')).toBe(false);
      // 全角空格 + 普通空格 + 换行
      expect(hasMeaningfulContent('\u3000 \n')).toBe(false);
      // NBSP + 零宽空格 + tab
      expect(hasMeaningfulContent('\u00A0\u200B\t')).toBe(false);
      // BOM + 空格 + 换行 + 全角空格
      expect(hasMeaningfulContent('\uFEFF \n\u3000')).toBe(false);
      // 所有类型混合
      expect(hasMeaningfulContent('\uFEFF\u00A0\u200B\u3000 \t\n\r\n')).toBe(false);
      // 零宽连接符 + 零宽非连接符
      expect(hasMeaningfulContent('\u200C\u200D')).toBe(false);
      // 各种宽度空格
      expect(hasMeaningfulContent('\u2000\u2001\u2002\u2003')).toBe(false);
      // 行分隔符 + 段分隔符
      expect(hasMeaningfulContent('\u2028\u2029')).toBe(false);
    });
  });

  describe('返回 true（有意义内容）', () => {
    it('普通文本', () => {
      expect(hasMeaningfulContent('hello')).toBe(true);
      expect(hasMeaningfulContent('你好')).toBe(true);
    });

    it('带换行的文本 - 保留换行符', () => {
      expect(hasMeaningfulContent('hello\nworld')).toBe(true);
      expect(hasMeaningfulContent('line1\n\nline2')).toBe(true);
    });

    it('前后有空白的文本 - 保留空白', () => {
      expect(hasMeaningfulContent('  hello  ')).toBe(true);
      expect(hasMeaningfulContent('\thello\t')).toBe(true);
      expect(hasMeaningfulContent('\nhello\n')).toBe(true);
    });

    it('单个字符', () => {
      expect(hasMeaningfulContent('a')).toBe(true);
      expect(hasMeaningfulContent('0')).toBe(true);
      expect(hasMeaningfulContent('.')).toBe(true);
    });

    it('特殊字符', () => {
      expect(hasMeaningfulContent('!')).toBe(true);
      expect(hasMeaningfulContent('😀')).toBe(true);
    });
  });
});
