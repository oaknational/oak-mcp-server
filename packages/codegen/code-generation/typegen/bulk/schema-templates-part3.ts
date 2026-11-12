/**
 * Template strings for bulk schema generation (part 3).
 *
 * @remarks
 * Contains unit-related Zod schema code templates.
 * Separated for maintainability and to stay under max-lines lint rule.

 */

/** Unit schemas template */
export const UNIT_TEMPLATE = `
// ============================================================================
// Unit Schemas (bulk-specific structure)
// ============================================================================

/**
 * Schema for thread reference within a unit.
 * @see UnitSummaryResponseSchema.threads
 */
export const unitThreadSchema = z
  .object({
    slug: z.string(),
    order: z.number(),
    title: z.string(),
  })
  .strict();

/** Unit thread reference type */
export type UnitThread = z.infer<typeof unitThreadSchema>;

/**
 * Schema for lesson reference within a unit.
 * @see UnitSummaryResponseSchema.unitLessons
 */
export const unitLessonSchema = z
  .object({
    lessonSlug: z.string(),
    lessonTitle: z.string(),
    lessonOrder: z.number(),
    state: z.string(),
  })
  .strict();

/** Unit lesson reference type */
export type UnitLesson = z.infer<typeof unitLessonSchema>;

/**
 * Schema for exam board reference in KS4 units.
 * Present only in secondary bulk files with KS4 units.
 * Some subjects (e.g., computing) include examSubjectTitle for the GCSE title.
 */
export const examBoardSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    examSubjectTitle: z.string().optional(),
  })
  .strict();

/** Exam board reference type */
export type ExamBoard = z.infer<typeof examBoardSchema>;

/**
 * Schema for an exam subject reference on a KS4 unit.
 * @see bulk schema.json $defs/unit.properties.examSubjects
 */
export const examSubjectSchema = z
  .object({
    examSubjectSlug: z.string(),
    examSubjectTitle: z.string(),
  })
  .strict();

/** Exam subject reference type */
export type ExamSubject = z.infer<typeof examSubjectSchema>;

/**
 * Schema for a categorisation tag on a unit.
 * @see bulk schema.json $defs/unit.properties.categories
 */
export const categorySchema = z
  .object({
    categoryTitle: z.string(),
    categorySlug: z.string(),
  })
  .strict();

/** Unit category tag type */
export type UnitCategory = z.infer<typeof categorySchema>;

/**
 * Schema for the tier reference on a KS4 unit.
 * @see bulk schema.json $defs/unit.properties.tier
 */
export const tierSchema = z
  .object({
    tierSlug: z.string(),
    tierTitle: z.string(),
  })
  .strict();

/** Tier reference type */
export type Tier = z.infer<typeof tierSchema>;

/**
 * Schema for a single programme factor (a slug/title pair).
 *
 * @remarks
 * programmeFactors is present in bulk data but ABSENT from the bulk
 * schema.json sidecar — the sidecar omits a field the API's own
 * UnitSummaryResponseSchema declares (upstream defect, MCP-205). The shape is
 * transcribed from that API schema, never from observed data.
 */
export const programmeFactorSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
  })
  .strict();

/** Programme factor reference type */
export type ProgrammeFactor = z.infer<typeof programmeFactorSchema>;

/**
 * Schema for the programme factors carried by KS4 unit variants.
 * @see UnitSummaryResponseSchema.programmeFactors
 */
export const unitProgrammeFactorsSchema = z
  .object({
    examBoard: programmeFactorSchema,
    pathway: programmeFactorSchema,
    tier: programmeFactorSchema,
    childSubject: programmeFactorSchema,
  })
  .partial()
  .strict();

/** Unit programme factors type */
export type UnitProgrammeFactors = z.infer<typeof unitProgrammeFactorsSchema>;

/**
 * Schema for unit records in bulk download sequence array.
 *
 * @remarks
 * Structure differs from API UnitSummaryResponseSchema:
 * - Missing: phaseSlug, notes, oakUrl
 * - Added: canonicalUrl, examBoard, examSubjects, tier, pathway, pathwaySlug,
 *   unitOptionGroup (KS4/variant fields, secondary files only)
 * - Required: description (optional in API), year as number or "All years"
 */
export const unitSchema = z
  .object({
    unitSlug: z.string(),
    unitTitle: z.string(),
    canonicalUrl: z.string(),
    subjectSlug: z.string(),
    threads: z.array(unitThreadSchema),
    priorKnowledgeRequirements: z.array(z.string()),
    nationalCurriculumContent: z.array(z.string()),
    description: z.string(),
    yearSlug: z.string(),
    year: z.union([z.number(), z.literal('All years')]),
    keyStageSlug: z.string(),
    whyThisWhyNow: z.string().optional(),
    unitLessons: z.array(unitLessonSchema),

    // KS4 / unit-variant fields (secondary files only)
    examBoard: examBoardSchema.optional(),
    examSubjects: z.array(examSubjectSchema).optional(),
    categories: z.array(categorySchema).optional(),
    tier: tierSchema.optional(),
    pathway: z.string().optional(),
    pathwaySlug: z.string().optional(),
    unitOptionGroup: z.string().optional(),
    programmeFactors: unitProgrammeFactorsSchema.optional(),
  })
  .strict();

/** Parsed unit type */
export type Unit = z.infer<typeof unitSchema>;
`;
