import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../src/security.js';

describe('security.ts', () => {
  describe('redactSecrets', () => {
    it('redacts sk- API keys', () => {
      const input = 'My key is sk-abcdefghijklmnopqrstuvwxyz';
      const result = redactSecrets(input);
      expect(result).not.toContain('sk-abcdef');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts GitHub personal access tokens', () => {
      const input = 'Token: ghp_abcdefghijklmnopqrstuvwxyz1234567890';
      const result = redactSecrets(input);
      expect(result).not.toContain('ghp_');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts Slack bot tokens', () => {
      const input = 'Slack token: xoxb-123-456-789';
      const result = redactSecrets(input);
      expect(result).not.toContain('xoxb-');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts Bearer tokens', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc';
      const result = redactSecrets(input);
      expect(result).not.toContain('eyJhbG');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts password= patterns', () => {
      const input = 'password=supersecret123';
      const result = redactSecrets(input);
      expect(result).not.toContain('supersecret');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts token= patterns', () => {
      const input = 'token: myverylongsecrettoken123';
      const result = redactSecrets(input);
      expect(result).not.toContain('myverylongsecrettoken');
      expect(result).toContain('[REDACTED]');
    });

    it('redacts ENV_VAR=value patterns', () => {
      const input = 'Look: API_SECRET_KEY=abcdefghijk123456';
      const result = redactSecrets(input);
      expect(result).toContain('[REDACTED]');
    });

    it('does not redact normal text', () => {
      const input = 'Hello! The weather is nice today. Here is some code.';
      const result = redactSecrets(input);
      expect(result).toBe(input);
    });

    it('handles mixed content with secrets', () => {
      const input =
        'The API key sk-test12345678901234567890 is used for auth. Also password=hunter2 is weak.';
      const result = redactSecrets(input);
      expect(result).not.toContain('sk-test');
      expect(result).not.toContain('hunter2');
      expect(result).toContain('The API key');
      expect(result).toContain('is used for auth');
    });

    it('handles empty string', () => {
      expect(redactSecrets('')).toBe('');
    });
  });
});
