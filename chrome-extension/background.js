const stateByTab = new Map();

function ensureTab(tabId) {
  if (!stateByTab.has(tabId)) {
    stateByTab.set(tabId, {
      recording: false,
      startedAt: null,
      events: [],
      startUrl: null,
      domSnapshots: {
        before: '',
        after: '',
        current: '',
        updatedAt: null,
        sourceEventType: null,
      },
    });
  }
  return stateByTab.get(tabId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id || message.tabId;
  if (!tabId) {
    sendResponse?.({ ok: false, error: 'No tab id' });
    return true;
  }

  const state = ensureTab(tabId);

  if (message.type === 'RECORDER_START') {
    state.recording = true;
    state.startedAt = Date.now();
    state.events = [];
    state.startUrl = message.url || sender.tab?.url || null;
    state.domSnapshots = {
      before: '',
      after: '',
      current: '',
      updatedAt: null,
      sourceEventType: null,
    };
    sendResponse?.({ ok: true });
    return true;
  }

  if (message.type === 'RECORDER_STOP') {
    state.recording = false;
    sendResponse?.({ ok: true, payload: state });
    return true;
  }

  if (message.type === 'RECORDER_EVENT') {
    if (state.recording) {
      const enrichedEvent = {
        ...message.event,
        timestamp: Date.now(),
      };
      state.events.push(enrichedEvent);

      if (typeof enrichedEvent.domBefore === 'string') {
        state.domSnapshots.before = enrichedEvent.domBefore;
      }
      if (typeof enrichedEvent.domAfter === 'string') {
        state.domSnapshots.after = enrichedEvent.domAfter;
      }
      if (typeof enrichedEvent.domCurrent === 'string') {
        state.domSnapshots.current = enrichedEvent.domCurrent;
      }
      state.domSnapshots.updatedAt = Date.now();
      state.domSnapshots.sourceEventType = enrichedEvent.type || null;
    }
    sendResponse?.({ ok: true });
    return true;
  }

  if (message.type === 'RECORDER_GET') {
    sendResponse?.({ ok: true, payload: state });
    return true;
  }

  if (message.type === 'RECORDER_GET_DOM') {
    sendResponse?.({ ok: true, domSnapshots: state.domSnapshots || null });
    return true;
  }

  if (message.type === 'RECORDER_CLEAR') {
    stateByTab.delete(tabId);
    sendResponse?.({ ok: true });
    return true;
  }

  sendResponse?.({ ok: false, error: 'Unknown message type' });
  return true;
});
