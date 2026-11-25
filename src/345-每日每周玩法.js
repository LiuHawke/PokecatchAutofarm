  /* ====================== 每日 / 每周玩法：解锁与提醒 ====================== */

  /*
   * 攻略建议的顺序：进行中的团体战 > 宝可方块首领 > 糖果工厂 > 团体战 > 对战塔（有里程碑且临近周一 08:00）> 主线；
   * 地下通道不占队伍，随时可派。
   * 这些玩法要么要登录拿服务器数据，要么结果由服务器校验，脚本只提醒、不代打。
   */
  const MODE_ORDER = ['bloc', 'candy', 'raid', 'tower', 'under', 'wboss'];

  /** 巴黎时间的日期（团体战、糖果工厂等按巴黎日切换） */
  function parisDay(t = now()) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    } catch { return dayKey(t); }
  }
  /** 距对战塔下次重置（周一 UTC 0 点）还有多少毫秒 */
  function towerResetIn(t = now()) {
    const d = new Date(t);
    const day = (d.getUTCDay() + 6) % 7;   // 周一 = 0
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7);
    return next - t;
  }

  /** 今日团体战首领（只读游戏接口；拿不到返回 null）：[{ key, name, boss, won, tried }] */
  function raidToday() {
    try {
      const R = nsOk() && NS().Raids;
      if (!R || typeof R.lane !== 'function') return null;
      return R.lane().map((x) => ({ key: x.key, name: REGION_ZH[x.key] || x.name, boss: x.boss, won: !!x.won, tried: typeof R.tried === 'function' ? R.tried(x.key) : 0 }));
    } catch { return null; }
  }

  /** 每个玩法今天的状态（只读存档里能看到的字段，看不到的标「未知」） */
  function modeStatus(save, f) {
    const out = [];
    const open = Object.fromEntries((f.modes || []).map((m) => [m.key, m]));
    for (const key of MODE_ORDER) {
      const m = open[key];
      if (!m) continue;
      let state = m.open ? '可玩' : '未解锁';
      let hint = '';
      if (m.open) {
        if (key === 'tower') {
          const best = ((save.tower || {}).best || {}).floor | 0;
          const h = Math.round(towerResetIn() / 3600000);
          hint = `本周最高 ${best} 层，${h} 小时后重置`;
          if (h < 24 && best % 10 !== 0) state = '临近截止';
        } else if (key === 'under') {
          const u = save.under || {};
          hint = u.day ? `今日已派 ${(u.used | 0)} 次` : '';
        } else if (key === 'raid') {
          const r = save.raids || {};
          hint = r.last ? `上次 ${String(r.last).slice(0, 10)}` : '';
          const today = raidToday();
          if (today && today.length) {
            hint = today.map((x) => `${x.name}：${x.boss ? TA_NAME[x.boss - 1] || '#' + x.boss : '?'}${x.won ? '（已赢）' : x.tried ? `（今天试了 ${x.tried} 次）` : ''}`).join('；');
            if (today.every((x) => x.won)) state = '今日已打';
          }
        } else if (key === 'bloc' || key === 'candy') {
          const b = save[key] || {};
          if (b.played && String(b.played).slice(0, 10) === parisDay()) state = '今日已打';
        }
      } else {
        hint = {
          raid: '需要关都冠军徽章', under: '需要神奥森林徽章', candy: '需要丰缘冠军徽章',
          tower: '需要打赢丰缘联盟', wboss: '需要打赢神奥联盟', bloc: '需要打赢合众联盟',
        }[key];
      }
      out.push({ key, zh: m.zh, cycle: m.cycle, open: m.open, state, hint });
    }
    return out;
  }

  /** 新解锁的玩法提醒一次；对战塔临近截止且有里程碑没拿时提醒一次 */
  function modesTick() {
    const save = S.save;
    const f = facts(save);
    if (!f) return;
    const st = progState();
    st.modesSeen = st.modesSeen || {};
    for (const s of modeStatus(save, f)) {
      if (s.open && !st.modesSeen[s.key]) {
        st.modesSeen[s.key] = now();
        persistProg();
        if (S.modesPrimed) {
          log('badge', `新玩法解锁：${s.zh}（${s.cycle}）`);
          notify('新玩法解锁', s.zh, 'pcauto-mode');
        }
      }
      if (s.key === 'tower' && s.state === '临近截止') {
        tellOnce(`tower:${parisDay()}`, '对战塔快重置了', `对战塔 ${s.hint}，本周还有里程碑没拿`);
      }
    }
    S.modesPrimed = true;
  }
