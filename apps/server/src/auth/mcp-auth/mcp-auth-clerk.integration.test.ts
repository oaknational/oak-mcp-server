/**
 * Integration tests for createMcpAuthClerk.
 *
 * Tests that the Clerk-specific middleware validates AuthInfo with Zod
 * `.strict()` before setting `req.auth`. Uses dependency injection
 * to avoid `vi.mock` on Clerk imports (ADR-078).
 *
 * Uses `node-mocks-http` for Express Request/Response objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthObject } from '@clerk/backend';
import { getAuthObjectForAcceptedToken, signedInAuthObject } from '@clerk/backend/internal';
import { verifyClerkToken } from '@clerk/mcp-tools/server';
import type { Logger } from '@oaknational/logger';
import { createMcpAuthClerk, type CreateMcpAuthClerkDeps } from './mcp-auth-clerk.js';
import { verifiedUserIdFrom } from './verified-user-id.js';
import {
  createFakeLogger,
  createFakeAuthInfo,
  createFakeMachineAuthObject,
  createMockExpressRequest,
  createMockExpressResponse,
  createRecordingLogger,
} from '../../test-helpers/fakes.js';

const ALLOWED_HOSTS = ['localhost'] as const;

describe('createMcpAuthClerk (Integration)', () => {
  const logger = createFakeLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod .strict() validation of verifyClerkToken result', () => {
    it('rejects authData with unknown fields (returns 401)', async () => {
      const authenticatedAuth = createFakeMachineAuthObject({ isAuthenticated: true });

      const malformedAuthData = {
        ...createFakeAuthInfo(),
        unexpectedField: 'should-be-rejected-by-strict',
      };

      const middleware = createMcpAuthClerk(logger, ALLOWED_HOSTS, {
        getAuth: vi.fn().mockReturnValue(authenticatedAuth),
        verifyClerkToken: vi.fn().mockReturnValue(malformedAuthData),
      });

      const req = createMockExpressRequest({ token: 'test-token', host: 'localhost' });
      const res = createMockExpressResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(logger.error).toHaveBeenCalled();
    });

    it('accepts valid authData and calls next()', async () => {
      const authenticatedAuth = createFakeMachineAuthObject({ isAuthenticated: true });
      const validAuthInfo = createFakeAuthInfo();

      const middleware = createMcpAuthClerk(logger, ALLOWED_HOSTS, {
        getAuth: vi.fn().mockReturnValue(authenticatedAuth),
        verifyClerkToken: vi.fn().mockReturnValue(validAuthInfo),
      });

      const req = createMockExpressRequest({ token: 'test-token', host: 'localhost' });
      const res = createMockExpressResponse();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req).toHaveProperty('auth', validAuthInfo);
    });
  });
});

const EVAL_MACHINE_ID = 'mch_evalrunner';
const CANARY_M2M_TOKEN = 'mt_canarycanarycanary';
const JWT_FORMAT_M2M_TOKEN = [{ alg: 'RS256' }, { sub: 'mch_evalrunner' }, 'sig']
  .map((part) => Buffer.from(JSON.stringify(part)).toString('base64url'))
  .join('.');

function m2mAuthObject(machineId: string): AuthObject {
  return {
    tokenType: 'm2m_token',
    id: 'mt_id_1',
    subject: machineId,
    machineId,
    scopes: ['mch_someothermachine'],
    claims: null,
    getToken: () => Promise.resolve('unused'),
    has: () => false,
    debug: () => ({}),
    isAuthenticated: true,
  };
}

function apiKeyAuthObject(): AuthObject {
  return {
    tokenType: 'api_key',
    id: 'ak_id_1',
    subject: 'user_apikeyowner',
    name: 'key',
    scopes: [],
    claims: null,
    userId: 'user_apikeyowner',
    orgId: null,
    getToken: () => Promise.resolve('unused'),
    has: () => false,
    debug: () => ({}),
    isAuthenticated: true,
  };
}

function sessionAuthObject(): AuthObject {
  return signedInAuthObject({}, 'h.p.s', {
    __raw: 'h.p.s',
    iss: 'https://clerk.example',
    sub: 'user_sessionholder',
    sid: 'sess_1',
    nbf: 0,
    exp: 0,
    iat: 0,
  });
}

/**
 * Mirrors `@clerk/express` `getAuth`: `clerkMiddleware` authenticates any
 * token type, then Clerk's own filter applies `acceptsToken`.
 */
function clerkGetAuthFor(authObject: AuthObject): CreateMcpAuthClerkDeps['getAuth'] {
  return (_req, options) =>
    getAuthObjectForAcceptedToken({ authObject, acceptsToken: options.acceptsToken });
}

async function runMiddleware(options: {
  readonly authObject: AuthObject;
  readonly token: string;
  readonly evalMachineIds: ReadonlySet<string>;
  readonly logger?: Logger;
}) {
  const middleware = createMcpAuthClerk(
    options.logger ?? createFakeLogger(),
    ALLOWED_HOSTS,
    { getAuth: clerkGetAuthFor(options.authObject), verifyClerkToken },
    undefined,
    options.evalMachineIds,
  );
  const req = createMockExpressRequest({ token: options.token, host: 'localhost' });
  const res = createMockExpressResponse();
  const next = vi.fn();
  await middleware(req, res, next);
  return { req, res, next };
}

describe('createMcpAuthClerk machine tokens (MCP-901)', () => {
  it('accepts an opaque M2M token from an allowlisted machine as a machine principal', async () => {
    const { req, next } = await runMiddleware({
      authObject: m2mAuthObject(EVAL_MACHINE_ID),
      token: CANARY_M2M_TOKEN,
      evalMachineIds: new Set([EVAL_MACHINE_ID]),
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.auth).toEqual({
      token: CANARY_M2M_TOKEN,
      clientId: EVAL_MACHINE_ID,
      scopes: [],
      extra: { principalType: 'machine', machineId: EVAL_MACHINE_ID },
    });
    expect(verifiedUserIdFrom(req.auth)).toBeUndefined();
  });

  it.each([
    {
      name: 'an M2M token from a machine that is not allowlisted',
      authObject: m2mAuthObject('mch_someothermachine'),
      token: CANARY_M2M_TOKEN,
      evalMachineIds: new Set([EVAL_MACHINE_ID]),
    },
    {
      name: 'an M2M token when the allowlist is empty',
      authObject: m2mAuthObject(EVAL_MACHINE_ID),
      token: CANARY_M2M_TOKEN,
      evalMachineIds: new Set<string>(),
    },
    {
      name: 'a JWT-format M2M token from an allowlisted machine',
      authObject: m2mAuthObject(EVAL_MACHINE_ID),
      token: JWT_FORMAT_M2M_TOKEN,
      evalMachineIds: new Set([EVAL_MACHINE_ID]),
    },
    {
      name: 'an API key',
      authObject: apiKeyAuthObject(),
      token: 'ak_canarycanarycanary',
      evalMachineIds: new Set([EVAL_MACHINE_ID, 'user_apikeyowner']),
    },
    {
      name: 'a session token',
      authObject: sessionAuthObject(),
      token: 'h.p.s',
      evalMachineIds: new Set([EVAL_MACHINE_ID, 'user_sessionholder']),
    },
  ])('refuses $name with the existing 401', async ({ authObject, token, evalMachineIds }) => {
    const { req, res, next } = await runMiddleware({ authObject, token, evalMachineIds });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.getHeader('WWW-Authenticate')).toContain('error="invalid_token"');
    expect(req.auth).toBeUndefined();
  });

  it('accepts a teacher OAuth token through the real verifyClerkToken exactly as before', async () => {
    const oauthAuthObject = createFakeMachineAuthObject({
      userId: 'user_teacher',
      clientId: 'client_teacher',
      scopes: ['openid', 'email'],
    });

    const { req, next } = await runMiddleware({
      authObject: oauthAuthObject,
      token: 'oat_teacher',
      evalMachineIds: new Set([EVAL_MACHINE_ID]),
    });

    expect(next).toHaveBeenCalledOnce();
    expect(req.auth).toEqual(verifyClerkToken(oauthAuthObject, 'oat_teacher'));
    expect(verifiedUserIdFrom(req.auth)).toBe('user_teacher');
  });

  it('logs the machine id and never any token characters', async () => {
    const { logger, entries } = createRecordingLogger();

    await runMiddleware({
      authObject: m2mAuthObject(EVAL_MACHINE_ID),
      token: CANARY_M2M_TOKEN,
      evalMachineIds: new Set([EVAL_MACHINE_ID]),
      logger,
    });

    const logged = JSON.stringify(entries);
    expect(logged).toContain(EVAL_MACHINE_ID);
    expect(logged).not.toContain('canary');
    expect(logged).not.toContain(CANARY_M2M_TOKEN.slice(0, 4));
  });
});
