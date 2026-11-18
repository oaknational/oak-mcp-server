/**
 * Graph generators for the vocabulary mining pipeline.
 *
 * @remarks
 * Generators transform extracted vocabulary data into static graph
 * structures suitable for MCP tool consumption.

 */

export {
  generateAnalysisReport,
  serializeAnalysisReport,
  writeAnalysisReportFile,
  type AnalysisReport,
  type AnalysisSummary,
  type CrossSubjectTermEntry,
  type KeywordFrequencyEntry,
  type KeywordStats,
  type MisconceptionDensity,
  type NCCoverage,
  type SubjectRankEntry,
  type SynonymCandidate,
  type SynonymPatterns,
} from './analysis-report-generator.js';

export {
  extractSynonymFromDefinition,
  generateMinedSynonyms,
  serializeMinedSynonyms,
  writeMinedSynonymsFile,
  type MinedSynonym,
  type MinedSynonymsData,
  type MinedSynonymsStats,
} from './synonym-miner.js';

export {
  generateGraphCorpusData,
  type GraphCorpus,
  type GraphCorpusUnitNode,
  type GraphCorpusEdge,
  type GraphCorpusNodeId,
  type GraphCorpusStats,
  type GraphCorpusDroppedEdge,
} from './graph-corpus-generator.js';
