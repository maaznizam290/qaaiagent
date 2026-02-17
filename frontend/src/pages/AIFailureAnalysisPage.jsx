import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { Header } from '../components/Header';
import { useAuth } from '../context/AuthContext';

function normalizeConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 'N/A';
  }
  return `${Math.round(num)}%`;
}

function getFailureTypeBadgeClass(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'ui') return 'badge-failure-ui';
  if (type === 'backend') return 'badge-failure-backend';
  if (type === 'test code') return 'badge-failure-test-code';
  return 'badge-failure-environment';
}

export default function AIFailureAnalysisPage() {
  const { token } = useAuth();
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadFileContent, setUploadFileContent] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewReport, setPreviewReport] = useState(null);
  const [uploadedFallback, setUploadedFallback] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('failureReport');
  const [analysisDetail, setAnalysisDetail] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Always start with empty local page state on a fresh mount.
    setUploadFile(null);
    setUploadFileContent('');
    setUploading(false);
    setUploadMessage('');
    setUploadError('');
    setPreviewLoading(false);
    setPreviewError('');
    setPreviewReport(null);
    setUploadedFallback(null);
    setAnalyses([]);
    setSelectedId(null);
    setActiveTab('failureReport');
    setAnalysisDetail(null);
    setAnalysisLoading(false);
    setAnalysisError('');
    setActionLoading('');
    setActionMessage('');
    setActionError('');
    setLoading(false);
    setError('');
  }, []);

  const selected = useMemo(
    () => analyses.find((item) => item.id === selectedId) || analyses[0] || null,
    [analyses, selectedId]
  );
  const effectiveSelected = selected || uploadedFallback;

  useEffect(() => {
    // Clear stale detail/action state whenever selected run changes.
    setAnalysisDetail(null);
    setAnalysisError('');
    setActionLoading('');
    setActionMessage('');
    setActionError('');
  }, [effectiveSelected?.id, effectiveSelected?.testRunId]);

  useEffect(() => {
    if (activeTab !== 'aiAnalysis' || !effectiveSelected?.testRunId) {
      return undefined;
    }

    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError('');
    setAnalysisDetail(null);

    api
      .getFailureAnalysisByRunId(effectiveSelected.testRunId, token)
      .then((result) => {
        if (cancelled) return;
        setAnalysisDetail(result?.analysis || null);
      })
      .catch((e) => {
        if (cancelled) return;
        setAnalysisError(e?.message || 'Unable to load AI analysis');
      })
      .finally(() => {
        if (!cancelled) {
          setAnalysisLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, effectiveSelected?.testRunId, token]);

  async function refreshAnalysesAndSelectRun(runId) {
    const result = await api.listFailureAnalyses(token);
    const list = Array.isArray(result?.analyses) ? result.analyses : [];
    setAnalyses(list);
    if (runId) {
      const match = list.find((item) => Number(item.testRunId) === Number(runId));
      setSelectedId(match?.id || list[0]?.id || null);
      return;
    }
    setSelectedId((prev) => prev || list[0]?.id || null);
  }

  async function handleUploadAnalyze(event) {
    event.preventDefault();
    setUploadMessage('');
    setUploadError('');
    if (!uploadFile || !uploadFileContent) {
      setUploadError('A JSON file is required before upload.');
      return;
    }
    const fileName = String(uploadFile.name || '').toLowerCase();
    const fileType = String(uploadFile.type || '').toLowerCase();
    const isJsonFile = fileName.endsWith('.json') || fileType.includes('json');
    if (!isJsonFile) {
      setUploadError('Please upload a valid .json file.');
      return;
    }
    setUploading(true);
    try {
      const result = await api.uploadFailureAnalysisFile(
        {
          fileName: uploadFile.name,
          fileContent: uploadFileContent,
        },
        token
      );
      setUploadMessage('File analyzed successfully. AI failure analysis generated.');
      setUploadFile(null);
      setUploadFileContent('');
      setPreviewReport(null);
      setUploadedFallback({
        id: `uploaded-${result?.run?.id || Date.now()}`,
        testRunId: result?.run?.id,
        failureReport: result?.run?.failureReport || null,
        analysis: result?.run?.failureAnalysis || null,
      });
      setAnalysisDetail({
        testRunId: result?.run?.id,
        failureReport: result?.run?.failureReport || null,
        analysis: result?.run?.failureAnalysis || null,
      });
      await refreshAnalysesAndSelectRun(result?.run?.id);
      setActiveTab('aiAnalysis');
    } catch (e) {
      setUploadError(e?.message || 'Unable to analyze uploaded file');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileSelection(file) {
    setUploadFile(file || null);
    setUploadFileContent('');
    setPreviewReport(null);
    setPreviewError('');
    setUploadError('');
    setUploadMessage('');

    if (!file) {
      return;
    }

    const fileName = String(file.name || '').toLowerCase();
    const fileType = String(file.type || '').toLowerCase();
    const isJsonFile = fileName.endsWith('.json') || fileType.includes('json');
    if (!isJsonFile) {
      setPreviewError('Only JSON files are allowed.');
      return;
    }

    setPreviewLoading(true);
    try {
      const text = await file.text();
      setUploadFileContent(text);
      const result = await api.previewFailureAnalysisFile({ fileContent: text }, token);
      setPreviewReport(result?.failureReport || null);
    } catch (e) {
      setPreviewError(e?.message || 'Unable to preview detected fields');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runAction(actionKey, apiCall) {
    if (!effectiveSelected?.testRunId) {
      return;
    }
    setActionLoading(actionKey);
    setActionMessage('');
    setActionError('');
    try {
      const result = await apiCall(effectiveSelected.testRunId, token);
      const payload = result?.action?.payload || {};
      if (actionKey === 'patch') {
        setActionMessage(payload.summary || 'Patch suggestion generated.');
      } else if (actionKey === 'ticket') {
        setActionMessage(`Issue ticket created: ${payload.ticketId || 'N/A'}`);
      } else if (actionKey === 'flaky') {
        setActionMessage('Run marked as known flaky.');
      } else if (actionKey === 'rerun') {
        setActionMessage(payload.message || 'Re-run request submitted.');
      } else {
        setActionMessage('Action completed.');
      }
    } catch (e) {
      setActionError(e?.message || 'Action failed');
    } finally {
      setActionLoading('');
    }
  }

  return (
    <>
      <Header />
      <main className="section">
        <div className="container">
          <h1>AI Failure Analysis</h1>
          <p>Automated root-cause insights for failed test runs.</p>

          <section className="card section-compact">
            <h3>Upload Failure Report File</h3>
            <p>Upload a JSON file containing failure artifacts. The backend will analyze it automatically.</p>
            <form className="waitlist-form" onSubmit={handleUploadAnalyze}>
              <label>
                Failure Report JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
                />
              </label>
              {previewLoading && <p>Detecting fields...</p>}
              {previewError && <p className="error">{previewError}</p>}
              {previewReport && (
                <div>
                  <p><strong>Detected Fields Preview</strong></p>
                  <pre>{JSON.stringify(previewReport, null, 2)}</pre>
                </div>
              )}
              <div className="hero-actions">
                <button className="btn btn-primary" type="submit" disabled={uploading}>
                  {uploading ? 'Analyzing...' : 'Upload & Analyze'}
                </button>
              </div>
            </form>
            {uploadMessage && <p className="success">{uploadMessage}</p>}
            {uploadError && <p className="error">{uploadError}</p>}
          </section>

          {loading && <p>Loading analysis...</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !error && (
            <section className="dashboard-grid section-compact">
              <article className="card">
                <h3>Analysis</h3>
                {analyses.length === 0 ? (
                  <p>No failure analysis available yet.</p>
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
                        <p>
                          Type:{' '}
                          <span className={`badge ${getFailureTypeBadgeClass(item.analysis?.failureType)}`}>
                            {item.analysis?.failureType || 'N/A'}
                          </span>
                        </p>
                        <p>Confidence: {normalizeConfidence(item.analysis?.confidence)}</p>
                      </button>
                    ))}
                  </div>
                )}
              </article>

              <article className="card">
                <h3>Failure Analysis Details</h3>
                <>
                  <div className="tab-row">
                    <button
                      type="button"
                      className={`btn ${activeTab === 'failureReport' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setActiveTab('failureReport')}
                    >
                      Failure Report
                    </button>
                    <button
                      type="button"
                      className={`btn ${activeTab === 'aiAnalysis' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setActiveTab('aiAnalysis')}
                    >
                      AI Analysis
                    </button>
                  </div>

                  {activeTab === 'failureReport' && <pre>{JSON.stringify(effectiveSelected?.failureReport || {}, null, 2)}</pre>}

                  {activeTab === 'aiAnalysis' && (
                    <>
                      {analysisLoading && <p>Loading AI analysis...</p>}
                      {analysisError && <p className="error">{analysisError}</p>}
                      {!analysisLoading && !analysisError && !effectiveSelected?.testRunId && (
                        <p className="error">AI analysis is not available for this run.</p>
                      )}
                      {!analysisLoading && !analysisError && effectiveSelected?.testRunId && !analysisDetail?.analysis && (
                        <p className="error">AI analysis is not available for this run.</p>
                      )}
                      {!analysisLoading && !analysisError && analysisDetail?.analysis && (
                        <>
                          <div className="analysis-fields">
                            <p><strong>Root Cause:</strong> {analysisDetail.analysis.rootCause || 'N/A'}</p>
                            <p>
                              <strong>Failure Type:</strong>{' '}
                              <span className={`badge ${getFailureTypeBadgeClass(analysisDetail.analysis.failureType)}`}>
                                {analysisDetail.analysis.failureType || 'N/A'}
                              </span>
                            </p>
                            <p><strong>Impacted Layer:</strong> {analysisDetail.analysis.impactedLayer || 'N/A'}</p>
                            <p><strong>Explanation:</strong> {analysisDetail.analysis.explanation || 'N/A'}</p>
                            <p><strong>Suggested Fix:</strong> {analysisDetail.analysis.suggestedFix || 'N/A'}</p>
                            <p>
                              <strong>Confidence Score:</strong>{' '}
                              {normalizeConfidence(analysisDetail.analysis.confidence)}
                            </p>
                          </div>

                          <div className="analysis-actions">
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={actionLoading === 'patch'}
                              onClick={() => runAction('patch', api.generatePatchSuggestion)}
                            >
                              {actionLoading === 'patch' ? 'Generating...' : 'Generate Patch Suggestion'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={actionLoading === 'ticket'}
                              onClick={() => runAction('ticket', api.createIssueTicket)}
                            >
                              {actionLoading === 'ticket' ? 'Creating...' : 'Create Issue Ticket'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={actionLoading === 'flaky'}
                              onClick={() => runAction('flaky', api.markKnownFlaky)}
                            >
                              {actionLoading === 'flaky' ? 'Marking...' : 'Mark as Known Flaky'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={actionLoading === 'rerun'}
                              onClick={() => runAction('rerun', api.rerunTest)}
                            >
                              {actionLoading === 'rerun' ? 'Submitting...' : 'Re-run Test'}
                            </button>
                          </div>

                          {actionMessage && <p className="success">{actionMessage}</p>}
                          {actionError && <p className="error">{actionError}</p>}
                        </>
                      )}
                    </>
                  )}
                </>
              </article>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
