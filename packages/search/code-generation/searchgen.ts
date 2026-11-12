import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { schemaBase } from '@oaknational/sdk-codegen/api-schema';
import type { OpenAPIObject } from 'openapi3-ts/oas31';

import { createCodegenLogger } from './create-codegen-logger.js';
import type { FileMap } from './typegen/extraction-types.js';
import { generateAdminStreamFixtureModules } from './typegen/admin/generate-admin-fixtures.js';
import { generateZeroHitFixtureModules } from './typegen/observability/generate-zero-hit-fixtures.js';
import { generateQueryParserModules } from './typegen/query-parser/generate-query-parser.js';
import { generateEsMappingModules } from './typegen/search/generate-es-mappings.js';
import { generateSearchFacetTypeModules } from './typegen/search/generate-search-facet-types.js';
import { generateSearchFacetZodModules } from './typegen/search/generate-search-facet-zod.js';
import { generateSearchFixtureModules } from './typegen/search/generate-search-fixtures.js';
import { generateSearchIndexDocumentModules } from './typegen/search/generate-search-index-docs.js';
import { generateSearchIndexModule } from './typegen/search/generate-search-index.js';
import { generateSearchRequestModules } from './typegen/search/generate-search-requests.js';
import { generateSearchResponseDocsModules } from './typegen/search/generate-search-response-docs.js';
import { generateSearchResponseModules } from './typegen/search/generate-search-responses.js';
import { generateSearchScopeModules } from './typegen/search/generate-search-scopes.js';
import { generateSearchSuggestionModules } from './typegen/search/generate-search-suggestions.js';
import { generateSubjectHierarchy } from './typegen/search/generate-subject-hierarchy.js';

export const SEARCH_OUTPUT_ANCHOR = 'src/types/generated/api-schema';

export function sdkSchemaFromCodegen(): OpenAPIObject {
  return JSON.parse(JSON.stringify(schemaBase)) as OpenAPIObject;
}

export function createSearchFileMap(sdkSchema: OpenAPIObject): FileMap {
  return {
    ...generateSearchFacetTypeModules(),
    ...generateSearchFacetZodModules(),
    ...generateSearchRequestModules(sdkSchema),
    ...generateSearchResponseModules(sdkSchema),
    ...generateSearchResponseDocsModules(sdkSchema),
    ...generateSearchSuggestionModules(sdkSchema),
    ...generateSearchScopeModules(sdkSchema),
    ...generateSearchFixtureModules(sdkSchema),
    ...generateSearchIndexModule(sdkSchema),
    ...generateSearchIndexDocumentModules(sdkSchema),
    ...generateEsMappingModules(sdkSchema),
    ...generateQueryParserModules(),
    ...generateZeroHitFixtureModules(sdkSchema),
    ...generateAdminStreamFixtureModules(sdkSchema),
  };
}

export function writeSearchFiles(packageRoot: string, fileMap: FileMap): void {
  const anchor = join(packageRoot, SEARCH_OUTPUT_ANCHOR);
  for (const [file, content] of Object.entries(fileMap)) {
    const target = resolve(anchor, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

if (import.meta.main) {
  writeSearchFiles(join(import.meta.dirname, '..'), createSearchFileMap(sdkSchemaFromCodegen()));
  generateSubjectHierarchy(createCodegenLogger('searchgen'));
}
