import { describe, it, expect, beforeEach, afterEach, vitest } from 'vitest';
import { 
  generateShareUrl, 
  parseUrlParams, 
  hasGatewayParams, 
  clearShareParams, 
  validateGatewayUrl 
} from '../lib/urlSharing';

describe('urlSharing', () => {
  let originalLocation: Location;
  
  beforeEach(() => {
    originalLocation = window.location;
    // Mock window.location
    delete (window as any).location;
    (window as any).location = {
      ...originalLocation,
      origin: 'https://app.example.com',
      pathname: '/',
      search: '',
      href: 'https://app.example.com/'
    };
  });
  
  afterEach(() => {
    (window as any).location = originalLocation;
  });

  describe('generateShareUrl', () => {
    it('should generate basic share URL with gateway parameter', () => {
      const url = generateShareUrl({
        gatewayUrl: 'https://gateway.example.com'
      });
      
      expect(url).toBe('https://app.example.com?gateway=https%3A%2F%2Fgateway.example.com&autoLogin=true');
    });

    it('should include custom clientId when provided', () => {
      const url = generateShareUrl({
        gatewayUrl: 'https://gateway.example.com',
        clientId: 'custom-client'
      });
      
      expect(url).toBe('https://app.example.com?gateway=https%3A%2F%2Fgateway.example.com&clientId=custom-client&autoLogin=true');
    });

    it('should not include clientId when it equals default "truestprompt"', () => {
      const url = generateShareUrl({
        gatewayUrl: 'https://gateway.example.com',
        clientId: 'truestprompt'
      });
      
      expect(url).toBe('https://app.example.com?gateway=https%3A%2F%2Fgateway.example.com&autoLogin=true');
    });

    it('should include project name when provided', () => {
      const url = generateShareUrl({
        gatewayUrl: 'https://gateway.example.com',
        projectName: 'My Project'
      });
      
      expect(url).toBe('https://app.example.com?gateway=https%3A%2F%2Fgateway.example.com&project=My+Project&autoLogin=true');
    });

    it('should respect autoLogin false', () => {
      const url = generateShareUrl({
        gatewayUrl: 'https://gateway.example.com',
        autoLogin: false
      });
      
      expect(url).toBe('https://app.example.com?gateway=https%3A%2F%2Fgateway.example.com');
    });

    it('should include all parameters when provided', () => {
      const url = generateShareUrl({
        gatewayUrl: 'https://gateway.example.com',
        clientId: 'custom-client',
        projectName: 'Test Project',
        autoLogin: true
      });
      
      expect(url).toBe('https://app.example.com?gateway=https%3A%2F%2Fgateway.example.com&clientId=custom-client&project=Test+Project&autoLogin=true');
    });
  });

  describe('parseUrlParams', () => {
    it('should parse gateway URL parameter', () => {
      (window as any).location.search = '?gateway=https%3A%2F%2Fgateway.example.com';
      
      const params = parseUrlParams();
      
      expect(params.gatewayUrl).toBe('https://gateway.example.com');
      expect(params.clientId).toBe('truestprompt'); // default
      expect(params.autoLogin).toBe(false); // default
    });

    it('should parse all parameters', () => {
      (window as any).location.search = '?gateway=https%3A%2F%2Fgateway.example.com&clientId=custom&project=Test&autoLogin=true';
      
      const params = parseUrlParams();
      
      expect(params.gatewayUrl).toBe('https://gateway.example.com');
      expect(params.clientId).toBe('custom');
      expect(params.projectName).toBe('Test');
      expect(params.autoLogin).toBe(true);
    });

    it('should handle alternative parameter names', () => {
      (window as any).location.search = '?gatewayUrl=https%3A%2F%2Fgateway.example.com&client_id=alt&projectName=AltTest&auto_login=true';
      
      const params = parseUrlParams();
      
      expect(params.gatewayUrl).toBe('https://gateway.example.com');
      expect(params.clientId).toBe('alt');
      expect(params.projectName).toBe('AltTest');
      expect(params.autoLogin).toBe(true);
    });

    it('should return defaults when no parameters', () => {
      (window as any).location.search = '';
      
      const params = parseUrlParams();
      
      expect(params.gatewayUrl).toBeNull();
      expect(params.clientId).toBe('truestprompt');
      expect(params.projectName).toBeNull();
      expect(params.autoLogin).toBe(false);
    });
  });

  describe('hasGatewayParams', () => {
    it('should return true when gateway parameter exists', () => {
      (window as any).location.search = '?gateway=https%3A%2F%2Fgateway.example.com';
      
      expect(hasGatewayParams()).toBe(true);
    });

    it('should return false when no gateway parameter', () => {
      (window as any).location.search = '?other=value';
      
      expect(hasGatewayParams()).toBe(false);
    });

    it('should return false when no parameters', () => {
      (window as any).location.search = '';
      
      expect(hasGatewayParams()).toBe(false);
    });
  });

  describe('validateGatewayUrl', () => {
    it('should validate HTTPS URLs', () => {
      expect(validateGatewayUrl('https://gateway.example.com')).toBe(true);
      expect(validateGatewayUrl('https://gateway.example.com:8080')).toBe(true);
      expect(validateGatewayUrl('https://gateway.example.com/path')).toBe(true);
    });

    it('should validate HTTP URLs', () => {
      expect(validateGatewayUrl('http://localhost:3000')).toBe(true);
      expect(validateGatewayUrl('http://gateway.local')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateGatewayUrl('not-a-url')).toBe(false);
      expect(validateGatewayUrl('ftp://gateway.example.com')).toBe(false);
      expect(validateGatewayUrl('')).toBe(false);
      expect(validateGatewayUrl('gateway.example.com')).toBe(false);
    });
  });

  describe('clearShareParams', () => {
    it('should clear URL parameters', () => {
      (window as any).location.search = '?gateway=test&project=test';
      const mockReplaceState = vitest.fn();
      window.history.replaceState = mockReplaceState;
      
      clearShareParams();
      
      expect(mockReplaceState).toHaveBeenCalledWith({}, '', '/');
    });
  });
});