const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, options = {}) {
  const { headers: customHeaders = {}, ...restOptions } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...customHeaders,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.fields = data.fields;
    error.formErrors = data.formErrors;
    error.issues = data.issues;
    throw error;
  }

  return data;
}

export const api = {
  register(payload) {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  login(payload) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  userExists(email) {
    const query = encodeURIComponent(email);
    return request(`/auth/exists?email=${query}`);
  },
  me(token) {
    return request('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  waitlist(payload, token) {
    return request('/waitlist', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    });
  },
  listFlows(token) {
    return request('/flows', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  createFlow(payload, token) {
    return request('/flows', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  autoGenerateFlow(payload, token) {
    return request('/flows/autogen', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  transformFlow(flowId, framework, token) {
    return request(`/flows/${flowId}/transform`, {
      method: 'POST',
      body: JSON.stringify({ framework }),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  runFlow(flowId, framework, token, healingContext = {}) {
    const { domBefore, domAfter, domCurrent } = healingContext;
    return request(`/flows/${flowId}/run`, {
      method: 'POST',
      body: JSON.stringify({
        framework,
        domBefore,
        domAfter,
        domCurrent,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  runSelfHealing(payload, token) {
    return request('/flows/self-healing/run', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  getFlow(flowId, token) {
    return request(`/flows/${flowId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  listFailureAnalyses(token) {
    return request(`/flows/failure-analyses?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  getFailureAnalysisByRunId(testRunId, token) {
    const cacheBust = Date.now();
    return request(`/flows/failure-analyses/${encodeURIComponent(testRunId)}?t=${cacheBust}`, {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  uploadFailureAnalysisFile(payload, token) {
    return request('/flows/failure-analyses/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  previewFailureAnalysisFile(payload, token) {
    return request('/flows/failure-analyses/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  generatePatchSuggestion(testRunId, token) {
    return request(`/flows/test-runs/${encodeURIComponent(testRunId)}/actions/patch-suggestion`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  createIssueTicket(testRunId, token) {
    return request(`/flows/test-runs/${encodeURIComponent(testRunId)}/actions/issue-ticket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  markKnownFlaky(testRunId, token) {
    return request(`/flows/test-runs/${encodeURIComponent(testRunId)}/actions/known-flaky`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  rerunTest(testRunId, token) {
    return request(`/flows/test-runs/${encodeURIComponent(testRunId)}/actions/rerun`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  generateQaTestPlan(payload, token) {
    return request('/qa-agent/plans/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  analyzeQaCoverage(payload, token) {
    return request('/qa-agent/coverage/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  getQaCiStatus(query, token) {
    const params = new URLSearchParams(query).toString();
    return request(`/qa-agent/ci/status?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  learnFromQaFailure(payload, token) {
    return request('/qa-agent/learn/failure', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  getQaLearningInsights(limit, token) {
    return request(`/qa-agent/learn/insights?limit=${encodeURIComponent(limit || 10)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  getQaCopilotRecommendations(payload, token) {
    return request('/qa-agent/copilot/recommendations', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
  getQaAgentOverview(token) {
    return request('/qa-agent/overview', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },
};
