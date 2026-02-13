import { useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';
import { autoFlowSchema } from '../schemas';

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

export default function DashboardPage() {
  const { user, token } = useAuth();

  const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState('');
  const [playwrightSpec, setPlaywrightSpec] = useState('');
  const [cypressSpec, setCypressSpec] = useState('');
  const [selectorMap, setSelectorMap] = useState({});
  const [detectedSelectors, setDetectedSelectors] = useState({});
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleReset() {
    setUrl('');
    setInstruction('');
    setPlaywrightSpec('');
    setCypressSpec('');
    setSelectorMap({});
    setDetectedSelectors({});
    setEvents([]);
    setMessage('');
    setError('');
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const parsed = autoFlowSchema.safeParse({ url, instruction });
    if (!parsed.success) {
      const clientError = parsed.error.issues.map((issue) => issue.message).join(' | ');
      setError(clientError || 'Please provide URL and instructions.');
      return;
    }

    setLoading(true);

    try {
      const normalizedUrl = parsed.data.url;
      const normalizedInstruction = parsed.data.instruction;
      const result = await api.autoGenerateFlow(
        {
          url: normalizedUrl,
          instruction: normalizedInstruction,
          save: true,
          name: `Auto Flow - ${new URL(normalizedUrl).hostname}`,
        },
        token
      );

      setPlaywrightSpec(result.transformedPlaywright || '');
      setCypressSpec(result.transformedCypress || '');
      setSelectorMap(result.selectorMap || {});
      setDetectedSelectors(result.detectedSelectors || {});
      setEvents(result.events || []);

      const msg = result.warning
        ? `Generated with warning: ${result.warning}`
        : 'Generated Playwright/Cypress specs and selector mapping successfully.';
      setMessage(msg);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Unable to generate from URL and instruction'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>Dashboard</h1>
          <p>Welcome, {user?.name}. URL + instruction automation is ready.</p>
          <p>
            Need diagnostics? Open <Link to="/self-healing">Self-Healing Engine</Link>.
          </p>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>TestFlux Script Engine</h3>
              <p>Paste only URL and plain-language instructions. No events JSON required.</p>

              <form className="waitlist-form" onSubmit={handleGenerate}>
                <label>
                  URL *
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </label>

                <label>
                  Instructions *
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    rows={8}
                    required
                  />
                </label>

                <div className="hero-actions">
                  <button className="btn btn-primary" type="submit" disabled={loading}>
                    {loading ? 'Generating...' : 'Generate'}
                  </button>
                  <button className="btn btn-outline" type="button" onClick={handleReset} disabled={loading}>
                    Reset
                  </button>
                </div>
              </form>

              {message && <p className="success">{message}</p>}
              {error && <p className="error">{error}</p>}
            </article>

            <article className="card">
              <h3>Intelligent Selector Mapping</h3>
              <pre>{JSON.stringify(selectorMap, null, 2) || '{}'}</pre>

              <h3>Detected Selectors</h3>
              <pre>{JSON.stringify(detectedSelectors, null, 2) || '{}'}</pre>

              <h3>Generated Events</h3>
              <pre>{JSON.stringify(events, null, 2) || '[]'}</pre>
            </article>
          </section>

          <section className="dashboard-grid section-compact">
            <article className="card">
              <h3>Transformed Spec - Playwright</h3>
              <pre>{playwrightSpec || 'Generate to view Playwright script.'}</pre>
            </article>
            <article className="card">
              <h3>Transformed Spec - Cypress</h3>
              <pre>{cypressSpec || 'Generate to view Cypress script.'}</pre>
            </article>
          </section>
        </div>
      </main>
    </>
  );
}
