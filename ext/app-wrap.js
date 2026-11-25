// 页面世界：等隔离世界送来 pcauto.* 存储快照，再用同步缓存提供 extGet / extSet / extDel 后启动脚本。
// 3 秒没收到快照（桥失效）就不提供扩展存储启动，脚本会提示备份不可用。
(() => {
  if (window.__pcautoExt) return;
  window.__pcautoExt = '{{VERSION}}';
  let booted = false, seq = 0;
  const waits = new Map();
  const send = (o) => window.dispatchEvent(new CustomEvent('pcauto-ext:op', { detail: JSON.stringify(o) }));
  const copy = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

  window.addEventListener('pcauto-ext:ack', (e) => {
    let m;
    try { m = JSON.parse(e.detail); } catch { return; }
    const fn = m && waits.get(m.id);
    if (fn) { waits.delete(m.id); fn(m); }
  });
  const call = (o, ms = 3000) => new Promise((res) => {
    const id = 'r' + (++seq) + '.' + Date.now();
    const t = setTimeout(() => { waits.delete(id); res({ ok: false, err: 'timeout' }); }, ms);
    waits.set(id, (m) => { clearTimeout(t); res(m); });
    send({ ...o, id });
  });

  function boot(snap) {
    if (booted) return;
    booted = true;
    let extGet, extSet, extDel;
    if (snap) {
      const cache = snap;
      extGet = (k, d) => (Object.prototype.hasOwnProperty.call(cache, k) ? copy(cache[k]) : d);
      extSet = (k, v) => {
        if (typeof k !== 'string' || !k.startsWith('pcauto.')) throw new Error('只能写 pcauto. 开头的键');
        cache[k] = copy(v);
        send({ op: 'set', k, v });
      };
      extDel = (k) => { delete cache[k]; send({ op: 'del', k }); };
    }
    const EXT = {
      version: '{{VERSION}}',
      store: !!snap,
      /** 写一个值、从扩展存储读回来比对、再删掉 */
      async roundTrip() {
        if (!snap) return { ok: false, err: '没收到存储快照' };
        const k = 'pcauto.selftest', v = 'rt' + Date.now();
        const t0 = performance.now();
        const a = await call({ op: 'set', k, v });
        const b = a.ok ? await call({ op: 'get', k }) : a;
        await call({ op: 'del', k });
        return { ok: !!a.ok && b.v === v, ms: Math.round(performance.now() - t0), err: a.err || b.err || null };
      },
      status(st) { window.dispatchEvent(new CustomEvent('pcauto-ext:status', { detail: JSON.stringify(st) })); },
    };
    run(extGet, extSet, extDel, EXT);
  }

  window.addEventListener('pcauto-ext:snap', (e) => {
    let snap = null;
    try { snap = JSON.parse(e.detail); } catch { /* 忽略 */ }
    boot(snap && typeof snap === 'object' ? snap : null);
  }, { once: true });
  window.dispatchEvent(new CustomEvent('pcauto-ext:hello'));
  setTimeout(() => boot(null), 3000);

  // eslint-disable-next-line no-unused-vars
  function run(extGet, extSet, extDel, PCAUTO_EXT) {
/*__APP__*/
  }
})();
