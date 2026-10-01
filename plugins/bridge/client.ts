// Injected into the dev page. Everything it sends is a report; everything it
// accepts is a request from the one origin the plugin was told about.
export const CLIENT = /* js */ `(() => {
  const PARENT = __AIF_PARENT_ORIGIN__;
  const post = (type, payload) => {
    try { parent.postMessage({ source: 'aif-bridge', type, payload }, PARENT) } catch {}
  };
  const trim = (v, n) => (typeof v === 'string' && v.length > n ? v.slice(0, n) + '…' : v);
  const err = (kind, message, stack) => post('error', { kind, message: trim(String(message), 2000), stack: trim(stack, 4000) });

  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      post('console', { level, message: trim(args.map(String).join(' '), 2000) });
    };
  }
  window.addEventListener('error', (e) => err('error', e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', (e) => err('unhandledrejection', e.reason, e.reason && e.reason.stack));
  window.addEventListener('vite:error', (e) => err('build', (e.detail && e.detail.err && e.detail.err.message) || 'vite error'));

  const fetch0 = window.fetch;
  window.fetch = async (...args) => {
    try {
      const res = await fetch0(...args);
      if (!res.ok) post('request', { url: String(args[0]), status: res.status });
      return res;
    } catch (e) {
      post('request', { url: String(args[0]), status: 0, message: trim(String(e), 500) });
      throw e;
    }
  };

  let selecting = false;
  let hovered = null;
  let marks = [];
  const HOVER = 'data-aif-hover';
  const MARK = 'data-aif-mark';
  // Attributes plus one sheet, never el.style: the page's own outline must come
  // back untouched when edit mode ends.
  const sheet = document.createElement('style');
  sheet.textContent =
    '[' + HOVER + ']{outline:2px solid rgba(0,144,255,.5)!important;outline-offset:2px!important;cursor:pointer!important}' +
    '[' + MARK + '="edited"]{outline:2px dashed #0090ff!important;outline-offset:2px!important}' +
    '[' + MARK + '="active"]{outline:2px solid #0090ff!important;outline-offset:2px!important}' +
    '[data-aif-badges]{position:fixed;inset:0 auto auto 0;pointer-events:none;z-index:2147483647}' +
    '[data-aif-badges]>span{position:absolute;left:0;top:0;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#0090ff;color:#fff;' +
    'font:600 11px/18px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff}';
  document.head.appendChild(sheet);
  const layer = document.createElement('div');
  layer.setAttribute('data-aif-badges', '');

  const nearest = (el) => { while (el && !(el.getAttribute && el.getAttribute('data-aif'))) el = el.parentElement; return el };
  // Every copy, not only the tracked node: a looping slider clones what is hovered.
  const unhover = () => {
    hovered = null;
    for (const el of document.querySelectorAll('[' + HOVER + ']')) el.removeAttribute(HOVER);
  };
  // A .map() stamps every item with one call site, so the occurrence is what
  // tells two nav links apart.
  const occurrences = (tag) => document.querySelectorAll('[data-aif="' + CSS.escape(tag) + '"]');
  // A picked node is stamped in memory, never in the DOM, so neither a reorder
  // nor a cloned copy can take its identity. A missing stamp falls back to the
  // occurrence only while the sibling count is what it was at the pick.
  const LOAD = Math.random().toString(36).slice(2, 8) + '-';
  const stamps = new WeakMap();
  const stamped = new Map();
  let picks = 0;
  const stampOf = (el) => {
    let stamp = stamps.get(el);
    if (!stamp) { stamp = LOAD + ++picks; stamps.set(el, stamp); stamped.set(stamp, new WeakRef(el)) }
    return stamp;
  };
  const resolve = (m) => {
    if (m.path && m.path !== location.pathname) return null;
    const all = occurrences(m.tag);
    if (typeof m.pick === 'string' && m.pick) {
      const el = stamped.get(m.pick)?.deref();
      if (el && el.isConnected) return el;
      if (Number.isInteger(m.count) && m.count !== all.length) return null;
      // The node that took the pick's place carries its stamp from here, so a
      // click on it reports the same pick rather than a new element.
      const found = all[m.nth];
      if (!found) return null;
      // Already another pick's node: this pick's element is gone, not moved here.
      if (stamps.has(found)) return stamps.get(found) === m.pick ? found : null;
      stamps.set(found, m.pick);
      stamped.set(m.pick, new WeakRef(found));
      return found;
    }
    return all[m.nth] || null;
  };

  // Resolving walks the DOM, so it runs only when the marks or the page's
  // nodes change; scrolling and layout shifts just move the badges.
  let resolved = [];
  const resolveAll = () => {
    resolved = selecting ? marks.map((m) => [m, resolve(m)]).filter(([, el]) => el) : [];
    const want = new Map(resolved.map(([m, el]) => [el, m.state === 'active' ? 'active' : 'edited']));
    for (const el of document.querySelectorAll('[' + MARK + ']')) if (!want.has(el)) el.removeAttribute(MARK);
    // A copy of the hovered node (a looping slider) carries the attribute too.
    for (const el of document.querySelectorAll('[' + HOVER + ']')) if (el !== hovered) el.removeAttribute(HOVER);
    for (const [el, state] of want) if (el.getAttribute(MARK) !== state) el.setAttribute(MARK, state);
  };
  const place = () => {
    // A hidden occurrence has no box to label: the desktop nav at phone width.
    const badges = resolved.filter(([m, el]) => m.label && el.isConnected && el.getClientRects().length);
    if (!badges.length) { layer.remove(); return }
    if (!layer.isConnected) document.body.appendChild(layer);
    while (layer.children.length > badges.length) layer.lastChild.remove();
    while (layer.children.length < badges.length) layer.appendChild(document.createElement('span'));
    // Every read before any write, so a frame costs one layout, not one a badge.
    const rects = badges.map(([, el]) => el.getBoundingClientRect());
    badges.forEach(([m], i) => {
      const badge = layer.children[i];
      const label = String(m.label).slice(0, 3);
      if (badge.textContent !== label) badge.textContent = label;
      badge.style.transform = 'translate(' + rects[i].left + 'px,' + rects[i].top + 'px) translate(-40%,-40%)';
    });
  };
  let queued = false;
  let stale = false;
  const repaint = (full) => {
    if (full) stale = true;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (stale) { stale = false; resolveAll() }
      place();
    });
  };
  const reposition = () => { if (selecting && marks.length) repaint(false) };
  window.addEventListener('resize', reposition);
  document.addEventListener('scroll', reposition, true);
  document.addEventListener('load', reposition, true);
  // A transition moves its element on every frame without touching the DOM, so
  // while any runs the badges are placed every frame.
  let moving = 0;
  const follow = () => {
    if (moving <= 0 || !selecting || !marks.length) return;
    place();
    requestAnimationFrame(follow);
  };
  const started = () => { if (moving++ === 0) requestAnimationFrame(follow) };
  const stopped = () => { moving = Math.max(0, moving - 1); reposition() };
  for (const type of ['transitionrun', 'animationstart']) document.addEventListener(type, started, true);
  for (const type of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) document.addEventListener(type, stopped, true);
  new ResizeObserver(reposition).observe(document.documentElement);
  // Nodes coming and going can change what a mark resolves to; a class or an
  // inline transform (a carousel) only moves it. The layer's own churn is neither.
  new MutationObserver((records) => {
    if (!selecting) return;
    const theirs = records.filter((r) => !layer.contains(r.target));
    const structural = theirs.some((r) => r.type === 'childList');
    if (structural || (theirs.length && marks.length)) repaint(structural);
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'data-state'],
  });

  document.addEventListener('mouseover', (e) => {
    if (!selecting) return;
    const el = nearest(e.target);
    if (el === hovered) return;
    unhover();
    if (el) { hovered = el; el.setAttribute(HOVER, '') }
  }, true);
  document.addEventListener('click', (e) => {
    if (!selecting) return;
    const el = nearest(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const tag = el.getAttribute('data-aif');
    const all = occurrences(tag);
    post('selected', {
      tag,
      pick: stampOf(el),
      nth: Array.prototype.indexOf.call(all, el),
      count: all.length,
      path: location.pathname,
      element: el.tagName.toLowerCase(),
      classes: el.className && String(el.className).slice(0, 500),
      text: trim((el.textContent || '').trim(), 300),
    });
  }, true);

  window.addEventListener('message', (e) => {
    if (e.origin !== PARENT || !e.data || e.data.source !== 'aif-host') return;
    const payload = e.data.payload;
    if (e.data.type === 'select-mode') { selecting = !!payload; if (!selecting) unhover(); repaint(true) }
    if (e.data.type === 'marks' && Array.isArray(payload)) {
      marks = payload.filter((m) => m && typeof m.tag === 'string' && Number.isInteger(m.nth)).slice(0, 50);
      repaint(true);
    }
    if (e.data.type === 'scroll-to' && payload && typeof payload.tag === 'string') {
      const el = resolve({ tag: payload.tag, nth: payload.nth | 0, pick: payload.pick, path: payload.path, count: payload.count });
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  let last = location.pathname;
  const announce = () => { if (location.pathname !== last) { last = location.pathname; post('route', { path: last }); repaint(true) } };
  for (const fn of ['pushState', 'replaceState']) {
    const original = history[fn].bind(history);
    history[fn] = (...a) => { original(...a); announce() };
  }
  window.addEventListener('popstate', announce);
  post('ready', { path: location.pathname });
})()`
