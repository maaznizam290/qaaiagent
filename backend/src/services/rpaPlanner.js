const { rpaWorkflowSchema } = require('../rpaAgent');

const WORKFLOW_JSON_SCHEMA = {
  name: 'rpa_workflow',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['url', 'steps'],
    properties: {
      url: { type: 'string' },
      steps: {
        type: 'array',
        minItems: 1,
        maxItems: 120,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['goto', 'click', 'type', 'extract', 'wait'] },
            selector: { type: 'string' },
            value: { type: 'string' },
            attribute: { type: 'string' },
          },
        },
      },
    },
  },
};

function parseJsonLoose(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    const first = value.indexOf('{');
    const last = value.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(value.slice(first, last + 1));
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

function normalizeDomain(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  try {
    const candidate = text.includes('://') ? text : `https://${text}`;
    return new URL(candidate).hostname.replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}

function isUrlAllowed(urlText, allowedDomains) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return true;
  }
  try {
    const hostname = new URL(urlText).hostname.replace(/^www\./, '').toLowerCase();
    return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch (error) {
    return false;
  }
}

function extractFirstUrl(text) {
  const input = String(text || '');
  const match = input.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

function splitInstructionLines(instruction) {
  return String(instruction || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+\s*[\)\].,:-]?\s*/, '').trim());
}

function extractQuotedValue(text) {
  const quoted = String(text || '').match(/"([^"]+)"|'([^']+)'/);
  if (!quoted) {
    return null;
  }
  return quoted[1] || quoted[2] || null;
}

function guessTypedValue(line) {
  const quoted = extractQuotedValue(line);
  if (quoted) {
    return quoted;
  }
  const match = String(line || '').match(/\b(?:type|enter|fill)\s+(.+?)\s+(?:in|into|on)\b/i);
  return match ? match[1].trim() : null;
}

function buildRuleBasedWorkflow(instruction) {
  const fallbackUrl = extractFirstUrl(instruction) || 'https://example.com';
  const lines = splitInstructionLines(instruction);
  const steps = [{ action: 'goto', value: fallbackUrl }];
  const searchInputSelector =
    'input[type="search"], input[name*="search" i], input[placeholder*="search" i], input[id*="search" i]';
  const searchButtonSelector =
    'button[type="submit"], button[aria-label*="search" i], button:has-text("Search"), .search-box__button--1oH7';

  let hasActionFromLines = false;
  for (const line of lines) {
    const lower = line.toLowerCase();

    if (/\b(navigate|open|goto|go to)\b/.test(lower) && extractFirstUrl(line)) {
      steps.push({ action: 'goto', value: extractFirstUrl(line) });
      hasActionFromLines = true;
      continue;
    }
    if (/\bclick\b/.test(lower) && /\b(search field|search bar|search input|search box)\b/.test(lower)) {
      steps.push({ action: 'click', selector: searchInputSelector });
      hasActionFromLines = true;
      continue;
    }
    if (/\b(type|enter|fill)\b/.test(lower) && /\b(search field|search bar|search input|search box)\b/.test(lower)) {
      steps.push({
        action: 'type',
        selector: searchInputSelector,
        value: guessTypedValue(line) || 'test',
      });
      hasActionFromLines = true;
      continue;
    }
    if (/\bclick\b/.test(lower) && /\b(search button|search|submit)\b/.test(lower)) {
      steps.push({ action: 'click', selector: searchButtonSelector });
      hasActionFromLines = true;
      continue;
    }
    if (/\b(wait|results|display|load)\b/.test(lower)) {
      steps.push({ action: 'wait', value: '2500' });
      hasActionFromLines = true;
      continue;
    }
    if (/\bextract\b/.test(lower)) {
      steps.push({ action: 'extract', selector: 'body', attribute: 'innerText' });
      hasActionFromLines = true;
    }
  }

  if (!hasActionFromLines) {
    const lower = String(instruction || '').toLowerCase();
    if (lower.includes('login')) {
      steps.push(
        { action: 'type', selector: 'input[type="email"], input[name*="email" i]', value: 'user@example.com' },
        { action: 'type', selector: 'input[type="password"], input[name*="password" i]', value: 'password' },
        { action: 'click', selector: 'button[type="submit"], button:has-text("Login"), button:has-text("Sign in")' }
      );
    } else if (lower.includes('search')) {
      steps.push({ action: 'click', selector: searchInputSelector });
      steps.push({
        action: 'type',
        selector: searchInputSelector,
        value: extractQuotedValue(instruction) || 'test',
      });
      steps.push({ action: 'click', selector: searchButtonSelector });
      steps.push({ action: 'wait', value: '2500' });
    } else {
      steps.push({ action: 'extract', selector: 'title', attribute: 'textContent' });
    }
  }

  return { url: fallbackUrl, steps };
}

function buildFallbackWorkflow(instruction) {
  return buildRuleBasedWorkflow(instruction);
}

function sanitizeWorkflow(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Planner returned invalid workflow payload.');
  }

  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  const normalizedSteps = steps
    .map((step) => ({
      action: String(step?.action || '').trim(),
      selector: typeof step?.selector === 'string' ? step.selector.trim() : undefined,
      value: typeof step?.value === 'string' ? step.value : undefined,
      attribute: typeof step?.attribute === 'string' ? step.attribute.trim() : undefined,
    }))
    .filter((step) => step.action.length > 0);

  const initialUrl = String(raw.url || '').trim();
  const gotoStep = normalizedSteps.find((step) => step.action === 'goto' && step.value);
  const url = initialUrl || gotoStep?.value || extractFirstUrl(JSON.stringify(raw)) || 'https://example.com';

  const withGoto = normalizedSteps.some((step) => step.action === 'goto')
    ? normalizedSteps
    : [{ action: 'goto', value: url }, ...normalizedSteps];

  return {
    url,
    steps: withGoto,
  };
}

async function callOpenAiPlanner(instruction, model, timeoutMs) {
  const apiKey =
    process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.OPENAI_RPA_API_KEY || process.env.OPENAI_FAILURE_ANALYZER_API_KEY;

  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: WORKFLOW_JSON_SCHEMA,
        },
        messages: [
          {
            role: 'system',
            content:
              'You are an RPA planner. Convert user instruction into deterministic browser automation workflow JSON. Preserve exact values from user text. Use actions from this set only: goto, click, type, extract, wait. For wait, set value in milliseconds as a string (e.g., "2500").',
          },
          {
            role: 'user',
            content: instruction,
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return parseJsonLoose(content);
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function planWorkflowFromInstruction({ instruction, allowedDomains = [] }) {
  const model = process.env.OPENAI_RPA_MODEL || 'gpt-4o-mini';
  const timeoutMs = Number(process.env.OPENAI_RPA_TIMEOUT_MS || 20000);
  const normalizedDomains = Array.from(
    new Set((Array.isArray(allowedDomains) ? allowedDomains : []).map(normalizeDomain).filter(Boolean))
  );

  const modelResult = await callOpenAiPlanner(instruction, model, timeoutMs);
  const candidate = modelResult || buildFallbackWorkflow(instruction);
  const workflow = sanitizeWorkflow(candidate);
  const parsed = rpaWorkflowSchema.safeParse(workflow);
  if (!parsed.success) {
    const fallback = buildFallbackWorkflow(instruction);
    const fallbackParsed = rpaWorkflowSchema.safeParse(fallback);
    if (!fallbackParsed.success) {
      throw new Error('Unable to generate a valid RPA workflow.');
    }
    if (!isUrlAllowed(fallbackParsed.data.url, normalizedDomains)) {
      throw new Error('Planned URL is outside allowed domains.');
    }
    return {
      workflow: fallbackParsed.data,
      source: 'fallback',
    };
  }

  if (!isUrlAllowed(parsed.data.url, normalizedDomains)) {
    throw new Error('Planned URL is outside allowed domains.');
  }

  return {
    workflow: parsed.data,
    source: modelResult ? 'openai' : 'fallback',
  };
}

module.exports = {
  planWorkflowFromInstruction,
  normalizeDomain,
  isUrlAllowed,
};
