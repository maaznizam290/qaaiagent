const express = require('express');

const { all, get, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const {
  generatePlanSchema,
  coverageAnalyzeSchema,
  learnFailureSchema,
  copilotRecommendationSchema,
  parseCiStatusQuery,
} = require('../qaAgent');
const { generateTestPlan } = require('../services/qaAgent/planService');
const { analyzeCoverage } = require('../services/qaAgent/coverageService');
const { fetchCiStatus } = require('../services/qaAgent/ciService');
const { learnFromFailureAnalysis, getLearningInsights } = require('../services/qaAgent/learningService');
const { buildCopilotRecommendations } = require('../services/qaAgent/copilotService');

const router = express.Router();

router.post('/plans/generate', requireAuth, validateBody(generatePlanSchema), async (req, res) => {
  try {
    const plan = generateTestPlan(req.validatedBody);
    await run(
      `INSERT INTO qa_test_plans (user_id, input_json, plan_json, status)
       VALUES (?, ?, ?, ?)`,
      [req.user.sub, JSON.stringify(req.validatedBody), JSON.stringify(plan), 'generated']
    );
    res.status(201).json({ plan });
  } catch (error) {
    res.status(500).json({ error: 'Unable to generate QA test plan' });
  }
});

router.post('/coverage/analyze', requireAuth, validateBody(coverageAnalyzeSchema), async (req, res) => {
  try {
    const analysis = analyzeCoverage(req.validatedBody.coverageReport, req.validatedBody.thresholds);
    await run(
      `INSERT INTO qa_coverage_reports (user_id, report_json, analysis_json)
       VALUES (?, ?, ?)`,
      [req.user.sub, JSON.stringify(req.validatedBody.coverageReport), JSON.stringify(analysis)]
    );
    res.status(201).json({ analysis });
  } catch (error) {
    res.status(500).json({ error: 'Unable to analyze coverage report' });
  }
});

router.get('/ci/status', requireAuth, async (req, res) => {
  const parsed = parseCiStatusQuery(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid CI status query.',
      issues: parsed.error.issues,
    });
    return;
  }

  try {
    const status = await fetchCiStatus(parsed.data);
    await run(
      `INSERT INTO qa_ci_sync_logs (user_id, provider, repo, status_json)
       VALUES (?, ?, ?, ?)`,
      [req.user.sub, parsed.data.provider, `${parsed.data.owner}/${parsed.data.repo}`, JSON.stringify(status)]
    );
    res.json({ status });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Unable to fetch CI status' });
  }
});

router.post('/learn/failure', requireAuth, validateBody(learnFailureSchema), async (req, res) => {
  try {
    let failureReport = req.validatedBody.failureReport || null;
    let failureAnalysis = req.validatedBody.failureAnalysis || null;
    const testRunId = req.validatedBody.testRunId || null;

    if ((!failureReport || !failureAnalysis) && testRunId) {
      const row = await get(
        `SELECT failure_report_json, analysis_json
         FROM failure_analyses
         WHERE test_run_id = ? AND user_id = ?
         LIMIT 1`,
        [testRunId, req.user.sub]
      );
      if (row) {
        try {
          failureReport = failureReport || JSON.parse(row.failure_report_json);
        } catch (error) {
          failureReport = failureReport || null;
        }
        try {
          failureAnalysis = failureAnalysis || JSON.parse(row.analysis_json);
        } catch (error) {
          failureAnalysis = failureAnalysis || null;
        }
      }
    }

    if (!failureAnalysis) {
      res.status(400).json({ error: 'failureAnalysis or resolvable testRunId is required.' });
      return;
    }

    const learningResult = await learnFromFailureAnalysis({
      userId: req.user.sub,
      testRunId,
      failureReport,
      failureAnalysis,
    });
    res.status(201).json({ learningResult });
  } catch (error) {
    res.status(500).json({ error: 'Unable to learn from failure input' });
  }
});

router.get('/learn/insights', requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit || 10);
    const insights = await getLearningInsights({
      userId: req.user.sub,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(30, limit)) : 10,
    });
    res.json({ insights });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch learning insights' });
  }
});

router.post('/copilot/recommendations', requireAuth, validateBody(copilotRecommendationSchema), async (req, res) => {
  try {
    const learningInsights = await getLearningInsights({ userId: req.user.sub, limit: 5 });

    let latestCoverage = null;
    const coverageRow = await get(
      'SELECT analysis_json FROM qa_coverage_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.sub]
    );
    if (coverageRow?.analysis_json) {
      try {
        latestCoverage = JSON.parse(coverageRow.analysis_json);
      } catch (error) {
        latestCoverage = null;
      }
    }

    let latestCiStatus = null;
    const ciRow = await get(
      'SELECT status_json FROM qa_ci_sync_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.sub]
    );
    if (ciRow?.status_json) {
      try {
        latestCiStatus = JSON.parse(ciRow.status_json);
      } catch (error) {
        latestCiStatus = null;
      }
    }

    const recommendations = buildCopilotRecommendations({
      learningInsights,
      latestCoverage,
      latestCiStatus,
      context: req.validatedBody.context || {},
    });
    res.json({ recommendations });
  } catch (error) {
    res.status(500).json({ error: 'Unable to generate copilot recommendations' });
  }
});

router.get('/overview', requireAuth, async (req, res) => {
  try {
    const [plans, coverage, insights] = await Promise.all([
      all(
        'SELECT id, status, created_at FROM qa_test_plans WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
        [req.user.sub]
      ),
      all(
        `SELECT id, created_at, report_json, analysis_json
         FROM qa_coverage_reports
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 5`,
        [req.user.sub]
      ),
      getLearningInsights({ userId: req.user.sub, limit: 5 }),
    ]);

    const coverageReports = coverage.map((row) => {
      let report = null;
      let analysis = null;

      try {
        report = row.report_json ? JSON.parse(row.report_json) : null;
      } catch (error) {
        report = null;
      }
      try {
        analysis = row.analysis_json ? JSON.parse(row.analysis_json) : null;
      } catch (error) {
        analysis = null;
      }

      return {
        id: row.id,
        createdAt: row.created_at,
        report,
        analysis,
      };
    });

    res.json({
      plans,
      coverageReports,
      learningInsights: insights,
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch QA agent overview' });
  }
});

module.exports = router;
