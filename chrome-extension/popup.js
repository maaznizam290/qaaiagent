function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response));
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => resolve(response));
  });
}

function setStatus(text, isError = false) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.style.color = isError ? '#ff6b6b' : '#70e3a3';
}

function renderPayload(payload) {
  document.getElementById('output').textContent = JSON.stringify(payload, null, 2);
}

async function getPayload() {
  const tab = await queryActiveTab();
  const result = await sendToBackground({ type: 'RECORDER_GET', tabId: tab.id });

  const flowName = document.getElementById('flowName').value || 'Recorded Flow';
  return {
    name: flowName,
    startUrl: result?.payload?.startUrl || tab.url,
    events: result?.payload?.events || [],
  };
}

async function startRecording() {
  const tab = await queryActiveTab();
  await sendToBackground({ type: 'RECORDER_START', tabId: tab.id, url: tab.url });
  setStatus('Recording started');
}

async function stopRecording() {
  const tab = await queryActiveTab();
  const result = await sendToBackground({ type: 'RECORDER_STOP', tabId: tab.id });
  const payload = {
    name: document.getElementById('flowName').value || 'Recorded Flow',
    startUrl: result?.payload?.startUrl || tab.url,
    events: result?.payload?.events || [],
  };
  renderPayload(payload);
  setStatus(`Recording stopped. Captured ${payload.events.length} events.`);
}

async function copyJson() {
  try {
    const payload = await getPayload();
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    renderPayload(payload);
    setStatus('Copied flow JSON to clipboard');
  } catch (error) {
    setStatus('Unable to copy JSON', true);
  }
}

async function sendToApi() {
  try {
    const payload = await getPayload();
    const apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, '');
    const token = document.getElementById('token').value.trim();

    if (!token) {
      setStatus('JWT Token is required to send flow', true);
      return;
    }

    const response = await fetch(`${apiUrl}/flows`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Failed to send flow', true);
      return;
    }

    renderPayload(data.flow || payload);
    setStatus(`Flow #${data.flow.id} sent successfully`);
  } catch (error) {
    setStatus('Failed to send flow to API', true);
  }
}

async function runSelfHealing() {
  try {
    const tab = await queryActiveTab();
    const apiUrl = document.getElementById('apiUrl').value.replace(/\/$/, '');
    const token = document.getElementById('token').value.trim();
    const target = document.getElementById('healingTarget').value.trim();
    const framework = document.getElementById('healingFramework').value;

    if (!token) {
      setStatus('JWT Token is required to run self-healing', true);
      return;
    }

    const recorder = await sendToBackground({ type: 'RECORDER_GET', tabId: tab.id });
    const liveDom = await sendToTab(tab.id, { type: 'RECORDER_CAPTURE_DOM' });

    const domBefore = recorder?.payload?.domSnapshots?.before || '';
    const domAfter = recorder?.payload?.domSnapshots?.after || '';
    const domCurrent = liveDom?.domCurrent || recorder?.payload?.domSnapshots?.current || '';

    let payload = {
      framework,
      domBefore,
      domAfter,
      domCurrent,
      save: false,
      instruction: 'Extract selectors and evaluate fallback healing',
    };

    let parsedUrl = null;
    try {
      const raw = target || tab.url;
      parsedUrl = new URL(raw);
    } catch (error) {
      parsedUrl = null;
    }

    if (target && !parsedUrl) {
      payload.flowId = target;
    } else {
      payload.url = parsedUrl ? parsedUrl.toString() : tab.url;
    }

    const response = await fetch(`${apiUrl}/flows/self-healing/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Self-healing run failed', true);
      return;
    }

    renderPayload(data);
    setStatus('Self-healing diagnostics completed');
  } catch (error) {
    setStatus('Unable to run self-healing diagnostics', true);
  }
}

document.getElementById('startBtn').addEventListener('click', startRecording);
document.getElementById('stopBtn').addEventListener('click', stopRecording);
document.getElementById('copyBtn').addEventListener('click', copyJson);
document.getElementById('sendBtn').addEventListener('click', sendToApi);
document.getElementById('selfHealingBtn').addEventListener('click', runSelfHealing);
