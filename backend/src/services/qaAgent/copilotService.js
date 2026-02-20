function buildCopilotRecommendations({ learningInsights, latestCoverage, latestCiStatus, context = {} }) {
  const actions = [];

  if (latestCoverage && latestCoverage.gateStatus === 'fail') {
    actions.push({
      priority: 'high',
      title: 'Fix coverage gate violations',
      reason: `Coverage gate failed for metrics: ${(latestCoverage.failingMetrics || []).join(', ') || 'unknown'}.`,
      owner: 'QA + Feature Team',
    });
  }

  if (latestCiStatus && latestCiStatus.health === 'attention') {
    actions.push({
      priority: 'high',
      title: 'Stabilize failing CI pipeline',
      reason: `Latest CI run status/conclusion: ${latestCiStatus.latest?.status || 'unknown'}/${latestCiStatus.latest?.conclusion || 'unknown'}.`,
      owner: 'DevOps + QA',
    });
  }

  if (Array.isArray(learningInsights) && learningInsights.length > 0) {
    const top = learningInsights[0];
    actions.push({
      priority: 'medium',
      title: 'Create preventive tests for recurring failure pattern',
      reason: `Recurring pattern "${top.rootCause}" occurred ${top.occurrenceCount} times.`,
      owner: 'Automation Team',
    });
  }

  if (actions.length === 0) {
    actions.push({
      priority: 'low',
      title: 'Maintain current QA baseline',
      reason: 'No critical signals found in coverage, CI, or learned failures.',
      owner: 'QA Agent',
    });
  }

  if (context?.releaseWindow === 'today') {
    actions.unshift({
      priority: 'high',
      title: 'Run release smoke suite immediately',
      reason: 'Release window flagged as immediate.',
      owner: 'Release QA',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: 'autonomous-co-pilot',
    actions: actions.slice(0, 6),
  };
}

module.exports = {
  buildCopilotRecommendations,
};

