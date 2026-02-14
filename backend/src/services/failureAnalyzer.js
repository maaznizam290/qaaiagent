const DEFAULT_ANALYSIS = {
  rootCause: 'Insufficient failure context',
  failureType: 'Environment',
  explanation: 'The run failed but the analyzer did not receive enough reliable artifacts.',
  suggestedFix: 'Capture richer artifacts (stack trace, console logs, network logs, screenshot, test content) and retry.',
  confidence: 25,
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

const ANALYSIS_RESPONSE_SCHEMA = {
  name: 'failure_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['rootCause', 'failureType', 'explanation', 'suggestedFix', 'confidence'],
    properties: {
      rootCause: { type: 'string' },
      failureType: { type: 'string', enum: ['UI', 'Backend', 'Test Code', 'Environment'] },
      explanation: { type: 'string' },
      suggestedFix: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
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

function normalizeAnalysis(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_ANALYSIS };
  }

  const parsedConfidence = Number(parsed.confidence);
  const normalizedConfidence = Number.isFinite(parsedConfidence)
    ? Math.max(0, Math.min(100, Math.round(parsedConfidence)))
    : DEFAULT_ANALYSIS.confidence;

  const normalizedFailureTypeRaw = String(parsed.failureType || '').trim().toLowerCase();
  const failureTypeMap = {
    ui: 'UI',
    backend: 'Backend',
    'test code': 'Test Code',
    environment: 'Environment',
  };
  const normalizedFailureType = failureTypeMap[normalizedFailureTypeRaw] || DEFAULT_ANALYSIS.failureType;

  const out = {
    rootCause: String(parsed.rootCause || '').trim(),
    failureType: normalizedFailureType,
    explanation: String(parsed.explanation || '').trim(),
    suggestedFix: String(parsed.suggestedFix || '').trim(),
    confidence: normalizedConfidence,
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

  const allowedKeys = ['rootCause', 'failureType', 'explanation', 'suggestedFix', 'confidence'];
  const keys = Object.keys(parsed);
  const hasExactKeys = keys.length === allowedKeys.length && allowedKeys.every((key) => hasOwn(parsed, key));
  if (!hasExactKeys) {
    return { isValid: false, reason: 'Response keys do not match expected structure.' };
  }

  const failureType = String(parsed.failureType || '').trim();
  const confidence = Number(parsed.confidence);
  const validFailureType = ['UI', 'Backend', 'Test Code', 'Environment'].includes(failureType);
  const validConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
  const validStrings = ['rootCause', 'explanation', 'suggestedFix'].every(
    (key) => typeof parsed[key] === 'string' && parsed[key].trim().length > 0
  );

  if (!validStrings) {
    return { isValid: false, reason: 'Response contains empty or invalid string fields.' };
  }
  if (!validFailureType) {
    return { isValid: false, reason: 'failureType is invalid.' };
  }
  if (!validConfidence) {
    return { isValid: false, reason: 'confidence must be a number from 0 to 100.' };
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

function buildFailureAnalysisPrompt(failureReport) {
  const sections = [
    `Test Name:\n${formatArtifactSection(failureReport.testName)}`,
    `Error Message:\n${formatArtifactSection(failureReport.errorMessage)}`,
    `Stack Trace:\n${formatArtifactSection(failureReport.stackTrace)}`,
    `Console Logs:\n${formatArtifactSection(failureReport.consoleLogs)}`,
    `Network Logs:\n${formatArtifactSection(failureReport.networkLogs)}`,
    `Screenshot Description:\n${formatArtifactSection(failureReport.screenshotDescription)}`,
    `Test Code:\n${formatArtifactSection(failureReport.testFileContent)}`,
  ].join('\n\n');

  return [
    'ROLE: Senior QA Failure Triage Assistant',
    'TASK: Analyze the failure report and return one deterministic JSON object.',
    'OUTPUT_RULES:',
    '- Return STRICT JSON only.',
    '- Return EXACTLY these keys: rootCause, failureType, explanation, suggestedFix, confidence.',
    '- failureType must be exactly one of: UI, Backend, Test Code, Environment.',
    '- confidence must be a number from 0 to 100.',
    '- Do not include markdown, code fences, comments, or extra keys.',
    'ANALYSIS_OBJECTIVE:',
    '- Identify the root cause.',
    '- Categorize the failure type.',
    '- Provide a clear explanation.',
    '- Suggest the next best fix.',
    '- Provide a confidence score.',
    '',
    'FAILURE_REPORT:',
    sections,
  ].join('\n');
}

async function analyzeFailureReport(failureReport) {
  const validation = validateFailureReport(failureReport);
  if (!validation.isValid) {
    return buildValidationErrorResponse(validation);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      analysis: {
        ...DEFAULT_ANALYSIS,
        explanation: 'OPENAI_API_KEY is not configured. Returning fallback analysis.',
      },
    };
  }

  const model = process.env.OPENAI_FAILURE_ANALYZER_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(process.env.OPENAI_FAILURE_ANALYZER_TIMEOUT_MS || 15000);
  const prompt = buildFailureAnalysisPrompt(failureReport);
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
              'Return strictly valid JSON with keys rootCause, failureType, explanation, suggestedFix, confidence.',
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
      analysis: normalizeAnalysis(parsed),
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
