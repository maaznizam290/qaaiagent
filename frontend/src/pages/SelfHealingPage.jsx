import { useState } from 'react';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

function getApiErrorMessage(error, fallback) {
  if (error?.issues?.length) {
    return error.issues.map((i) => `${i.path.join('.') || 'request'}: ${i.message}`).join(' | ');
  }
  if (error?.formErrors?.length) {
    return error.formErrors.join(' | ');
  }
  if (error?.fields) {
    const fieldMessages = Object.entries(error.fields)
      .flatMap(([field, messages]) => (messages || []).map((m) => `${field}: ${m}`))
      .join(' | ');
    if (fieldMessages) {
      return fieldMessages;
    }
  }
  return error?.message || fallback;
}

export default function SelfHealingPage() {
  const { token } = useAuth();

  const [target, setTarget] = useState('');
  const [instruction, setInstruction] = useState('');
  const [framework, setFramework] = useState('playwright');
  const [domBefore, setDomBefore] = useState('');
  const [domAfter, setDomAfter] = useState('');
  const [domCurrent, setDomCurrent] = useState('');
  const [healing, setHealing] = useState(null);
  const [run, setRun] = useState(null);
  const [failureAnalysis, setFailureAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleRun(event) {
    event.preventDefault();
    setSubmitted(true);
    setError('');
    setMessage('');
    setHealing(null);
    setRun(null);
    setFailureAnalysis(null);

    const normalizedTarget = target.trim();
    const normalizedInstruction = instruction.trim();
    if (!normalizedTarget || !normalizedInstruction) {
      setError('Flow ID/URL and instructions are required.');
      return;
    }

    let parsedUrl = null;
    try {
      parsedUrl = new URL(normalizedTarget);
    } catch (e) {
      parsedUrl = null;
    }

    setLoading(true);
    try {
      const payload = parsedUrl
        ? {
            url: parsedUrl.toString(),
            instruction: normalizedInstruction,
            framework,
            domBefore,
            domAfter,
            domCurrent,
            save: false,
          }
        : {
            flowId: normalizedTarget,
            instruction: normalizedInstruction,
            framework,
            domBefore,
            domAfter,
            domCurrent,
          };

      const result = await api.runSelfHealing(payload, token);
      if (result?.flow?.warning) {
        setMessage(`Self-healing run completed with warning: ${result.flow.warning}`);
      } else {
        setMessage('Self-healing run completed.');
      }
      setRun(result.run || null);
      setFailureAnalysis(result?.run?.failureAnalysis || null);
      setHealing(result.healing || null);
      setDomBefore(result?.domSnapshots?.before || '');
      setDomAfter(result?.domSnapshots?.after || '');
      setDomCurrent(result?.domSnapshots?.current || '');
    } catch (e) {
      setError(getApiErrorMessage(e, 'Unable to run self-healing engine'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>Self-Healing Engine</h1>
          <p>DOM Difference Diagnostic Using a Flow ID or Direct URL</p>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Run Diagnostics</h3>
              <form className="waitlist-form" onSubmit={handleRun}>
                <label>
                  Flow ID or URL *
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="Please enter the URL in form of .com or ID"
                    className={submitted && !target.trim() ? 'input-invalid' : ''}
                    required
                  />
                </label>

                <label>
                  Instructions *
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="please enter the instructions"
                    className={submitted && !instruction.trim() ? 'input-invalid' : ''}
                    rows={4}
                    required
                  />
                </label>

                <label>
                  Framework
                  <select value={framework} onChange={(e) => setFramework(e.target.value)}>
                    <option value="playwright">playwright</option>
                    <option value="cypress">cypress</option>
                  </select>
                </label>

                <label>
                  DOM Before
                  <textarea value={domBefore} onChange={(e) => setDomBefore(e.target.value)} rows={6} />
                </label>

                <label>
                  DOM After
                  <textarea value={domAfter} onChange={(e) => setDomAfter(e.target.value)} rows={6} />
                </label>

                <label>
                  DOM Current
                  <textarea value={domCurrent} onChange={(e) => setDomCurrent(e.target.value)} rows={6} />
                </label>

                <div className="hero-actions">
                  <button className="btn btn-primary" type="submit" disabled={loading}>
                    {loading ? 'Running...' : 'Run Self-Healing'}
                  </button>
                </div>
              </form>

              {message && <p className="success">{message}</p>}
              {error && <p className="error">{error}</p>}
            </article>

            <article className="card">
              <h3>Healing Summary</h3>
              <pre>{JSON.stringify(healing?.summary || {}, null, 2)}</pre>

              <h3>Run Record</h3>
              <pre>{JSON.stringify(run || {}, null, 2)}</pre>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Selector Resolution</h3>
              <pre>{JSON.stringify(healing?.selectorResolution || {}, null, 2)}</pre>
            </article>
            <article className="card">
              <h3>DOM Diff</h3>
              <pre>{JSON.stringify(healing?.domDiff || {}, null, 2)}</pre>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Failure Analysis</h3>
              <p><strong>Root Cause:</strong> {failureAnalysis?.rootCause || 'N/A'}</p>
              <p><strong>Explanation:</strong> {failureAnalysis?.explanation || 'N/A'}</p>
              <p><strong>Suggested Fix:</strong> {failureAnalysis?.suggestedFix || 'N/A'}</p>
              <p><strong>Confidence:</strong> {failureAnalysis?.confidence || 'N/A'}</p>
            </article>
            <article className="card">
              <h3>Failure Report</h3>
              <pre>{JSON.stringify(run?.failureReport || {}, null, 2)}</pre>
            </article>
          </section>
        </div>
      </main>
    </>
  );
}
