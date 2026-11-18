import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { breakStaleLocalLock, createLocalFileObjectStore } from './object-store.js';

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

    it.each([
      ['a holder process that is still running', holder(process.pid)],
      ['a holder process that has exited', holder(exitedPid())],
      ['a holder on another host', holder(exitedPid(), 'another-host.invalid')],
      ['no holder recorded', ''],
      ['a holder that is not a pid', JSON.stringify({ pid: 'one', host: hostname() })],
    ])('is waited on, never broken by a writer, with %s', async (_name, body) => {
      const { objects, lock, version } = await storeWithLock(body);

      const write = objects.putIfVersion(key, '{"version":"next"}', version);
      await sleep(200);

      expect(await readFile(lock, 'utf8')).toBe(body);
      expect(await objects.get(key)).toBe('{"version":"previous"}');
      await rm(lock);
      expect(await write).toBe(true);
    });

    it('fails as lock-held after the wait, naming an exited holder and how to break it', async () => {
      const pid = exitedPid();
      const { objects, lock } = await storeWithLock(holder(pid));

      await expect(objects.putIfVersion(key, '{}', null)).rejects.toMatchObject({
        name: 'GraphRefreshError',
        failure: 'lock-held',
        message: expect.stringMatching(
          new RegExp(`pid ${String(pid)} on ${hostname()}, which has exited.*--break-stale-lock`),
        ) as unknown,
      });
      expect(await readFile(lock, 'utf8')).toBe(holder(pid));
    }, 10_000);

    it('releases only its own lock, leaving one that replaced it during the write', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
      tempDirs.push(dir);
      const objects = createLocalFileObjectStore(dir);
      const lock = path.join(dir, ...key.split('/')) + '.lock';
      failingWrite.onWrite = async (file) => {
        if (!String(file).includes('.lock.')) {
          failingWrite.onWrite = undefined;
          await writeFile(lock, holder(process.pid), 'utf8');
        }
      };

      expect(await objects.putIfVersion(key, '{}', null)).toBe(true);

      expect(await readFile(lock, 'utf8')).toBe(holder(process.pid));
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

  describe('breakStaleLocalLock', () => {
    const key = 'graph-corpus/v1/latest.json';
    const exitedPid = (): number => {
      const { pid } = spawnSync(process.execPath, ['-e', '']);
      if (pid === undefined) {
        throw new Error('could not start a process to take a pid from');
      }
      return pid;
    };
    const holder = (pid: number, host = hostname()): string =>
      JSON.stringify({ pid, host, startedAt: '2026-11-18T00:00:00.000Z', id: randomUUID() });

    async function rootWithLock(lockBody: string | null) {
      const root = await mkdtemp(path.join(tmpdir(), 'graph-store-'));
      tempDirs.push(root);
      const objects = createLocalFileObjectStore(root);
      await objects.put(key, 'v0');
      const lock = path.join(root, ...key.split('/')) + '.lock';
      if (lockBody !== null) {
        await writeFile(lock, lockBody, 'utf8');
      }
      return { root, objects, lock };
    }

    it('removes a lock whose holder on this host has exited', async () => {
      const { root, lock } = await rootWithLock(holder(exitedPid()));

      expect(await breakStaleLocalLock(root, key)).toMatchObject({ ok: true });
      await expect(readFile(lock, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it.each([
      ['a holder process that is still running', () => holder(process.pid), 'is running'],
      [
        'a holder on another host',
        () => holder(exitedPid(), 'another-host.invalid'),
        'another host',
      ],
      ['no holder record', () => '', 'no holder record'],
    ])('refuses, leaving the lock, with %s', async (_name, body, reason) => {
      const planted = body();
      const { root, lock } = await rootWithLock(planted);

      expect(await breakStaleLocalLock(root, key)).toMatchObject({
        ok: false,
        error: expect.stringContaining(reason) as unknown,
      });
      expect(await readFile(lock, 'utf8')).toBe(planted);
    });

    it('refuses when there is no lock', async () => {
      const { root } = await rootWithLock(null);
      expect(await breakStaleLocalLock(root, key)).toMatchObject({ ok: false });
    });

    it('lets at most one of twelve racing writers win, with breakers racing them, every round', async () => {
      for (let round = 0; round < 40; round += 1) {
        const { root, objects, lock } = await rootWithLock(holder(exitedPid()));
        const version = (await objects.getVersioned(key))?.version ?? null;

        const writes = Array.from({ length: 12 }, (_, writer) =>
          objects.putIfVersion(key, `w${String(writer)}`, version),
        );
        const breaks = Array.from({ length: 3 }, () => breakStaleLocalLock(root, key));
        const won = (await Promise.all(writes)).filter(Boolean);
        const broken = (await Promise.all(breaks)).filter((result) => result.ok);

        expect({ round, won: won.length, broken: broken.length }).toEqual({
          round,
          won: 1,
          broken: 1,
        });
        await expect(readFile(lock, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      }
    }, 60_000);
  });
});
