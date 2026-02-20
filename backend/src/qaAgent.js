const { z } = require('zod');

const providerSchema = z.enum(['github', 'gitlab']);

const generatePlanSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  scope: z.string().trim().min(1).max(4000),
  repositoryUrl: z.string().trim().url().optional(),
  frameworks: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  riskAreas: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  constraints: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
  goals: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
});

const coverageAnalyzeSchema = z.object({
  coverageReport: z.record(z.any()),
  thresholds: z
    .object({
      lines: z.number().min(0).max(100).optional(),
      branches: z.number().min(0).max(100).optional(),
      functions: z.number().min(0).max(100).optional(),
      statements: z.number().min(0).max(100).optional(),
    })
    .optional(),
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

