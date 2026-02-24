import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2);
}

function getErrorMessage(error, fallback) {
  if (error?.issues?.length) {
    return error.issues.map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join(' | ');
  }
  if (error?.formErrors?.length) {
    return error.formErrors.join(' | ');
  }
  if (error?.fields) {
    return Object.entries(error.fields)
      .flatMap(([field, messages]) => (messages || []).map((msg) => `${field}: ${msg}`))
      .join(' | ');
  }
  return error?.message || fallback;
}

export default function RpaAgentPage() {
  const { token } = useAuth();
  const [instruction, setInstruction] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [workflow, setWorkflow] = useState(null);
  const [status, setStatus] = useState('idle');
  const [executionLogs, setExecutionLogs] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [extractedData, setExtractedData] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isRunning = status === 'running' || status === 'pending';
  const latestLog = useMemo(() => (executionLogs.length > 0 ? executionLogs[executionLogs.length - 1] : null), [executionLogs]);

  async function pollWorkflowStatus(currentWorkflowId) {
    const result = await api.getRpaAgentWorkflow(currentWorkflowId, token);
    setStatus(result.status || 'unknown');
    setWorkflow(result.generatedWorkflowJSON || null);
    setExecutionLogs(Array.isArray(result?.executionLogs?.logs) ? result.executionLogs.logs : []);
    setScreenshots(Array.isArray(result?.executionLogs?.screenshots) ? result.executionLogs.screenshots : []);
    setExtractedData(Array.isArray(result?.executionLogs?.extractedData) ? result.executionLogs.extractedData : []);
    if (result?.executionLogs?.error) {
      setError(result.executionLogs.error);
    }
    return result;
  }

  useEffect(() => {
    if (!workflowId || !isRunning) {
      return undefined;
    }

    const timer = setInterval(() => {
      pollWorkflowStatus(workflowId).catch(() => {});
    }, 1500);

    return () => clearInterval(timer);
  }, [workflowId, isRunning]);

  async function handleExecute(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    setWorkflow(null);
    setExecutionLogs([]);
    setScreenshots([]);
    setExtractedData([]);
    setStatus('pending');
    setWorkflowId('');

    try {
      const result = await api.executeRpaAgent({ instruction }, token);
      setWorkflowId(result.workflowId);
      setWorkflow(result.generatedWorkflowJSON || null);
      setStatus(result.status || 'running');
      await pollWorkflowStatus(result.workflowId);
    } catch (e) {
      setStatus('failed');
      setError(getErrorMessage(e, 'Unable to execute RPA workflow'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>RPA Agent</h1>
          <p>AI-powered robotic process automation for browser workflows.</p>
          {error && <p className="error">{error}</p>}

          <section className="card section-compact">
            <h3>Instruction Input</h3>
            <form className="waitlist-form" onSubmit={handleExecute}>
              <label>
                Instructions
                <textarea
                  rows={8}
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="Example: Open https://example.com, click Sign In, fill email and password, then extract account name."
                  required
                />
              </label>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Planning...' : 'Execute'}
              </button>
            </form>
            <p>Status: <strong>{status}</strong></p>
            {latestLog && <p>Latest Log: {latestLog.message}</p>}
            {workflowId && <p>Workflow ID: <code>{workflowId}</code></p>}
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Generated Workflow</h3>
              <pre>{formatJson(workflow)}</pre>
            </article>
            <article className="card">
              <h3>Live Execution Logs</h3>
              <pre>{formatJson(executionLogs)}</pre>
            </article>
          </section>

          <section className="card section-compact">
            <h3>Screenshots</h3>
            {screenshots.length === 0 ? (
              <pre>{formatJson({})}</pre>
            ) : (
              <div className="grid-3">
                {screenshots.map((shot) => (
                  <article key={`${shot.fileName}-${shot.step}`} className="card">
                    <p>Step {shot.step}: {shot.action}</p>
                    <img src={shot.url} alt={`Step ${shot.step}`} style={{ width: '100%', borderRadius: '0.5rem' }} />
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card section-compact">
            <h3>Extracted Data</h3>
            <pre>{formatJson(extractedData)}</pre>
          </section>
        </div>
      </main>
    </>
  );
}
