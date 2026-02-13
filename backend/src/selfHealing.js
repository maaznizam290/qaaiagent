const cheerio = require('cheerio');

function safeCheerioLoad(html) {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return null;
  }
  try {
    return cheerio.load(html);
  } catch (error) {
    return null;
  }
}

function stampDomSnapshot(html, stage, runId) {
  const safeRunId = String(runId || Date.now());
  const safeStage = String(stage || 'snapshot');
  const $ = safeCheerioLoad(html);
  if ($) {
    const body = $('body');
    if (body.length > 0) {
      body.attr('data-self-healing-stage', safeStage);
      body.attr('data-self-healing-run-id', safeRunId);
      body.attr('data-self-healing-stamped-at', String(Date.now()));
      return $.html();
    }
  }

  const base = String(html || '').trim() || buildFallbackDom(`DOM ${safeStage}`);
  return `${base}\n<!-- self-healing-stage:${safeStage};run:${safeRunId};ts:${Date.now()} -->`;
}

function findFirstExistingSelector($, candidates) {
  for (const selector of candidates) {
    const normalized = normalizeSelectorForDom(selector);
    if (!normalized) {
      continue;
    }
    try {
      const node = $(normalized).first();
      if (node.length > 0) {
        return { selector: normalized, node };
      }
    } catch (error) {
      // Ignore invalid selector candidates.
    }
  }
  return null;
}

function markResolvedSelectors($, selectorMap) {
  const resolution = runSelectorHealing(selectorMap, $.html());
  Object.entries(resolution.perSelector || {}).forEach(([originalSelector, result]) => {
    if (!result || !result.usedSelector) {
      return;
    }
    try {
      const node = $(result.usedSelector).first();
      if (node.length > 0) {
        node.attr('data-self-healing-selector-original', originalSelector);
        node.attr('data-self-healing-selector-used', result.usedSelector);
        node.attr('data-self-healing-selector-mode', result.healed ? 'fallback' : 'primary');
      }
    } catch (error) {
      // Ignore selector that cannot be queried by cheerio.
    }
  });
  return resolution;
}

function applyInstructionEffects(domHtml, instructionDetails, selectorMap, url) {
  const $ = safeCheerioLoad(domHtml);
  if (!$) {
    return {
      html: synthesizeDomAfter(domHtml, '', selectorMap),
      summary: { emailFilled: false, passwordFilled: false, submitMarked: false },
      selectorResolution: runSelectorHealing(selectorMap, ''),
    };
  }

  const selectorResolution = markResolvedSelectors($, selectorMap);

  let emailFilled = false;
  let passwordFilled = false;
  let submitMarked = false;

  if (instructionDetails && instructionDetails.needsLogin) {
    const emailTarget = findFirstExistingSelector($, [
      'input[type="email"]',
      'input[name="email"]',
      'input[name*="email"]',
      'input[id*="email"]',
      'input[name*="user"]',
      'input[id*="user"]',
    ]);
    if (emailTarget) {
      emailTarget.node.attr('value', instructionDetails.emailValue || '{{email}}');
      emailTarget.node.attr('data-self-healing-input', 'email');
      emailFilled = true;
    }

    const passwordTarget = findFirstExistingSelector($, [
      'input[type="password"]',
      'input[name="password"]',
      'input[name*="password"]',
      'input[id*="password"]',
      'input[name*="pass"]',
      'input[id*="pass"]',
    ]);
    if (passwordTarget) {
      passwordTarget.node.attr('value', instructionDetails.passwordValue || '{{password}}');
      passwordTarget.node.attr('data-self-healing-input', 'password');
      passwordFilled = true;
    }

    if (instructionDetails.clickLogin) {
      const loginButton = findFirstExistingSelector($, [
        'button[type="submit"]',
        'input[type="submit"]',
        'button',
        '[role="button"]',
      ]);
      if (loginButton) {
        loginButton.node.attr('data-self-healing-action', 'clicked');
        submitMarked = true;
      }
    }
  }

  const summaryNode = [
    '<section id="self-healing-diagnostic-after" data-self-healing="after-state">',
    `<p>url=${String(url || '')}</p>`,
    `<p>emailFilled=${String(emailFilled)}</p>`,
    `<p>passwordFilled=${String(passwordFilled)}</p>`,
    `<p>submitMarked=${String(submitMarked)}</p>`,
    `<p>resolvedSelectors=${selectorResolution.total}</p>`,
    `<p>fallbackResolved=${selectorResolution.healedCount}</p>`,
    `<p>unresolved=${selectorResolution.unresolvedCount}</p>`,
    '</section>',
  ].join('');

  $('body').attr('data-self-healing-state', 'after-diagnostic');
  $('body').append(summaryNode);

  return {
    html: $.html(),
    summary: { emailFilled, passwordFilled, submitMarked },
    selectorResolution,
  };
}

function buildCurrentStateDom(afterDomHtml, selectorResolution, instructionDetails) {
  const $ = safeCheerioLoad(afterDomHtml);
  if (!$) {
    return `${afterDomHtml}\n<!-- self-healing-current-state -->`;
  }

  const currentNode = [
    '<section id="self-healing-diagnostic-current" data-self-healing="current-state">',
    `<p>needsLogin=${String(Boolean(instructionDetails && instructionDetails.needsLogin))}</p>`,
    `<p>clickLogin=${String(Boolean(instructionDetails && instructionDetails.clickLogin))}</p>`,
    `<p>selectorsPrimary=${selectorResolution.primaryMatchedCount}</p>`,
    `<p>selectorsFallback=${selectorResolution.healedCount}</p>`,
    `<p>selectorsUnresolved=${selectorResolution.unresolvedCount}</p>`,
    `<p>generatedAt=${new Date().toISOString()}</p>`,
    '</section>',
  ].join('');

  $('body').attr('data-self-healing-state', 'current-diagnostic');
  $('body').append(currentNode);
  return $.html();
}

function buildDynamicDomSnapshots({ baseDom, instructionDetails, selectorMap, url, runId }) {
  const source = typeof baseDom === 'string' && baseDom.trim().length > 0 ? baseDom : buildFallbackDom('DOM before');
  const before = stampDomSnapshot(source, 'before', `${runId}-before`);

  const afterEffects = applyInstructionEffects(source, instructionDetails || {}, selectorMap || {}, url);
  const after = stampDomSnapshot(afterEffects.html, 'after', `${runId}-after`);

  const currentRaw = buildCurrentStateDom(afterEffects.html, afterEffects.selectorResolution, instructionDetails || {});
  const current = stampDomSnapshot(currentRaw, 'current', `${runId}-current`);

  return { before, after, current };
}

function buildFallbackDom(label) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Self-Healing Snapshot</title></head><body data-self-healing-fallback="true"><main><h1>${label}</h1></main></body></html>`;
}

function synthesizeDomAfter(domBefore, instruction, selectorMap) {
  const $ = safeCheerioLoad(domBefore);
  if (!$) {
    return buildFallbackDom('DOM after (synthetic)');
  }

  const selectorEntries = Object.entries(selectorMap || {});
  let marked = 0;
  for (const [exactSelector, cfg] of selectorEntries) {
    if (marked >= 5) {
      break;
    }
    const candidate = (cfg && cfg.primary) || exactSelector;
    const normalized = normalizeSelectorForDom(candidate);
    if (!normalized) {
      continue;
    }
    try {
      const node = $(normalized).first();
      if (node.length > 0) {
        node.attr('data-self-healing-mark', 'after');
        node.attr('data-self-healing-selector', String(candidate));
        marked += 1;
      }
    } catch (error) {
      // Ignore invalid selector and continue marking others.
    }
  }

  $('body').attr('data-self-healing-stage', 'after');
  $('body').attr('data-self-healing-instruction', String(instruction || '').slice(0, 160));

  if (marked === 0) {
    $('body').append('<div id="self-healing-marker">synthetic-after-state</div>');
  }

  return $.html();
}

function normalizeSelectorForDom(selector) {
  if (!selector || typeof selector !== 'string') {
    return null;
  }

  const trimmed = selector.trim();
  if (!trimmed) {
    return null;
  }

  // text=... is Playwright-specific and cannot be queried via cheerio CSS selectors.
  if (trimmed.startsWith('text=')) {
    return null;
  }

  return trimmed;
}

function selectorExists($, selector) {
  const normalized = normalizeSelectorForDom(selector);
  if (!normalized) {
    return false;
  }

  try {
    return $(normalized).length > 0;
  } catch (error) {
    return false;
  }
}

function collectDomStats($) {
  const tags = {};
  const ids = new Set();
  const classes = new Set();

  $('body *').each((_, el) => {
    const tag = String(el.tagName || '').toLowerCase();
    if (tag) {
      tags[tag] = (tags[tag] || 0) + 1;
    }

    const id = String((el.attribs && el.attribs.id) || '').trim();
    if (id) {
      ids.add(id);
    }

    const classNames = String((el.attribs && el.attribs.class) || '')
      .split(/\s+/)
      .filter(Boolean);
    classNames.forEach((name) => classes.add(name));
  });

  return { tags, ids: Array.from(ids), classes: Array.from(classes) };
}

function diffArray(before, after) {
  const beforeSet = new Set(before || []);
  const afterSet = new Set(after || []);

  const added = [];
  const removed = [];

  afterSet.forEach((value) => {
    if (!beforeSet.has(value)) {
      added.push(value);
    }
  });
  beforeSet.forEach((value) => {
    if (!afterSet.has(value)) {
      removed.push(value);
    }
  });

  return { added, removed };
}

function diffTagCounts(beforeTags, afterTags) {
  const keys = Array.from(new Set([...Object.keys(beforeTags || {}), ...Object.keys(afterTags || {})]));
  const changed = [];

  keys.forEach((tag) => {
    const before = Number(beforeTags[tag] || 0);
    const after = Number(afterTags[tag] || 0);
    if (before !== after) {
      changed.push({ tag, before, after, delta: after - before });
    }
  });

  return changed;
}

function diffDom(beforeHtml, afterHtml) {
  const before$ = safeCheerioLoad(beforeHtml);
  const after$ = safeCheerioLoad(afterHtml);
  if (!before$ || !after$) {
    return null;
  }

  const before = collectDomStats(before$);
  const after = collectDomStats(after$);

  return {
    ids: diffArray(before.ids, after.ids),
    classes: diffArray(before.classes, after.classes),
    tags: diffTagCounts(before.tags, after.tags),
  };
}

function resolveSelectorEntry(entry, domHtml) {
  const $ = safeCheerioLoad(domHtml);
  if (!$) {
    return {
      usedSelector: null,
      matched: false,
      healed: false,
      attempts: [],
      reason: 'DOM snapshot unavailable',
    };
  }

  const primary = entry && entry.primary ? entry.primary : null;
  const fallbacks = Array.isArray(entry && entry.fallbacks) ? entry.fallbacks : [];
  const candidates = [primary, ...fallbacks].filter(Boolean);
  const attempts = [];

  for (const candidate of candidates) {
    const matched = selectorExists($, candidate);
    attempts.push({ selector: candidate, matched });
    if (matched) {
      return {
        usedSelector: candidate,
        matched: true,
        healed: candidate !== primary,
        attempts,
      };
    }
  }

  return {
    usedSelector: null,
    matched: false,
    healed: false,
    attempts,
  };
}

function runSelectorHealing(selectorMap, domHtml) {
  const entries = Object.entries(selectorMap || {});
  const result = {};

  let healedCount = 0;
  let unresolvedCount = 0;
  let primaryMatchedCount = 0;

  entries.forEach(([exactSelector, config]) => {
    const resolved = resolveSelectorEntry(config, domHtml);
    result[exactSelector] = resolved;

    if (resolved.matched) {
      if (resolved.healed) {
        healedCount += 1;
      } else {
        primaryMatchedCount += 1;
      }
    } else {
      unresolvedCount += 1;
    }
  });

  return {
    perSelector: result,
    healedCount,
    unresolvedCount,
    primaryMatchedCount,
    total: entries.length,
  };
}

function buildHealingDiagnostics({ selectorMap, domBefore, domAfter, domCurrent }) {
  const selectorResolution = runSelectorHealing(selectorMap, domCurrent);
  const domDiff = diffDom(domBefore, domAfter);

  const summary = {
    totalSelectors: selectorResolution.total,
    primaryMatched: selectorResolution.primaryMatchedCount,
    healedWithFallback: selectorResolution.healedCount,
    unresolved: selectorResolution.unresolvedCount,
    domDiffAvailable: Boolean(domDiff),
  };

  return {
    summary,
    selectorResolution,
    domDiff,
  };
}

module.exports = {
  diffDom,
  runSelectorHealing,
  buildHealingDiagnostics,
  buildFallbackDom,
  synthesizeDomAfter,
  stampDomSnapshot,
  buildDynamicDomSnapshots,
};
