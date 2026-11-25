  /* ====================== 模块：后台保活（实验） ====================== */

  function getDocDesc(name) {
    const W = PAGE_WIN;
    return (W.Document && Object.getOwnPropertyDescriptor(W.Document.prototype, name))
        || (W.HTMLDocument && Object.getOwnPropertyDescriptor(W.HTMLDocument.prototype, name))
        || Object.getOwnPropertyDescriptor(PAGE_DOC, name);
  }

  function ensureRealDescs() {
    if (!S.realDescs) {
      S.realDescs = { descH: getDocDesc('hidden'), descV: getDocDesc('visibilityState') };
    }
    return S.realDescs;
  }

  async function setKeepAlive(on) {
    if (on && !S.keepAliveOn) {
      ensureRealDescs();
      try {
        Object.defineProperty(PAGE_DOC, 'hidden', { configurable: true, get: () => false });
      } catch { /* 忽略 */ }
      try {
        Object.defineProperty(PAGE_DOC, 'visibilityState', { configurable: true, get: () => 'visible' });
      } catch { /* 忽略 */ }
      // 伪装一生效就要置位：下面的 resume() 在没有用户手势时可能一直挂起，置位晚了会导致关不掉保活
      S.keepAliveOn = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        const kaCtx = new AC();
        kaCtx.resume().catch(() => {});
        const osc = kaCtx.createOscillator();
        const gain = kaCtx.createGain();
        gain.gain.value = 0.0001;      // 近乎无声，仅用于让标签保持"有音频输出"
        osc.frequency.value = 55;
        osc.connect(gain).connect(kaCtx.destination);
        osc.start();
        S.keepAudio = { ac: kaCtx, osc };
      } catch { /* 无音频也可继续 */ }
      log('info', '后台保活已开启：解除了定时器节流，但 requestAnimationFrame 在后台仍会被浏览器完全停止');
    } else if (!on && S.keepAliveOn) {
      if (S.keepAudio) { try { S.keepAudio.osc.stop(); S.keepAudio.ac.close(); } catch { /* 忽略 */ } S.keepAudio = null; }
      if (S.realDescs?.descH) {
        try { Object.defineProperty(PAGE_DOC, 'hidden', { configurable: true, get: S.realDescs.descH.get }); } catch { /* 忽略 */ }
        try { Object.defineProperty(PAGE_DOC, 'visibilityState', { configurable: true, get: S.realDescs.descV.get }); } catch { /* 忽略 */ }
      }
      S.keepAliveOn = false;
      log('info', '后台保活已关闭');
    }
  }
