/** Content-type classification from API paths for response augmentation. */

import { CONTENT_TYPE_PREFIXES } from '@oaknational/sdk-codegen/api-schema';
import type { ContentType } from './types/response-augmentation.js';

const subjectCollectionPattern = new RegExp(
  `/${CONTENT_TYPE_PREFIXES.subject.pathSegment}(/[^/]+)?$`,
);

function includesEntityCollection(path: string, contentType: ContentType): boolean {
  return path.includes(`/${CONTENT_TYPE_PREFIXES[contentType].pathSegment}/`);
}

/**
 * Checks whether `path` ends with the entity-collection segment for
 * `contentType` (e.g. `/key-stages/{ks}/subjects/{s}/lessons` ends with
 * the `lesson` collection segment).
 */
export function endsWithEntityCollection(path: string, contentType: ContentType): boolean {
  return path.endsWith(`/${CONTENT_TYPE_PREFIXES[contentType].pathSegment}`);
}

/**
 * Checks if path is a search endpoint
 */
export function isSearchEndpoint(path: string): ContentType | undefined {
  if (path === '/search/lessons' || path === '/search/transcripts') {
    return 'lesson';
  }
  return undefined;
}

/**
 * Checks if path is a key-stage scoped endpoint
 */
export function isKeyStageScopedEndpoint(path: string): ContentType | undefined {
  if (!path.includes('/key-stages/') || !path.includes('/subjects/')) {
    return undefined;
  }
  if (endsWithEntityCollection(path, 'lesson')) {
    return 'lesson';
  }
  if (endsWithEntityCollection(path, 'unit')) {
    return 'unit';
  }
  return undefined;
}

/**
 * Checks if path is a single entity endpoint.
 *
 * Subject paths use positive exact-depth matching to prevent sub-resource
 * paths like `/subjects/maths/key-stages` or `/subjects/maths/years` from
 * being misclassified as subject entities. Lesson and unit paths retain
 * `includes()` matching because they have valid deeper paths (e.g.,
 * `/lessons/\{l\}/summary`, `/units/\{u\}/summary`). Sequence paths
 * (`/sequences/\{slug\}`, `/sequences/\{sequence\}/units`) match via
 * `includes()` on the `/sequences/` segment.
 */
export function isSingleEntityEndpoint(path: string): ContentType | undefined {
  if (includesEntityCollection(path, 'lesson')) {
    return 'lesson';
  }
  if (includesEntityCollection(path, 'unit')) {
    return 'unit';
  }
  if (includesEntityCollection(path, 'sequence')) {
    return 'sequence';
  }
  if (subjectCollectionPattern.test(path)) {
    return 'subject';
  }
  if (includesEntityCollection(path, 'thread')) {
    return 'thread';
  }
  return undefined;
}

/**
 * Determines content type from API path
 *
 * Recognises paths for:
 * - Single entity endpoints (e.g., /lessons/\{lesson\}/summary)
 * - Search endpoints (e.g., /search/lessons, /search/transcripts)
 * - Key-stage scoped endpoints (e.g., /key-stages/\{ks\}/subjects/\{subj\}/lessons)
 */
export function getContentTypeFromPath(path: string): ContentType | undefined {
  return isSearchEndpoint(path) ?? isKeyStageScopedEndpoint(path) ?? isSingleEntityEndpoint(path);
}

function isPathTemplateSegment(segment: string): boolean {
  return segment.startsWith('{') && segment.endsWith('}');
}

/**
 * Extracts the entity identifier that immediately follows the entity collection
 * segment in a concrete API path.
 *
 * For example, `/lessons/add-fractions/summary` resolves to `add-fractions`.
 * OpenAPI template placeholders such as `\{lesson\}` are intentionally ignored
 * because they are not usable website slugs.
 */
export function extractEntityIdFromPath(
  path: string,
  contentType: ContentType | undefined,
): string | undefined {
  if (contentType === undefined) {
    return undefined;
  }

  const entityPathSegment = CONTENT_TYPE_PREFIXES[contentType].pathSegment;
  const pathSegments = path.split('/');
  const entityPathIndex = pathSegments.indexOf(entityPathSegment);
  const candidateId = pathSegments[entityPathIndex + 1];

  if (candidateId === undefined || candidateId.length === 0 || isPathTemplateSegment(candidateId)) {
    return undefined;
  }

  return candidateId;
}
