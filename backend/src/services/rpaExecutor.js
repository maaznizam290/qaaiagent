const fs = require('fs');
const path = require('path');

const { isUrlAllowed, normalizeDomain } = require('./rpaPlanner');

let playwrightLib = null;
function getPlaywright() {
  if (playwrightLib) {
    return playwrightLib;
  }
  try {
    // Lazy load to keep server boot stable even when playwright is not installed.
    playwrightLib = require('playwright');
    return playwrightLib;
  } catch (error) {
    return null;
  }
}

const screenshotsDir = path.join(__dirname, '..', '..', 'data', 'rpa-screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeAllowedDomains(domains) {
  return Array.from(new Set((domains || []).map(normalizeDomain).filter(Boolean)));
}

function pushLog(logs, onUpdate, status, level, message, meta = {}) {
  const entry = {
    at: nowIso(),
    level,
    message,
    ...meta,
  };
  logs.push(entry);
  if (typeof onUpdate === 'function') {
    Promise.resolve(onUpdate({ status, logs })).catch(() => {});
  }
}

async function executeSingleStep({
  page,
  step,
  stepIndex,
  workflowId,
  workflowUrl,
  screenshots,
  extractedData,
  allowedDomains,
}) {
  const action = String(step?.action || '').toLowerCase();
  const selector = step?.selector;
  const value = step?.value;
  const attribute = step?.attribute;

  if (action === 'goto') {
    if (!value) {
      throw new Error(`Step ${stepIndex + 1}: goto requires value (URL).`);
    }
    if (!isUrlAllowed(value, allowedDomains)) {
      throw new Error(`Step ${stepIndex + 1}: URL domain is not allowed.`);
    }
    await page.goto(value, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!isUrlAllowed(page.url(), allowedDomains)) {
      throw new Error(`Step ${stepIndex + 1}: Redirected to blocked domain.`);
    }
  } else if (action === 'click') {
    if (!selector) {
      throw new Error(`Step ${stepIndex + 1}: click requires selector.`);
    }
    if (!isUrlAllowed(page.url(), allowedDomains)) {
      throw new Error(`Step ${stepIndex + 1}: Current page domain is blocked.`);
    }

    const clickEl = page.locator(selector).first();
    await clickEl.waitFor({ state: 'visible', timeout: 12000 });
    await clickEl.scrollIntoViewIfNeeded();

    const selectorLower = String(selector || '').toLowerCase();
    const workflowUrlLower = String(workflowUrl || '').toLowerCase();
    const isSearchClick = selectorLower.includes('search');
    const isDarazWorkflow = workflowUrlLower.includes('daraz');

    if (isSearchClick || isDarazWorkflow) {
      await Promise.all([
        page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
        clickEl.click({ timeout: 12000 }),
      ]);

      const darazResultsSelector = "div[data-qa-locator='product-item']";
      let resultsReady = false;
      try {
        await page.waitForSelector(darazResultsSelector, { timeout: 15000 });
        await page.waitForFunction(() => {
          const items = document.querySelectorAll("div[data-qa-locator='product-item']");
          return items.length > 0;
        });
        resultsReady = true;
      } catch (error) {
        resultsReady = false;
      }

      if (!resultsReady) {
        await page
          .waitForFunction(() => {
            return window.location.href.toLowerCase().includes('search');
          }, { timeout: 15000 })
          .catch(() => {});
      }

      const autoExtracted = await page
        .evaluate(() => {
          const items = Array.from(document.querySelectorAll("div[data-qa-locator='product-item']"));
          if (!items.length) {
            return null;
          }

          const titles = items
            .map((item) => {
              const titleNode =
                item.querySelector('[data-qa-locator="product-item-title"]')
                || item.querySelector('a[title]')
                || item.querySelector('h2')
                || item.querySelector('h3')
                || item.querySelector('a');
              const text = titleNode?.getAttribute?.('title') || titleNode?.textContent || '';
              return String(text || '').trim();
            })
            .filter(Boolean)
            .slice(0, 10);

          return {
            resultCount: items.length,
            titles,
            pageUrl: window.location.href,
          };
        })
        .catch(() => null);

      if (autoExtracted) {
        extractedData.push({
          step: stepIndex + 1,
          selector,
          attribute: 'searchResults',
          value: autoExtracted,
          pageUrl: page.url(),
        });
      }

      await page.waitForTimeout(1500);
    } else {
      await clickEl.click({ timeout: 12000 });
    }
  } else if (action === 'type') {
    if (!selector) {
      throw new Error(`Step ${stepIndex + 1}: type requires selector.`);
    }
    if (!isUrlAllowed(page.url(), allowedDomains)) {
      throw new Error(`Step ${stepIndex + 1}: Current page domain is blocked.`);
    }
    const element = page.locator(selector).first();
    const textValue = String(value || '');
    await element.waitFor({ state: 'visible', timeout: 12000 });
    await element.scrollIntoViewIfNeeded();
    await element.click({ timeout: 12000 });
    await element.fill('', { timeout: 12000 });
    await element.type(textValue, { delay: 50, timeout: 12000 });

    await page
      .waitForFunction(
        ({ sel, val }) => {
          const candidates = Array.from(document.querySelectorAll(sel));
          return candidates.some((el) => {
            const currentValue = typeof el.value === 'string' ? el.value : '';
            return currentValue === val;
          });
        },
        { sel: selector, val: textValue },
        { timeout: 6000 }
      )
      .catch(async () => {
        const current = await element.inputValue().catch(() => '');
        if (current === textValue) {
          return;
        }
        await element.evaluate((el, val) => {
          if (typeof el.value === 'string') {
            el.value = val;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, textValue);
      });

    await element.evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, textValue);

    await element.evaluate((el) => el.blur());
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.waitForTimeout(500);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const typed = await element.inputValue();
    console.log('Typed value:', typed);
  } else if (action === 'extract') {
    if (!selector) {
      throw new Error(`Step ${stepIndex + 1}: extract requires selector.`);
    }
    if (!isUrlAllowed(page.url(), allowedDomains)) {
      throw new Error(`Step ${stepIndex + 1}: Current page domain is blocked.`);
    }
    const extractedValue = await page.$eval(
      selector,
      (el, attr) => {
        if (attr === 'innerText') {
          return el.innerText;
        }
        if (attr === 'textContent') {
          return el.textContent;
        }
        if (attr) {
          return el.getAttribute(attr);
        }
        return el.textContent;
      },
      attribute || null
    );
    extractedData.push({
      step: stepIndex + 1,
      selector,
      attribute: attribute || 'textContent',
      value: extractedValue,
      pageUrl: page.url(),
    });
  } else if (action === 'wait') {
    const waitMs = Number.parseInt(String(value || '2000'), 10);
    const safeWaitMs = Number.isFinite(waitMs) ? Math.min(Math.max(waitMs, 200), 30000) : 2000;
    await page.waitForTimeout(safeWaitMs);
  } else {
    throw new Error(`Step ${stepIndex + 1}: Unsupported action "${action}".`);
  }

  const screenshotName = `${workflowId}-step-${stepIndex + 1}.png`;
  const screenshotPath = path.join(screenshotsDir, screenshotName);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  screenshots.push({
    step: stepIndex + 1,
    action,
    fileName: screenshotName,
    path: `/api/rpa-agent/screenshots/${screenshotName}`,
  });
}

async function executeWorkflow({
  workflowId,
  workflow,
  allowedDomains = [],
  stepRetries = 1,
  maxExecutionMs = 120000,
  onUpdate,
}) {
  const playwright = getPlaywright();
  if (!playwright?.chromium) {
    throw new Error('Playwright is not installed. Run npm install playwright in backend.');
  }

  const logs = [];
  const screenshots = [];
  const extractedData = [];
  const consoleLogs = [];
  const normalizedDomains = normalizeAllowedDomains(allowedDomains);

  let browser = null;
  let status = 'running';
  const startedAt = nowIso();

  function emit(level, message, meta = {}) {
    pushLog(logs, onUpdate, status, level, message, meta);
  }

  const run = async () => {
    emit('info', 'Starting RPA execution', { workflowId, maxExecutionMs });
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      const log = {
        at: nowIso(),
        type: msg.type(),
        text: msg.text(),
      };
      consoleLogs.push(log);
      emit('console', log.text, { type: log.type });
    });

    page.on('pageerror', (error) => {
      emit('error', `Page error: ${error.message}`);
    });

    for (let index = 0; index < workflow.steps.length; index += 1) {
      const step = workflow.steps[index];
      let done = false;
      let attempt = 0;

      while (!done && attempt <= stepRetries) {
        attempt += 1;
        emit('info', `Executing step ${index + 1}/${workflow.steps.length}`, {
          action: step.action,
          attempt,
        });
        try {
          await executeSingleStep({
            page,
            step,
            stepIndex: index,
            workflowId,
            workflowUrl: workflow.url,
            screenshots,
            extractedData,
            allowedDomains: normalizedDomains,
          });
          done = true;
          emit('info', `Step ${index + 1} completed`, { action: step.action });
        } catch (error) {
          const isLastAttempt = attempt > stepRetries;
          emit('warn', `Step ${index + 1} failed`, {
            action: step.action,
            error: error.message,
            attempt,
            willRetry: !isLastAttempt,
          });
          if (isLastAttempt) {
            throw error;
          }
          await wait(400 * attempt);
        }
      }
    }

    if (extractedData.length === 0) {
      const fallbackSnapshot = await page
        .evaluate(() => {
          const h1 = document.querySelector('h1')?.textContent || '';
          const h2 = document.querySelector('h2')?.textContent || '';
          const bodyText = (document.body?.innerText || '').trim().slice(0, 400);
          return {
            title: document.title || '',
            url: window.location.href,
            headings: [h1, h2].map((x) => String(x || '').trim()).filter(Boolean),
            bodyPreview: bodyText,
          };
        })
        .catch(() => null);

      if (fallbackSnapshot) {
        extractedData.push({
          step: workflow.steps.length,
          selector: 'document',
          attribute: 'pageSnapshot',
          value: fallbackSnapshot,
          pageUrl: page.url(),
        });
      }
    }

    status = 'completed';
    emit('info', 'RPA execution completed');
    return {
      status,
      startedAt,
      completedAt: nowIso(),
      logs,
      screenshots,
      consoleLogs,
      extractedData,
    };
  };

  try {
    const result = await Promise.race([
      run(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${maxExecutionMs}ms`)), maxExecutionMs)
      ),
    ]);
    return result;
  } catch (error) {
    status = 'failed';
    emit('error', `RPA execution failed: ${error.message}`);
    return {
      status,
      startedAt,
      completedAt: nowIso(),
      logs,
      screenshots,
      consoleLogs,
      extractedData,
      error: error.message,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  executeWorkflow,
};
