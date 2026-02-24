const crypto = require('crypto');
const express = require('express');

const { get, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { rpaExecuteSchema } = require('../rpaAgent');
const { planWorkflowFromInstruction, normalizeDomain } = require('../services/rpaPlanner');
const { executeWorkflow } = require('../services/rpaExecutor');
const path = require('path');

const router = express.Router();

const ACTIVE_WORKFLOW_JOBS = new Map();

function parseJson(text, fallback) {
  if (!text || typeof text !== 'string') {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

function mergeAllowedDomains(requestDomains, workflowUrl) {
  const configured = String(process.env.RPA_ALLOWED_DOMAINS || '')
    .split(',')
    .map((part) => normalizeDomain(part))
    .filter(Boolean);
  const requested = (requestDomains || []).map((part) => normalizeDomain(part)).filter(Boolean);
  const wildcardConfigured = String(process.env.RPA_ALLOWED_DOMAINS || '')
    .split(',')
    .map((part) => String(part || '').trim())
    .includes('*');
  const wildcardRequested = (requestDomains || []).some((part) => String(part || '').trim() === '*');

  if (wildcardConfigured || wildcardRequested) {
    return [];
  }

  if (configured.length > 0 && requested.length > 0) {
    return requested.filter((domain) => configured.includes(domain));
  }
  if (configured.length > 0) {
    return configured;
  }
  if (requested.length > 0) {
    return requested;
  }
  // Empty list means "no domain restriction".
  return [];
}

async function persistWorkflowExecution({ workflowId, status, generatedWorkflow, executionLogs }) {
  await run(
    `UPDATE rpa_workflows
     SET generated_workflow_json = ?,
         execution_logs = ?,
         status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE workflow_id = ?`,
    [JSON.stringify(generatedWorkflow || {}), JSON.stringify(executionLogs || {}), status, workflowId]
  );
}

function toPublicWorkflowResponse(row, req) {
  const host = `${req.protocol}://${req.get('host')}`;
  const generatedWorkflowJSON = parseJson(row.generated_workflow_json, {});
  const executionLogs = parseJson(row.execution_logs, {
    logs: [],
    screenshots: [],
    extractedData: [],
    error: null,
  });
  const screenshots = (executionLogs.screenshots || []).map((shot) => ({
    ...shot,
    url: shot.path?.startsWith('http') ? shot.path : `${host}${shot.path}`,
  }));

  return {
    workflowId: row.workflow_id,
    instruction: row.instruction,
    status: row.status,
    createdAt: row.created_at,
    generatedWorkflowJSON,
    executionLogs: {
      ...executionLogs,
      screenshots,
    },
    active: ACTIVE_WORKFLOW_JOBS.has(row.workflow_id),
  };
}

router.post('/', requireAuth, validateBody(rpaExecuteSchema), async (req, res) => {
  const workflowId = crypto.randomUUID();
  const instruction = req.validatedBody.instruction;
  const maxExecutionMs =
    req.validatedBody.maxExecutionMs || Number(process.env.RPA_MAX_EXECUTION_MS || 120000);
  const stepRetries = req.validatedBody.stepRetries ?? Number(process.env.RPA_STEP_RETRIES || 1);

  try {
    await run(
      `INSERT INTO rpa_workflows (workflow_id, user_id, instruction, generated_workflow_json, execution_logs, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workflowId, req.user.sub, instruction, '{}', '{"logs":[],"screenshots":[]}', 'pending']
    );

    const planned = await planWorkflowFromInstruction({
      instruction,
      allowedDomains: req.validatedBody.allowedDomains || [],
    });
    const allowedDomains = mergeAllowedDomains(req.validatedBody.allowedDomains, planned.workflow.url);
    const executionSeed = {
      logs: [
        {
          at: new Date().toISOString(),
          level: 'info',
          message: `Workflow planned using ${planned.source}`,
          allowedDomains,
        },
      ],
      screenshots: [],
      extractedData: [],
    };

    await persistWorkflowExecution({
      workflowId,
      status: 'running',
      generatedWorkflow: planned.workflow,
      executionLogs: executionSeed,
    });

    const job = executeWorkflow({
      workflowId,
      workflow: planned.workflow,
      maxExecutionMs,
      stepRetries,
      allowedDomains,
      onUpdate: async ({ status, logs }) => {
        const current = await get(
          'SELECT execution_logs, generated_workflow_json FROM rpa_workflows WHERE workflow_id = ? LIMIT 1',
          [workflowId]
        );
        const existing = parseJson(current?.execution_logs, executionSeed);
        await persistWorkflowExecution({
          workflowId,
          status: status || 'running',
          generatedWorkflow: parseJson(current?.generated_workflow_json, planned.workflow),
          executionLogs: {
            ...existing,
            logs,
          },
        });
      },
    })
      .then(async (result) => {
        await persistWorkflowExecution({
          workflowId,
          status: result.status || 'completed',
          generatedWorkflow: planned.workflow,
          executionLogs: result,
        });
      })
      .catch(async (error) => {
        const failed = {
          logs: [
            {
              at: new Date().toISOString(),
              level: 'error',
              message: error.message || 'Execution failed',
            },
          ],
          screenshots: [],
          extractedData: [],
          error: error.message || 'Execution failed',
        };
        await persistWorkflowExecution({
          workflowId,
          status: 'failed',
          generatedWorkflow: planned.workflow,
          executionLogs: failed,
        });
      })
      .finally(() => {
        ACTIVE_WORKFLOW_JOBS.delete(workflowId);
      });

    ACTIVE_WORKFLOW_JOBS.set(workflowId, job);

    res.status(202).json({
      workflowId,
      status: 'running',
      generatedWorkflowJSON: planned.workflow,
      allowedDomains,
      statusUrl: `/api/rpa-agent/${encodeURIComponent(workflowId)}`,
    });
  } catch (error) {
    await run(
      `UPDATE rpa_workflows
       SET status = ?, execution_logs = ?, updated_at = CURRENT_TIMESTAMP
       WHERE workflow_id = ?`,
      [
        'failed',
        JSON.stringify({
          logs: [{ at: new Date().toISOString(), level: 'error', message: error.message || 'Planner failure' }],
          screenshots: [],
          extractedData: [],
          error: error.message || 'Planner failure',
        }),
        workflowId,
      ]
    ).catch(() => {});

    res.status(500).json({ error: error.message || 'Unable to start RPA workflow execution' });
  }
});

router.get('/screenshots/:fileName', async (req, res) => {
  // This path is protected so screenshot links can be shared only for authenticated users.
  const fileName = String(req.params.fileName || '').trim();
  if (!fileName.endsWith('.png')) {
    res.status(404).json({ error: 'Screenshot not found' });
    return;
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  if (safeName !== fileName) {
    res.status(404).json({ error: 'Screenshot not found' });
    return;
  }

  const absolute = path.join(__dirname, '..', '..', 'data', 'rpa-screenshots', safeName);
  res.sendFile(absolute, (error) => {
    if (error) {
      res.status(404).json({ error: 'Screenshot not found' });
    }
  });
});

router.get('/:workflowId', requireAuth, async (req, res) => {
  const workflowId = String(req.params.workflowId || '').trim();
  if (!workflowId) {
    res.status(400).json({ error: 'workflowId is required' });
    return;
  }

  const row = await get(
    `SELECT workflow_id, instruction, generated_workflow_json, execution_logs, status, created_at
     FROM rpa_workflows
     WHERE workflow_id = ? AND user_id = ?
     LIMIT 1`,
    [workflowId, req.user.sub]
  );

  if (!row) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }

  res.json(toPublicWorkflowResponse(row, req));
});

module.exports = router;
