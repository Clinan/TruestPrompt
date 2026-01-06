/**
 * Property 13: Tools JSON Validation
 * Property 14: JSON Format Idempotence
 * Property 15: Invalid Tools JSON Prevents Save
 *
 * **Feature: ui-redesign-langui-antdv, Property 13-15: JSON Validation**
 * **Validates: Requirements 7.2, 7.3, 7.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseToolsDefinition } from '../modules/provider/domain/tools';

// Tools validation functions (extracted from ToolsModal.vue logic)
function isValidToolsDefinition(value: string): boolean {
  return !parseToolsDefinition(value).error;
}

function formatJson(value: string): string {
  const parsed = JSON.parse(value);
  return JSON.stringify(parsed, null, 2);
}

function canSaveTools(jsonString: string): boolean {
  return isValidToolsDefinition(jsonString);
}

describe('Tools JSON Validation (Property 13)', () => {
  it('should accept tools array format', () => {
    const toolObjectArb = fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue());
    const toolsArrayArb = fc.array(toolObjectArb, { maxLength: 5 });
    fc.assert(
      fc.property(toolsArrayArb, (tools) => {
        const jsonString = JSON.stringify(tools);
        expect(isValidToolsDefinition(jsonString)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept { tools: [] } format', () => {
    const toolObjectArb = fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue());
    const toolsArrayArb = fc.array(toolObjectArb, { maxLength: 5 });
    fc.assert(
      fc.property(toolsArrayArb, (tools) => {
        const jsonString = JSON.stringify({ tools });
        expect(isValidToolsDefinition(jsonString)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should correctly identify invalid JSON', () => {
    const invalidJsonExamples = [
      '{invalid}',
      '{"key": }',
      '[1, 2, ]',
      '{"unclosed": "string',
      'not json at all',
      '{key: "no quotes on key"}',
      "{'single': 'quotes'}"
    ];

    invalidJsonExamples.forEach(invalid => {
      expect(isValidToolsDefinition(invalid)).toBe(false);
    });
  });

  it('should reject invalid tool shapes', () => {
    const invalidShapes = [
      'null',
      'true',
      '123',
      '"string"',
      '{}',
      '{"tools":"nope"}'
    ];

    invalidShapes.forEach((item) => {
      expect(isValidToolsDefinition(item)).toBe(false);
    });
  });

  it('should reject non-object tool entries', () => {
    const invalidTools = JSON.stringify([{ type: 'function' }, 'oops']);
    expect(isValidToolsDefinition(invalidTools)).toBe(false);
  });

  it('should allow empty definition', () => {
    expect(isValidToolsDefinition('')).toBe(true);
    expect(isValidToolsDefinition('   ')).toBe(true);
  });
});

describe('JSON Format Idempotence (Property 14)', () => {
  it('should produce same result when formatting multiple times', () => {
    fc.assert(
      fc.property(
        fc.json(),
        (jsonValue) => {
          const jsonString = JSON.stringify(jsonValue);

          // Format once
          const formatted1 = formatJson(jsonString);

          // Format again
          const formatted2 = formatJson(formatted1);

          // Should be identical (idempotent)
          expect(formatted2).toBe(formatted1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should normalize different whitespace to same format', () => {
    const compact = '{"a":1,"b":2}';
    const spaced = '{ "a" : 1 , "b" : 2 }';
    const multiline = `{
      "a": 1,
      "b": 2
    }`;

    const formatted1 = formatJson(compact);
    const formatted2 = formatJson(spaced);
    const formatted3 = formatJson(multiline);

    expect(formatted1).toBe(formatted2);
    expect(formatted2).toBe(formatted3);
  });
});

describe('Invalid Tools JSON Prevents Save (Property 15)', () => {
  it('should prevent save for invalid JSON', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => {
          if (!s.trim()) return false;
          try {
            JSON.parse(s);
            return false; // Valid JSON, skip
          } catch {
            return true; // Invalid JSON, keep
          }
        }),
        (invalidJson) => {
          expect(canSaveTools(invalidJson)).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should allow save for valid tools JSON', () => {
    fc.assert(
      fc.property(
        fc.array(fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue()), { maxLength: 5 }),
        (tools) => {
          const jsonString = JSON.stringify(tools);
          expect(canSaveTools(jsonString)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle tools array format', () => {
    const validTools = JSON.stringify([
      {
        type: 'function',
        function: {
          name: 'test',
          description: 'A test function',
          parameters: { type: 'object', properties: {} }
        }
      }
    ]);

    expect(canSaveTools(validTools)).toBe(true);
  });
});
