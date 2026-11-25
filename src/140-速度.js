  /* ====================== 模块：速度 ====================== */

  /**
   * @param force 失败后的死磕模式会强制重设一次（忽略玩家让路窗口）
   * 冷却是必须的：这里靠 class 'on' 判断是否已选中，万一游戏改版换了选中态的表示方式，
   * 没有冷却就会变成每 350ms 点一次速度按钮，永不停歇。
   */
  function ensureSpeed(force = false) {
    if (!force && userBusy(8000)) return;   // 玩家刚动过界面，别抢着改速度
    if (now() - (S.speedAt || 0) < 3000) return;
    const btns = $$('#speed-btns button');
    if (!btns.length) return;
    const want = String(S.cfg.speed);
    const target = btns.find((b) => b.dataset.speed === want) || btns[btns.length - 1];
    if (target && !target.classList.contains('on')) {
      S.speedAt = now();
      fire(target);
    }
  }
