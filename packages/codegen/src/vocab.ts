/**
 * Subpath barrel: `@oaknational/sdk-codegen/vocab`
 *
 * Types and hand-authored domain ontology for vocabulary graphs.
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

export type {
  NCCoverageGraph,
  NCCoverageGraphStats,
  NCStatementNode,
  MinedSynonym,
  MinedSynonymsData,
  MinedSynonymsStats,
  VocabularyGraph,
  VocabularyGraphStats,
  VocabularyNode,
} from './bulk/index.js';
