function bestSelector(element) {
  if (!element) return null;

  if (element.id) {
    return `#${element.id}`;
  }

  const testid = element.getAttribute('data-testid');
  if (testid) {
    return `[data-testid="${testid}"]`;
  }

  const name = element.getAttribute('name');
  if (name) {
    return `[name="${name}"]`;
  }

  const className = (element.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  if (className) {
    return `${element.tagName.toLowerCase()}.${className}`;
  }

  return element.tagName.toLowerCase();
}

const DOM_SNAPSHOT_LIMIT = 200000;

function captureDomSnapshot() {
  try {
    const html = document.documentElement?.outerHTML || '';
    if (html.length <= DOM_SNAPSHOT_LIMIT) {
      return { html, truncated: false };
    }
    return { html: html.slice(0, DOM_SNAPSHOT_LIMIT), truncated: true };
  } catch (error) {
    return { html: '', truncated: false };
  }
}

function sendEvent(event) {
  chrome.runtime.sendMessage({
    type: 'RECORDER_EVENT',
    event,
  });
}

window.addEventListener('click', (e) => {
  const before = captureDomSnapshot();
  setTimeout(() => {
    const after = captureDomSnapshot();
    sendEvent({
      type: 'click',
      selector: bestSelector(e.target),
      value: '',
      url: location.href,
      domBefore: before.html,
      domAfter: after.html,
      domCurrent: after.html,
      domMeta: {
        beforeTruncated: before.truncated,
        afterTruncated: after.truncated,
      },
    });
  }, 250);
}, true);

window.addEventListener('input', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return;
  }

  const before = captureDomSnapshot();
  setTimeout(() => {
    const after = captureDomSnapshot();
    sendEvent({
      type: 'input',
      selector: bestSelector(target),
      value: target.value,
      url: location.href,
      domBefore: before.html,
      domAfter: after.html,
      domCurrent: after.html,
      domMeta: {
        beforeTruncated: before.truncated,
        afterTruncated: after.truncated,
      },
    });
  }, 250);
}, true);

window.addEventListener('submit', (e) => {
  const form = e.target;
  const before = captureDomSnapshot();
  setTimeout(() => {
    const after = captureDomSnapshot();
    sendEvent({
      type: 'submit',
      selector: bestSelector(form),
      value: '',
      url: location.href,
      domBefore: before.html,
      domAfter: after.html,
      domCurrent: after.html,
      domMeta: {
        beforeTruncated: before.truncated,
        afterTruncated: after.truncated,
      },
    });
  }, 250);
}, true);

window.addEventListener('hashchange', () => {
  const snap = captureDomSnapshot();
  sendEvent({
    type: 'navigate',
    url: location.href,
    domCurrent: snap.html,
    domMeta: {
      currentTruncated: snap.truncated,
    },
  });
});

window.addEventListener('load', () => {
  const snap = captureDomSnapshot();
  sendEvent({
    type: 'navigate',
    url: location.href,
    domCurrent: snap.html,
    domMeta: {
      currentTruncated: snap.truncated,
    },
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'RECORDER_CAPTURE_DOM') {
    return false;
  }

  const snap = captureDomSnapshot();
  sendResponse({ ok: true, domCurrent: snap.html, truncated: snap.truncated, url: location.href });
  return true;
});
