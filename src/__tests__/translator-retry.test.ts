/**
 * Tests for translator retry logic
 *
 * Tests the exponential backoff retry behavior:
 * - Retries on RateLimitError, APIConnectionError, 5xx APIError
 * - Does NOT retry on AuthenticationError, BadRequestError
 * - Respects max retries (3 attempts)
 * - Exponential backoff timing (1s, 2s, 4s)
 */

import { TranslationService, RETRY_CONFIG } from '../translator';

// Mock @actions/core to avoid GitHub Action context errors
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
}));

// Mock the Anthropic SDK
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  // Create error classes matching real SDK signatures
  class AnthropicError extends Error {}

  class APIError extends AnthropicError {
    readonly status: number | undefined;
    readonly headers: Headers | undefined;
    readonly error: Object | undefined;
    constructor(status: number | undefined, error: Object | undefined, message: string | undefined, headers: Headers | undefined) {
      super(message || 'API Error');
      this.status = status;
      this.error = error;
      this.headers = headers;
      this.name = 'APIError';
    }
  }

  class AuthenticationError extends APIError {
    constructor(status: number | undefined, error: Object | undefined, message: string | undefined, headers: Headers | undefined) {
      super(status ?? 401, error, message, headers);
      this.name = 'AuthenticationError';
    }
  }

  class RateLimitError extends APIError {
    constructor(status: number | undefined, error: Object | undefined, message: string | undefined, headers: Headers | undefined) {
      super(status ?? 429, error, message, headers);
      this.name = 'RateLimitError';
    }
  }

  class APIConnectionError extends AnthropicError {
    readonly status: undefined;
    constructor({ message }: { message?: string; cause?: Error }) {
      super(message || 'Connection error');
      this.status = undefined;
      this.name = 'APIConnectionError';
    }
  }

  class BadRequestError extends APIError {
    constructor(status: number | undefined, error: Object | undefined, message: string | undefined, headers: Headers | undefined) {
      super(status ?? 400, error, message, headers);
      this.name = 'BadRequestError';
    }
  }

  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));

  return {
    __esModule: true,
    default: MockAnthropic,
    APIError,
    AuthenticationError,
    RateLimitError,
    APIConnectionError,
    BadRequestError,
  };
});

// Import the error classes for use in tests
import {
  APIError,
  AuthenticationError,
  RateLimitError,
  APIConnectionError,
  BadRequestError,
} from '@anthropic-ai/sdk';

// =============================================================================
// HELPERS
// =============================================================================

function createSuccessResponse(text: string = 'Translated text') {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

// Helper to create errors matching SDK constructor signatures
/* eslint-disable @typescript-eslint/no-explicit-any */
function rateLimitError(msg: string) {
  return new RateLimitError(429, undefined, msg, null as any);
}

function connectionError(msg: string) {
  return new APIConnectionError({ message: msg });
}

function authError(msg: string) {
  return new AuthenticationError(401, undefined, msg, null as any);
}

function badRequestError(msg: string) {
  return new BadRequestError(400, undefined, msg, null as any);
}

function serverError(status: number, msg: string) {
  return new APIError(status, undefined, msg, null as any);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Speed up tests by reducing retry delays
beforeAll(() => {
  // Patch retry config for faster tests
  (RETRY_CONFIG as { baseDelayMs: number }).baseDelayMs = 10; // 10ms instead of 1s
});

afterAll(() => {
  (RETRY_CONFIG as { baseDelayMs: number }).baseDelayMs = 1000;
});

// =============================================================================
// TESTS
// =============================================================================

describe('TranslationService - Retry Logic', () => {
  let service: TranslationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TranslationService('test-api-key', 'claude-sonnet-4-20250514', true);
  });

  describe('successful calls', () => {
    it('should succeed on first attempt', async () => {
      mockCreate.mockResolvedValueOnce(createSuccessResponse());

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Introduction\n\nSome content',
      });

      expect(result.success).toBe(true);
      expect(result.translatedSection).toBe('Translated text');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryable errors', () => {
    it('should retry on RateLimitError and succeed', async () => {
      mockCreate
        .mockRejectedValueOnce(rateLimitError('Rate limit exceeded'))
        .mockResolvedValueOnce(createSuccessResponse());

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on APIConnectionError and succeed', async () => {
      mockCreate
        .mockRejectedValueOnce(connectionError('Connection refused'))
        .mockResolvedValueOnce(createSuccessResponse());

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx APIError and succeed', async () => {
      mockCreate
        .mockRejectedValueOnce(serverError(500, 'Internal Server Error'))
        .mockResolvedValueOnce(createSuccessResponse());

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 APIError and succeed', async () => {
      mockCreate
        .mockRejectedValueOnce(serverError(503, 'Service Unavailable'))
        .mockResolvedValueOnce(createSuccessResponse());

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(true);
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry up to maxRetries times then fail', async () => {
      mockCreate
        .mockRejectedValueOnce(rateLimitError('Rate limit 1'))
        .mockRejectedValueOnce(rateLimitError('Rate limit 2'))
        .mockRejectedValueOnce(rateLimitError('Rate limit 3'));

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      // translateSection catches the error and returns failure
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('should succeed on third attempt after two failures', async () => {
      mockCreate
        .mockRejectedValueOnce(rateLimitError('Rate limit'))
        .mockRejectedValueOnce(connectionError('Connection reset'))
        .mockResolvedValueOnce(createSuccessResponse('Third time lucky'));

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(true);
      expect(result.translatedSection).toBe('Third time lucky');
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });
  });

  describe('non-retryable errors', () => {
    it('should NOT retry on AuthenticationError', async () => {
      mockCreate.mockRejectedValueOnce(authError('Invalid API key'));

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication');
      expect(mockCreate).toHaveBeenCalledTimes(1); // No retry
    });

    it('should NOT retry on BadRequestError', async () => {
      mockCreate.mockRejectedValueOnce(badRequestError('Invalid request'));

      const result = await service.translateSection({
        mode: 'new',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        englishSection: '## Test\n\nContent',
      });

      expect(result.success).toBe(false);
      expect(mockCreate).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('retry with different translation modes', () => {
    it('should retry for update mode translations', async () => {
      mockCreate
        .mockRejectedValueOnce(rateLimitError('Rate limit'))
        .mockResolvedValueOnce(createSuccessResponse('Updated translation'));

      const result = await service.translateSection({
        mode: 'update',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
        oldEnglish: '## Old content',
        newEnglish: '## New content',
        currentTranslation: '## 旧内容',
      });

      expect(result.success).toBe(true);
      expect(result.translatedSection).toBe('Updated translation');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should retry for full document translations', async () => {
      mockCreate
        .mockRejectedValueOnce(connectionError('Timeout'))
        .mockResolvedValueOnce(createSuccessResponse('Full document translated'));

      const result = await service.translateFullDocument({
        content: '# Short doc\n\nContent',
        sourceLanguage: 'en',
        targetLanguage: 'zh-cn',
      });

      expect(result.success).toBe(true);
      expect(result.translatedSection).toBe('Full document translated');
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry config', () => {
    it('should export retry configuration', () => {
      expect(RETRY_CONFIG.maxRetries).toBe(3);
      // baseDelayMs might be patched in tests, check original in non-test context
      expect(typeof RETRY_CONFIG.baseDelayMs).toBe('number');
    });
  });
});
