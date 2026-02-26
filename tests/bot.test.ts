import { describe, it, expect } from 'vitest';
import { formatForTelegram, splitMessage } from '../src/bot.js';

describe('bot.ts — formatForTelegram', () => {
  it('converts bold markdown to HTML', () => {
    expect(formatForTelegram('**bold text**')).toContain('<b>bold text</b>');
  });

  it('converts italic markdown to HTML', () => {
    expect(formatForTelegram('*italic text*')).toContain('<i>italic text</i>');
  });

  it('converts inline code to HTML', () => {
    expect(formatForTelegram('use `npm install`')).toContain(
      '<code>npm install</code>',
    );
  });

  it('converts code blocks to HTML', () => {
    const input = '```js\nconsole.log("hello");\n```';
    const result = formatForTelegram(input);
    expect(result).toContain('<pre>');
    expect(result).toContain('console.log');
  });

  it('protects code block contents from other conversions', () => {
    const input = '```\n**not bold** and *not italic*\n```';
    const result = formatForTelegram(input);
    // Inside code blocks, markdown should NOT be converted
    expect(result).not.toContain('<b>not bold</b>');
    expect(result).toContain('**not bold**');
  });

  it('converts strikethrough to HTML', () => {
    expect(formatForTelegram('~~deleted~~')).toContain('<s>deleted</s>');
  });

  it('converts links to HTML', () => {
    const result = formatForTelegram('[Google](https://google.com)');
    expect(result).toContain('<a href="https://google.com">Google</a>');
  });

  it('converts headings to bold', () => {
    expect(formatForTelegram('# Title')).toContain('<b>Title</b>');
    expect(formatForTelegram('## Subtitle')).toContain('<b>Subtitle</b>');
  });

  it('converts checkboxes', () => {
    expect(formatForTelegram('- [ ] Todo')).toContain('\u2610');
    expect(formatForTelegram('- [x] Done')).toContain('\u2611');
  });

  it('strips horizontal rules', () => {
    expect(formatForTelegram('---')).toBe('');
    expect(formatForTelegram('***')).toBe('');
  });

  it('escapes HTML entities in text', () => {
    const result = formatForTelegram('5 < 10 & 10 > 5');
    expect(result).toContain('&lt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&gt;');
  });

  it('handles empty input', () => {
    expect(formatForTelegram('')).toBe('');
  });

  it('handles plain text without markdown', () => {
    const text = 'Just a normal message with no formatting.';
    const result = formatForTelegram(text);
    expect(result).toContain('Just a normal message');
  });
});

describe('bot.ts — splitMessage', () => {
  it('returns single-element array for short messages', () => {
    const result = splitMessage('Hello world');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello world');
  });

  it('returns empty array for empty input', () => {
    expect(splitMessage('')).toHaveLength(0);
  });

  it('splits on newline boundaries', () => {
    const longText = Array(100)
      .fill('This is a line of text that takes up space.')
      .join('\n');
    const result = splitMessage(longText, 200);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(200);
    }
  });

  it('handles text with no newlines', () => {
    const longText = 'a'.repeat(5000);
    const result = splitMessage(longText, 4096);
    expect(result.length).toBeGreaterThan(1);
  });

  it('respects custom limit', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const result = splitMessage(text, 20);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });
});
