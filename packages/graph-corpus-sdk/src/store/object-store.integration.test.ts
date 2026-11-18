import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalFileObjectStore } from './object-store.js';

const failingWrite = vi.hoisted(() => ({ armed: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (!failingWrite.armed) {
        return actual.writeFile(...args);
      }
      const [file] = args;
      await actual.writeFile(file, '{"ver', 'utf8');
      throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    },
  };
});

const tempDirs: string[] = [];
afterEach(async () => {
  failingWrite.armed = false;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('local-file object store', () => {
  it('keeps the previous object intact when a write fails part way', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
    tempDirs.push(dir);
    const objects = createLocalFileObjectStore(dir);
    await objects.put('graph-corpus/v1/latest.json', '{"version":"previous"}');

    failingWrite.armed = true;
    await expect(objects.put('graph-corpus/v1/latest.json', '{"version":"next"}')).rejects.toThrow(
      'no space left on device',
    );
    failingWrite.armed = false;

    expect(await objects.get('graph-corpus/v1/latest.json')).toBe('{"version":"previous"}');
    expect(await objects.list('graph-corpus/v1/')).toEqual(['graph-corpus/v1/latest.json']);
  });

  it('lets one of two concurrent conditional writes from the same version win', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
    tempDirs.push(dir);
    const objects = createLocalFileObjectStore(dir);
    const key = 'graph-corpus/v1/latest.json';
    await objects.put(key, '{"version":"previous"}');
    const read = await objects.getVersioned(key);

    const won = await Promise.all([
      objects.putIfVersion(key, '{"version":"a"}', read?.version ?? null),
      objects.putIfVersion(key, '{"version":"b"}', read?.version ?? null),
    ]);

    expect(won.filter(Boolean)).toHaveLength(1);
    expect(await objects.get(key)).toBe(won[0] ? '{"version":"a"}' : '{"version":"b"}');
    expect(await objects.list('graph-corpus/v1/')).toEqual([key]);
  });
});
