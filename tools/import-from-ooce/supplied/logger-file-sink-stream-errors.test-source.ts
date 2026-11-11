import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFileSink, type FileSystem, type SimpleWriteStream } from './file-sink.js';
import type { LogEvent } from './types.js';

const event: LogEvent = {
  level: 'INFO',
  message: 'test',
  context: {},
  otelRecord: {
    Timestamp: '2025-11-08T12:00:00.000Z',
    ObservedTimestamp: '2025-11-08T12:00:00.000Z',
    SeverityNumber: 9,
    SeverityText: 'INFO',
    Body: 'test',
    Attributes: {},
    Resource: {
      'service.name': 'test-service',
      'service.version': '1.0.0',
      'deployment.environment': 'test',
    },
  },
  line: '{"Body":"test"}\n',
};

function fileSystemWithFailingStream(): { fs: FileSystem; fail: (error: Error) => void } {
  const events = new EventEmitter();
  const stream: SimpleWriteStream = {
    write: () => true,
    end: () => stream,
    on: (name, listener) => events.on(name, listener),
  };
  return {
    fs: { mkdirSync: () => undefined, createWriteStream: () => stream },
    fail: (error) => events.emit('error', error),
  };
}

describe('file sink stream errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'a directory',
      '/var/log/app',
      "EISDIR: illegal operation on a directory, open '/var/log/app'",
    ],
    [
      'an unwritable path',
      '/var/log/app.log',
      "EACCES: permission denied, open '/var/log/app.log'",
    ],
  ])('reports a stream error for %s and keeps accepting writes', (_case, path, message) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fs, fail } = fileSystemWithFailingStream();
    const sink = createFileSink({ path }, fs);

    expect(() => {
      fail(new Error(message));
    }).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith('Log file stream failed', { path, error: message });
    expect(() => sink?.write(event)).not.toThrow();
  });
});
