  /* ====================== 模块：自动开始游戏 ====================== */

  function ensureStarted() {
    const go = document.querySelector('.ti-go');
    if (go && go.offsetParent !== null) {
      if (now() - (S.lastStartAt || 0) > 6000) {
        S.lastStartAt = now();
        fire(go);
        log('info', '检测到标题画面，自动进入游戏');
        setTimeout(() => { S.lastProgressAt = now(); S.lastTickAt = now(); }, 1500);
      }
      return true;
    }
    return false;
  }
