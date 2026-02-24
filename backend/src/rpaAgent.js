const { z } = require('zod');

const rpaStepSchema = z.object({
  action: z.enum(['goto', 'click', 'type', 'extract', 'wait']),
  selector: z.string().trim().min(1).max(500).optional(),
  value: z.string().trim().max(4000).optional(),
  attribute: z.string().trim().max(120).optional(),
});

const rpaWorkflowSchema = z.object({
  url: z.string().url(),
  steps: z.array(rpaStepSchema).min(1).max(120),
});

const rpaExecuteSchema = z.object({
  instruction: z.string().trim().min(5).max(12000),
  maxExecutionMs: z.number().int().min(5000).max(300000).optional(),
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  stepRetries: z.number().int().min(0).max(3).optional(),
});

module.exports = {
  rpaWorkflowSchema,
  rpaExecuteSchema,
};
