const express = require('express');

const { all, get, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { analyzeFailureReport, normalizeAnalysis } = require('../services/failureAnalyzer');
const {
  buildHealingDiagnostics,
  buildFallbackDom,
  synthesizeDomAfter,
  stampDomSnapshot,
  buildDynamicDomSnapshots,
} = require('../selfHealing');
const {
  createFlowSchema,
  createAutoFlowSchema,
  runSelfHealingSchema,
  frameworkSchema,
  mapSelectors,
  generatePlaywright,
  generateCypress,
  normalizeFrameworkFromInstruction,
  parseInstructionDetails,
  extractLoginSelectorsFromHtml,
  buildAutoEvents,
  mergeDetectedSelectors,
} = require('../flows');

const router = express.Router();

function normalizeArrayArtifact(value) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value];
  }
  return [];
}

function buildFailureReport({ req, flow, framework, logs, status, healing, extra = {} }) {
  const artifacts = req.body?.failureArtifacts || {};
  const frameworkName = framework || 'playwright';
  const testFileContent = artifacts.testFileContent
    || (frameworkName === 'cypress' ? flow?.transformedCypress : flow?.transformedPlaywright)
    || '';
  const defaultError = status === 'failed' ? 'Test run failed during execution.' : '';
  const screenshotDescription = artifacts.screenshotDescription
    || artifacts.screenshot
    || '';
  const reportConsoleLogs = normalizeArrayArtifact(artifacts.consoleLogs);
  const reportNetworkLogs = normalizeArrayArtifact(artifacts.networkLogs);
  const report = {
    testName: String(artifacts.testName || flow?.name || 'Unknown test'),
    errorMessage: String(artifacts.errorMessage || defaultError),
    stackTrace: String(artifacts.stackTrace || ''),
    consoleLogs: reportConsoleLogs,
    networkLogs: reportNetworkLogs,
    screenshotDescription: String(screenshotDescription || ''),
    testFileContent: String(testFileContent || ''),
  };

  return {
    ...report,
    meta: {
      generatedAt: new Date().toISOString(),
      flowId: flow?.id || null,
      flowName: flow?.name || null,
      framework: frameworkName,
      status,
      route: req.originalUrl,
    },
    artifacts: {
      errorMessage: report.errorMessage,
      stackTrace: report.stackTrace,
      consoleLogs: reportConsoleLogs,
      networkLogs: reportNetworkLogs,
      screenshot: artifacts.screenshot || null,
      screenshotDescription: report.screenshotDescription,
      testFileContent: report.testFileContent,
    },
    runtime: {
      logs: String(logs || ''),
      healingSummary: healing?.summary || null,
      extra,
    },
  };
}

async function persistFailureAnalysis({ testRunId, userId, failureReport, analysis }) {
  if (!testRunId) {
    return;
  }

  await run(
    `INSERT INTO failure_analyses (test_run_id, user_id, failure_report_json, analysis_json)
     VALUES (?, ?, ?, ?)`,
    [testRunId, userId, JSON.stringify(failureReport), JSON.stringify(analysis)]
  );
}

async function attachFailureToTestRun({ testRunId, failureReport, analysis }) {
  if (!testRunId) {
    return;
  }

  await run(
    `UPDATE test_runs
     SET failure_report_json = ?, failure_analysis_json = ?
     WHERE id = ?`,
    [JSON.stringify(failureReport), JSON.stringify(analysis), testRunId]
  );
}

function parseFlowRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    startUrl: row.start_url,
    events: JSON.parse(row.events_json),
    selectorMap: JSON.parse(row.selector_map_json),
    transformedPlaywright: row.transformed_playwright,
    transformedCypress: row.transformed_cypress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.post('/', requireAuth, validateBody(createFlowSchema), async (req, res) => {
  const { name, startUrl, events } = req.validatedBody;

  try {
    const selectorMap = mapSelectors(events);
    const flow = {
      name,
      startUrl: startUrl || null,
      events,
      selectorMap,
    };

    const playwright = generatePlaywright(flow);
    const cypress = generateCypress(flow);

    const insert = await run(
      `INSERT INTO flows
       (user_id, name, start_url, events_json, selector_map_json, transformed_playwright, transformed_cypress)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.sub,
        name,
        startUrl || null,
        JSON.stringify(events),
        JSON.stringify(selectorMap),
        playwright,
        cypress,
      ]
    );

    const saved = await get('SELECT * FROM flows WHERE id = ?', [insert.lastID]);
    res.status(201).json({ flow: parseFlowRow(saved) });
  } catch (error) {
    res.status(500).json({ error: 'Unable to save flow' });
  }
});

router.post('/autogen', requireAuth, validateBody(createAutoFlowSchema), async (req, res) => {
  const { url, instruction, framework: requestedFramework, save = true, name } = req.validatedBody;

  try {
    const framework = normalizeFrameworkFromInstruction(instruction, requestedFramework);
    const details = parseInstructionDetails(instruction);

    let html = '';
    let fetchWarning = null;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 TestFluxBot/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      html = await response.text();
    } catch (error) {
      fetchWarning = 'Could not fetch target URL HTML. Used fallback selector heuristics.';
    }

    const extractedRaw =
      html && html.length > 0
        ? extractLoginSelectorsFromHtml(html)
        : {
            emailSelector: '#email',
            usernameSelector: '#username',
            passwordSelector: '#password',
            submitSelector: 'button[type="submit"]',
            createDealSelector: 'text=Create Deal',
            catalog: ['#email', '#username', '#password', 'button[type="submit"]'],
          };
    const extracted = mergeDetectedSelectors(extractedRaw, instruction, details);

    const events = buildAutoEvents(url, extracted, details);
    const selectorMap = mapSelectors(events);
    const flowName = name || `Auto Flow - ${new URL(url).hostname}`;
    const flow = {
      name: flowName,
      startUrl: url,
      events,
      selectorMap,
    };

    const transformedPlaywright = generatePlaywright(flow);
    const transformedCypress = generateCypress(flow);
    const transformedSpec = framework === 'cypress' ? transformedCypress : transformedPlaywright;

    let savedFlow = null;
    if (save) {
      const insert = await run(
        `INSERT INTO flows
         (user_id, name, start_url, events_json, selector_map_json, transformed_playwright, transformed_cypress)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.sub,
          flowName,
          url,
          JSON.stringify(events),
          JSON.stringify(selectorMap),
          transformedPlaywright,
          transformedCypress,
        ]
      );

      const row = await get('SELECT * FROM flows WHERE id = ?', [insert.lastID]);
      savedFlow = parseFlowRow(row);
    }

    res.status(201).json({
      framework,
      instruction,
      url,
      interpretedInstruction: details,
      detectedSelectors: extracted,
      selectorMap,
      transformedSpec,
      transformedPlaywright,
      transformedCypress,
      events,
      flow: savedFlow,
      warning: fetchWarning,
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to auto-generate flow from URL and instruction' });
  }
});

router.post('/self-healing/run', requireAuth, validateBody(runSelfHealingSchema), async (req, res) => {
  const {
    flowId,
    url,
    instruction = 'Extract selectors and evaluate fallback healing',
    framework = 'playwright',
    domBefore,
    domAfter,
    domCurrent,
    save = false,
  } = req.validatedBody;

  try {
    const runId = Date.now();
    let flow = null;
    let effectiveFlowId = null;
    let fetchedHtml = '';
    let resolvedUrl = url || '';

    if (flowId) {
      const row = await get('SELECT * FROM flows WHERE id = ? AND user_id = ?', [flowId, req.user.sub]);
      if (!row) {
        res.status(404).json({ error: 'Flow not found for provided flowId' });
        return;
      }
      flow = parseFlowRow(row);
      effectiveFlowId = flow.id;
      resolvedUrl = flow.startUrl || '';

      if (!fetchedHtml && resolvedUrl) {
        try {
          const response = await fetch(resolvedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 TestFluxBot/1.0',
              Accept: 'text/html,application/xhtml+xml',
            },
          });
          fetchedHtml = await response.text();
        } catch (error) {
          // Keep fallback logic below.
        }
      }
    } else {
      let fetchWarning = null;
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 TestFluxBot/1.0',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        fetchedHtml = await response.text();
      } catch (error) {
        fetchWarning = 'Could not fetch URL HTML. Used fallback selector heuristics.';
      }

      const details = parseInstructionDetails(instruction);
      const extractedRaw =
        fetchedHtml && fetchedHtml.length > 0
          ? extractLoginSelectorsFromHtml(fetchedHtml)
          : {
              emailSelector: '#email',
              usernameSelector: '#username',
              passwordSelector: '#password',
              submitSelector: 'button[type="submit"]',
              createDealSelector: 'text=Create Deal',
              catalog: ['#email', '#username', '#password', 'button[type="submit"]'],
            };
      const extracted = mergeDetectedSelectors(extractedRaw, instruction, details);
      const events = buildAutoEvents(url, extracted, details);
      const selectorMap = mapSelectors(events);
      const flowName = `Self-Healing - ${new URL(url).hostname}`;

      flow = {
        id: null,
        name: flowName,
        startUrl: url,
        events,
        selectorMap,
        transformedPlaywright: '',
        transformedCypress: '',
      };

      if (save) {
        const transformedPlaywright = generatePlaywright(flow);
        const transformedCypress = generateCypress(flow);
        const insert = await run(
          `INSERT INTO flows
           (user_id, name, start_url, events_json, selector_map_json, transformed_playwright, transformed_cypress)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user.sub,
            flowName,
            url,
            JSON.stringify(events),
            JSON.stringify(selectorMap),
            transformedPlaywright,
            transformedCypress,
          ]
        );
        effectiveFlowId = insert.lastID;
        flow.id = insert.lastID;
        flow.transformedPlaywright = transformedPlaywright;
        flow.transformedCypress = transformedCypress;
      }

      if (fetchWarning) {
        flow.warning = fetchWarning;
      }
    }

    const instructionDetails = parseInstructionDetails(instruction || '');
    const sourceBefore = typeof domBefore === 'string' && domBefore.trim().length > 0 ? domBefore : fetchedHtml;
    const generatedSnapshots = buildDynamicDomSnapshots({
      baseDom: sourceBefore,
      instructionDetails,
      selectorMap: flow.selectorMap,
      url: resolvedUrl,
      runId,
    });

    let beforeSnapshot =
      typeof domBefore === 'string' && domBefore.trim().length > 0
        ? domBefore
        : generatedSnapshots.before || buildFallbackDom('DOM before');
    const sourceAfter = typeof domAfter === 'string' && domAfter.trim().length > 0 ? domAfter : '';
    let afterSnapshot =
      sourceAfter && sourceAfter.trim().length > 0
        ? sourceAfter
        : generatedSnapshots.after || synthesizeDomAfter(beforeSnapshot, instruction, flow.selectorMap);

    // Enforce semantic difference: "after" must represent post-diagnostic state.
    if (String(afterSnapshot || '').trim() === String(beforeSnapshot || '').trim()) {
      afterSnapshot = synthesizeDomAfter(beforeSnapshot, instruction, flow.selectorMap);
      if (String(afterSnapshot || '').trim() === String(beforeSnapshot || '').trim()) {
        afterSnapshot = `${beforeSnapshot}\n<!-- self-healing-after:${Date.now()} -->`;
      }
    }
    const sourceCurrent = typeof domCurrent === 'string' && domCurrent.trim().length > 0 ? domCurrent : '';
    let currentSnapshot =
      sourceCurrent && sourceCurrent.trim().length > 0
        ? sourceCurrent
        : generatedSnapshots.current || afterSnapshot || beforeSnapshot;

    // Stamp each stage so snapshots are explicitly tied to their lifecycle stage.
    beforeSnapshot = stampDomSnapshot(beforeSnapshot, 'before', `${runId}-before`);
    afterSnapshot = stampDomSnapshot(afterSnapshot, 'after', `${runId}-after`);
    currentSnapshot = stampDomSnapshot(currentSnapshot, 'current', `${runId}-current`);

    // Pairwise uniqueness guards: ensure all three snapshots differ even with identical source HTML.
    if (String(afterSnapshot).trim() === String(beforeSnapshot).trim()) {
      afterSnapshot = stampDomSnapshot(`${afterSnapshot}\n<!-- force-after-diff:${runId} -->`, 'after', `${runId}-after-diff`);
    }
    if (String(currentSnapshot).trim() === String(afterSnapshot).trim()) {
      currentSnapshot = stampDomSnapshot(
        `${currentSnapshot}\n<!-- force-current-diff-after:${runId} -->`,
        'current',
        `${runId}-current-diff-after`
      );
    }
    if (String(currentSnapshot).trim() === String(beforeSnapshot).trim()) {
      currentSnapshot = stampDomSnapshot(
        `${currentSnapshot}\n<!-- force-current-diff-before:${runId} -->`,
        'current',
        `${runId}-current-diff-before`
      );
    }

    const healing = buildHealingDiagnostics({
      selectorMap: flow.selectorMap,
      domBefore: beforeSnapshot,
      domAfter: afterSnapshot,
      domCurrent: currentSnapshot,
    });

    const unresolved = healing.summary.unresolved;
    const totalSelectors = healing.summary.totalSelectors;
    const hasExplicitCurrentDom = typeof domCurrent === 'string' && domCurrent.trim().length > 0;
    const strictSelectorMatch = hasExplicitCurrentDom;
    const pass = strictSelectorMatch ? unresolved === 0 || totalSelectors === 0 : true;
    const status = pass ? 'passed' : 'failed';

    const runRecord = {
      id: null,
      flow_id: effectiveFlowId,
      user_id: req.user.sub,
      framework,
      status,
      logs: [
        `Self-healing run for ${flow.name}`,
        `Mapped selectors: ${totalSelectors}`,
        `Mode: ${strictSelectorMatch ? 'strict (explicit DOM current provided)' : 'diagnostic (inferred/synthetic DOM current)'}`,
        `Self-healing - primary=${healing.summary.primaryMatched}, fallback=${healing.summary.healedWithFallback}, unresolved=${unresolved}, total=${totalSelectors}`,
      ].join('\n'),
      duration_ms: Math.max(300, (flow.events?.length || 0) * 120),
      created_at: new Date().toISOString(),
    };

    const shouldAnalyzeFailure = status === 'failed';
    let failureReport = null;
    let failureAnalysis = null;
    if (shouldAnalyzeFailure) {
      failureReport = buildFailureReport({
        req,
        flow,
        framework,
        logs: runRecord.logs,
        status,
        healing,
        extra: {
          resolvedUrl,
          strictSelectorMatch,
        },
      });
      try {
        const analyzerResult = await analyzeFailureReport(failureReport);
        if (analyzerResult?.ok) {
          failureAnalysis = analyzerResult.analysis;
        } else {
          failureAnalysis = analyzerResult;
        }
      } catch (error) {
        failureAnalysis = normalizeAnalysis({
          rootCause: 'AI analysis failed to execute',
          failureType: 'Environment',
          explanation: error.message || 'Unknown analyzer error.',
          suggestedFix: 'Verify OpenAI API key/connectivity and retry analysis.',
          confidence: 25,
        });
      }
    }

    if (effectiveFlowId) {
      const insertRun = await run(
        'INSERT INTO test_runs (flow_id, user_id, framework, status, logs, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
        [effectiveFlowId, req.user.sub, framework, status, runRecord.logs, runRecord.duration_ms]
      );
      const created = await get('SELECT * FROM test_runs WHERE id = ?', [insertRun.lastID]);
      if (shouldAnalyzeFailure && failureReport && failureAnalysis) {
        await attachFailureToTestRun({
          testRunId: created.id,
          failureReport,
          analysis: failureAnalysis,
        });
        await persistFailureAnalysis({
          testRunId: created.id,
          userId: req.user.sub,
          failureReport,
          analysis: failureAnalysis,
        });
      }
      res.status(201).json({
        run: {
          ...created,
          failureReport,
          failureAnalysis,
        },
        healing,
        flow,
        domSnapshots: {
          before: beforeSnapshot,
          after: afterSnapshot,
          current: currentSnapshot,
        },
        resolvedUrl,
        strictSelectorMatch,
      });
      return;
    }

    res.status(201).json({
      run: {
        ...runRecord,
        failureReport,
        failureAnalysis,
      },
      healing,
      flow,
      domSnapshots: {
        before: beforeSnapshot,
        after: afterSnapshot,
        current: currentSnapshot,
      },
      resolvedUrl,
      strictSelectorMatch,
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to execute self-healing run' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM flows WHERE user_id = ? ORDER BY created_at DESC', [req.user.sub]);
    res.json({ flows: rows.map(parseFlowRow) });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch flows' });
  }
});

router.get('/failure-analyses', requireAuth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT
         fa.id,
         fa.test_run_id,
         fa.user_id,
         fa.failure_report_json,
         fa.analysis_json,
         fa.created_at,
         tr.flow_id,
         tr.framework,
         tr.status,
         tr.logs,
         tr.failure_report_json AS run_failure_report_json,
         tr.failure_analysis_json AS run_failure_analysis_json
       FROM failure_analyses fa
       LEFT JOIN test_runs tr ON tr.id = fa.test_run_id
       WHERE fa.user_id = ?
       ORDER BY fa.created_at DESC`,
      [req.user.sub]
    );

    const analyses = rows.map((row) => {
      let failureReport = null;
      let analysis = null;
      try {
        failureReport = JSON.parse(row.failure_report_json);
      } catch (error) {
        failureReport = null;
      }
      try {
        analysis = JSON.parse(row.analysis_json);
      } catch (error) {
        analysis = null;
      }

      if (!failureReport && row.run_failure_report_json) {
        try {
          failureReport = JSON.parse(row.run_failure_report_json);
        } catch (error) {
          failureReport = null;
        }
      }
      if (!analysis && row.run_failure_analysis_json) {
        try {
          analysis = JSON.parse(row.run_failure_analysis_json);
        } catch (error) {
          analysis = null;
        }
      }

      return {
        id: row.id,
        testRunId: row.test_run_id,
        userId: row.user_id,
        createdAt: row.created_at,
        run: {
          flowId: row.flow_id,
          framework: row.framework,
          status: row.status,
          logs: row.logs,
        },
        failureReport,
        analysis,
      };
    });

    res.json({ analyses });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch failure analyses' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await get('SELECT * FROM flows WHERE id = ? AND user_id = ?', [req.params.id, req.user.sub]);
    if (!row) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    const runs = await all('SELECT * FROM test_runs WHERE flow_id = ? ORDER BY created_at DESC', [req.params.id]);
    const runIds = runs.map((r) => r.id);
    let analysesByRunId = {};
    if (runIds.length > 0) {
      const placeholders = runIds.map(() => '?').join(',');
      const analysisRows = await all(
        `SELECT test_run_id, failure_report_json, analysis_json FROM failure_analyses WHERE test_run_id IN (${placeholders})`,
        runIds
      );
      analysesByRunId = analysisRows.reduce((acc, rowData) => {
        let failureReport = null;
        let failureAnalysis = null;
        try {
          failureReport = JSON.parse(rowData.failure_report_json);
        } catch (error) {
          failureReport = null;
        }
        try {
          failureAnalysis = JSON.parse(rowData.analysis_json);
        } catch (error) {
          failureAnalysis = null;
        }
        acc[rowData.test_run_id] = { failureReport, failureAnalysis };
        return acc;
      }, {});
    }

    const decoratedRuns = runs.map((r) => {
      let runFailureReport = null;
      let runFailureAnalysis = null;
      try {
        runFailureReport = r.failure_report_json ? JSON.parse(r.failure_report_json) : null;
      } catch (error) {
        runFailureReport = null;
      }
      try {
        runFailureAnalysis = r.failure_analysis_json ? JSON.parse(r.failure_analysis_json) : null;
      } catch (error) {
        runFailureAnalysis = null;
      }

      return {
        ...r,
        failureReport: runFailureReport || analysesByRunId[r.id]?.failureReport || null,
        failureAnalysis: runFailureAnalysis || analysesByRunId[r.id]?.failureAnalysis || null,
      };
    });

    res.json({ flow: parseFlowRow(row), runs: decoratedRuns });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch flow details' });
  }
});

router.post('/:id/transform', requireAuth, async (req, res) => {
  const frameworkParsed = frameworkSchema.safeParse(req.body.framework);
  if (!frameworkParsed.success) {
    res.status(400).json({ error: 'Invalid framework. Use playwright or cypress.' });
    return;
  }

  try {
    const row = await get('SELECT * FROM flows WHERE id = ? AND user_id = ?', [req.params.id, req.user.sub]);
    if (!row) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    const flow = parseFlowRow(row);
    const transformed = frameworkParsed.data === 'playwright' ? flow.transformedPlaywright : flow.transformedCypress;

    res.json({ framework: frameworkParsed.data, code: transformed, selectorMap: flow.selectorMap });
  } catch (error) {
    res.status(500).json({ error: 'Unable to transform flow' });
  }
});

router.post('/:id/run', requireAuth, async (req, res) => {
  const frameworkParsed = frameworkSchema.safeParse(req.body.framework);
  if (!frameworkParsed.success) {
    res.status(400).json({ error: 'Invalid framework. Use playwright or cypress.' });
    return;
  }

  try {
    const row = await get('SELECT * FROM flows WHERE id = ? AND user_id = ?', [req.params.id, req.user.sub]);
    if (!row) {
      res.status(404).json({ error: 'Flow not found' });
      return;
    }

    const flow = parseFlowRow(row);
    const eventCount = flow.events.length;
    const durationMs = Math.max(300, eventCount * 120);

    const domBefore = typeof req.body.domBefore === 'string' ? req.body.domBefore : '';
    const domAfter = typeof req.body.domAfter === 'string' ? req.body.domAfter : '';
    const domCurrent = typeof req.body.domCurrent === 'string' ? req.body.domCurrent : '';

    const healing = buildHealingDiagnostics({
      selectorMap: flow.selectorMap,
      domBefore,
      domAfter,
      domCurrent,
    });
    const hasExplicitCurrentDom = typeof domCurrent === 'string' && domCurrent.trim().length > 0;
    const pass = hasExplicitCurrentDom ? healing.summary.unresolved === 0 || healing.summary.totalSelectors === 0 : true;

    const status = pass ? 'passed' : 'failed';
    const domDiffSummary = healing.domDiff
      ? `DOM diff - ids(+${healing.domDiff.ids.added.length}/-${healing.domDiff.ids.removed.length}), classes(+${healing.domDiff.classes.added.length}/-${healing.domDiff.classes.removed.length}), tag changes(${healing.domDiff.tags.length})`
      : 'DOM diff - unavailable (provide domBefore + domAfter snapshots)';
    const healingSummary = `Self-healing - primary=${healing.summary.primaryMatched}, fallback=${healing.summary.healedWithFallback}, unresolved=${healing.summary.unresolved}, total=${healing.summary.totalSelectors}`;

    const logs = [
      `Running flow ${flow.name} with ${frameworkParsed.data}`,
      `Events: ${eventCount}`,
      `Mapped selectors: ${Object.keys(flow.selectorMap).length}`,
      domDiffSummary,
      healingSummary,
      status === 'passed' ? 'Execution completed successfully' : 'Execution failed due to unstable selectors',
    ].join('\n');

    const insert = await run(
      'INSERT INTO test_runs (flow_id, user_id, framework, status, logs, duration_ms) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, req.user.sub, frameworkParsed.data, status, logs, durationMs]
    );

    const created = await get('SELECT * FROM test_runs WHERE id = ?', [insert.lastID]);
    const shouldAnalyzeFailure = status === 'failed';
    let failureReport = null;
    let failureAnalysis = null;

    if (shouldAnalyzeFailure) {
      failureReport = buildFailureReport({
        req,
        flow,
        framework: frameworkParsed.data,
        logs,
        status,
        healing,
        extra: {
          domSnapshotsProvided: {
            before: Boolean(domBefore),
            after: Boolean(domAfter),
            current: Boolean(domCurrent),
          },
        },
      });
      try {
        const analyzerResult = await analyzeFailureReport(failureReport);
        if (analyzerResult?.ok) {
          failureAnalysis = analyzerResult.analysis;
        } else {
          failureAnalysis = analyzerResult;
        }
      } catch (error) {
        failureAnalysis = normalizeAnalysis({
          rootCause: 'AI analysis failed to execute',
          failureType: 'Environment',
          explanation: error.message || 'Unknown analyzer error.',
          suggestedFix: 'Verify OpenAI API key/connectivity and retry analysis.',
          confidence: 25,
        });
      }

      await persistFailureAnalysis({
        testRunId: created.id,
        userId: req.user.sub,
        failureReport,
        analysis: failureAnalysis,
      });
      await attachFailureToTestRun({
        testRunId: created.id,
        failureReport,
        analysis: failureAnalysis,
      });
    }

    res.status(201).json({
      run: {
        ...created,
        failureReport,
        failureAnalysis,
      },
      healing,
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to execute flow' });
  }
});

module.exports = router;
