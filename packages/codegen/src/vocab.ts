/**
 * Subpath barrel: `@oaknational/sdk-codegen/vocab`
 *
 * Types and hand-authored domain ontology for curriculum vocabulary.
 *
 * Mined synonym DATA is in the separate `@oaknational/sdk-codegen/vocab-data`
 * subpath.
 *
 * Pipeline APIs (readers, extractors, generators) remain in the
 * `/bulk` subpath.
 */

export { conceptGraph } from './mcp/property-graph-data.js';
export type {
  ConceptGraph,
  ConceptId,
  ConceptCategory,
  ConceptEdge,
} from './mcp/property-graph-data.js';

export type { MinedSynonym, MinedSynonymsData, MinedSynonymsStats } from './bulk/index.js';
