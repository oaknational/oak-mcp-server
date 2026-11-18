/**
 * Vocabulary mining pipeline orchestrator.
 *
 * @remarks
 * This module provides the pipeline entry point for extracting vocabulary
 * data from Oak National Academy bulk download files, then writing the
 * mined synonyms to the SDK and an analysis report beside this module.
 *
 * @example
 * ```bash
 * # Run from repo root
 * pnpm vocab-gen
 *
 * # Dry run (no files written)
 * pnpm vocab-gen --dry-run
 * ```
 *
 * @see ADR-086 (`docs/architecture/architectural-decisions/086-vocab-gen-graph-export-pattern.md`) for the pipeline specification
 */
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Logger } from '@oaknational/logger';
import {
  generateAnalysisReport,
  generateMinedSynonyms,
  writeAnalysisReportFile,
  writeMinedSynonymsFile,
} from '../src/bulk.js';
import { readAllBulkFiles } from './lib/index.js';
import { processBulkData, type ProcessingResult } from './vocab-gen-core.js';
import { type PipelineConfig, type PipelineResult } from './vocab-gen-config.js';
import { toBulkDataInputs } from './vocab-gen-inputs.js';
import { enforceRestrictedInclusionCorpusBoundary } from './vocab-gen-restricted-boundary.js';

// Re-export core types and functions
export {
  type BulkDataInput,
  type ExtractedData,
  type ExtractionStats,
  processBulkData,
} from './vocab-gen-core.js';

// Re-export configuration types and factory
export {
  createPipelineConfig,
  type PipelineConfig,
  type PipelineConfigInput,
  type PipelineResult,
} from './vocab-gen-config.js';

// Re-export formatting function
export { formatPipelineResult } from './vocab-gen-format.js';

async function generateOutputFiles(
  result: ProcessingResult,
  config: PipelineConfig,
  logger?: Logger,
): Promise<string[]> {
  const outputFiles: string[] = [];

  // Generate analysis report (written to vocab-gen/reports in the SDK)
  const analysisReport = generateAnalysisReport(result.extractedData);
  const vocabGenDir = dirname(fileURLToPath(import.meta.url));
  const analysisFilePath = await writeAnalysisReportFile(analysisReport, vocabGenDir, logger);
  outputFiles.push(`reports/${basename(analysisFilePath)}`);

  const minedSynonyms = generateMinedSynonyms(result.extractedData.keywords);
  const synonymsDir = join(config.outputPath, 'synonyms');
  const synonymsFilePath = await writeMinedSynonymsFile(minedSynonyms, synonymsDir, logger);
  outputFiles.push(`synonyms/${basename(synonymsFilePath)}`);

  return outputFiles;
}

/** Injectable dependencies for {@link runPipeline} (ADR-078 testability). */
export interface RunPipelineDeps {
  /** Bulk-file reader; defaults to the disk-backed {@link readAllBulkFiles}. */
  readonly readAllBulkFiles?: typeof readAllBulkFiles;
}

/**
 * Runs the vocabulary mining pipeline.
 *
 * @param config - Pipeline configuration
 * @param logger - Optional logger for progress reporting
 * @param deps - Injectable dependencies (ADR-078)
 * @returns Pipeline result with statistics and output files
 */
export async function runPipeline(
  config: PipelineConfig,
  logger?: Logger,
  deps: RunPipelineDeps = {},
): Promise<PipelineResult> {
  const corpusBoundaryRejection = enforceRestrictedInclusionCorpusBoundary(config);
  if (corpusBoundaryRejection) {
    return corpusBoundaryRejection;
  }

  const startTime = Date.now();

  // Read all bulk download files
  const readFiles = deps.readAllBulkFiles ?? readAllBulkFiles;
  const allFiles = await readFiles(config.bulkDataPath, logger);

  const { inputs: bulkData, restrictedLessonsExcluded } = toBulkDataInputs(allFiles, {
    includeRestricted: config.includeRestricted,
  });

  // Process the data (extraction)
  const result = processBulkData(bulkData);

  let outputFiles: string[] = [];
  if (!config.dryRun) {
    outputFiles = await generateOutputFiles(result, config, logger);
  }

  const durationMs = Date.now() - startTime;

  return {
    ...result.stats,
    success: true,
    filesProcessed: result.filesProcessed,
    totalLessons: result.totalLessons,
    totalUnits: result.totalUnits,
    restrictedLessonsExcluded,
    outputFiles,
    durationMs,
    dryRun: config.dryRun,
  };
}
