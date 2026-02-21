const { all, get, run } = require('../../db');

function normalizeKeyPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 120);
}

function buildPatternKey({ failureType, rootCause, impactedLayer }) {
  return [failureType, impactedLayer, rootCause]
    .map(normalizeKeyPart)
    .filter(Boolean)
    .join('|')
    .slice(0, 240);
}

async function learnFromFailureAnalysis({ userId, testRunId = null, failureReport = null, failureAnalysis = null }) {
  const failureType = String(failureAnalysis?.failureType || 'Environment');
  const rootCause = String(failureAnalysis?.rootCause || 'Unknown failure cause');
  const impactedLayer = String(failureAnalysis?.impactedLayer || 'Unknown layer');
  const suggestedFix = String(failureAnalysis?.suggestedFix || '');
  const patternKey = buildPatternKey({ failureType, rootCause, impactedLayer }) || 'unknown-pattern';
  const metadata = {
    testRunId,
    testName: failureReport?.testName || null,
    confidence: failureAnalysis?.confidence ?? null,
  };

  const existing = await get(
    'SELECT id, occurrence_count FROM qa_learning_patterns WHERE user_id = ? AND pattern_key = ? LIMIT 1',
    [userId, patternKey]
  );

  if (existing) {
    await run(
      `UPDATE qa_learning_patterns
       SET occurrence_count = ?, last_seen_at = ?, root_cause = ?, impacted_layer = ?, suggested_fix = ?, metadata_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        Number(existing.occurrence_count || 0) + 1,
        new Date().toISOString(),
        rootCause,
        impactedLayer,
        suggestedFix,
        JSON.stringify(metadata),
        new Date().toISOString(),
        existing.id,
      ]
    );
    return { patternId: existing.id, patternKey, updated: true };
  }

  const insert = await run(
    `INSERT INTO qa_learning_patterns
     (user_id, pattern_key, failure_type, root_cause, impacted_layer, suggested_fix, occurrence_count, last_seen_at, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      patternKey,
      failureType,
      rootCause,
      impactedLayer,
      suggestedFix,
      1,
      new Date().toISOString(),
      JSON.stringify(metadata),
    ]
  );

  return { patternId: insert.lastID, patternKey, updated: false };
}

async function getLearningInsights({ userId, limit = 10 }) {
  const rows = await all(
    `SELECT * FROM qa_learning_patterns
     WHERE user_id = ?
     ORDER BY occurrence_count DESC, updated_at DESC
     LIMIT ?`,
    [userId, limit]
  );

  const mapped = rows.map((row) => {
    let metadata = null;
    try {
      metadata = row.metadata_json ? JSON.parse(row.metadata_json) : null;
    } catch (error) {
      metadata = null;
    }
    return {
      id: row.id,
      patternKey: row.pattern_key,
      failureType: row.failure_type,
      rootCause: row.root_cause,
      impactedLayer: row.impacted_layer,
      suggestedFix: row.suggested_fix,
      occurrenceCount: row.occurrence_count,
      lastSeenAt: row.last_seen_at,
      metadata,
    };
  });

  if (mapped.length > 0) {
    return mapped;
  }

  // Fallback insight from latest CI sync so the insights panel has actionable context
  // even before failure-learning patterns are accumulated.
  const ciRow = await get(
    'SELECT status_json, created_at FROM qa_ci_sync_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
    [userId]
  );

  if (!ciRow?.status_json) {
    return mapped;
  }

  let status = null;
  try {
    status = JSON.parse(ciRow.status_json);
  } catch (error) {
    status = null;
  }
  if (!status || typeof status !== 'object') {
    return mapped;
  }

  const latest = status.latest || {};
  return [
    {
      id: 'ci-fallback-latest',
      patternKey: 'ci-health-signal',
      failureType: 'CI',
      rootCause: `Latest CI health: ${status.health || 'unknown'}`,
      impactedLayer: 'CI Pipeline',
      suggestedFix:
        (status.health === 'attention'
          ? 'Stabilize failing CI run and unblock pipeline gates.'
          : 'Continue monitoring CI trend and keep pipeline checks green.'),
      occurrenceCount: 1,
      lastSeenAt: ciRow.created_at,
      metadata: {
        provider: status.provider || null,
        repo: status.repo || null,
        latestStatus: latest.status || null,
        latestConclusion: latest.conclusion || null,
        latestRunUrl: latest.htmlUrl || null,
        source: 'ci_fallback',
      },
    },
  ];
}

module.exports = {
  learnFromFailureAnalysis,
  getLearningInsights,
};
