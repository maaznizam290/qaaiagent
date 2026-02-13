export const challenges = [
  {
    title: 'Slow Regression Cycles',
    description: 'Days or weeks to complete regression testing, blocking shipping velocity.',
  },
  {
    title: 'Brittle Test Scripts',
    description: 'Test suites break on minor UI updates and create noisy failures.',
  },
  {
    title: 'Manual Failure Analysis',
    description: 'Engineers spend hours debugging flaky tests instead of fixing product issues.',
  },
];

export const roadmap = [
  {
    phase: 'Phase 1',
    title: 'Foundation',
    timeline: 'Weeks 1-3',
    outcome: 'Generate stable tests 10x faster',
    items: [
      'Chrome extension to record user flows',
      'Flow -> Playwright/Cypress transformer',
      'Intelligent selector mapping',
      'Simple test execution dashboard',
    ],
  },
  {
    phase: 'Phase 2',
    title: 'Self-Healing Engine',
    timeline: 'Weeks 4-6',
    outcome: 'Tests evolve and fix themselves',
    items: [
      'DOM diffing algorithms',
      'Intelligent selector fallback',
      'Log + screenshot analysis',
      'Auto-patching broken test scripts',
    ],
  },
  {
    phase: 'Phase 3',
    title: 'AI Failure Analysis',
    timeline: 'Weeks 6-8',
    outcome: 'Debug in minutes, not hours',
    items: [
      'Multi-modal analysis (screenshots, logs)',
      'Root cause explanations',
      'Suggested code fixes',
      'Actionable next steps',
    ],
  },
  {
    phase: 'Phase 4',
    title: 'Autonomous QA Agent',
    timeline: 'Weeks 8-12',
    outcome: 'Fully autonomous QA co-pilot',
    items: [
      'Intelligent test planning',
      'Coverage intelligence',
      'CI integration (GitHub, GitLab)',
      'Continuous learning loop',
    ],
  },
];

export const pricing = [
  {
    name: 'Solo',
    price: '$49',
    period: '/month',
    description: 'Perfect for individual QA engineers',
    features: ['Unlimited test generation', 'Self-healing engine', 'Basic AI diagnostics', '5 projects', 'Email support'],
  },
  {
    name: 'Startup',
    price: '$299',
    period: '/month',
    description: 'For growing engineering teams',
    popular: true,
    features: [
      'Everything in Solo',
      'Advanced AI failure analysis',
      'Coverage intelligence',
      'Unlimited projects',
      'CI/CD integrations',
      'Priority support',
      'Team collaboration',
    ],
  },
  {
    name: 'Enterprise',
    price: '$999',
    period: '/month',
    description: 'For large organizations',
    features: [
      'Everything in Startup',
      'SSO authentication',
      'Audit logs',
      'Custom integrations',
      'Dedicated success manager',
      'SLA guarantee',
      'On-premise option',
    ],
  },
];
