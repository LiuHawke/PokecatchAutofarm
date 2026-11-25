  /* ====================== 游戏接口：启动时拿到游戏内部对象 ====================== */
  /*
   * 游戏把所有模块放进一个对象后 Object.freeze，之后页面上再也摸不到。
   * 脚本在 document-start 往页面注入一小段代码，临时替换 Object.freeze / defineProperty：
   *   - 认出那个模块对象就记到 window.__pcautoNS，然后立即还原；
   *   - Adventure.step / tick 被定义成 getter 时换成带监听的版本（沙盒里不回调），供实战统计用。
   * 只读与沙盒重放：不调用 Cloud，不写存档，不碰 link。拿不到就退回原来的 DOM / localStorage 方式。
   */

  const NS_HOOK = `(() => {
    if (window.__pcautoHook) return;
    window.__pcautoHook = 1;
    const OF = Object.freeze, OD = Object.defineProperty;
    let wrapped = 0;
    const done = () => {
      if (Object.freeze === hf) Object.freeze = OF;
      if (Object.defineProperty === hd) Object.defineProperty = OD;
    };
    const hd = function (t, k, d) {
      try {
        if ((k === 'step' || k === 'tick') && d && typeof d.get === 'function' && t && typeof t.ensure === 'function'
          && typeof t.zonePool === 'function' && typeof t.startZone === 'function') {
          const fn = d.get.call(t);
          if (typeof fn === 'function' && !fn.__pcauto) {
            const w = function (...a) {
              const r = fn.apply(this, a);
              try {
                const tap = window.__pcautoTap, ns = window.__pcautoNS;
                if (tap && !(ns && ns.Game.inSandbox && ns.Game.inSandbox())) tap(k, r);
              } catch (e) { /* 统计出错不影响游戏 */ }
              return r;
            };
            w.__pcauto = 1;
            d = { ...d, get: () => w };
            wrapped++;
          }
        }
      } catch (e) { /* 忽略 */ }
      return OD.call(Object, t, k, d);
    };
    const hf = function (o) {
      try {
        if (o && o.Game && o.Game.DEX && o.Adventure && o.Adventure.zonePool && o.CONFIG && o.STORY && o.STORY.CHAPTERS) {
          window.__pcautoNS = o;
          window.__pcautoWrapped = wrapped;
          done();
        }
      } catch (e) { /* 忽略 */ }
      return OF.call(Object, o);
    };
    Object.freeze = hf;
    Object.defineProperty = hd;
    setTimeout(() => { done(); if (!window.__pcautoNS) window.__pcautoNSErr = '60 秒内没等到游戏内部对象'; }, 60000);
  })();`;

  (function installNsHook() {
    try {
      if (PAGE_WIN.__pcautoHook || PAGE_WIN.__pcautoNS) return;
      const sc = PAGE_DOC.createElement('script');
      sc.textContent = NS_HOOK;
      (PAGE_DOC.head || PAGE_DOC.documentElement).appendChild(sc);
      sc.remove();
    } catch { /* 忽略：退回旧方式 */ }
  })();

  const NS = () => PAGE_WIN.__pcautoNS || null;
  function nsOk() {
    const n = NS();
    return !!(n && n.Game && n.Adventure && typeof n.Game.sandbox === 'function' && typeof n.Game.inSandbox === 'function'
      && typeof n.Game.freshState === 'function' && typeof n.Adventure.step === 'function' && typeof n.Adventure.buildChapter === 'function');
  }
  /** 拿不到接口时的原因（给界面和自检看） */
  function nsWhy() {
    if (nsOk()) return '';
    if (PAGE_WIN.__pcautoNSErr) return PAGE_WIN.__pcautoNSErr;
    if (!PAGE_WIN.__pcautoHook) return '启动挂钩没装上（脚本比游戏晚加载，刷新页面再试）';
    return NS() ? '游戏接口缺少需要的函数（游戏可能改版了）' : '游戏还没加载完';
  }
  /** 游戏内存里的当前存档（只读）；拿不到时返回 null */
  function liveSave() {
    try { return nsOk() ? NS().Game.S || null : null; } catch { return null; }
  }
