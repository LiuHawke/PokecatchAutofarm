  /* ====================== 每日战报 ====================== */

  const DAILY_KEY = 'pcauto.daily.v1';
  const DAILY_FIELDS = ['caught', 'battles', 'money', 'evolutions', 'dexNew', 'berries', 'deaths', 'manual', 'stalls',
    'teamSwaps', 'hatched', 'deposited', 'candies', 'shopSpent', 'retreats', 'advances', 'catchupMin'];

  function dayKey(t = now()) {
    const d = new Date(t), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function dailyMark() {
    const c = tallySnap();
    return { ...c, advances: S.tally.advances || 0, nShiny: S.tally.shinies.length, nBadge: S.tally.badges.length };
  }

  /** 每 30 秒把战报增量并入当天的累计；跨天时把昨天的封存起来，面板里可以查看 */
  function dailyTick() {
    const d = safeParse(lsGet(DAILY_KEY), null) || { day: dayKey(), t: {} };
    const today = dayKey();
    if (d.day !== today) {
      d.prev = { day: d.day, t: d.t, sent: false };
      d.day = today;
      d.t = {};
    }
    const cur = dailyMark();
    const last = S.dailyLast;
    if (last) {
      for (const k of DAILY_FIELDS) d.t[k] = (d.t[k] || 0) + Math.max(0, (cur[k] || 0) - (last[k] || 0));
      d.t.shinyList = [...(d.t.shinyList || []), ...S.tally.shinies.slice(last.nShiny).map((x) => x.text)].slice(-50);
      d.t.badgeList = [...(d.t.badgeList || []), ...S.tally.badges.slice(last.nBadge).map((x) => x.text)].slice(-20);
      d.t.runMin = (d.t.runMin || 0) + Math.min(2, (cur.at - last.at) / 60000);
    }
    S.dailyLast = cur;
    lsSet(DAILY_KEY, JSON.stringify(d));
    return d;
  }

  function dailyText(rec) {
    const t = rec.t || {};
    const parts = [
      `挂机 ${fmtDur((t.runMin || 0) * 60000)}`,
      `捕获 ${fmt(t.caught)}${t.dexNew ? `（新图鉴 +${t.dexNew}）` : ''}`,
      `战斗 ${fmt(t.battles)}`,
      `赚到 ₽${fmt(t.money)}`,
      (t.shinyList || []).length && `✨ 闪光 ${t.shinyList.length}：${t.shinyList.slice(0, 5).join('、')}`,
      (t.badgeList || []).length && `🏅 ${t.badgeList.join('、')}`,
      t.advances && `章节推进 ${t.advances} 次`,
      t.evolutions && `进化 ${t.evolutions}`,
      t.teamSwaps && `自动换队 ${t.teamSwaps} 次`,
      t.retreats && `连败回退 ${t.retreats} 次`,
      t.shopSpent && `补糖花费 ₽${fmt(t.shopSpent)}`,
      t.manual && `卡弹窗 ${t.manual} 次`,
      t.stalls && `停滞 ${t.stalls} 次`,
    ].filter(Boolean);
    return parts.join('\n');
  }

  /** 设置里查看：今天的累计和昨天的封存 */
  function showDaily() {
    const d = dailyTick();
    const toRep = (t) => ({
      durMs: (t.runMin || 0) * 60000, hiddenMs: 0, dex: t.dexNew || 0,
      caught: t.caught || 0, battles: t.battles || 0, money: t.money || 0, evolutions: t.evolutions || 0,
      berries: t.berries || 0, deaths: t.deaths || 0, manual: t.manual || 0, stalls: t.stalls || 0,
      teamSwaps: t.teamSwaps || 0, hatched: t.hatched || 0, deposited: t.deposited || 0, candies: t.candies || 0,
      shopSpent: t.shopSpent || 0, retreats: t.retreats || 0, catchupMin: t.catchupMin || 0,
      advances: t.advances || 0, shinies: t.shinyList || [], badges: t.badgeList || [], events: [],
    });
    showReport(toRep(d.t), `今日战报 ${d.day}`);
    if (d.prev) {
      const box = $('#pcauto-report-ok');
      if (box) {
        const y = document.createElement('button');
        y.textContent = `查看昨天（${d.prev.day}）`;
        y.style.cssText = 'width:100%;margin-top:6px;padding:7px;border-radius:9px;border:1px solid #2c3346;background:transparent;color:#c7d0e0;cursor:pointer';
        y.onclick = () => showReport(toRep(d.prev.t), `日报 ${d.prev.day}`);
        box.after(y);
      }
    }
  }
