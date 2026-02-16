const DEFAULT_ANALYSIS = {
  rootCause: 'Insufficient failure context',
  failureType: 'Environment',
  explanation: 'The run failed but the analyzer did not receive enough reliable artifacts.',
  suggestedFix: 'Capture richer artifacts (stack trace, console logs, network logs, screenshot, test content) and retry.',
  confidence: 25,
  impactedLayer: 'Execution Environment',
  quickActions: ['Capture complete failure artifacts and rerun once.'],
  failureCategory: 'Environment',
  severityLevel: 'medium',
};

const REQUIRED_FAILURE_REPORT_FIELDS = [
  'testName',
  'errorMessage',
  'stackTrace',
  'consoleLogs',
  'networkLogs',
  'screenshotDescription',
  'testFileContent',
];

const FAILURE_TYPES = ['UI', 'Backend', 'Test Code', 'Environment'];

const COMMON_FAILURE_KEYWORDS = [
  'timeout',
  'timed out',
  'selector',
  'element not found',
  'assertion',
  'expect',
  'null reference',
  'undefined',
  'network error',
  'connection refused',
  '500',
  '502',
  '503',
  '504',
  '401',
  '403',
  '404',
  'flaky',
  'race condition',
  'database',
  'deadlock',
  'stale element',
];

const ANALYSIS_RESPONSE_SCHEMA = {
  name: 'failure_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['rootCause', 'failureType', 'explanation', 'suggestedFix', 'confidence', 'impactedLayer', 'quickActions'],
    properties: {
      rootCause: { type: 'string' },
      failureType: { type: 'string', enum: FAILURE_TYPES },
      explanation: { type: 'string' },
      suggestedFix: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      impactedLayer: { type: 'string' },
      quickActions: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: { type: 'string' },
      },
    },
  },
};

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function validateFailureReport(failureReport) {
  if (!failureReport || typeof failureReport !== 'object' || Array.isArray(failureReport)) {
    return {
      isValid: false,
      missingFields: [...REQUIRED_FAILURE_REPORT_FIELDS],
      details: 'failureReport must be a plain object.',
    };
  }

  const missingFields = REQUIRED_FAILURE_REPORT_FIELDS.filter(
    (field) => !hasOwn(failureReport, field) || failureReport[field] === undefined || failureReport[field] === null
  );

  return {
    isValid: missingFields.length === 0,
    missingFields,
    details: missingFields.length > 0 ? 'Required failureReport fields are missing.' : null,
  };
}

function buildValidationErrorResponse(validation) {
  return {
    ok: false,
    error: {
      code: 'INVALID_FAILURE_REPORT',
      message: validation.details || 'Invalid failure report payload.',
      missingFields: validation.missingFields || [],
    },
    analysis: null,
  };
}

function buildApiErrorResponse({ code, message, requestId = null, status = null }) {
  return {
    ok: false,
    error: {
      code,
      message,
      requestId,
      status,
    },
    analysis: null,
  };
}

function safeParseJson(content) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

function normalizeArrayStrings(value) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value];
  }
  return [];
}

function trimText(value, maxChars) {
  const text = String(value || '').trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)} ...[truncated]`;
}

function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const raw of entries) {
    const value = String(raw || '').trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function trimLogEntries(entries, maxEntries = 40, maxCharsPerEntry = 500) {
  return dedupeEntries(entries)
    .slice(0, maxEntries)
    .map((entry) => trimText(entry, maxCharsPerEntry));
}

function detectHttpStatusErrors({ errorMessage, consoleLogs, networkLogs }) {
  const text = [errorMessage, ...consoleLogs, ...networkLogs].join('\n');
  const matches = [...text.matchAll(/\b([45]\d{2})\b/g)];
  const statuses = Array.from(new Set(matches.map((m) => Number(m[1]))));
  return statuses.filter((code) => code >= 400 && code <= 599);
}

function detectFailureKeywords({ errorMessage, stackTrace, consoleLogs, networkLogs }) {
  const haystack = [errorMessage, stackTrace, ...consoleLogs, ...networkLogs].join('\n').toLowerCase();
  return COMMON_FAILURE_KEYWORDS.filter((keyword) => haystack.includes(keyword));
}

function inferFailureCategory({ httpStatusErrors, keywords }) {
  const hasServerError = httpStatusErrors.some((status) => status >= 500);
  const hasClientError = httpStatusErrors.some((status) => status >= 400 && status < 500);
  const hasBackendKeyword = keywords.some(
    (k) => ['database', 'deadlock', 'network error', 'connection refused', '500', '502', '503', '504'].includes(k)
  );
  const hasUiKeyword = keywords.some((k) => ['selector', 'element not found', 'stale element'].includes(k));
  const hasTestKeyword = keywords.some((k) => ['assertion', 'expect', 'flaky', 'race condition'].includes(k));

  if (hasServerError || hasClientError || hasBackendKeyword) {
    return 'Backend';
  }
  if (hasUiKeyword) {
    return 'UI';
  }
  if (hasTestKeyword) {
    return 'Test Code';
  }
  return 'Environment';
}

function inferImpactedLayer(failureCategory, keywords) {
  if (failureCategory === 'UI') {
    return 'Frontend UI';
  }
  if (failureCategory === 'Backend') {
    if (keywords.includes('database') || keywords.includes('deadlock')) {
      return 'Database';
    }
    return 'API Service';
  }
  if (failureCategory === 'Test Code') {
    return 'Test Automation';
  }
  return 'Execution Environment';
}

function inferSeverityLevel({ httpStatusErrors, keywords }) {
  if (httpStatusErrors.some((status) => status >= 500) || keywords.includes('deadlock')) {
    return 'high';
  }
  if (httpStatusErrors.some((status) => status >= 400 && status < 500) || keywords.includes('timeout') || keywords.includes('timed out')) {
    return 'medium';
  }
  return 'low';
}

function preprocessFailureReport(failureReport) {
  const consoleLogs = trimLogEntries(normalizeArrayStrings(failureReport.consoleLogs));
  const networkLogs = trimLogEntries(normalizeArrayStrings(failureReport.networkLogs), 50, 600);
  const processedReport = {
    ...failureReport,
    testName: trimText(failureReport.testName, 200),
    errorMessage: trimText(failureReport.errorMessage, 1500),
    stackTrace: trimText(failureReport.stackTrace, 6000),
    consoleLogs,
    networkLogs,
    screenshotDescription: trimText(failureReport.screenshotDescription, 2000),
    testFileContent: trimText(failureReport.testFileContent, 12000),
  };

  const httpStatusErrors = detectHttpStatusErrors({
    errorMessage: processedReport.errorMessage,
    consoleLogs: processedReport.consoleLogs,
    networkLogs: processedReport.networkLogs,
  });
  const commonFailureKeywords = detectFailureKeywords({
    errorMessage: processedReport.errorMessage,
    stackTrace: processedReport.stackTrace,
    consoleLogs: processedReport.consoleLogs,
    networkLogs: processedReport.networkLogs,
  });
  const failureCategory = inferFailureCategory({
    httpStatusErrors,
    keywords: commonFailureKeywords,
  });
  const impactedLayer = inferImpactedLayer(failureCategory, commonFailureKeywords);
  const severityLevel = inferSeverityLevel({
    httpStatusErrors,
    keywords: commonFailureKeywords,
  });

  return {
    report: processedReport,
    signals: {
      httpStatusErrors,
      commonFailureKeywords,
    },
    tags: {
      failureCategory,
      impactedLayer,
      severityLevel,
    },
  };
}

function normalizeFailureType(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  const mapped = {
    ui: 'UI',
    backend: 'Backend',
    'test code': 'Test Code',
    environment: 'Environment',
  }[raw];
  return mapped || fallback;
}

function normalizeQuickActions(value) {
  const list = Array.isArray(value)
    ? value.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (list.length === 0) {
    return [...DEFAULT_ANALYSIS.quickActions];
  }
  return dedupeEntries(list).slice(0, 5);
}

function normalizeAnalysis(parsed, tags = null) {
  if (!parsed || typeof parsed !== 'object') {
    return {
      ...DEFAULT_ANALYSIS,
      failureCategory: tags?.failureCategory || DEFAULT_ANALYSIS.failureCategory,
      impactedLayer: tags?.impactedLayer || DEFAULT_ANALYSIS.impactedLayer,
      severityLevel: tags?.severityLevel || DEFAULT_ANALYSIS.severityLevel,
    };
  }

  const parsedConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(parsedConfidence)
    ? Math.max(0, Math.min(100, Math.round(parsedConfidence)))
    : DEFAULT_ANALYSIS.confidence;
  const failureType = normalizeFailureType(parsed.failureType, tags?.failureCategory || DEFAULT_ANALYSIS.failureType);
  const impactedLayer = String(parsed.impactedLayer || '').trim() || tags?.impactedLayer || DEFAULT_ANALYSIS.impactedLayer;
  const quickActions = normalizeQuickActions(parsed.quickActions);

  const out = {
    rootCause: String(parsed.rootCause || '').trim(),
    failureType,
    explanation: String(parsed.explanation || '').trim(),
    suggestedFix: String(parsed.suggestedFix || '').trim(),
    confidence,
    impactedLayer,
    quickActions,
    failureCategory: failureType,
    severityLevel: tags?.severityLevel || DEFAULT_ANALYSIS.severityLevel,
  };

  if (!out.rootCause) out.rootCause = DEFAULT_ANALYSIS.rootCause;
  if (!out.explanation) out.explanation = DEFAULT_ANALYSIS.explanation;
  if (!out.suggestedFix) out.suggestedFix = DEFAULT_ANALYSIS.suggestedFix;
  return out;
}

function validateAiAnalysisStructure(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { isValid: false, reason: 'Response is not a JSON object.' };
  }

  const allowedKeys = ['rootCause', 'failureType', 'explanation', 'suggestedFix', 'confidence', 'impactedLayer', 'quickActions'];
  const keys = Object.keys(parsed);
  const hasExactKeys = keys.length === allowedKeys.length && allowedKeys.every((key) => hasOwn(parsed, key));
  if (!hasExactKeys) {
    return { isValid: false, reason: 'Response keys do not match expected structure.' };
  }

  const failureType = String(parsed.failureType || '').trim();
  const confidence = Number(parsed.confidence);
  const impactedLayer = String(parsed.impactedLayer || '').trim();
  const validFailureType = FAILURE_TYPES.includes(failureType);
  const validConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
  const validStrings = ['rootCause', 'explanation', 'suggestedFix'].every(
    (key) => typeof parsed[key] === 'string' && parsed[key].trim().length > 0
  );
  const validQuickActions = Array.isArray(parsed.quickActions)
    && parsed.quickActions.length > 0
    && parsed.quickActions.every((x) => typeof x === 'string' && x.trim().length > 0);

  if (!validStrings) {
    return { isValid: false, reason: 'Response contains empty or invalid string fields.' };
  }
  if (!validFailureType) {
    return { isValid: false, reason: 'failureType is invalid.' };
  }
  if (!validConfidence) {
    return { isValid: false, reason: 'confidence must be a number from 0 to 100.' };
  }
  if (!impactedLayer) {
    return { isValid: false, reason: 'impactedLayer must be a non-empty string.' };
  }
  if (!validQuickActions) {
    return { isValid: false, reason: 'quickActions must be a non-empty array of strings.' };
  }

  return { isValid: true, reason: null };
}

function formatArtifactSection(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[none]';
    }
    return value.map((item) => `- ${String(item)}`).join('\n');
  }

  const text = String(value || '').trim();
  return text.length > 0 ? text : '[none]';
}

function buildFailureAnalysisPrompt(preprocessed) {
  const { report, signals, tags } = preprocessed;
  const sections = [
    '=== ARTIFACT: TEST NAME ===',
    formatArtifactSection(report.testName),
    '=== ARTIFACT: ERROR MESSAGE ===',
    formatArtifactSection(report.errorMessage),
    '=== ARTIFACT: STACK TRACE ===',
    formatArtifactSection(report.stackTrace),
    '=== ARTIFACT: CONSOLE LOGS ===',
    formatArtifactSection(report.consoleLogs),
    '=== ARTIFACT: NETWORK LOGS ===',
    formatArtifactSection(report.networkLogs),
    '=== ARTIFACT: SCREENSHOT DESCRIPTION ===',
    formatArtifactSection(report.screenshotDescription),
    '=== ARTIFACT: TEST CODE ===',
    formatArtifactSection(report.testFileContent),
  ].join('\n\n');

  return [
    'ROLE: Senior QA Failure Triage Assistant',
    'TASK: Analyze the failure report and return one deterministic JSON object.',
    'OUTPUT_RULES:',
    '- Return STRICT JSON only.',
    '- Return EXACTLY these keys: rootCause, failureType, explanation, suggestedFix, confidence, impactedLayer, quickActions.',
    '- failureType must be exactly one of: UI, Backend, Test Code, Environment.',
    '- confidence must be a number from 0 to 100.',
    '- impactedLayer must be a concise non-empty string.',
    '- quickActions must be an array of 1 to 5 concise remediation steps.',
    '- Do not include markdown, code fences, comments, or extra keys.',
    'ANALYSIS_OBJECTIVE:',
    '- Do not summarize artifacts only; reason from evidence and categorize.',
    '- Correlate console logs and network logs with screenshot state before deciding root cause.',
    '- If logs and screenshot conflict, explain the conflict and choose the most likely failureType.',
    '- Identify the root cause.',
    '- Categorize the failure type.',
    '- Provide a clear explanation.',
    '- Suggest the next best fix.',
    '- Provide a confidence score.',
    '- Identify impactedLayer.',
    '- Provide quickActions.',
    '',
    'PREPROCESSING_METADATA:',
    `failureCategory: ${tags.failureCategory}`,
    `impactedLayer: ${tags.impactedLayer}`,
    `severityLevel: ${tags.severityLevel}`,
    `httpStatusErrors: ${JSON.stringify(signals.httpStatusErrors)}`,
    `commonFailureKeywords: ${JSON.stringify(signals.commonFailureKeywords)}`,
    '',
    'FAILURE_REPORT_ARTIFACTS:',
    sections,
  ].join('\n');
}

async function analyzeFailureReport(failureReport) {
  const validation = validateFailureReport(failureReport);
  if (!validation.isValid) {
    return buildValidationErrorResponse(validation);
  }

  const preprocessed = preprocessFailureReport(failureReport);
  const apiKey =
    process.env.OPENAI_API_KEY
    || process.env.OPENAI_KEY
    || process.env.OPENAI_FAILURE_ANALYZER_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      analysis: {
        ...DEFAULT_ANALYSIS,
        failureType: preprocessed.tags.failureCategory,
        failureCategory: preprocessed.tags.failureCategory,
        impactedLayer: preprocessed.tags.impactedLayer,
        severityLevel: preprocessed.tags.severityLevel,
        explanation: 'OPENAI_API_KEY is not configured. Returning fallback analysis.',
      },
    };
  }

  const model = process.env.OPENAI_FAILURE_ANALYZER_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(process.env.OPENAI_FAILURE_ANALYZER_TIMEOUT_MS || 15000);
  const prompt = buildFailureAnalysisPrompt(preprocessed);
  const maxAttempts = 2;
  let lastInvalidRequestId = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Reason over artifacts, correlate logs with screenshot state, categorize failure type, and return strictly valid JSON with keys rootCause, failureType, explanation, suggestedFix, confidence, impactedLayer, quickActions.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: ANALYSIS_RESPONSE_SCHEMA,
          },
        }),
      });

      const requestId = response.headers.get('x-request-id')
        || response.headers.get('openai-request-id')
        || null;
      if (requestId) {
        console.info(`[failureAnalyzer] OpenAI request_id=${requestId} attempt=${attempt}`);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        return buildApiErrorResponse({
          code: 'OPENAI_API_ERROR',
          message: `OpenAI request failed (${response.status}): ${errorBody.slice(0, 300)}`,
          requestId,
          status: response.status,
        });
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content || '';
      const parsed = safeParseJson(content);
      if (!parsed) {
        lastInvalidRequestId = requestId;
        if (attempt < maxAttempts) {
          continue;
        }
        return buildApiErrorResponse({
          code: 'OPENAI_INVALID_RESPONSE',
          message: 'OpenAI returned invalid JSON after retry.',
          requestId: requestId || lastInvalidRequestId,
          status: response.status,
        });
      }

      const structureValidation = validateAiAnalysisStructure(parsed);
      if (!structureValidation.isValid) {
        lastInvalidRequestId = requestId;
        if (attempt < maxAttempts) {
          continue;
        }
        return buildApiErrorResponse({
          code: 'OPENAI_INVALID_RESPONSE',
          message: `OpenAI JSON structure is invalid after retry: ${structureValidation.reason}`,
          requestId: requestId || lastInvalidRequestId,
          status: response.status,
        });
      }

      return {
        ok: true,
        analysis: normalizeAnalysis(parsed, preprocessed.tags),
        requestId,
      };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return buildApiErrorResponse({
          code: 'OPENAI_TIMEOUT',
          message: `OpenAI request timed out after ${timeoutMs}ms.`,
        });
      }
      return buildApiErrorResponse({
        code: 'OPENAI_REQUEST_FAILED',
        message: error?.message || 'OpenAI request failed.',
      });
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  return buildApiErrorResponse({
    code: 'OPENAI_INVALID_RESPONSE',
    message: 'OpenAI returned invalid response.',
    requestId: lastInvalidRequestId,
  });
}

module.exports = {
  analyzeFailureReport,
  normalizeAnalysis,
  validateFailureReport,
};
