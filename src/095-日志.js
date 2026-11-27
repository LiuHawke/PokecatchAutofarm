  /* ====================== 日志：持久化、分类、报错与流程 ====================== */

  const LOG_KEY = 'pcauto.log.v1';
  const LOG_MAX = 1000;
  const LOG_CATS = [
    ['error', '报错'], ['game', '游戏报错'], ['warn', '警告'], ['flow', '流程'], ['prog', '主线'],
    ['team', '配队'], ['item', '物品'], ['catch', '捕获'], ['info', '其他'],
  ];
  const LOG_CAT_NAME = Object.fromEntries(LOG_CATS);

  /** 各模块传进来的 kind 归到界面上的分类 */
  function logCat(kind) {
    return {
      error: 'error', game: 'game', warn: 'warn', flow: 'flow',
      prog: 'prog', badge: 'prog',
      team: 'team', battle: 'team',
      item: 'item', evo: 'item',
      shiny: 'catch', event: 'catch', catch: 'catch',
    }[kind] || 'info';
  }

  let logSeq = 0;
  let logStoreDirty = false;
  const logErrSeen = new Map();     // 报错内容 → 那一条日志，用来合并计次
  let logErrWin = { at: 0, n: 0, dropped: 0 };
  const logOnceLast = {};

  (function logLoad() {
    const saved = storeGet(LOG_KEY, null);
    if (!Array.isArray(saved)) return;
    S.events = saved.slice(0, LOG_MAX).filter((e) => e && typeof e.msg === 'string');
    logSeq = S.events.reduce((m, e) => Math.max(m, e.id | 0), 0);
    S.logErrSeenId = logSeq;     // 上次会话的报错不再亮红标，日志页里照样能看到
    S.events.forEach((e) => { e.t = logTime(e.at); });
  })();

  function logTime(at) { return new Date(at).toLocaleTimeString('zh-CN', { hour12: false }); }

  function log(kind, msg, detail) {
    const at = now();
    const e = { id: ++logSeq, at, t: logTime(at), kind, cat: logCat(kind), msg: String(msg) };
    if (detail) e.detail = String(detail).slice(0, 2000);
    S.events.unshift(e);
    if (S.events.length > LOG_MAX) S.events.length = LOG_MAX;
    S.logDirty = true;
    logStoreDirty = true;
    if (S.cfg.logToConsole) console.log('[AutoFarm]', kind, msg);
    scheduleHud();
    return e;
  }

  /** 同一个 key 的结论没变就不再记，避免每 2 秒刷一遍同一句「跳过」 */
  function logOnce(key, kind, msg) {
    if (logOnceLast[key] === msg) return;
    logOnceLast[key] = msg;
    log(kind, msg);
  }
  function logOnceReset(key) { delete logOnceLast[key]; }

  /** 报错：同样的内容合并计次；每分钟最多新增 20 条，多出来的只计数 */
  function logError(src, err, extra) {
    const msg = `${src}：${(err && err.message) || err}`;
    const stack = (err && err.stack) || extra || '';
    const kind = src.startsWith('游戏') ? 'game' : 'error';
    const old = logErrSeen.get(msg);
    if (old && S.events.includes(old)) {
      old.n = (old.n || 1) + 1;
      if (now() - (old.upAt || old.at) > 60000) {
        old.upAt = now();
        old.t = logTime(now());
        S.logDirty = true;
        logStoreDirty = true;
        scheduleHud();
      }
      return;
    }
    if (now() - logErrWin.at > 60000) logErrWin = { at: now(), n: 0, dropped: 0 };
    if (++logErrWin.n > 20) { logErrWin.dropped++; return; }
    const e = log(kind, msg, stack);
    e.n = 1;
    logErrSeen.set(msg, e);
    if (logErrSeen.size > 200) logErrSeen.delete(logErrSeen.keys().next().value);
  }

  function logErrCount() {
    return S.events.reduce((n, e) => n + (e.cat === 'error' || e.cat === 'game' ? 1 : 0), 0);
  }

  function logPersist(force) {
    if (!logStoreDirty && !force) return;
    logStoreDirty = false;
    storeSet(LOG_KEY, S.events.map(({ id, at, kind, cat, msg, n, detail }) => ({ id, at, t: logTime(at), kind, cat, msg, n, detail })));
  }

  function logClear() {
    S.events = [];
    logErrSeen.clear();
    S.logDirty = true;
    logPersist(true);
    scheduleHud();
  }

  /** 页面级报错：调用栈里有扩展地址的算助手，其余算游戏；资源加载失败不记 */
  function installErrorLog() {
    const own = (s) => /chrome-extension:|moz-extension:|\/app\.js/.test(s || '') && !/\/bundle\/app\./.test(s || '');
    PAGE_WIN.addEventListener('error', (e) => {
      if (!(e instanceof ErrorEvent)) return;
      const where = `${e.filename || ''}:${e.lineno || 0}`;
      const stack = (e.error && e.error.stack) || where;
      logError(own(stack + where) ? '助手报错' : '游戏报错', e.error || e.message, stack);
    }, true);
    PAGE_WIN.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      const stack = (r && r.stack) || '';
      logError(own(stack) ? '助手报错（异步）' : '游戏报错（异步）', r && r.message ? r : String(r), stack);
    });
  }

  /** 日志导出成纯文本：给「复制全部」用 */
  function logText(list) {
    return (list || S.events).slice().reverse().map((e) =>
      `${new Date(e.at).toLocaleString('zh-CN', { hour12: false })} [${LOG_CAT_NAME[e.cat] || e.cat}] ${e.msg}${e.n > 1 ? ` ×${e.n}` : ''}${e.detail ? `\n    ${e.detail.replace(/\n/g, '\n    ')}` : ''}`).join('\n');
  }
