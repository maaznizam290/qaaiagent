export type LogIssue = {
  category: 'HTTP_500' | 'HTTP_404' | 'SQL_ERROR' | 'VALIDATION_ERROR' | 'AUTH_FAILURE' | 'PERFORMANCE';
  severity: 'error' | 'warning';
  message: string;
  evidence: string;
  line: number;
};

export type LogAnalysisResult = {
  errors: LogIssue[];
  warnings: LogIssue[];
  performanceIssues: LogIssue[];
};

const HTTP_500_RE = /\b(?:http|status|response)?\s*[:=-]?\s*500\b|internal server error|5\d{2}\s+server error/i;
const HTTP_404_RE = /\b(?:http|status|response)?\s*[:=-]?\s*404\b|not found|route not found/i;
const SQL_ERROR_RE = /\bsql(?:ite)?\b.*\b(error|exception|syntax)\b|syntax error at or near|duplicate key|constraint failed|foreign key constraint/i;
const VALIDATION_ERROR_RE = /\bvalidation\b.*\b(error|failed|exception)\b|invalid input|schema validation|required field/i;
const AUTH_FAILURE_RE = /\b(unauthorized|forbidden|authentication failed|auth failed|invalid token|token expired|access denied|login failed)\b|status\s*[:=-]?\s*401|status\s*[:=-]?\s*403/i;

const PERFORMANCE_WARN_RE = /\bslow\b|\btimeout\b|timed out|latency|response time/i;
const PERFORMANCE_MS_RE = /\b(\d+(?:\.\d+)?)\s*ms\b/i;

function pushUnique(target: LogIssue[], item: LogIssue): void {
  const exists = target.some(
    (x) => x.category === item.category && x.evidence === item.evidence && x.line === item.line
  );
  if (!exists) {
    target.push(item);
  }
}

function toIssue(
  category: LogIssue['category'],
  severity: LogIssue['severity'],
  lineText: string,
  lineNumber: number
): LogIssue {
  return {
    category,
    severity,
    message: lineText.trim() || 'Matched log pattern',
    evidence: lineText.trim(),
    line: lineNumber,
  };
}

function detectPerformance(line: string, lineNumber: number): LogIssue | null {
  const lower = line.toLowerCase();
  const hasPerfHint = PERFORMANCE_WARN_RE.test(lower);
  const msMatch = line.match(PERFORMANCE_MS_RE);
  const durationMs = msMatch ? Number(msMatch[1]) : null;
  const exceedsThreshold = Number.isFinite(durationMs as number) && (durationMs as number) >= 1000;

  if (!hasPerfHint && !exceedsThreshold) {
    return null;
  }

  return {
    category: 'PERFORMANCE',
    severity: exceedsThreshold ? 'warning' : 'warning',
    message: 'Potential performance issue detected in logs.',
    evidence: line.trim(),
    line: lineNumber,
  };
}

export function logAnalyzer(logs: string): LogAnalysisResult {
  const text = String(logs || '');
  const lines = text.split(/\r?\n/);

  const errors: LogIssue[] = [];
  const warnings: LogIssue[] = [];
  const performanceIssues: LogIssue[] = [];

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const lineNumber = index + 1;

    if (HTTP_500_RE.test(line)) {
      pushUnique(errors, toIssue('HTTP_500', 'error', line, lineNumber));
    }
    if (HTTP_404_RE.test(line)) {
      pushUnique(errors, toIssue('HTTP_404', 'error', line, lineNumber));
    }
    if (SQL_ERROR_RE.test(line)) {
      pushUnique(errors, toIssue('SQL_ERROR', 'error', line, lineNumber));
    }
    if (VALIDATION_ERROR_RE.test(line)) {
      pushUnique(errors, toIssue('VALIDATION_ERROR', 'error', line, lineNumber));
    }
    if (AUTH_FAILURE_RE.test(line)) {
      pushUnique(errors, toIssue('AUTH_FAILURE', 'error', line, lineNumber));
    }

    const perf = detectPerformance(line, lineNumber);
    if (perf) {
      pushUnique(performanceIssues, perf);
      pushUnique(warnings, perf);
    }
  });

  return {
    errors,
    warnings,
    performanceIssues,
  };
}

