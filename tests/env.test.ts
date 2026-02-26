import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const ENV_PATH = join(PROJECT_ROOT, '.env');

// We need to dynamically import so each test gets fresh state
async function getReadEnvFile() {
  // Clear module cache by using dynamic import with cache busting
  const mod = await import('../src/env.js');
  return mod.readEnvFile;
}

describe('env.ts — readEnvFile', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    if (existsSync(ENV_PATH)) {
      originalEnv = undefined; // Will handle in afterEach
    }
  });

  afterEach(() => {
    // Clean up test .env files
    try {
      if (existsSync(ENV_PATH)) {
        unlinkSync(ENV_PATH);
      }
    } catch {
      // ignore
    }
  });

  it('returns empty object when .env does not exist', async () => {
    // Ensure no .env exists
    try { unlinkSync(ENV_PATH); } catch { /* ignore */ }
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile();
    expect(result).toEqual({});
  });

  it('parses simple KEY=VALUE pairs', async () => {
    writeFileSync(ENV_PATH, 'FOO=bar\nBAZ=qux\n', 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile();
    expect(result['FOO']).toBe('bar');
    expect(result['BAZ']).toBe('qux');
  });

  it('skips comment lines and blank lines', async () => {
    writeFileSync(ENV_PATH, '# comment\n\nFOO=bar\n# another comment\n', 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile();
    expect(result['FOO']).toBe('bar');
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('handles double-quoted values', async () => {
    writeFileSync(ENV_PATH, 'FOO="hello world"\n', 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile();
    expect(result['FOO']).toBe('hello world');
  });

  it('handles single-quoted values', async () => {
    writeFileSync(ENV_PATH, "FOO='hello world'\n", 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile();
    expect(result['FOO']).toBe('hello world');
  });

  it('filters by key when keys array provided', async () => {
    writeFileSync(ENV_PATH, 'FOO=bar\nBAZ=qux\nHELLO=world\n', 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile(['FOO', 'HELLO']);
    expect(result['FOO']).toBe('bar');
    expect(result['HELLO']).toBe('world');
    expect(result['BAZ']).toBeUndefined();
  });

  it('handles empty values', async () => {
    writeFileSync(ENV_PATH, 'FOO=\n', 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    const result = readEnvFile();
    expect(result['FOO']).toBe('');
  });

  it('does NOT pollute process.env', async () => {
    writeFileSync(ENV_PATH, 'AOS_TEST_SECRET=supersecret\n', 'utf-8');
    const readEnvFile = (await import('../src/env.js')).readEnvFile;
    readEnvFile();
    expect(process.env['AOS_TEST_SECRET']).toBeUndefined();
  });
});
