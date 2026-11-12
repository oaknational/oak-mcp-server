/** Slug and generic ID extraction from response bodies for response augmentation. */

import type { ContentType } from './types/response-augmentation.js';
import { isNonNullObject } from './response-augmentation-helpers.js';

/**
 * Extracts lesson slug from response
 */
export function extractLessonSlug(response: unknown): string | undefined {
  if (!isNonNullObject(response)) {
    return undefined;
  }
  if ('lessonSlug' in response) {
    return typeof response.lessonSlug === 'string' ? response.lessonSlug : undefined;
  }
  return undefined;
}

/**
 * Extracts the top-level `unitSlug` from a unit-resource response.
 *
 * For unit resources, `unitSlug` is a top-level scalar. For lesson
 * resources, use `extractLessonUnits` / `formatPrimaryUnit` from
 * `lesson-resource-helpers.ts` — lessons expose units structurally via
 * `units` (lesson↔unit many-to-many per ADR-080 §"Context").
 */
export function extractUnitSlug(response: unknown): string | undefined {
  if (!isNonNullObject(response)) {
    return undefined;
  }
  if ('unitSlug' in response) {
    return typeof response.unitSlug === 'string' ? response.unitSlug : undefined;
  }
  return undefined;
}

/**
 * Extracts subject slug from response
 */
export function extractSubjectSlug(response: unknown): string | undefined {
  if (!isNonNullObject(response)) {
    return undefined;
  }
  if ('subjectSlug' in response) {
    return typeof response.subjectSlug === 'string' ? response.subjectSlug : undefined;
  }
  return undefined;
}

/**
 * Extracts sequence slug from response
 */
export function extractSequenceSlug(response: unknown): string | undefined {
  if (!isNonNullObject(response)) {
    return undefined;
  }
  if ('sequenceSlug' in response) {
    return typeof response.sequenceSlug === 'string' ? response.sequenceSlug : undefined;
  }
  return undefined;
}

/**
 * Extracts thread slug from response
 */
export function extractThreadSlug(response: unknown): string | undefined {
  if (!isNonNullObject(response)) {
    return undefined;
  }
  if ('threadSlug' in response) {
    return typeof response.threadSlug === 'string' ? response.threadSlug : undefined;
  }
  return undefined;
}

/**
 * Extracts content-type-specific ID from response
 */
export function extractContentTypeSpecificId(
  response: unknown,
  contentType: ContentType | undefined,
): string | undefined {
  if (contentType === 'lesson') {
    return extractLessonSlug(response);
  }
  if (contentType === 'unit') {
    return extractUnitSlug(response);
  }
  if (contentType === 'subject') {
    return extractSubjectSlug(response);
  }
  if (contentType === 'sequence') {
    return extractSequenceSlug(response);
  }
  if (contentType === 'thread') {
    return extractThreadSlug(response);
  }
  return undefined;
}

/**
 * Extracts generic ID fields (slug or id) from response
 */
export function extractGenericId(response: unknown): string | undefined {
  if (!isNonNullObject(response)) {
    return undefined;
  }
  if ('slug' in response && typeof response.slug === 'string') {
    return response.slug;
  }
  if ('id' in response && typeof response.id === 'string') {
    return response.id;
  }
  return undefined;
}
