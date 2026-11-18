import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalFileObjectStore } from './object-store.js';

const failingWrite = vi.hoisted(() => ({
  armed: false,
  onWrite: undefined as ((file: unknown) => Promise<void>) | undefined,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      await failingWrite.onWrite?.(args[0]);
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
  failingWrite.onWrite = undefined;
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

  describe('a lock file left on latest.json', () => {
    const key = 'graph-corpus/v1/latest.json';

    async function storeWithLock(lockBody: string) {
      const dir = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
      tempDirs.push(dir);
      const file = path.join(dir, ...key.split('/'));
      await mkdir(path.dirname(file), { recursive: true });
      const objects = createLocalFileObjectStore(dir);
      await objects.put(key, '{"version":"previous"}');
      await writeFile(`${file}.lock`, lockBody, 'utf8');
      const read = await objects.getVersioned(key);
      return { objects, lock: `${file}.lock`, version: read?.version ?? null };
    }

    const exitedPid = (): number => {
      const { pid } = spawnSync(process.execPath, ['-e', '']);
      if (pid === undefined) {
        throw new Error('could not start a process to take a pid from');
      }
      return pid;
    };

    const holder = (pid: number, host = hostname()): string =>
      JSON.stringify({ pid, host, startedAt: '2026-11-18T00:00:00.000Z', id: 'planted' });

    it('is broken and the write goes ahead when its holder process has exited', async () => {
      const { objects, lock, version } = await storeWithLock(holder(exitedPid()));

      expect(await objects.putIfVersion(key, '{"version":"next"}', version)).toBe(true);

      expect(await objects.get(key)).toBe('{"version":"next"}');
      await expect(readFile(lock, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it.each([
      ['a holder process that is still running', holder(process.pid)],
      ['a holder on another host', holder(exitedPid(), 'another-host.invalid')],
      ['no holder recorded', ''],
      ['a holder that is not a pid', JSON.stringify({ pid: 'one', host: hostname() })],
    ])('is waited on, never broken, with %s', async (_name, body) => {
      const { objects, lock, version } = await storeWithLock(body);

      const write = objects.putIfVersion(key, '{"version":"next"}', version);
      await sleep(200);

      expect(await readFile(lock, 'utf8')).toBe(body);
      expect(await objects.get(key)).toBe('{"version":"previous"}');
      await rm(lock);
      expect(await write).toBe(true);
    });

    it('records its holder while held, and is gone after the write', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
      tempDirs.push(dir);
      const objects = createLocalFileObjectStore(dir);
      const lock = path.join(dir, ...key.split('/')) + '.lock';
      let seen: unknown;
      failingWrite.onWrite = async (file) => {
        if (!String(file).includes('.lock.')) {
          seen = JSON.parse(await readFile(lock, 'utf8'));
        }
      };

      expect(await objects.putIfVersion(key, '{}', null)).toBe(true);

      expect(seen).toMatchObject({ pid: process.pid, host: hostname() });
      await expect(readFile(lock, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });
});
