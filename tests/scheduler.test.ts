import { describe, it, expect } from 'vitest';
import { isValidCron, computeNextRun } from '../src/scheduler.js';

describe('isValidCron', () => {
  it('accepts valid cron expressions', () => {
    expect(isValidCron('0 9 * * *')).toBe(true);
    expect(isValidCron('*/15 * * * *')).toBe(true);
    expect(isValidCron('0 0 1 * *')).toBe(true);
  });

  it('rejects invalid cron expressions', () => {
    expect(isValidCron('')).toBe(false);
    expect(isValidCron('not-a-cron')).toBe(false);
    expect(isValidCron('0 25 * * *')).toBe(false);
    expect(isValidCron('* * * *')).toBe(false);
  });
});

describe('computeNextRun', () => {
  it('returns epoch seconds in the future for valid cron', () => {
    const result = computeNextRun('0 9 * * *');
    expect(result).toBeTypeOf('number');
    expect(result!).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('returns null for invalid cron', () => {
    expect(computeNextRun('not-a-cron')).toBeNull();
  });
});
