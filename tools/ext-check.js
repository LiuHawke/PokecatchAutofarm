// 扩展桥接自测（不开浏览器）：node tools/ext-check.js
// 用假的 chrome.storage 和 EventTarget 跑 bridge.js + app.js 的包装层，主体脚本换成一段探针。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

function makeEnv(initial, { bridge = true } = {}) {
  const store = { ...initial };
  const win = new EventTarget();
  const lag = (fn) => setTimeout(fn, 5);
  const chrome = {
    runtime: { lastError: null },
    storage: { local: {
      get(k, cb) { lag(() => cb(k == null ? { ...store } : { [k]: store[k] })); },
      set(o, cb) { lag(() => { Object.assign(store, JSON.parse(JSON.stringify(o))); cb && cb(); }); },
      remove(k, cb) { lag(() => { delete store[k]; cb && cb(); }); },
    } },
  };
  const base = { window: win, CustomEvent, EventTarget, setTimeout, clearTimeout, JSON, Object, Promise, performance, Date, String, console, location: { host: 'test' } };
  base.window.dispatchEvent = win.dispatchEvent.bind(win);
  base.window.addEventListener = win.addEventListener.bind(win);
  const iso = vm.createContext({ ...base, chrome });
  const main = vm.createContext({ ...base });
  return { store, win, iso, main, bridge };
}

const wrap = fs.readFileSync(path.join(ROOT, 'ext', 'app-wrap.js'), 'utf8').replace(/\{\{VERSION\}\}/g, 't');
const bridge = fs.readFileSync(path.join(ROOT, 'ext', 'bridge.js'), 'utf8');
const probe = `
  const HAS_STORE = typeof extGet === 'function';
  window.__probe = { HAS_STORE, ext: PCAUTO_EXT, get: HAS_STORE ? extGet : null, set: HAS_STORE ? extSet : null, del: HAS_STORE ? extDel : null };
`;

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. 正常：快照送达、读写、往返、前缀限制
  {
    const env = makeEnv({ 'pcauto.cfg.v4': { a: 1 }, 'pcauto.bak.index': [{ id: 'x' }], other: 'secret' });
    vm.runInContext(bridge, env.iso);
    vm.runInContext(wrap.replace('/*__APP__*/', probe), env.main);
    await sleep(50);
    const p = env.main.window.__probe;
    ok('收到快照后带扩展存储启动', !!p && p.HAS_STORE && p.ext.store);
    ok('读到已有设置', p.get('pcauto.cfg.v4', null).a === 1);
    ok('快照里没有非 pcauto. 的键', p.get('other', 'none') === 'none');
    const o = p.get('pcauto.cfg.v4'); o.a = 9;
    ok('读出的是副本（改了不影响缓存）', p.get('pcauto.cfg.v4').a === 1);
    p.set('pcauto.cfg.v4', { a: 2 });
    ok('写入立刻能同步读回', p.get('pcauto.cfg.v4').a === 2);
    await sleep(30);
    ok('写入落到扩展存储', env.store['pcauto.cfg.v4'].a === 2);
    p.del('pcauto.cfg.v4');
    await sleep(30);
    ok('删除落到扩展存储', !('pcauto.cfg.v4' in env.store));
    let threw = false;
    try { p.set('gachamon-save-v1', 'x'); } catch { threw = true; }
    ok('不许写非 pcauto. 的键', threw && !('gachamon-save-v1' in env.store));
    env.win.dispatchEvent(new CustomEvent('pcauto-ext:op', { detail: JSON.stringify({ op: 'set', k: 'other', v: 'hack' }) }));
    await sleep(30);
    ok('桥拒绝页面直接写别的键', env.store.other === 'secret');
    const rt = await p.ext.roundTrip();
    ok('存储往返', rt.ok, JSON.stringify(rt));
    ok('往返后不留测试键', !('pcauto.selftest' in env.store));
    p.ext.status({ version: '1.0.0', ns: true, wrapped: 2, hasStore: true, evil: 'x' });
    await sleep(30);
    ok('状态写进 _status 且只保留已知字段', env.store._status && env.store._status.wrapped === 2 && !('evil' in env.store._status));
  }
  // 2. 桥不在：3 秒后无扩展存储启动
  {
    const env = makeEnv({});
    vm.runInContext(wrap.replace('/*__APP__*/', probe), env.main);
    await sleep(200);
    ok('没快照时先不启动', !env.main.window.__probe);
    await sleep(3000);
    const p = env.main.window.__probe;
    ok('3 秒后不带扩展存储启动', !!p && !p.HAS_STORE && !p.ext.store);
  }
  // 3. 桥先发快照、app 后到：靠 hello 补发
  {
    const env = makeEnv({ 'pcauto.k': 1 });
    vm.runInContext(bridge, env.iso);
    await sleep(50);
    vm.runInContext(wrap.replace('/*__APP__*/', probe), env.main);
    await sleep(20);
    const p = env.main.window.__probe;
    ok('app 晚到也能拿到快照', !!p && p.HAS_STORE && p.get('pcauto.k') === 1);
  }
  console.log(fails ? `${fails} 项失败` : '全部通过');
  process.exit(fails ? 1 : 0);
})();
