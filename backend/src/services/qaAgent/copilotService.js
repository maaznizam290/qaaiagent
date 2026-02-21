const OPERATING_DIRECTIVE =
  'You are an autonomous QA Engineering Agent. Your goal is to ensure application quality through a perceive-plan-act-learn loop. Always decompose high-level testing goals into sub-tasks. Reflect after every action to confirm success. Use available tools for browser interaction, file reading, and test execution. Do not stop until the user\'s test goal is fully verified or a definitive bug is reported.';

function buildReflectionForAction(action) {
  const unresolved = action.priority === 'high';
  return {
    actionTitle: action.title,
    successCriteria: 'Action has clear owner and rationale tied to current quality signals.',
    status: unresolved ? 'needs_follow_up' : 'confirmed',
    note: unresolved
      ? 'Critical signal remains unresolved until follow-up execution evidence is provided.'
      : 'No blocking signal detected for this action at recommendation time.',
  };
}

function buildSubTasks(actions, context) {
  const testingGoal = String(context?.testingGoal || context?.goal || 'Validate application quality baseline').trim();
  const decomposition = actions.map((action, index) => ({
    id: `task-${index + 1}`,
    title: action.title,
    priority: action.priority,
    reason: action.reason,
    owner: action.owner,
  }));
  return {
    testingGoal,
    strategy: 'perceive-plan-act-learn',
    tasks: decomposition,
  };
}

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

  const boundedActions = actions.slice(0, 6);
  const subTasks = buildSubTasks(boundedActions, context);
  const reflections = boundedActions.map(buildReflectionForAction);
  const highPriorityUnresolved = boundedActions.find((action) => action.priority === 'high') || null;

  return {
    generatedAt: new Date().toISOString(),
    mode: 'autonomous-co-pilot',
    directive: OPERATING_DIRECTIVE,
    subTasks,
    actions: boundedActions,
    reflections,
    verificationStatus: highPriorityUnresolved ? 'definitive_bug_reported' : 'fully_verified',
    definitiveBug: highPriorityUnresolved
      ? {
          title: highPriorityUnresolved.title,
          reason: highPriorityUnresolved.reason,
          owner: highPriorityUnresolved.owner,
        }
      : null,
  };
}

module.exports = {
  buildCopilotRecommendations,
};
