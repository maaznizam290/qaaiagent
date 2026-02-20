function buildDefaultMatrix(frameworks = []) {
  const hasPlaywright = frameworks.some((f) => String(f).toLowerCase().includes('playwright'));
  const hasCypress = frameworks.some((f) => String(f).toLowerCase().includes('cypress'));
  const uiFrameworks = hasPlaywright || hasCypress ? frameworks : ['playwright', 'cypress'];

  return {
    smoke: ['critical user journeys', 'auth flow', 'core API contracts'],
    regression: ['cross-browser UI regressions', 'edge-case API failures', 'data integrity checks'],
    integration: ['service-to-service contracts', 'db migration checks', 'queue/retry correctness'],
    uiAutomation: uiFrameworks,
  };
}

function generateTestPlan(input) {
  const now = new Date().toISOString();
  const riskAreas = Array.isArray(input.riskAreas) && input.riskAreas.length > 0
    ? input.riskAreas
    : ['authentication', 'critical path workflows', 'external integrations'];
  const constraints = Array.isArray(input.constraints) ? input.constraints : [];
  const goals = Array.isArray(input.goals) && input.goals.length > 0
    ? input.goals
    : ['raise release confidence', 'reduce escaped defects', 'speed up feedback loops'];
  const matrix = buildDefaultMatrix(input.frameworks || []);

  const phases = [
    {
      name: 'Phase 1 - Baseline Risk Mapping',
      tasks: [
        'Map modules to business criticality and historical failures.',
        'Identify missing automated checks for high-risk paths.',
        'Define minimal smoke test gate for pull requests.',
      ],
    },
    {
      name: 'Phase 2 - Automation Expansion',
      tasks: [
        'Generate targeted API + UI regression suites for risk areas.',
        'Prioritize flaky test stabilization before adding breadth.',
        'Add deterministic test data and environment guards.',
      ],
    },
    {
      name: 'Phase 3 - CI Quality Gates',
      tasks: [
        'Fail pipeline on smoke/regression gate violations.',
        'Enforce minimum coverage thresholds with trend monitoring.',
        'Publish per-commit QA scorecard to engineering channels.',
      ],
    },
    {
      name: 'Phase 4 - Learning Loop',
      tasks: [
        'Feed failure analyses into recurring root-cause clusters.',
        'Auto-suggest new tests for repeated defect signatures.',
        'Track mean-time-to-detect and mean-time-to-stabilize.',
      ],
    },
  ];

  return {
    generatedAt: now,
    projectName: input.projectName,
    scope: input.scope,
    repositoryUrl: input.repositoryUrl || null,
    goals,
    riskAreas,
    constraints,
    matrix,
    phases,
    kpis: [
      'PR smoke pass rate',
      'Defect escape rate',
      'Flaky test ratio',
      'Coverage trend delta',
    ],
    nextBestAction:
      'Start by shipping a PR smoke gate and high-risk regression suite, then tighten coverage thresholds incrementally.',
  };
}

module.exports = {
  generateTestPlan,
};

