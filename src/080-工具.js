  /* ====================== 工具 ====================== */

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => {
    n = Math.round(n || 0);
    return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n);
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---- 存储与解析的统一兜底：任何异常都退回默认值，绝不让脚本在初始化阶段崩掉 ---- */

  function safeParse(raw, fallback) {
    try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
  }
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch { return false; }
  }

  /** 所有定时任务的统一兜底：单次异常不会让这条定时器变成植物人，且会在日志里喊一声 */
  function safeInterval(name, fn, ms) {
    let warnedAt = 0;
    return setInterval(() => {
      try {
        fn();
      } catch (e) {
        if (now() - warnedAt > 60000) {
          warnedAt = now();
          try { log('warn', `内部任务「${name}」异常：${(e && e.message) || e}`); } catch { /* 忽略 */ }
        }
      }
    }, ms);
  }

  /** 真实可见性：keepAlive 开启后 document.hidden 被伪装，必须读原始描述符 */
  function isRealHidden() {
    const d = S.realDescs && S.realDescs.descH;
    if (d && typeof d.get === 'function') {
      try { return !!d.get.call(PAGE_DOC); } catch { /* 回落 */ }
    }
    return !!document.hidden;
  }

  /** 同时派发 pointer/mouse/click，兼容只监听 pointerdown 的控件 */
  function fire(el) {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect();
    // 不传 view，避免事件构造因 window 归属不一致而直接抛错
    const opt = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opt));
      el.dispatchEvent(new PointerEvent('pointerup', opt));
      el.dispatchEvent(new MouseEvent('click', opt));
      return true;
    } catch (e) {
      try { el.click(); return true; } catch (_) { return false; }
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 记一次「脚本发起」；intentFresh 判断弹窗是否落在这次操作的时间窗里 */
  function intent(kind) { S.intents[kind] = now(); }
  function intentFresh(kind, ms) { return now() - (S.intents[kind] || 0) < ms; }

  function gotoScreen(key) {
    if (!/^[a-z-]+$/.test(key)) return;
    const tab = $(`#tabs button[data-screen="${key}"]`);
    if (tab) fire(tab);
  }
  function activeScreen() {
    return (($('.screen.active') || {}).id || '').replace(/^screen-/, '') || 'adventure';
  }

  /** 长任务互斥：喂糖、换队、孵蛋、购物、换章节同一时间只跑一个，主循环在此期间让路 */
  function isBusyTask() { return !!(S.busyTask || S.feeding); }

  /** 自动化统一的「可以开始了吗」：玩家在操作、页面在后台、有弹窗、已有长任务时都不动 */
  function autoIdle(userMs = 10000) {
    return S.cfg.enabled && !S.pausedByUser && !isBusyTask() && !userBusy(userMs)
        && (!isRealHidden() || S.keepAliveOn) && !findModal();
  }

  async function runTask(name, fn) {
    if (isBusyTask()) return { ok: false, msg: '正在执行其他任务' };
    S.busyTask = name;
    S.busySince = now();
    const prev = activeScreen();
    try {
      return await fn();
    } catch (e) {
      return { ok: false, msg: (e && e.message) || String(e) };
    } finally {
      if (activeScreen() !== prev) gotoScreen(prev);
      S.busyTask = '';
      S.lastProgressAt = now();
      S.lastActivityAt = now();
    }
  }

  /** 连续失败 3 次就关掉这项自动化，避免一直和改版后的界面较劲 */
  function taskResult(cfgKey, label, r) {
    if (r && r.ok) { S.taskFails[cfgKey] = 0; return; }
    if (r && r.skip) return;
    const n = (S.taskFails[cfgKey] = (S.taskFails[cfgKey] || 0) + 1);
    log('warn', `${label}失败：${(r && r.msg) || '未知原因'}`);
    if (n >= 3 && S.cfg[cfgKey]) {
      S.cfg[cfgKey] = false;
      writeCfg(S.cfg);
      log('warn', `${label}连续失败 3 次，已自动关闭（可在设置里重新打开）`);
      notify('自动化已停用', `${label}连续失败 3 次`, 'pcauto-task');
    }
  }

  /** 长任务里自己清掉弹窗（主循环此时让路，不会帮忙关）；规则与主循环相同，认不出的就停手 */
  async function settleModals(rounds = 4) {
    for (let i = 0; i < rounds; i++) {
      const m = findModal();
      if (!m) return true;
      const r = classifyModal(m);
      if (r.act !== 'click' || !r.btn) return false;
      fire(r.btn);
      if (r.log) log(r.log[0], r.log[1]);
      await wait(500);
    }
    return !findModal();
  }

  function readSaveRaw() { return lsGet(SAVE_KEY); }
  function readSave() { return safeParse(readSaveRaw(), null); }
  /** 3.x 设置 → 4.0：去掉推送和已废弃的开关，「连败回退 / 自动推进」并成「主线推进」 */
  function migrateCfgV3(old) {
    if (!old || typeof old !== 'object') return null;
    const c = {};
    for (const k of Object.keys(DEFAULTS)) if (k in old) c[k] = old[k];
    if (old.autoAdvance || old.autoRetreat) { c.progress = true; c.counterSwap = true; }
    if (old.speed && old.speed !== 4) c.speed = 4;
    return c;
  }
  function readCfg() {
    let saved = safeParse(lsGet(CFG_KEY), null);
    if (!saved) {
      // 换了域名 localStorage 是空的：用扩展存储里的镜像
      const mirror = storeGet(CFG_KEY, null);
      if (mirror && typeof mirror === 'object') {
        saved = { ...mirror };
        lsSet(CFG_KEY, JSON.stringify(saved));
        S_BOOT.cfgFromMirror = true;
      }
    }
    if (!saved) {
      saved = migrateCfgV3(safeParse(lsGet(CFG_KEY_V3), null)) || {};
      if (Object.keys(saved).length) { saved.migratedFrom = 3; lsSet(CFG_KEY, JSON.stringify(saved)); }
    }
    const c = { ...DEFAULTS, ...saved, berryFamilies: { ...DEFAULTS.berryFamilies, ...(saved.berryFamilies || {}) } };
    for (const k of Object.keys(c)) if (!(k in DEFAULTS) && k !== 'migratedFrom') delete c[k];
    return c;
  }
  function defaultCfg() {
    return { ...DEFAULTS, berryFamilies: { ...DEFAULTS.berryFamilies } };
  }
  function writeCfg(c) {
    c.preset = detectPreset(c);
    lsSet(CFG_KEY, JSON.stringify(c));
    storeSet(CFG_KEY, JSON.parse(JSON.stringify(c)));
  }

  /** 开关组合恰好等于某一档就算该档，手动改过任何一项就是「自定义」 */
  function detectPreset(c) {
    for (const [name, p] of Object.entries(PRESETS)) {
      if (Object.keys(p.cfg).every((k) => c[k] === p.cfg[k])) return name;
    }
    return 'custom';
  }

  /**
   * 一键挂机：先自检，页面结构或弹窗规则有失败项时不放心全托管，降为「稳妥」。
   * 返回实际生效的档位。
   */
  function applyPreset(name) {
    if (!PRESETS[name]) return S.cfg.preset;
    let target = name;
    const st = runSelfTest();
    if (st.fails && name !== 'safe') {
      target = 'safe';
      log('warn', `自检有 ${st.fails} 项失败，暂按「稳妥」档运行（点「诊断」查看）`);
    }
    Object.assign(S.cfg, PRESETS[target].cfg);
    writeCfg(S.cfg);
    S.pausedByUser = false;
    setKeepAlive(!!S.cfg.keepAlive).catch(() => {});
    if (S.cfg.wakeLock) requestWakeLock();
    log('info', `一键挂机：已切到「${PRESETS[target].label}」档 —— ${PRESETS[target].desc}`);
    renderHud();
    return target;
  }
