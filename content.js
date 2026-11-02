// Pages Saver - runs in the page: select area, pick next button, click it.
(() => {
  if (window.__pagesSaver) return;
  window.__pagesSaver = true;

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === 'PING') reply({ ok: true });
    if (msg.type === 'SELECT_AREA') { selectArea(); reply({ ok: true }); }
    if (msg.type === 'PICK_NEXT') { pickNext(); reply({ ok: true }); }
    if (msg.type === 'CLICK_NEXT') reply(clickNext(msg.target));
    if (msg.type === 'VIEWPORT') reply({ w: innerWidth, h: innerHeight });
    if (msg.type === 'TOAST') { toast(msg.text); reply({ ok: true }); }
  });

  const Z = 2147483647;
  function make(style, text) {
    const d = document.createElement('div');
    d.dataset.ps = '1';
    d.style.cssText = 'position:fixed;z-index:' + Z + ';font:13px sans-serif;' + style;
    if (text) d.textContent = text;
    document.documentElement.appendChild(d);
    return d;
  }
  function toast(text) {
    const t = make('right:16px;bottom:16px;background:#111;color:#fff;padding:8px 12px;border-radius:6px', text);
    setTimeout(() => t.remove(), 2500);
  }

  // Step 1: drag a rectangle
  function selectArea() {
    const overlay = make('inset:0;cursor:crosshair;background:rgba(0,0,0,.2)');
    const box = make('display:none;border:2px solid #2563eb;background:rgba(37,99,235,.15);pointer-events:none');
    const hint = make('left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 14px;border-radius:6px;pointer-events:none',
      'Drag to select the area to save. Esc to cancel.');
    let sx, sy, r = null;
    const cleanup = () => { overlay.remove(); box.remove(); hint.remove(); removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
    addEventListener('keydown', onKey, true);
    overlay.onmousedown = (e) => { sx = e.clientX; sy = e.clientY; box.style.display = 'block'; move(e); };
    const move = (e) => {
      r = { x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w: Math.abs(e.clientX - sx), h: Math.abs(e.clientY - sy) };
      box.style.cssText += `;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
    };
    overlay.onmousemove = (e) => { if (r) move(e); };
    overlay.onmouseup = () => {
      cleanup();
      if (!r || r.w < 5 || r.h < 5) return;
      chrome.runtime.sendMessage({ type: 'AREA_SELECTED', rect: r, viewport: { w: innerWidth, h: innerHeight } });
    };
  }

  // Step 2: click the site's "next page" button once to remember it
  function pickNext() {
    const hl = make('display:none;pointer-events:none;outline:2px solid #f97316;background:rgba(249,115,22,.15)');
    const hint = make('left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:8px 14px;border-radius:6px;pointer-events:none',
      'Click the NEXT PAGE button. Esc to cancel.');
    const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const onMove = (e) => {
      const b = e.target.getBoundingClientRect();
      hl.style.cssText += `;display:block;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
    };
    const onClick = (e) => {
      stop(e);
      const el = e.target.closest('a,button,[role=button],input') || e.target;
      const b = el.getBoundingClientRect();
      cleanup();
      chrome.runtime.sendMessage({
        type: 'NEXT_PICKED',
        target: { selector: cssPath(el), text: (el.innerText || el.value || '').trim().slice(0, 40),
                  x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
      });
    };
    const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
    const evs = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
    const cleanup = () => {
      hl.remove(); hint.remove();
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      evs.forEach((n) => document.removeEventListener(n, stop, true));
      removeEventListener('keydown', onKey, true);
    };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    evs.forEach((n) => document.addEventListener(n, stop, true));
    addEventListener('keydown', onKey, true);
  }

  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      let s = el.localName;
      const sibs = [...el.parentElement.children].filter((c) => c.localName === el.localName);
      if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(el) + 1})`;
      parts.unshift(s);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  // Step 3 (during run): find and left-click the remembered button
  function clickNext(t) {
    let el = null;
    try { el = document.querySelector(t.selector); } catch (_) {}
    if (!el && t.text) {
      el = [...document.querySelectorAll('a,button,[role=button],input')]
        .find((c) => (c.innerText || c.value || '').trim() === t.text);
    }
    if (!el) el = document.elementFromPoint(t.x, t.y);
    if (!el || el.dataset.ps) return { ok: false, error: 'Next button not found' };
    if (el.disabled) return { ok: false, error: 'Next button is disabled (last page?)' };
    const b = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0 };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    return { ok: true };
  }
})();
