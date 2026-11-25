  /* ====================== 模块：采样统计 ====================== */

  function detectShiny(save) {
    const pool = [
      ...(save.mons || []),
      ...((save.pension && save.pension.mons) || []).map((p) => p && p.mon).filter(Boolean),
    ];
    const priming = !S.shinyPrimed;      // 本次会话第一次扫描
    let added = 0;
    for (const mon of pool) {
      if (!mon || !mon.shiny) continue;
      const key = String(mon.id) + ':' + String(mon.uid || '');
      if (S.shinyKeys.has(key)) continue;
      S.shinyKeys.add(key);
      added++;
      // 首轮只登记不通知：持久化记录有上限会被裁剪，否则老闪光会在重载后被当成新发现重报一遍
      if (priming) continue;
      S.shinySession++;
      const name = mon.name || ('No.' + mon.id);
      log('shiny', `✨ 闪光 ${name} Lv.${mon.level || '?'}`);
      beep('rare');
      notify('✨ 发现闪光宝可梦', `${name} Lv.${mon.level || '?'}`, 'pcauto-shiny');
      tallyEvent('shinies', `${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${name} Lv.${mon.level || '?'}`);
    }
    S.shinyPrimed = true;
    // 写盘挪出循环：原先每发现一只就序列化整个集合一次
    if (added) lsSet(SHINY_KEY, JSON.stringify([...S.shinyKeys].slice(-4000)));
  }

  function applyRates(sample) {
    const w = S.win;
    if (w.length > 0) {
      const prev = w[w.length - 1];
      const dm = (sample.money || 0) - (prev.money || 0);
      if (dm > 0) S.sessionEarned += dm;
    }
    w.push(sample);
    // 窗口 300 个样本 × 2 秒 ≈ 10 分钟。原先 45 个样本只有 90 秒，外推出来的「每小时」抖动极大。
    while (w.length > 300) w.shift();
    const first = w[0];
    const spanH = Math.max(1 / 3600, (sample.at - first.at) / 3600000);

    // 修复：只累计相邻样本的正向增长，避免花钱消费导致极差虚高
    const posDelta = (key) => {
      let sum = 0;
      for (let i = 1; i < w.length; i++) {
        const diff = (w[i][key] || 0) - (w[i - 1][key] || 0);
        if (diff > 0) sum += diff;
      }
      return sum;
    };
    S.rate.catch = Math.round(posDelta('caught') / spanH);
    S.rate.battle = Math.round(posDelta('battles') / spanH);
    S.rate.money = Math.round(posDelta('money') / spanH);

    const b = S.baseline;
    if (b) {
      const h = Math.max(1 / 3600, (sample.at - b.at) / 3600000);
      S.avg.catch = Math.round((sample.caught - b.caught) / h);
      S.avg.battle = Math.round((sample.battles - b.battles) / h);
      S.avg.money = Math.round(S.sessionEarned / h);
    }
  }

  function sample() {
    const raw = readSaveRaw();
    if (!raw) {
      // 存档 key 写死在 SAVE_KEY，游戏一旦升版就会静默失效（HUD 全是 0 且毫无提示）
      if (!S.saveMissWarned && now() - S.bootAt > 30000) {
        S.saveMissWarned = true;
        log('warn', `读不到存档（${SAVE_KEY}），游戏可能更新了存档格式，统计与树果功能将不可用`);
      }
      return;
    }
    // 存档内容没变就不重新 parse：几百只宝可梦的存档每 2 秒全量 parse 一次是白烧 CPU
    if (raw !== S.saveRaw) {
      const parsed = safeParse(raw, null);
      if (!parsed) return;
      S.saveRaw = raw;
      S.save = parsed;
      detectShiny(parsed);
    }
    const save = S.save;
    if (!save) return;
    S.saveMissWarned = false;
    const st = save.stats || {};
    const point = {
      at: now(),
      caught: st.caught || 0,
      battles: st.battles || 0,
      money: save.money || 0,
      dex: Object.keys(save.dex || {}).length,
    };
    if (!S.baseline) S.baseline = { ...point };

    // 战报累计：只加相邻采样的正增量（花钱、恢复存档导致的减少不算）
    const prevPt = S.win[S.win.length - 1];
    const evoNow = st.evolutions || 0;
    if (prevPt) {
      const t = S.tally;
      t.caught += Math.max(0, point.caught - prevPt.caught);
      t.battles += Math.max(0, point.battles - prevPt.battles);
      t.money += Math.max(0, point.money - prevPt.money);
      if (S.lastEvoCount != null) t.evolutions += Math.max(0, evoNow - S.lastEvoCount);
    }
    S.lastEvoCount = evoNow;
    // 新图鉴按增量累计：快照里直接存图鉴总数的话，启动时还没采样，第一份战报会显示「新图鉴 +400」
    if (S.lastDex != null && point.dex > S.lastDex) S.tally.dexNew += point.dex - S.lastDex;
    if (S.lastDex == null || point.dex > S.lastDex) S.lastDex = point.dex;

    const adv = save.adv || {};
    // 用 lastTick 判断世界是否在推进（游戏每步都会刷新）
    if (save.lastTick && save.lastTick !== S.lastTick) {
      S.lastTick = save.lastTick;
      S.lastTickAt = now();
    }
    const nodeKey = `${adv.chapter || 0}:${adv.node || 0}`;
    if (nodeKey !== S.lastNodeKey) {
      if (S.lastNodeKey) S.lastProgressAt = now();
      S.lastNodeKey = nodeKey;
      S.stalled = false;
    }
    // 相位切换
    const ph = phaseInfo();
    if (ph.idx !== S.phase) {
      const prev = S.phase;
      S.phase = ph.idx;
      S.phaseAt = now();
      if (prev >= 0 && S.cfg.phaseNotify) {
        log('phase', `${ph.icon} 进入${ph.name}时段`);
        if (ph.idx === 2) {
          beep('rare');
          notify('🌙 夜晚开始', '夜间限定宝可梦开始出没（20:00–07:59）', 'pcauto-phase');
        } else if (ph.idx === 0) {
          beep('info');
          notify('🌅 早晨开始', '早晨时段：08:00–09:59', 'pcauto-phase');
        }
      }
    }

    // 后台停摆计时
    const realHidden = isRealHidden();
    if (realHidden && !S.hiddenSince) S.hiddenSince = now();
    if (!realHidden && S.hiddenSince) {
      const gapMs = now() - S.hiddenSince;
      S.hiddenTotalMs += gapMs;
      S.hiddenSince = 0;
      if (gapMs > 60000) {
        const mins = Math.round(gapMs / 60000);
        log('warn', `标签页在后台 ${mins} 分钟，游戏这期间是停摆的`);
      }
    }

    // 离线/补算检测：单次采样里 lastTick 突然前进
    if (S.prevTick && save.lastTick) {
      const jump = save.lastTick - S.prevTick;
      if (jump > 30000) {
        const mins = Math.round(jump / 60000);
        const p2 = phaseInfo();
        // 补算的收益已经在上面的相邻增量里计入战报，这里只记录分钟数和这一跳的收益
        S.tally.catchupMin += mins;
        S.catchup = {
          at: now(), mins,
          money: prevPt ? Math.max(0, point.money - prevPt.money) : 0,
          caught: prevPt ? Math.max(0, point.caught - prevPt.caught) : 0,
        };
        log('info', `补算了约 ${mins} 分钟（按 ${p2.icon}${p2.name} 的时段结算）：+${fmt(S.catchup.money)} ₽，捕获 +${S.catchup.caught}`);
        if (mins >= 30) notify('离线补偿结算', `补算 ${mins} 分钟，按当前时段「${p2.name}」计算`, 'pcauto-catchup');
      }
    }
    if (save.lastTick) S.prevTick = save.lastTick;

    // 实际倍率：游戏内时间推进 / 真实时间（后台或卡顿时会明显低于 2.5）
    if (S.speedPrev && save.lastTick) {
      const dtReal = (point.at - S.speedPrev.at) / 1000;
      const dtGame = (save.lastTick - S.speedPrev.tick) / 1000;
      if (dtReal >= 1.5 && !S.hiddenSince && dtGame > 0.05) {
        const ratio = dtGame / dtReal;
        S.speedRatio = S.speedRatio == null ? ratio : S.speedRatio * 0.7 + ratio * 0.3;
      }
    }
    S.speedPrev = { at: point.at, tick: save.lastTick };

    // 分相位捕获统计
    if (S.lastCatchCount >= 0) {
      const d = point.caught - S.lastCatchCount;
      if (d > 0) {
        S.phaseCatch[ph.idx] = (S.phaseCatch[ph.idx] || 0) + d;
        S.lastCatchAt = now();
        S.lastProgressAt = now();
        S.evoFail = 0;      // 抓到新怪可能解锁了新的进化路线，解除进化退避
      }
    }
    S.lastCatchCount = point.caught;

    const badgeKey = (adv.badges || []).join(',');
    if (badgeKey !== S.lastBadgeKey) {
      if (S.lastBadgeKey != null) {
        const idx = (adv.badges || []).length;
        log('badge', `🏅 获得第 ${idx} 枚徽章`);
        beep('rare');
        notify('🏅 新徽章', `已获得 ${idx} 枚徽章`, 'pcauto-badge');
        tallyEvent('badges', `第 ${idx} 枚徽章`);
      }
      S.lastBadgeKey = badgeKey;
    }

    applyRates(point);
    deathWatch(save);
    confirmBerry(save);
    progressWatch(save);
    watchEvent();
    scheduleHud();
  }
