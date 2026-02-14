import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

function normalizeConfidence(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return 'N/A';
  }
  return raw;
}

export default function AIFailureAnalysisPage() {
  const { token } = useAuth();
  const [analyses, setAnalyses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await api.listFailureAnalyses(token);
        if (cancelled) {
          return;
        }
        const list = Array.isArray(result?.analyses) ? result.analyses : [];
        setAnalyses(list);
        setSelectedId((prev) => prev || list[0]?.id || null);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Unable to load AI failure analyses');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const selected = useMemo(
    () => analyses.find((item) => item.id === selectedId) || analyses[0] || null,
    [analyses, selectedId]
  );

  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>AI Failure Analysis</h1>
          <p>Automated root-cause insights for failed test runs.</p>

          {loading && <p>Loading analyses...</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !error && (
            <section className="dashboard-grid section-compact">
              <article className="card">
                <h3>Analyses</h3>
                {analyses.length === 0 ? (
                  <p>No failure analyses available yet.</p>
                ) : (
                  <div className="runs-list">
                    {analyses.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="card run-card"
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>Run #{item.testRunId}</strong>
                        <p>Type: {item.analysis?.failureType || 'N/A'}</p>
                        <p>Confidence: {normalizeConfidence(item.analysis?.confidence)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </article>

              <article className="card">
                <h3>Failure Analysis Details</h3>
                {selected ? (
                  <>
                    <p>
                      <strong>Root Cause:</strong> {selected.analysis?.rootCause || 'N/A'}
                    </p>
                    <p>
                      <strong>Failure Type:</strong> {selected.analysis?.failureType || 'N/A'}
                    </p>
                    <p>
                      <strong>Explanation:</strong> {selected.analysis?.explanation || 'N/A'}
                    </p>
                    <p>
                      <strong>Suggested Fix:</strong> {selected.analysis?.suggestedFix || 'N/A'}
                    </p>
                    <p>
                      <strong>Confidence:</strong> {normalizeConfidence(selected.analysis?.confidence)}
                    </p>
                    <pre>{JSON.stringify(selected.failureReport || {}, null, 2)}</pre>
                  </>
                ) : (
                  <p>Select an analysis to view details.</p>
                )}
              </article>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
