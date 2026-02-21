import type { ApiMap } from './perception/apiParser';
import type { UiElementMap } from './perception/uiElementDetector';
import type { UserStoryMap } from './perception/userStoryParser';

export type JourneyStep = {
  id: string;
  label: string;
  source: 'ui' | 'api' | 'story' | 'inferred';
};

export type UserJourney = {
  name: string;
  steps: JourneyStep[];
};

export type JourneyGraphNode = {
  id: string;
  label: string;
  source: JourneyStep['source'];
};

export type JourneyGraphEdge = {
  from: string;
  to: string;
  reason: string;
};

export type JourneyGraph = {
  nodes: JourneyGraphNode[];
  edges: JourneyGraphEdge[];
  adjacency: Record<string, string[]>;
};

export type FlowMapperOutput = {
  userJourneys: UserJourney[];
  graph: JourneyGraph;
};

type FlowMapperInput = {
  uiMap: UiElementMap;
  apiMap: ApiMap;
  userStoryMap: UserStoryMap;
};

function toNodeId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pushUniqueStep(steps: JourneyStep[], step: JourneyStep): void {
  if (!steps.some((x) => x.id === step.id)) {
    steps.push(step);
  }
}

function findUiSteps(uiMap: UiElementMap): JourneyStep[] {
  const steps: JourneyStep[] = [];

  if (uiMap.forms.login.length > 0 || uiMap.forms.authentication.length > 0) {
    pushUniqueStep(steps, { id: 'login', label: 'Login', source: 'ui' });
  }
  if (uiMap.forms.signup.length > 0) {
    pushUniqueStep(steps, { id: 'signup', label: 'Signup', source: 'ui' });
  }
  if (uiMap.forms.search.length > 0) {
    pushUniqueStep(steps, { id: 'search', label: 'Search', source: 'ui' });
  }
  if (uiMap.forms.checkout.length > 0) {
    pushUniqueStep(steps, { id: 'checkout', label: 'Checkout', source: 'ui' });
  }
  if (uiMap.forms.contact.length > 0) {
    pushUniqueStep(steps, { id: 'contact', label: 'Contact', source: 'ui' });
  }

  return steps;
}

function mapEndpointToStep(path: string): string | null {
  const p = path.toLowerCase();
  if (p.includes('login') || p.includes('signin') || p.includes('auth')) return 'Login';
  if (p.includes('dashboard')) return 'Dashboard';
  if (p.includes('order') || p.includes('cart')) return 'Create Order';
  if (p.includes('checkout') || p.includes('payment')) return 'Checkout';
  if (p.includes('confirm') || p.includes('confirmation') || p.includes('receipt')) return 'Confirmation';
  return null;
}

function findApiSteps(apiMap: ApiMap): JourneyStep[] {
  const steps: JourneyStep[] = [];
  apiMap.endpoints.forEach((endpoint) => {
    const label = mapEndpointToStep(endpoint.path);
    if (!label) return;
    pushUniqueStep(steps, {
      id: toNodeId(label),
      label,
      source: 'api',
    });
  });
  return steps;
}

function parseStoryFlowToSteps(flowText: string): JourneyStep[] {
  return flowText
    .split(/->|→|>/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((label) => ({
      id: toNodeId(label),
      label,
      source: 'story' as const,
    }));
}

function buildBaseJourney(uiSteps: JourneyStep[], apiSteps: JourneyStep[], storyMap: UserStoryMap): UserJourney[] {
  const journeys: UserJourney[] = [];

  storyMap.flows.forEach((storyFlow, idx) => {
    const parsed = parseStoryFlowToSteps(storyFlow);
    if (parsed.length > 0) {
      journeys.push({
        name: `Story Flow ${idx + 1}`,
        steps: parsed,
      });
    }
  });

  if (journeys.length === 0) {
    const steps: JourneyStep[] = [];

    const hasLogin = uiSteps.some((x) => x.id === 'login') || apiSteps.some((x) => x.id === 'login');
    const hasCheckout = uiSteps.some((x) => x.id === 'checkout') || apiSteps.some((x) => x.id === 'checkout');

    if (hasLogin) {
      pushUniqueStep(steps, { id: 'login', label: 'Login', source: 'inferred' });
      pushUniqueStep(steps, { id: 'dashboard', label: 'Dashboard', source: 'inferred' });
    }

    if (hasCheckout) {
      pushUniqueStep(steps, { id: 'create-order', label: 'Create Order', source: 'inferred' });
      pushUniqueStep(steps, { id: 'checkout', label: 'Checkout', source: 'inferred' });
      pushUniqueStep(steps, { id: 'confirmation', label: 'Confirmation', source: 'inferred' });
    }

    uiSteps.forEach((step) => pushUniqueStep(steps, step));
    apiSteps.forEach((step) => pushUniqueStep(steps, step));

    if (steps.length === 0) {
      steps.push({ id: 'start', label: 'Start', source: 'inferred' });
    }

    journeys.push({
      name: 'Primary User Journey',
      steps,
    });
  }

  return journeys;
}

function buildGraph(journeys: UserJourney[]): JourneyGraph {
  const nodeMap = new Map<string, JourneyGraphNode>();
  const edges: JourneyGraphEdge[] = [];
  const edgeSet = new Set<string>();

  journeys.forEach((journey) => {
    journey.steps.forEach((step, index) => {
      if (!nodeMap.has(step.id)) {
        nodeMap.set(step.id, {
          id: step.id,
          label: step.label,
          source: step.source,
        });
      }

      if (index > 0) {
        const prev = journey.steps[index - 1];
        const key = `${prev.id}=>${step.id}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({
            from: prev.id,
            to: step.id,
            reason: `Sequence in ${journey.name}`,
          });
        }
      }
    });
  });

  const adjacency: Record<string, string[]> = {};
  edges.forEach((edge) => {
    if (!adjacency[edge.from]) adjacency[edge.from] = [];
    if (!adjacency[edge.from].includes(edge.to)) {
      adjacency[edge.from].push(edge.to);
    }
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    adjacency,
  };
}

export function flowMapper(input: FlowMapperInput): FlowMapperOutput {
  const uiSteps = findUiSteps(input.uiMap);
  const apiSteps = findApiSteps(input.apiMap);
  const userJourneys = buildBaseJourney(uiSteps, apiSteps, input.userStoryMap);
  const graph = buildGraph(userJourneys);

  return {
    userJourneys,
    graph,
  };
}

