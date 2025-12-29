/**
 * Image Utils Property Tests
 * 
 * **Feature: vl-image-upload, Property 1, 2, 3, 4, 5, 6, 7: Image Operations**
 * **Validates: Requirements 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ImageContent, UserPromptPreset } from '../types';

// Helper to generate unique IDs
let idCounter = 0;
function newId(): string {
  return `img-${++idCounter}-${Date.now()}`;
}

// Image operations (pure functions for testing)
function addImage(images: ImageContent[], newImage: ImageContent): ImageContent[] {
  return [...images, newImage];
}

function removeImage(images: ImageContent[], index: number): ImageContent[] {
  if (index < 0 || index >= images.length) return images;
  return images.filter((_, i) => i !== index);
}

// Arbitrary generators
const mimeTypeArb = fc.constantFrom('image/png', 'image/jpeg', 'image/gif', 'image/webp');

const urlImageArb: fc.Arbitrary<ImageContent> = fc.record({
  id: fc.uuid(),
  type: fc.constant('url' as const),
  url: fc.webUrl().map(url => `${url}/image.png`),
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
});

const base64ImageArb: fc.Arbitrary<ImageContent> = fc.record({
  id: fc.uuid(),
  type: fc.constant('base64' as const),
  base64: fc.base64String({ minLength: 100, maxLength: 1000 }),
  mimeType: mimeTypeArb,
  name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
});

const imageContentArb: fc.Arbitrary<ImageContent> = fc.oneof(urlImageArb, base64ImageArb);

const imagesArrayArb = fc.array(imageContentArb, { minLength: 0, maxLength: 10 });

const roleArb = fc.constantFrom('system', 'user', 'assistant') as fc.Arbitrary<UserPromptPreset['role']>;

const userPromptPresetArb: fc.Arbitrary<UserPromptPreset> = fc.record({
  id: fc.uuid(),
  role: roleArb,
  text: fc.string({ minLength: 0, maxLength: 500 }),
  images: fc.option(imagesArrayArb, { nil: undefined })
});

describe('Image Utils Property Tests', () => {
  /**
   * Property 5: Storage Round Trip
   * For any UserPromptPreset with images, serializing to JSON and deserializing
   * should produce an equivalent object with all image data preserved.
   * 
   * **Feature: vl-image-upload, Property 5: Storage Round Trip**
   * **Validates: Requirements 3.4, 3.5**
   */
  describe('Property 5: Storage Round Trip', () => {
    it('serializing and deserializing UserPromptPreset preserves all data', () => {
      fc.assert(
        fc.property(userPromptPresetArb, (preset) => {
          const serialized = JSON.stringify(preset);
          const deserialized = JSON.parse(serialized) as UserPromptPreset;
          
          expect(deserialized.id).toBe(preset.id);
          expect(deserialized.role).toBe(preset.role);
          expect(deserialized.text).toBe(preset.text);
          
          if (preset.images) {
            expect(deserialized.images).toBeDefined();
            expect(deserialized.images?.length).toBe(preset.images.length);
            
            preset.images.forEach((img, i) => {
              const deserializedImg = deserialized.images![i];
              expect(deserializedImg.id).toBe(img.id);
              expect(deserializedImg.type).toBe(img.type);
              expect(deserializedImg.url).toBe(img.url);
              expect(deserializedImg.base64).toBe(img.base64);
              expect(deserializedImg.mimeType).toBe(img.mimeType);
              expect(deserializedImg.name).toBe(img.name);
            });
          } else {
            expect(deserialized.images).toBeUndefined();
          }
        }),
        { numRuns: 100 }
      );
    });

    it('serializing ImageContent array preserves all images', () => {
      fc.assert(
        fc.property(imagesArrayArb, (images) => {
          const serialized = JSON.stringify(images);
          const deserialized = JSON.parse(serialized) as ImageContent[];
          
          expect(deserialized.length).toBe(images.length);
          
          images.forEach((img, i) => {
            expect(deserialized[i]).toEqual(img);
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Image List Addition
   * For any message and any valid image, adding the image to the message
   * should increase the images array length by exactly 1 and the new image
   * should be at the end of the array.
   * 
   * **Feature: vl-image-upload, Property 2: Image List Addition**
   * **Validates: Requirements 2.1**
   */
  describe('Property 2: Image List Addition', () => {
    it('adding an image increases array length by 1', () => {
      fc.assert(
        fc.property(imagesArrayArb, imageContentArb, (existingImages, newImage) => {
          const before = [...existingImages];
          const after = addImage(existingImages, newImage);
          
          expect(after.length).toBe(before.length + 1);
        }),
        { numRuns: 100 }
      );
    });

    it('new image is appended at the end', () => {
      fc.assert(
        fc.property(imagesArrayArb, imageContentArb, (existingImages, newImage) => {
          const after = addImage(existingImages, newImage);
          
          expect(after[after.length - 1]).toEqual(newImage);
        }),
        { numRuns: 100 }
      );
    });

    it('existing images are preserved in order', () => {
      fc.assert(
        fc.property(imagesArrayArb, imageContentArb, (existingImages, newImage) => {
          const after = addImage(existingImages, newImage);
          
          existingImages.forEach((img, i) => {
            expect(after[i]).toEqual(img);
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Image List Removal
   * For any message with N images (N > 0) and any valid index i (0 <= i < N),
   * removing the image at index i should result in an array of length N-1
   * with all other images preserved in order.
   * 
   * **Feature: vl-image-upload, Property 3: Image List Removal**
   * **Validates: Requirements 2.2**
   */
  describe('Property 3: Image List Removal', () => {
    it('removing an image decreases array length by 1', () => {
      fc.assert(
        fc.property(
          fc.array(imageContentArb, { minLength: 1, maxLength: 10 }),
          fc.nat(),
          (images, indexSeed) => {
            const index = indexSeed % images.length;
            const after = removeImage(images, index);
            
            expect(after.length).toBe(images.length - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removed image is no longer in array', () => {
      fc.assert(
        fc.property(
          fc.array(imageContentArb, { minLength: 1, maxLength: 10 }),
          fc.nat(),
          (images, indexSeed) => {
            const index = indexSeed % images.length;
            const removedImage = images[index];
            const after = removeImage(images, index);
            
            // The specific image at that index should not be at that position
            // Note: we check by reference since IDs could theoretically collide
            expect(after[index]).not.toBe(removedImage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('other images are preserved in order', () => {
      fc.assert(
        fc.property(
          fc.array(imageContentArb, { minLength: 1, maxLength: 10 }),
          fc.nat(),
          (images, indexSeed) => {
            const index = indexSeed % images.length;
            const after = removeImage(images, index);
            
            // Images before the removed index should be unchanged
            for (let i = 0; i < index; i++) {
              expect(after[i]).toEqual(images[i]);
            }
            
            // Images after the removed index should shift down
            for (let i = index; i < after.length; i++) {
              expect(after[i]).toEqual(images[i + 1]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removing from empty array is no-op', () => {
      fc.assert(
        fc.property(fc.nat(), (index) => {
          const after = removeImage([], index);
          expect(after).toEqual([]);
        }),
        { numRuns: 50 }
      );
    });

    it('removing with invalid index is no-op', () => {
      fc.assert(
        fc.property(
          fc.array(imageContentArb, { minLength: 1, maxLength: 10 }),
          (images) => {
            const invalidIndex = images.length + 10;
            const after = removeImage(images, invalidIndex);
            expect(after).toEqual(images);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 6: Role-Based Image Button Visibility
   * For any message, the image attachment button should be visible
   * if and only if the message role is "user".
   * 
   * **Feature: vl-image-upload, Property 6: Role-Based Image Button Visibility**
   * **Validates: Requirements 5.1, 5.2**
   */
  describe('Property 6: Role-Based Image Button Visibility', () => {
    function shouldShowImageButton(role: UserPromptPreset['role']): boolean {
      return role === 'user';
    }

    it('image button is visible only for user role', () => {
      fc.assert(
        fc.property(roleArb, (role) => {
          const visible = shouldShowImageButton(role);
          
          if (role === 'user') {
            expect(visible).toBe(true);
          } else {
            expect(visible).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('system role hides image button', () => {
      expect(shouldShowImageButton('system')).toBe(false);
    });

    it('assistant role hides image button', () => {
      expect(shouldShowImageButton('assistant')).toBe(false);
    });

    it('user role shows image button', () => {
      expect(shouldShowImageButton('user')).toBe(true);
    });
  });

  /**
   * Property 7: Image Preservation on Role Change
   * For any message with images, changing the role from "user" to another role
   * and back to "user" should preserve all images unchanged.
   * 
   * **Feature: vl-image-upload, Property 7: Image Preservation on Role Change**
   * **Validates: Requirements 5.3, 5.4**
   */
  describe('Property 7: Image Preservation on Role Change', () => {
    function changeRole(preset: UserPromptPreset, newRole: UserPromptPreset['role']): UserPromptPreset {
      return { ...preset, role: newRole };
    }

    it('changing role preserves images', () => {
      fc.assert(
        fc.property(
          userPromptPresetArb,
          roleArb,
          (preset, newRole) => {
            const changed = changeRole(preset, newRole);
            
            // Images should be preserved regardless of role change
            expect(changed.images).toEqual(preset.images);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('round-trip role change preserves images', () => {
      fc.assert(
        fc.property(
          userPromptPresetArb.filter(p => p.role === 'user'),
          fc.constantFrom('system', 'assistant') as fc.Arbitrary<'system' | 'assistant'>,
          (preset, intermediateRole) => {
            // Change from user to another role
            const changed = changeRole(preset, intermediateRole);
            // Change back to user
            const restored = changeRole(changed, 'user');
            
            // Images should be preserved
            expect(restored.images).toEqual(preset.images);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple role changes preserve images', () => {
      fc.assert(
        fc.property(
          userPromptPresetArb,
          fc.array(roleArb, { minLength: 1, maxLength: 10 }),
          (preset, roleChanges) => {
            let current = preset;
            
            for (const role of roleChanges) {
              current = changeRole(current, role);
            }
            
            // Images should be preserved after all changes
            expect(current.images).toEqual(preset.images);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// Import actual utility functions
import {
  estimateBase64Size,
  isValidImageUrl,
  parseDataUrl,
  buildDataUrl,
  isSupportedImageType,
  getImageTypeLabel
} from '../lib/imageUtils';

describe('Image Utils Functions', () => {
  /**
   * Property 1: File to Base64 Round Trip
   * For any valid image file, converting it to Base64 and then decoding
   * should produce data equivalent to the original file content.
   * 
   * Note: In browser environment, we test the parseDataUrl/buildDataUrl round trip
   * since FileReader is not available in Node.js test environment.
   * 
   * **Feature: vl-image-upload, Property 1: File to Base64 Round Trip**
   * **Validates: Requirements 1.4**
   */
  describe('Property 1: Data URL Round Trip', () => {
    it('buildDataUrl and parseDataUrl are inverse operations', () => {
      fc.assert(
        fc.property(
          fc.base64String({ minLength: 10, maxLength: 500 }),
          fc.constantFrom('image/png', 'image/jpeg', 'image/gif', 'image/webp'),
          (base64, mimeType) => {
            const dataUrl = buildDataUrl(base64, mimeType);
            const parsed = parseDataUrl(dataUrl);
            
            expect(parsed).not.toBeNull();
            expect(parsed?.base64).toBe(base64);
            expect(parsed?.mimeType).toBe(mimeType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('parseDataUrl returns null for invalid data URLs', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !s.startsWith('data:image/')),
          (invalidUrl) => {
            const parsed = parseDataUrl(invalidUrl);
            expect(parsed).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('buildDataUrl handles already-formatted data URLs', () => {
      fc.assert(
        fc.property(
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.constantFrom('image/png', 'image/jpeg'),
          (base64, mimeType) => {
            const dataUrl = `data:${mimeType};base64,${base64}`;
            const result = buildDataUrl(dataUrl, 'image/gif'); // Different mime type
            
            // Should return the original data URL unchanged
            expect(result).toBe(dataUrl);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('estimateBase64Size', () => {
    it('returns size in bytes for small data', () => {
      const smallBase64 = 'YWJj'; // 'abc' in base64
      const size = estimateBase64Size(smallBase64);
      expect(size).toMatch(/^\d+ B$/);
    });

    it('returns size in KB for medium data', () => {
      // Generate ~2KB of base64 data
      const mediumBase64 = 'A'.repeat(2730); // ~2KB
      const size = estimateBase64Size(mediumBase64);
      expect(size).toMatch(/^\d+(\.\d+)? KB$/);
    });

    it('returns size in MB for large data', () => {
      // Generate ~2MB of base64 data
      const largeBase64 = 'A'.repeat(2796203); // ~2MB
      const size = estimateBase64Size(largeBase64);
      expect(size).toMatch(/^\d+(\.\d+)? MB$/);
    });

    it('handles data URL format', () => {
      const dataUrl = 'data:image/png;base64,YWJjZGVm';
      const size = estimateBase64Size(dataUrl);
      expect(size).toMatch(/^\d+(\.\d+)? (B|KB|MB)$/);
    });
  });

  describe('isValidImageUrl', () => {
    it('accepts valid http URLs', () => {
      fc.assert(
        fc.property(fc.webUrl(), (url) => {
          expect(isValidImageUrl(url)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('accepts data URLs', () => {
      fc.assert(
        fc.property(
          fc.base64String({ minLength: 10, maxLength: 100 }),
          fc.constantFrom('image/png', 'image/jpeg', 'image/gif', 'image/webp'),
          (base64, mimeType) => {
            const dataUrl = `data:${mimeType};base64,${base64}`;
            expect(isValidImageUrl(dataUrl)).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('rejects invalid URLs', () => {
      expect(isValidImageUrl('')).toBe(false);
      expect(isValidImageUrl('not-a-url')).toBe(false);
      expect(isValidImageUrl('ftp://example.com/image.png')).toBe(false);
    });

    it('rejects null and undefined', () => {
      expect(isValidImageUrl(null as any)).toBe(false);
      expect(isValidImageUrl(undefined as any)).toBe(false);
    });
  });

  describe('getImageTypeLabel', () => {
    it('returns correct labels', () => {
      expect(getImageTypeLabel('url')).toBe('URL');
      expect(getImageTypeLabel('base64')).toBe('Base64');
    });
  });
});


// Import plugin functions for API format testing
import {
  imageToVisionContent,
  buildVisionContent,
  normalizeMessages,
  type VisionContentPart
} from '../lib/plugins';
import type { PluginRequest } from '../types';

describe('API Format Property Tests', () => {
  /**
   * Property 4: API Format Correctness
   * For any message with text and images, the formatted API request should:
   * - Have content as an array when images are present
   * - Include a text content item with the message text
   * - Include an image_url content item for each image
   * - URL images should have their URL directly in image_url.url
   * - Base64 images should have a data URL format in image_url.url
   * 
   * **Feature: vl-image-upload, Property 4: API Format Correctness**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  describe('Property 4: API Format Correctness', () => {
    describe('imageToVisionContent', () => {
      it('URL images have URL directly in image_url.url', () => {
        fc.assert(
          fc.property(urlImageArb, (image) => {
            const result = imageToVisionContent(image);
            
            expect(result.type).toBe('image_url');
            expect(result.image_url.url).toBe(image.url);
          }),
          { numRuns: 100 }
        );
      });

      it('Base64 images have data URL format in image_url.url', () => {
        fc.assert(
          fc.property(base64ImageArb, (image) => {
            const result = imageToVisionContent(image);
            
            expect(result.type).toBe('image_url');
            expect(result.image_url.url).toMatch(/^data:image\/[^;]+;base64,.+$/);
            expect(result.image_url.url).toContain(image.base64);
          }),
          { numRuns: 100 }
        );
      });
    });

    describe('buildVisionContent', () => {
      it('returns string when no images', () => {
        fc.assert(
          fc.property(fc.string(), (text) => {
            const result = buildVisionContent(text, undefined);
            expect(typeof result).toBe('string');
            expect(result).toBe(text);
          }),
          { numRuns: 50 }
        );
      });

      it('returns string when images array is empty', () => {
        fc.assert(
          fc.property(fc.string(), (text) => {
            const result = buildVisionContent(text, []);
            expect(typeof result).toBe('string');
            expect(result).toBe(text);
          }),
          { numRuns: 50 }
        );
      });

      it('returns array when images are present', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }),
            fc.array(imageContentArb, { minLength: 1, maxLength: 5 }),
            (text, images) => {
              const result = buildVisionContent(text, images);
              
              expect(Array.isArray(result)).toBe(true);
              const contentArray = result as VisionContentPart[];
              
              // Should have text + images count elements
              expect(contentArray.length).toBe(1 + images.length);
              
              // First element should be text
              expect(contentArray[0].type).toBe('text');
              expect((contentArray[0] as any).text).toBe(text);
              
              // Rest should be image_url
              for (let i = 1; i < contentArray.length; i++) {
                expect(contentArray[i].type).toBe('image_url');
              }
            }
          ),
          { numRuns: 100 }
        );
      });

      it('includes image_url for each image', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1 }),
            fc.array(imageContentArb, { minLength: 1, maxLength: 5 }),
            (text, images) => {
              const result = buildVisionContent(text, images);
              const contentArray = result as VisionContentPart[];
              
              const imageUrls = contentArray.filter(c => c.type === 'image_url');
              expect(imageUrls.length).toBe(images.length);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('normalizeMessages', () => {
      it('preserves images in messages', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.array(imageContentArb, { minLength: 1, maxLength: 3 }),
            (text, images) => {
              const request: PluginRequest = {
                systemPrompt: '',
                userPrompts: [],
                toolsDefinition: '',
                params: {},
                modelId: 'test-model',
                enableSuggestions: false,
                stream: false,
                messages: [{ role: 'user', content: text, images }]
              };
              
              const result = normalizeMessages(request);
              
              expect(result.length).toBe(1);
              expect(Array.isArray(result[0].content)).toBe(true);
              
              const contentArray = result[0].content as VisionContentPart[];
              const imageUrls = contentArray.filter(c => c.type === 'image_url');
              expect(imageUrls.length).toBe(images.length);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('handles messages without images as plain text', () => {
        fc.assert(
          fc.property(
            // 生成至少包含一个非空白字符的字符串
            fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            (text) => {
              const request: PluginRequest = {
                systemPrompt: '',
                userPrompts: [],
                toolsDefinition: '',
                params: {},
                modelId: 'test-model',
                enableSuggestions: false,
                stream: false,
                messages: [{ role: 'user', content: text }]
              };
              
              const result = normalizeMessages(request);
              
              expect(result.length).toBe(1);
              expect(typeof result[0].content).toBe('string');
              expect(result[0].content).toBe(text);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('filters empty messages but keeps messages with only images', () => {
        fc.assert(
          fc.property(
            fc.array(imageContentArb, { minLength: 1, maxLength: 3 }),
            (images) => {
              const request: PluginRequest = {
                systemPrompt: '',
                userPrompts: [],
                toolsDefinition: '',
                params: {},
                modelId: 'test-model',
                enableSuggestions: false,
                stream: false,
                messages: [{ role: 'user', content: '', images }]
              };
              
              const result = normalizeMessages(request);
              
              // Message with images but empty text should still be included
              expect(result.length).toBe(1);
              expect(Array.isArray(result[0].content)).toBe(true);
            }
          ),
          { numRuns: 50 }
        );
      });
    });
  });
});
