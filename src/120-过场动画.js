  /* ====================== 模块：过场动画 ====================== */

  function handleCutscene() {
    const tap = document.querySelector('.rc-fx .rc-tap, .lk-fx .rc-tap, .cinema .rc-tap');
    if (!tap) return false;
    if (now() - (S.lastTapAt || 0) < 1500) return true;
    S.lastTapAt = now();
    fire(tap);
    S.lastProgressAt = now();
    return true;
  }
