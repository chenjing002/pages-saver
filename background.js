// Pages Saver - background: capture area -> save -> click next -> wait -> repeat
const state = { running: false, stop: false, saved: 0, total: 0, error: '' };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  handle(msg, sender).then(reply).catch((e) => reply({ ok: false, error: String(e.message || e) }));
  return true;
});

async function handle(msg, sender) {
  switch (msg.type) {
    case 'AREA_SELECTED':
      await chrome.storage.local.set({ area: { rect: msg.rect, viewport: msg.viewport } });
      toast(sender.tab.id, `Area saved: ${msg.rect.w} x ${msg.rect.h}`);
      return { ok: true };
    case 'NEXT_PICKED':
      await chrome.storage.local.set({ next: msg.target });
      toast(sender.tab.id, `Next button saved: "${msg.target.text}"`);
      return { ok: true };
    case 'SELECT_AREA':
    case 'PICK_NEXT':
      await ping(msg.tabId);
      return chrome.tabs.sendMessage(msg.tabId, { type: msg.type });
    case 'START':
      return start(msg.tabId, msg.count, msg.delaySec);
    case 'STOP':
      state.stop = true;
      return { ok: true };
    case 'STATE':
      return { ok: true, ...state };
  }
}

async function start(tabId, count, delaySec) {
  if (state.running) return { ok: false, error: 'Already running' };
  const { area, next } = await chrome.storage.local.get(['area', 'next']);
  if (!area) return { ok: false, error: 'Select an area first' };
  if (count > 1 && !next) return { ok: false, error: 'Pick the next button first' };

  Object.assign(state, { running: true, stop: false, saved: 0, total: count, error: '' });
  run(tabId, count, delaySec * 1000, area, next)
    .catch((e) => { state.error = String(e.message || e); })
    .finally(() => {
      state.running = false;
      toast(tabId, state.error ? 'Pages Saver stopped: ' + state.error : `Pages Saver done: ${state.saved} image(s) saved`);
    });
  return { ok: true };
}

async function run(tabId, count, delayMs, area, next) {
  for (let i = 1; i <= count && !state.stop; i++) {
    await ping(tabId, 15000);                      // wait until page is ready
    await capture(tabId, area, `pages-saver/page_${String(i).padStart(3, '0')}.png`);
    state.saved = i;
    if (i === count) break;
    const r = await chrome.tabs.sendMessage(tabId, { type: 'CLICK_NEXT', target: next });
    if (!r.ok) throw new Error(r.error);
    await wait(delayMs);
  }
}

async function capture(tabId, area, filename) {
  const tab = await chrome.tabs.get(tabId);
  let vp = area.viewport;
  try { vp = await chrome.tabs.sendMessage(tabId, { type: 'VIEWPORT' }); } catch (_) {}
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const bmp = await createImageBitmap(await (await fetch(shot)).blob());
  const k = bmp.width / vp.w;                      // CSS px -> image px (handles retina/zoom)
  const r = area.rect;
  const canvas = new OffscreenCanvas(Math.round(r.w * k), Math.round(r.h * k));
  canvas.getContext('2d').drawImage(bmp, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const url = await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob); });
  await chrome.downloads.download({ url, filename, conflictAction: 'uniquify' });
}

// Make sure content.js is alive in the tab (page may be reloading after "next")
async function ping(tabId, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (true) {
    try { await chrome.tabs.sendMessage(tabId, { type: 'PING' }); return; } catch (_) {}
    try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch (_) {}
    if (Date.now() > end) throw new Error('Cannot reach the page (chrome:// pages are not supported)');
    await sleep(300);
  }
}

// Sleep in 1s steps so Stop is quick and the service worker stays awake
async function wait(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !state.stop) {
    await sleep(Math.min(1000, end - Date.now()));
    chrome.runtime.getPlatformInfo();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toast = (tabId, text) => chrome.tabs.sendMessage(tabId, { type: 'TOAST', text }).catch(() => {});
