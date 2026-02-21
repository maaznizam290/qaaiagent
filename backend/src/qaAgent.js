const { z } = require('zod');

const providerSchema = z.enum(['github', 'gitlab']);

const generatePlanSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  scope: z.string().trim().min(1).max(4000),
  repositoryUrl: z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      const text = String(value).trim();
      return text.length === 0 ? undefined : text;
    },
    z.string().url().optional()
  ),
  frameworks: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  riskAreas: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  constraints: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  goals: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
});

const coverageThresholdsSchema = z
  .object({
    lines: z.number().min(0).max(100).optional(),
    branches: z.number().min(0).max(100).optional(),
    functions: z.number().min(0).max(100).optional(),
    statements: z.number().min(0).max(100).optional(),
  })
  .optional();

const coverageReportShape = z.object({}).catchall(z.any());

const coverageAnalyzeSchema = z.preprocess(
  (raw) => {
    // Accept stringified JSON payloads.
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        return raw;
      }
    }
    return raw;
  },
  z.union([
    z.object({
      coverageReport: z.preprocess(
        (reportRaw) => {
          if (typeof reportRaw === 'string') {
            try {
              return JSON.parse(reportRaw);
            } catch (error) {
              return reportRaw;
            }
          }
          return reportRaw;
        },
        coverageReportShape
      ),
      thresholds: coverageThresholdsSchema,
    }),
    coverageReportShape,
  ])
).transform((parsed) => {
  if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'coverageReport')) {
    return {
      coverageReport: parsed.coverageReport,
      thresholds: parsed.thresholds,
    };
  }
  // Backward/compat mode: treat raw object body as coverage report.
  return {
    coverageReport: parsed,
    thresholds: undefined,
  };
});

const learnFailureSchema = z.object({
  testRunId: z.number().int().positive().optional(),
  failureReport: z.record(z.any()).optional(),
  failureAnalysis: z.record(z.any()).optional(),
});

const copilotRecommendationSchema = z.object({
  context: z.record(z.any()).optional(),
});

function parseCiStatusQuery(query) {
  const parsed = z
    .object({
      provider: providerSchema,
      owner: z.string().trim().min(1).max(120),
      repo: z.string().trim().min(1).max(120),
      ref: z.string().trim().min(1).max(120).optional(),
      perPage: z.coerce.number().int().min(1).max(50).optional(),
    })
    .safeParse(query);
  return parsed;
}

module.exports = {
  providerSchema,
  generatePlanSchema,
  coverageAnalyzeSchema,
  learnFailureSchema,
  copilotRecommendationSchema,
  parseCiStatusQuery,
};
