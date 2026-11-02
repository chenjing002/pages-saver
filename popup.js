const $ = (id) => document.getElementById(id);
const send = (m) => chrome.runtime.sendMessage(m);
const tabId = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id;

async function load() {
  const { area, next, count, delay } = await chrome.storage.local.get(['area', 'next', 'count', 'delay']);
  if (count) $('count').value = count;
  if (delay) $('delay').value = delay;
  if (area) { $('areaInfo').textContent = `${area.rect.w} x ${area.rect.h}`; $('areaInfo').className = 'ok'; }
  if (next) { $('nextInfo').textContent = `"${next.text}"`; $('nextInfo').className = 'ok'; }
}

async function onPage(type) {
  try { await send({ type, tabId: await tabId() }); window.close(); }
  catch (e) { $('msg').textContent = 'Cannot use this page (chrome:// pages are not supported)'; }
}
$('area').onclick = () => onPage('SELECT_AREA');
$('next').onclick = () => onPage('PICK_NEXT');

$('start').onclick = async () => {
  const count = parseInt($('count').value) || 1, delaySec = parseFloat($('delay').value) || 6;
  chrome.storage.local.set({ count, delay: delaySec });
  const r = await send({ type: 'START', tabId: await tabId(), count, delaySec });
  $('msg').textContent = r.ok ? '' : r.error;
  refresh();
};
$('stop').onclick = () => send({ type: 'STOP' });

async function refresh() {
  const s = await send({ type: 'STATE' });
  $('start').hidden = s.running;
  $('stop').hidden = !s.running;
  if (s.running) $('msg').textContent = `Saving... ${s.saved} / ${s.total}`;
  else if (s.error) $('msg').textContent = 'Stopped: ' + s.error;
  else if (s.total) $('msg').textContent = `Done: ${s.saved} / ${s.total} saved`;
}

load(); refresh(); setInterval(refresh, 500);
