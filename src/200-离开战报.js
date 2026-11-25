  /* ====================== 模块：离开战报 ====================== */

  function hiddenMsNow() { return S.hiddenTotalMs + (S.hiddenSince ? now() - S.hiddenSince : 0); }

  /** 往战报流水里记一件事（闪光、徽章、活动） */
  function tallyEvent(listKey, text) {
    const arr = S.tally[listKey];
    arr.push({ at: now(), text });
    if (arr.length > 100) arr.shift();
  }

  function tallySnap() {
    const t = S.tally;
    return {
      at: now(), hiddenMs: hiddenMsNow(), dexNew: t.dexNew,
      caught: t.caught, battles: t.battles, money: t.money, evolutions: t.evolutions,
      berries: t.berries, deaths: t.deaths, manual: t.manual, stalls: t.stalls,
      teamSwaps: t.teamSwaps, hatched: t.hatched, deposited: t.deposited, candies: t.candies,
      shopSpent: t.shopSpent, retreats: t.retreats, advances: t.advances, catchupMin: t.catchupMin,
    };
  }

  function reportSince(snap) {
    const c = tallySnap();
    const since = (k) => S.tally[k].filter((x) => x.at >= snap.at).map((x) => x.text);
    const d = (k) => Math.max(0, (c[k] || 0) - (snap[k] || 0));
    return {
      durMs: c.at - snap.at, hiddenMs: d('hiddenMs'), dex: d('dexNew'),
      caught: d('caught'), battles: d('battles'), money: d('money'), evolutions: d('evolutions'),
      berries: d('berries'), deaths: d('deaths'), manual: d('manual'), stalls: d('stalls'),
      teamSwaps: d('teamSwaps'), hatched: d('hatched'), deposited: d('deposited'), candies: d('candies'),
      shopSpent: d('shopSpent'), retreats: d('retreats'), advances: d('advances'), catchupMin: d('catchupMin'),
      shinies: since('shinies'), badges: since('badges'), events: since('events'),
    };
  }

  function fmtDur(ms) {
    const m = Math.round(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`;
  }

  function showReport(rep, title) {
    $('#pcauto-report')?.remove();
    const rows = [
      ['时长', fmtDur(rep.durMs)],
      rep.hiddenMs > 60000 && ['其中后台停摆', fmtDur(rep.hiddenMs), '#f87171'],
      ['捕获', fmt(rep.caught), '#8ee98e'],
      rep.dex && ['新图鉴', '+' + rep.dex, '#8ee98e'],
      ['战斗', fmt(rep.battles)],
      ['赚到', '₽ ' + fmt(rep.money), '#ffcb05'],
      rep.evolutions && ['进化', String(rep.evolutions)],
      rep.catchupMin && ['其中离线补算', fmtDur(rep.catchupMin * 60000), '#93c5fd'],
      rep.berries && ['吃树果', String(rep.berries)],
      rep.candies && ['喂经验糖', rep.candies + ' 颗'],
      rep.teamSwaps && ['自动换队', rep.teamSwaps + ' 次', '#c084fc'],
      rep.hatched && ['孵化', rep.hatched + ' 个蛋', '#8ee98e'],
      rep.deposited && ['寄放培育屋', rep.deposited + ' 只'],
      rep.shopSpent && ['补糖花费', '₽ ' + fmt(rep.shopSpent), '#f59e0b'],
      rep.advances && ['章节推进', rep.advances + ' 次', '#ffcb05'],
      rep.retreats && ['连败回退刷级', rep.retreats + ' 次', '#f59e0b'],
      rep.deaths && ['挑战失败', String(rep.deaths), '#f59e0b'],
      rep.manual && ['卡在弹窗等您处理', rep.manual + ' 次', '#f59e0b'],
      rep.stalls && ['停滞告警', rep.stalls + ' 次', '#f59e0b'],
    ].filter(Boolean);
    const list = (label, arr, color) => arr.length
        ? `<div style="margin-top:6px"><span style="color:#8b93a7">${label}</span><div style="color:${color};font-size:12px">${arr.slice(-12).map(esc).join('<br>')}${arr.length > 12 ? `<br>…共 ${arr.length} 条` : ''}</div></div>` : '';

    const box = document.createElement('div');
    box.id = 'pcauto-report';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483002;background:rgba(6,8,14,.6);display:flex;align-items:center;justify-content:center';
    box.innerHTML = `<div style="width:300px;max-height:80vh;overflow:auto;background:#12141c;border:1px solid rgba(255,203,5,.32);border-radius:14px;padding:14px 16px;color:#e8ecf4;font:13px/1.6 system-ui,-apple-system,'PingFang SC',sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.65)">
      <b style="font-size:15px">${esc(title)}</b>
      <div style="margin-top:8px">${rows.map(([k, v, color]) => `<div style="display:flex;justify-content:space-between"><span style="color:#8b93a7">${k}</span><b style="color:${color || '#e8ecf4'}">${esc(v)}</b></div>`).join('')}</div>
      ${list('✨ 闪光', rep.shinies, '#f472b6')}
      ${list('🏅 徽章', rep.badges, '#ffcb05')}
      ${list('⚡ 活动', rep.events, '#93c5fd')}
      <button id="pcauto-report-ok" style="width:100%;margin-top:12px;padding:8px;border-radius:9px;border:0;background:#ffcb05;color:#12141c;font-weight:700;cursor:pointer">知道了</button>
    </div>`;
    document.documentElement.appendChild(box);
    $('#pcauto-report-ok', box).onclick = () => box.remove();
    box.onclick = (e) => { if (e.target === box) box.remove(); };
  }

  /** 您回到电脑前（真实操作或切回标签页）时调用 */
  function markPresent() {
    const t = now();
    if (t - S.awayLastSeen < 1000) return;   // 节流，避免每次按键都拍快照
    const gone = t - S.awayLastSeen;
    if (S.cfg.awayReport && S.awaySnap && S.awayLastSeen && gone >= clamp(S.cfg.awayMin, 1, 1440) * 60000) {
      const rep = reportSince(S.awaySnap);
      log('info', `离开 ${fmtDur(rep.durMs)}：捕获 ${rep.caught}，闪光 ${rep.shinies.length}，₽${fmt(rep.money)}`);
      showReport(rep, '离开期间战报');
    }
    S.awaySnap = tallySnap();
    S.awayLastSeen = t;
  }

  // 战报流水存在页面 localStorage：自动刷新后能接上。只接 10 分钟内的，避免关掉页面一晚后把旧数据当成新的
  function saveTally() {
    lsSet(TALLY_KEY, JSON.stringify({ at: now(), tally: S.tally, awaySnap: S.awaySnap, awayLastSeen: S.awayLastSeen }));
  }
  function loadTally() {
    const p = safeParse(lsGet(TALLY_KEY), null);
    if (!p || !p.tally || now() - (p.at || 0) > 10 * 60000) return;
    S.tally = { ...S.tally, ...p.tally };
    for (const k of ['shinies', 'badges', 'events']) if (!Array.isArray(S.tally[k])) S.tally[k] = [];
    S.awaySnap = p.awaySnap || null;
    S.awayLastSeen = p.awayLastSeen || 0;
  }
