  /* ====================== 模块：游戏城无人值守 ====================== */

  function casinoAuto() {
    if (!S.cfg.casinoAuto) return;
    const scr = document.querySelector('#screen-casino');
    if (!scr || !scr.classList.contains('active')) return;      // 只在游戏城页面
    if (userBusy(2500)) return;
    const save = S.save || {};
    const money = save.money || 0;
    const floor = (S.cfg.casinoFloor ?? 50000);
    const auto = scr.querySelector('.cs-slots .cs-auto') || scr.querySelector('.cs-auto');
    if (!auto) return;
    const on = auto.classList.contains('on');

    // 上次点了没生效（按钮被禁用、界面改版）：记一次失败；冷却 5 秒，避免每轮都点
    const p = S.casinoPending;
    if (p) {
      if (on === p.want) { S.casinoPending = null; S.taskFails.casinoAuto = 0; }
      else if (now() - p.at < 5000) return;
      else { S.casinoPending = null; taskResult('casinoAuto', '游戏城自动', { ok: false, msg: '点击开关后状态没变' }); }
    }
    const toggle = (want, kind, msg) => {
      fire(auto);
      S.casinoPending = { want, at: now() };
      log(kind, msg);
    };

    // 金钱保护：低于阈值自动停
    if (money < floor) {
      if (on) toggle(false, 'warn', `游戏城自动已关闭（金钱 ${money} < ${floor}）`);
      return;
    }
    if (!on && S.cfg.casinoAuto) toggle(true, 'info', '游戏城自动模式已开启');
  }
