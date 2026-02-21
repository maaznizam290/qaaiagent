import { useEffect, useState } from 'react';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

export default function AutonomousQaAgentPage() {
  const { token } = useAuth();

  const [planInput, setPlanInput] = useState({
    projectName: 'Test Flux',
    scope: 'Web app regression + API contract validation',
    repositoryUrl: '',
  });
  const [coverageInput, setCoverageInput] = useState('{"total":{"lines":{"pct":78},"branches":{"pct":62},"functions":{"pct":80},"statements":{"pct":79}}}');
  const [ciInput, setCiInput] = useState({
    provider: 'github',
    owner: '',
    repo: '',
    ref: '',
  });
  const [autonomousInput, setAutonomousInput] = useState({
    url: '',
    apiDocs: '',
    userStories: '',
    dbSchema: '',
    logs: '',
  });

  const [overview, setOverview] = useState(null);
  const [planResult, setPlanResult] = useState(null);
  const [coverageResult, setCoverageResult] = useState(null);
  const [ciResult, setCiResult] = useState(null);
  const [copilotResult, setCopilotResult] = useState(null);
  const [autonomousResult, setAutonomousResult] = useState(null);
  const [insights, setInsights] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function refreshOverview() {
    try {
      const [ov, learning] = await Promise.all([
        api.getQaAgentOverview(token),
        api.getQaLearningInsights(8, token),
      ]);
      setOverview(ov);
      setInsights(Array.isArray(learning?.insights) ? learning.insights : []);
    } catch (e) {
      setError(e?.message || 'Unable to fetch QA agent overview');
    }
  }

  useEffect(() => {
    refreshOverview();
  }, []);

  async function handleGeneratePlan(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...planInput,
        repositoryUrl: planInput.repositoryUrl?.trim() ? planInput.repositoryUrl.trim() : undefined,
      };
      const result = await api.generateQaTestPlan(payload, token);
      setPlanResult(result.plan || null);
      await refreshOverview();
    } catch (e) {
      setError(e?.message || 'Unable to generate test plan');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeCoverage(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const parsedCoverage = JSON.parse(coverageInput);
      const result = await api.analyzeQaCoverage({ coverageReport: parsedCoverage }, token);
      setCoverageResult(result.analysis || null);
      await refreshOverview();
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError('Coverage JSON is invalid. Please provide valid JSON format.');
      } else {
        setError(e?.message || 'Unable to analyze coverage');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchCiStatus(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const query = {
        provider: ciInput.provider,
        owner: ciInput.owner,
        repo: ciInput.repo,
        ...(ciInput.ref ? { ref: ciInput.ref } : {}),
      };
      const result = await api.getQaCiStatus(query, token);
      setCiResult(result.status || null);
      await refreshOverview();
    } catch (e) {
      setError(e?.message || 'Unable to fetch CI status');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopilotRecommendations() {
    setError('');
    setLoading(true);
    try {
      const result = await api.getQaCopilotRecommendations({}, token);
      setCopilotResult(result.recommendations || null);
    } catch (e) {
      setError(e?.message || 'Unable to generate copilot recommendations');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyzeAutonomousAgent(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        url: autonomousInput.url,
        apiDocs: autonomousInput.apiDocs || undefined,
        userStories: autonomousInput.userStories || undefined,
        dbSchema: autonomousInput.dbSchema || undefined,
        logs: autonomousInput.logs || undefined,
      };
      const result = await api.analyzeAutonomousQaAgent(payload, token);
      setAutonomousResult(result || null);
    } catch (e) {
      setError(e?.message || 'Unable to analyze autonomous QA input');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>Autonomous QA Agent</h1>
          <p>Autonomous QA co-pilot for test planning, coverage intelligence, CI monitoring, and failure learning.</p>
          {error && <p className="error">{error}</p>}

          <section className="card section-compact">
            <h3>Autonomous Product Analysis</h3>
            <form className="waitlist-form" onSubmit={handleAnalyzeAutonomousAgent}>
              <label>
                URL
                <input
                  value={autonomousInput.url}
                  onChange={(e) => setAutonomousInput((p) => ({ ...p, url: e.target.value }))}
                  placeholder="https://example.com"
                  required
                />
              </label>
              <label>
                API Docs
                <textarea
                  rows={5}
                  value={autonomousInput.apiDocs}
                  onChange={(e) => setAutonomousInput((p) => ({ ...p, apiDocs: e.target.value }))}
                  placeholder="Swagger JSON or API docs URL"
                />
              </label>
              <label>
                User Stories
                <textarea
                  rows={5}
                  value={autonomousInput.userStories}
                  onChange={(e) => setAutonomousInput((p) => ({ ...p, userStories: e.target.value }))}
                />
              </label>
              <label>
                DB Schema
                <textarea
                  rows={5}
                  value={autonomousInput.dbSchema}
                  onChange={(e) => setAutonomousInput((p) => ({ ...p, dbSchema: e.target.value }))}
                />
              </label>
              <label>
                Logs
                <textarea
                  rows={5}
                  value={autonomousInput.logs}
                  onChange={(e) => setAutonomousInput((p) => ({ ...p, logs: e.target.value }))}
                />
              </label>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Working...' : 'Analyze Product'}
              </button>
            </form>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>UI Map</h3>
              <pre>{formatJson(autonomousResult?.perceptionLayer?.uiMap || autonomousResult?.perceptionLayer?.uiElements)}</pre>
            </article>
            <article className="card">
              <h3>User Flows</h3>
              <pre>{formatJson(autonomousResult?.flows)}</pre>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Validation Rules</h3>
              <pre>{formatJson(autonomousResult?.validations)}</pre>
            </article>
            <article className="card">
              <h3>Risk Analysis</h3>
              <pre>{formatJson(autonomousResult?.riskAnalysis)}</pre>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Generate Test Plan</h3>
              <form className="waitlist-form" onSubmit={handleGeneratePlan}>
                <label>
                  Project Name
                  <input
                    value={planInput.projectName}
                    onChange={(e) => setPlanInput((p) => ({ ...p, projectName: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Scope
                  <textarea
                    rows={5}
                    value={planInput.scope}
                    onChange={(e) => setPlanInput((p) => ({ ...p, scope: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Repository URL (optional)
                  <input
                    value={planInput.repositoryUrl}
                    onChange={(e) => setPlanInput((p) => ({ ...p, repositoryUrl: e.target.value }))}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Working...' : 'Generate Plan'}
                </button>
              </form>
            </article>

            <article className="card">
              <h3>Analyze Coverage</h3>
              <form className="waitlist-form" onSubmit={handleAnalyzeCoverage}>
                <label>
                  Coverage JSON
                  <textarea
                    rows={8}
                    value={coverageInput}
                    onChange={(e) => setCoverageInput(e.target.value)}
                    required
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Working...' : 'Analyze Coverage'}
                </button>
              </form>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>CI Integration</h3>
              <form className="waitlist-form" onSubmit={handleFetchCiStatus}>
                <label>
                  Provider
                  <select
                    value={ciInput.provider}
                    onChange={(e) => setCiInput((p) => ({ ...p, provider: e.target.value }))}
                  >
                    <option value="github">github</option>
                    <option value="gitlab">gitlab</option>
                  </select>
                </label>
                <label>
                  Owner/Group
                  <input
                    value={ciInput.owner}
                    onChange={(e) => setCiInput((p) => ({ ...p, owner: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Repo
                  <input
                    value={ciInput.repo}
                    onChange={(e) => setCiInput((p) => ({ ...p, repo: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Ref (optional)
                  <input
                    value={ciInput.ref}
                    onChange={(e) => setCiInput((p) => ({ ...p, ref: e.target.value }))}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Working...' : 'Fetch CI Status'}
                </button>
              </form>
            </article>

            <article className="card">
              <h3>Autonomous Co-Pilot</h3>
              <button className="btn btn-primary" type="button" onClick={handleCopilotRecommendations} disabled={loading}>
                {loading ? 'Working...' : 'Generate Recommendations'}
              </button>
              <h3>Learning Insights</h3>
              <pre>{formatJson(insights)}</pre>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Latest Plan</h3>
              <pre>{formatJson(planResult)}</pre>
              <h3>Coverage Analysis</h3>
              <pre>{formatJson(coverageResult)}</pre>
            </article>
            <article className="card">
              <h3>CI Status</h3>
              <pre>{formatJson(ciResult)}</pre>
              <h3>Co-Pilot Recommendations</h3>
              <pre>{formatJson(copilotResult)}</pre>
            </article>
          </section>

          <section className="card section-compact">
            <h3>QA Agent Overview</h3>
            <pre>{formatJson(overview)}</pre>
          </section>
        </div>
      </main>
    </>
  );
}
