import { describe, it, expect } from 'vitest';
import { isAllowedHostname, isValidHostHeader } from './host-header-validation.js';

describe('host-header-validation', () => {
  describe('isValidHostHeader', () => {
    it('accepts canonical host formats', () => {
      expect(isValidHostHeader('example.com')).toBe(true);
      expect(isValidHostHeader('example.com:443')).toBe(true);
      expect(isValidHostHeader('localhost:3333')).toBe(true);
      expect(isValidHostHeader('[::1]:3333')).toBe(true);
    });

    it('rejects malformed or dangerous host formats', () => {
      expect(isValidHostHeader('example.com:443@203.0.113.9')).toBe(false);
      expect(isValidHostHeader('[::1]evil')).toBe(false);
      expect(isValidHostHeader('.example.com')).toBe(false);
      expect(isValidHostHeader('example..com')).toBe(false);
      expect(isValidHostHeader('example.com/path')).toBe(false);
    });
  });

  describe('isAllowedHostname', () => {
    it('matches exact hostnames case-insensitively', () => {
      expect(isAllowedHostname('example.com', ['EXAMPLE.COM'])).toBe(true);
    });

    it('matches wildcard hostnames', () => {
      expect(isAllowedHostname('api.example.com', ['*.example.com'])).toBe(true);
      expect(isAllowedHostname('deep.api.example.com', ['*.example.com'])).toBe(true);
      expect(isAllowedHostname('example.com', ['*.example.com'])).toBe(false);
    });

    it('rejects hostnames whose wildcard span carries characters outside [a-z0-9.-]', () => {
      // All three hostnames are unreachable through the app's own callers —
      // isValidHostHeader rejects the underscore form, and both call sites
      // lowercase before matching — pinned as exported-predicate contract.
      expect(isAllowedHostname('evil_x.example.com', ['*.example.com'])).toBe(false);
      expect(isAllowedHostname('API.example.com', ['*.example.com'])).toBe(false);
      expect(isAllowedHostname('ev_il.api.y.com', ['*.api.*.com'])).toBe(false);
    });

    it("rejects a hostname too short for the pattern's literal segments", () => {
      expect(isAllowedHostname('api.com', ['api.*.com'])).toBe(false);
      expect(isAllowedHostname('api.example.com', ['api.*.example.com'])).toBe(false);
    });

    it('matches an interior wildcard and two wildcards in one pattern', () => {
      expect(isAllowedHostname('api.x.com', ['api.*.com'])).toBe(true);
      expect(isAllowedHostname('x.api.y.com', ['*.api.*.com'])).toBe(true);
      expect(isAllowedHostname('x.api.com', ['*.api.*.com'])).toBe(false);
    });

    it('lets a wildcard span zero characters (pinned contract for the exported predicate)', () => {
      // Unreachable through the app's own callers — isValidHostHeader rejects
      // a leading dot before any allow-list check — pinned deliberately, so
      // the exported predicate's contract survives implementation changes.
      expect(isAllowedHostname('.example.com', ['*.example.com'])).toBe(true);
    });

    it('skips empty and whitespace-only allow-list entries', () => {
      // Unreachable through the app's own callers — parseCsv trims and
      // drops empty entries before they reach this predicate — pinned so
      // a blank entry can never become match-all if a caller changes.
      expect(isAllowedHostname('example.com', ['', '   ', 'example.com'])).toBe(true);
      expect(isAllowedHostname('example.com', ['', '   '])).toBe(false);
    });
  });
});
