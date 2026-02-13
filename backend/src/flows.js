const cheerio = require('cheerio');
const { z } = require('zod');

const frameworkSchema = z.enum(['playwright', 'cypress']);
const flowEventTypeSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'button') {
    return 'click';
  }

  return normalized;
}, z.enum(['navigate', 'click', 'input', 'submit', 'change', 'wait']));

const optionalNormalizedString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) {
      return undefined;
    }
    const t = String(v).trim();
    return t.length > 0 ? t : undefined;
  });

const flowEventSchema = z.object({
  type: flowEventTypeSchema,
  selector: optionalNormalizedString.refine((v) => v === undefined || v.length <= 500, {
    message: 'Selector must be 500 chars or less',
  }),
  value: optionalNormalizedString.refine((v) => v === undefined || v.length <= 4000, {
    message: 'Value must be 4000 chars or less',
  }),
  url: optionalNormalizedString.refine((v) => v === undefined || z.string().url().safeParse(v).success, {
    message: 'Invalid URL format in event',
  }),
  timestamp: z.number().optional(),
});

const createFlowSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    startUrl: optionalNormalizedString.refine((v) => v === undefined || z.string().url().safeParse(v).success, {
      message: 'Invalid startUrl',
    }),
    events: z.union([z.array(flowEventSchema), z.string()]),
  })
  .transform((data) => {
    let events = data.events;
    if (typeof events === 'string') {
      try {
        events = JSON.parse(events);
      } catch (e) {
        events = '__INVALID_JSON__';
      }
    }

    return {
      name: data.name,
      startUrl: data.startUrl,
      events,
    };
  })
  .superRefine((data, ctx) => {
    if (!Array.isArray(data.events)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: 'Events must be a JSON array',
      });
      return;
    }

    if (data.events.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['events'],
        message: 'At least one event is required',
      });
      return;
    }

    data.events.forEach((event, index) => {
      const parsed = flowEventSchema.safeParse(event);
      if (!parsed.success) {
        parsed.error.issues.forEach((issue) => {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['events', index, ...issue.path],
            message: issue.message,
          });
        });
      }
    });
  });

const createAutoFlowSchema = z.object({
  url: z
    .string({ required_error: 'URL is required' })
    .trim()
    .min(1, 'URL is required')
    .url('Invalid URL'),
  instruction: z
    .string({ required_error: 'Instructions are required' })
    .trim()
    .min(1, 'Instructions are required')
    .max(1000, 'Instructions must be 1000 characters or less'),
  framework: frameworkSchema.optional(),
  save: z.boolean().optional(),
  name: z.string().trim().min(2).max(120).optional(),
});

const runSelfHealingSchema = z
  .object({
    flowId: z.string().trim().min(1).optional(),
    url: z.string().trim().url('Invalid URL').optional(),
    instruction: z
      .string({ required_error: 'Please enter the instructions' })
      .trim()
      .min(1, 'Please enter the instructions')
      .max(1000),
    framework: frameworkSchema.optional(),
    domBefore: z.string().optional(),
    domAfter: z.string().optional(),
    domCurrent: z.string().optional(),
    save: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.flowId && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flowId'],
        message: 'Please enter the URL in form of .com or ID',
      });
    }
  });

function selectorCandidates(el) {
  const out = [];

  if (el.id) {
    out.push(`#${el.id}`);
  }

  if (el.name) {
    out.push(`[name="${el.name}"]`);
  }

  if (el.getAttribute('data-testid')) {
    out.push(`[data-testid="${el.getAttribute('data-testid')}"]`);
  }

  if (el.classList && el.classList.length > 0) {
    const cls = Array.from(el.classList).slice(0, 2).join('.');
    if (cls) {
      out.push(`${el.tagName.toLowerCase()}.${cls}`);
    }
  }

  out.push(el.tagName.toLowerCase());
  return out;
}

function mapSelectors(events) {
  const map = {};
  for (const event of events) {
    if (!event.selector) {
      continue;
    }

    const selector = event.selector;
    const candidates = [];
    const idMatch = selector.match(/#([A-Za-z0-9\-_]+)/);
    const nameMatch = selector.match(/\[name="([^"]+)"\]/);

    // Keep the exact recorded selector as primary for transparency/traceability.
    candidates.push(selector);
    if (idMatch) {
      candidates.push(`#${idMatch[1]}`);
    }
    if (nameMatch) {
      candidates.push(`[name="${nameMatch[1]}"]`);
    }

    map[selector] = {
      exactSelector: selector,
      primary: selector,
      fallbacks: Array.from(new Set(candidates.slice(1))),
    };
  }

  return map;
}

function escapedSingle(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapedDouble(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function eventToPlaywright(event, selectorMap) {
  if (event.type === 'navigate' && event.url) {
    return `  await page.goto('${escapedSingle(event.url)}');`;
  }

  if (event.type === 'wait') {
    const waitMs = Number(event.value || 1000);
    return `  await page.waitForTimeout(${Number.isFinite(waitMs) ? waitMs : 1000});`;
  }

  if (!event.selector) {
    return null;
  }

  const mapped = selectorMap[event.selector]?.primary || event.selector;
  if (mapped.startsWith('text=')) {
    const text = mapped.slice(5);
    if (event.type === 'click' || event.type === 'submit') {
      return `  await page.getByText('${escapedSingle(text)}').click();`;
    }
    return null;
  }

  if (event.type === 'click' || event.type === 'submit') {
    return `  await page.click('${escapedSingle(mapped)}');`;
  }

  if (event.type === 'input' || event.type === 'change') {
    return `  await page.fill('${escapedSingle(mapped)}', '${escapedSingle(event.value || '')}');`;
  }

  return null;
}

function eventToCypress(event, selectorMap) {
  if (event.type === 'navigate' && event.url) {
    return `  cy.visit("${escapedDouble(event.url)}");`;
  }

  if (event.type === 'wait') {
    const waitMs = Number(event.value || 1000);
    return `  cy.wait(${Number.isFinite(waitMs) ? waitMs : 1000});`;
  }

  if (!event.selector) {
    return null;
  }

  const mapped = selectorMap[event.selector]?.primary || event.selector;
  if (mapped.startsWith('text=')) {
    const text = mapped.slice(5);
    if (event.type === 'click' || event.type === 'submit') {
      return `  cy.contains("${escapedDouble(text)}").click();`;
    }
    return null;
  }

  if (event.type === 'click' || event.type === 'submit') {
    return `  cy.get("${escapedDouble(mapped)}").click();`;
  }

  if (event.type === 'input' || event.type === 'change') {
    return `  cy.get("${escapedDouble(mapped)}").clear().type("${escapedDouble(event.value || '')}");`;
  }

  return null;
}

function generatePlaywright(flow) {
  const selectorMap = flow.selectorMap;
  const lines = [
    "import { test, expect } from '@playwright/test';",
    '',
    `test('${flow.name}', async ({ page }) => {`,
  ];

  if (flow.startUrl) {
    lines.push(`  await page.goto('${escapedSingle(flow.startUrl)}');`);
  }

  for (let index = 0; index < flow.events.length; index += 1) {
    const event = flow.events[index];
    // Avoid duplicate navigation when first recorded event is same as startUrl.
    if (index === 0 && flow.startUrl && event.type === 'navigate' && event.url === flow.startUrl) {
      continue;
    }
    const line = eventToPlaywright(event, selectorMap);
    if (line) {
      lines.push(line);
    }
  }

  lines.push('});');
  return lines.join('\n');
}

function generateCypress(flow) {
  const selectorMap = flow.selectorMap;
  const lines = [
    `describe('${flow.name}', () => {`,
    "  it('runs recorded flow', () => {",
  ];

  if (flow.startUrl) {
    lines.push(`    cy.visit("${escapedDouble(flow.startUrl)}");`);
  }

  for (let index = 0; index < flow.events.length; index += 1) {
    const event = flow.events[index];
    // Avoid duplicate navigation when first recorded event is same as startUrl.
    if (index === 0 && flow.startUrl && event.type === 'navigate' && event.url === flow.startUrl) {
      continue;
    }
    const line = eventToCypress(event, selectorMap);
    if (line) {
      lines.push(`    ${line.trim()}`);
    }
  }

  lines.push('  });');
  lines.push('});');
  return lines.join('\n');
}

function getAttr(el, name) {
  return String((el.attribs && el.attribs[name]) || '').trim();
}

function getTextFingerprint(el) {
  return [
    getAttr(el, 'id'),
    getAttr(el, 'name'),
    getAttr(el, 'placeholder'),
    getAttr(el, 'type'),
    getAttr(el, 'autocomplete'),
    getAttr(el, 'aria-label'),
  ]
    .join(' ')
    .toLowerCase();
}

function selectorForElement(el) {
  const tag = (el.tagName || 'input').toLowerCase();
  const id = getAttr(el, 'id');
  if (id) {
    return `#${id}`;
  }

  const dataTestId = getAttr(el, 'data-testid');
  if (dataTestId) {
    return `[data-testid="${dataTestId}"]`;
  }

  const name = getAttr(el, 'name');
  if (name) {
    return `${tag}[name="${name}"]`;
  }

  const ariaLabel = getAttr(el, 'aria-label');
  if (ariaLabel) {
    return `${tag}[aria-label="${ariaLabel}"]`;
  }

  const placeholder = getAttr(el, 'placeholder');
  if (placeholder) {
    return `${tag}[placeholder="${placeholder}"]`;
  }

  const className = getAttr(el, 'class')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join('.');
  if (className) {
    return `${tag}.${className}`;
  }

  return tag;
}

function normalizeFrameworkFromInstruction(instruction, fallbackFramework) {
  const lower = instruction.toLowerCase();
  if (lower.includes('cypress')) {
    return 'cypress';
  }
  if (lower.includes('playwright')) {
    return 'playwright';
  }
  return fallbackFramework || 'playwright';
}

function parseInstructionDetails(instruction) {
  const text = instruction || '';
  const lower = text.toLowerCase();

  const emailMatch = text.match(/email\s*[:=]\s*([^\s,]+)/i);
  const passwordMatch = text.match(/password\s*[:=]\s*([^\s,]+)/i);

  return {
    emailValue: emailMatch ? emailMatch[1].trim() : '{{email}}',
    passwordValue: passwordMatch ? passwordMatch[1].trim() : '{{password}}',
    clickLogin: /click.*(login|sign in|log in)|submit/i.test(lower),
    waitAfterLogin: /wait.*(load|page)|wait for/i.test(lower),
    clickCreateDeal: /(create deal|creation deal|new deal)/i.test(lower),
    needsLogin: /(login|sign in|log in|email|password)/i.test(lower),
    requestSelectorsOnly: /(all selectors|provide.*selectors|selectors for)/i.test(lower),
  };
}

function findButtonByKeywords($, keywords) {
  const nodes = $('button, a, [role="button"], input[type="submit"]').toArray();
  for (const node of nodes) {
    const text = ($(node).text() || getAttr(node, 'value') || getAttr(node, 'aria-label') || '').trim().toLowerCase();
    if (!text) {
      continue;
    }
    if (keywords.some((k) => text.includes(k))) {
      return selectorForElement(node);
    }
  }
  return null;
}

function extractLoginSelectorsFromHtml(html) {
  const $ = cheerio.load(html);
  const inputs = $('input').toArray();

  const emailInput = inputs.find((el) => {
    const fp = getTextFingerprint(el);
    return fp.includes('email');
  });

  const usernameInput = inputs.find((el) => {
    const fp = getTextFingerprint(el);
    return fp.includes('user') || fp.includes('login') || fp.includes('username');
  });

  const passwordInput = inputs.find((el) => {
    const fp = getTextFingerprint(el);
    return fp.includes('password') || getAttr(el, 'type').toLowerCase() === 'password';
  });

  let submitButton = null;
  if (passwordInput) {
    const parentForm = $(passwordInput).closest('form');
    if (parentForm && parentForm.length > 0) {
      submitButton = parentForm.find('button, input[type="submit"]').first().get(0) || null;
    }
  }

  if (!submitButton) {
    submitButton = $('button, input[type="submit"]').first().get(0) || null;
  }

  const createDealSelector =
    findButtonByKeywords($, ['create deal', 'new deal', 'deal']) || 'text=Create Deal';
  const loginSelector = submitButton ? selectorForElement(submitButton) : findButtonByKeywords($, ['login', 'sign in']) || 'button[type="submit"]';

  const catalog = [];
  $('input,button,form').slice(0, 40).each((_, el) => {
    catalog.push(selectorForElement(el));
  });

  return {
    emailSelector: emailInput ? selectorForElement(emailInput) : null,
    usernameSelector: usernameInput ? selectorForElement(usernameInput) : null,
    passwordSelector: passwordInput ? selectorForElement(passwordInput) : null,
    submitSelector: loginSelector,
    createDealSelector,
    catalog: Array.from(new Set(catalog)),
  };
}

function buildAutoEvents(url, selectors, details) {
  const events = [{ type: 'navigate', url }];

  if (details.requestSelectorsOnly) {
    return events;
  }

  if (details.needsLogin) {
    if (selectors.emailSelector) {
      events.push({ type: 'input', selector: selectors.emailSelector, value: details.emailValue });
    } else if (selectors.usernameSelector) {
      events.push({ type: 'input', selector: selectors.usernameSelector, value: details.emailValue });
    }

    if (selectors.passwordSelector) {
      events.push({ type: 'input', selector: selectors.passwordSelector, value: details.passwordValue });
    }

    if (details.clickLogin && selectors.submitSelector) {
      events.push({ type: 'submit', selector: selectors.submitSelector });
    }

    if (details.waitAfterLogin) {
      events.push({ type: 'wait', value: '3000' });
    }
  }

  if (details.clickCreateDeal && selectors.createDealSelector) {
    events.push({ type: 'click', selector: selectors.createDealSelector });
  }

  return events;
}

function inferFallbackSelectorsFromInstruction(instruction) {
  const text = String(instruction || '');
  const explicitSelectors = text.match(/([#.][A-Za-z_][A-Za-z0-9\-_]*)|(\[[^\]]+\])/g) || [];

  const fallback = {
    emailSelector: '#email',
    usernameSelector: '#username',
    passwordSelector: '#password',
    submitSelector: 'button[type="submit"]',
    createDealSelector: 'text=Create Deal',
    catalog: [],
  };

  for (const selector of explicitSelectors) {
    const lower = selector.toLowerCase();
    if (lower.includes('email')) {
      fallback.emailSelector = selector;
    } else if (lower.includes('user')) {
      fallback.usernameSelector = selector;
    } else if (lower.includes('password') || lower.includes('pass')) {
      fallback.passwordSelector = selector;
    } else if (lower.includes('deal')) {
      fallback.createDealSelector = selector;
    } else if (lower.includes('submit') || lower.includes('login')) {
      fallback.submitSelector = selector;
    }
  }

  fallback.catalog = [
    fallback.emailSelector,
    fallback.usernameSelector,
    fallback.passwordSelector,
    fallback.submitSelector,
    fallback.createDealSelector,
    'input[type="email"]',
    'input[type="password"]',
  ];

  return fallback;
}

function mergeDetectedSelectors(detected, instruction, details) {
  const inferred = inferFallbackSelectorsFromInstruction(instruction);
  const out = {
    emailSelector: detected.emailSelector || (details.needsLogin ? inferred.emailSelector : null),
    usernameSelector: detected.usernameSelector || (details.needsLogin ? inferred.usernameSelector : null),
    passwordSelector: detected.passwordSelector || (details.needsLogin ? inferred.passwordSelector : null),
    submitSelector: detected.submitSelector || (details.needsLogin ? inferred.submitSelector : null),
    createDealSelector: detected.createDealSelector || (details.clickCreateDeal ? inferred.createDealSelector : null),
    catalog: Array.from(new Set([...(detected.catalog || []), ...(inferred.catalog || [])])),
  };

  return out;
}

module.exports = {
  frameworkSchema,
  createFlowSchema,
  createAutoFlowSchema,
  runSelfHealingSchema,
  selectorCandidates,
  mapSelectors,
  generatePlaywright,
  generateCypress,
  normalizeFrameworkFromInstruction,
  parseInstructionDetails,
  extractLoginSelectorsFromHtml,
  buildAutoEvents,
  mergeDetectedSelectors,
};
