const DEFAULT_THRESHOLDS = {
  lines: 80,
  branches: 70,
  functions: 80,
  statements: 80,
};

function readCoverageMetric(report, key) {
  if (!report || typeof report !== 'object') return null;
  const direct = report[key];
  if (direct && typeof direct === 'object' && direct.pct != null) {
    return Number(direct.pct);
  }
  const total = report.total;
  if (total && typeof total === 'object' && total[key] && total[key].pct != null) {
    return Number(total[key].pct);
  }
  const summary = report.summary;
  if (summary && typeof summary === 'object' && summary[key] && summary[key].pct != null) {
    return Number(summary[key].pct);
  }
  return null;
}

function analyzeCoverage(coverageReport, thresholds = {}) {
  const appliedThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const metrics = ['lines', 'branches', 'functions', 'statements'];

  const metricResults = metrics.map((metric) => {
    const pctRaw = readCoverageMetric(coverageReport, metric);
    const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : 0;
    const threshold = appliedThresholds[metric];
    const delta = Number((pct - threshold).toFixed(2));
    return {
      metric,
      percentage: Number(pct.toFixed(2)),
      threshold,
      delta,
      status: delta >= 0 ? 'pass' : 'fail',
    };
  });

  const failed = metricResults.filter((m) => m.status === 'fail');
  const overallScore = Number(
    (
      metricResults.reduce((sum, m) => sum + m.percentage, 0) / Math.max(1, metricResults.length)
    ).toFixed(2)
  );

  const recommendations = [];
  if (failed.some((f) => f.metric === 'branches')) {
    recommendations.push('Add branch-focused tests around conditional logic and error paths.');
  }
  if (failed.some((f) => f.metric === 'functions')) {
    recommendations.push('Add unit tests for uncovered service/helper functions.');
  }
  if (failed.some((f) => f.metric === 'lines' || f.metric === 'statements')) {
    recommendations.push('Increase integration coverage for critical workflows and API handlers.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Coverage is healthy. Keep trend monitoring and guard thresholds in CI.');
  }

  return {
    overallScore,
    gateStatus: failed.length === 0 ? 'pass' : 'fail',
    metrics: metricResults,
    failingMetrics: failed.map((f) => f.metric),
    recommendations,
    analyzedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeCoverage,
};

