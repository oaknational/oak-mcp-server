import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseOtelLogRecord } from './test-helpers/parse-otel-log-record';
import { createFileSink, type FileSinkInterface } from './file-sink';
import { createNodeStdoutSink } from './node';
import type { LogEvent, LogSink } from './types';
import type { ResourceAttributes } from './resource-attributes';
import { UnifiedLogger } from './unified-logger';
import type { ActiveSpanContextSnapshot } from '@oaknational/observability';

function createLineSink(): {
  readonly events: LogEvent[];
  readonly sink: LogSink;
} {
  const events: LogEvent[] = [];

  return {
    events,
    sink: {
      write(event): void {
        events.push(event);
      },
    },
  };
}

function createFileSinkMock(): {
  readonly events: LogEvent[];
  readonly sink: FileSinkInterface;
} {
  const events: LogEvent[] = [];

  return {
    events,
    sink: {
      write(event): void {
        events.push(event);
      },
      end: vi.fn(),
    },
  };
}

const httpResourceAttributes: ResourceAttributes = {
  'service.name': 'http-test',
  'service.version': '1.0.0',
  'deployment.environment': 'test',
};

const NO_ACTIVE_SPAN_CONTEXT = (): ActiveSpanContextSnapshot | undefined => undefined;

describe('Logger DI Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-09T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('supports stdout-style DI with a single sink', () => {
    const stdout = createLineSink();
    const logger = new UnifiedLogger({
      minSeverity: 9,
      resourceAttributes: httpResourceAttributes,
      context: {},
      sinks: [stdout.sink],
      getActiveSpanContext: NO_ACTIVE_SPAN_CONTEXT,
    });

    logger.info('test message');

    expect(stdout.events).toHaveLength(1);

    const record = parseOtelLogRecord(stdout.events[0]?.line ?? '');
    expect(record.Body).toBe('test message');
    expect(record.Resource['service.name']).toBe('http-test');
  });

  it('supports file-style DI with a file sink implementation', () => {
    const file = createFileSinkMock();
    const logger = new UnifiedLogger({
      minSeverity: 9,
      resourceAttributes: httpResourceAttributes,
      context: {},
      sinks: [file.sink],
      getActiveSpanContext: NO_ACTIVE_SPAN_CONTEXT,
    });

    logger.warn('file message');

    expect(file.events).toHaveLength(1);

    const record = parseOtelLogRecord(file.events[0]?.line ?? '');
    expect(record.SeverityText).toBe('WARN');
    expect(record.Body).toBe('file message');
  });

  it('writes the same event object to multiple injected sinks', () => {
    const stdout = createLineSink();
    const file = createFileSinkMock();
    const logger = new UnifiedLogger({
      minSeverity: 1,
      resourceAttributes: httpResourceAttributes,
      context: {},
      sinks: [stdout.sink, file.sink],
      getActiveSpanContext: NO_ACTIVE_SPAN_CONTEXT,
    });

    logger.trace('dual sink');

    expect(stdout.events).toHaveLength(1);
    expect(file.events).toHaveLength(1);
    expect(stdout.events[0]).toBe(file.events[0]);
  });

  it('lets child loggers inherit DI wiring and merged context', () => {
    const stdout = createLineSink();
    const file = createFileSinkMock();
    const parent = new UnifiedLogger({
      minSeverity: 9,
      resourceAttributes: httpResourceAttributes,
      context: {
        parentKey: 'parentValue',
      },
      sinks: [stdout.sink, file.sink],
      getActiveSpanContext: NO_ACTIVE_SPAN_CONTEXT,
    });

    const child = parent.child({
      childKey: 'childValue',
    });

    child.info('child message');

    expect(stdout.events).toHaveLength(1);
    expect(file.events).toHaveLength(1);

    const record = parseOtelLogRecord(stdout.events[0]?.line ?? '');
    expect(record.Attributes).toMatchObject({
      parentKey: 'parentValue',
      childKey: 'childValue',
    });
  });

  it.each([
    ['a key=value credential', 'login failed password=canary-pw-7f3a'],
    ['a bearer token', 'upstream said Authorization: Bearer canary-pw-7f3a'],
  ])('keeps %s in the message out of the stdout and file lines', (_label, message) => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const fileChunks: string[] = [];
    const fileSink = createFileSink(
      { path: '/virtual/app.log' },
      {
        mkdirSync: vi.fn(),
        createWriteStream: () => ({
          write: (chunk: string) => fileChunks.push(chunk) > 0,
          end: vi.fn(),
          on: vi.fn(),
        }),
      },
    );
    expect(fileSink).not.toBeNull();
    const logger = new UnifiedLogger({
      minSeverity: 1,
      resourceAttributes: httpResourceAttributes,
      context: {},
      sinks: [createNodeStdoutSink(), ...(fileSink ? [fileSink] : [])],
      getActiveSpanContext: NO_ACTIVE_SPAN_CONTEXT,
    });

    let stdoutLines: string[];
    try {
      logger.warn(message);
      stdoutLines = stdoutWrite.mock.calls.map(([chunk]) => String(chunk));
    } finally {
      stdoutWrite.mockRestore();
    }

    expect(stdoutLines).toHaveLength(1);
    expect(fileChunks).toHaveLength(1);
    for (const line of [...stdoutLines, ...fileChunks]) {
      expect(line).not.toContain('canary-pw-7f3a');
      expect(parseOtelLogRecord(line).Body).toContain('[REDACTED]');
    }
  });
});
