// 隔离世界：页面脚本碰不到 chrome.storage，由这里转手。
// 只认 pcauto. 前缀的键；页面 → 这里的消息都是 JSON 字符串（跨世界传对象不可靠）。
(() => {
  const PFX = 'pcauto.';
  const MAX_VAL = 32 * 1024 * 1024;
  const okKey = (k) => typeof k === 'string' && k.startsWith(PFX) && k.length < 200;
  let snap = null;

  const toPage = (name, obj) => window.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(obj) }));
  const sendSnap = () => toPage('pcauto-ext:snap', snap);

  try {
    chrome.storage.local.get(null, (all) => {
      snap = {};
      for (const [k, v] of Object.entries(all || {})) if (okKey(k)) snap[k] = v;
      sendSnap();
    });
  } catch (e) { /* 扩展刚被重载，旧页面上的桥已失效 */ }

  window.addEventListener('pcauto-ext:hello', () => { if (snap) sendSnap(); });

  window.addEventListener('pcauto-ext:op', (e) => {
    let m;
    try { m = JSON.parse(e.detail); } catch { return; }
    if (!m || !okKey(m.k)) return;
    const ack = (extra) => { if (m.id) toPage('pcauto-ext:ack', { id: m.id, ...extra }); };
    try {
      if (m.op === 'set') {
        if (JSON.stringify(m.v ?? null).length > MAX_VAL) return ack({ ok: false, err: 'too-big' });
        chrome.storage.local.set({ [m.k]: m.v }, () => ack({ ok: !chrome.runtime.lastError }));
      } else if (m.op === 'del') {
        chrome.storage.local.remove(m.k, () => ack({ ok: !chrome.runtime.lastError }));
      } else if (m.op === 'get') {
        chrome.storage.local.get(m.k, (r) => ack({ ok: true, v: r ? r[m.k] : undefined }));
      }
    } catch (err) { ack({ ok: false, err: String(err) }); }
  });

  // 页面报告的运行状态，给弹出窗口看（不经过 pcauto. 前缀，页面无法借此写别的键）
  window.addEventListener('pcauto-ext:status', (e) => {
    let st;
    try { st = JSON.parse(e.detail); } catch { return; }
    if (!st || typeof st !== 'object') return;
    const s = {
      at: Date.now(), host: location.host, version: String(st.version || ''), ns: !!st.ns, why: String(st.why || '').slice(0, 200),
      wrapped: st.wrapped | 0, dup: !!st.dup, other: String(st.other || '').slice(0, 20), hasStore: !!st.hasStore,
    };
    try { chrome.storage.local.set({ _status: s }); } catch { /* 忽略 */ }
  });
})();
