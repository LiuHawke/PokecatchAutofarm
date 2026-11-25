  /* ====================== 昼夜 / 场景常量（对齐游戏 DAYTIME 规则） ====================== */

  // 来源：t.DAYTIME.PHASES —— 早晨 8:00 起、白天 10:00 起、夜晚 20:00 起（浏览器本地时区）
  const PHASES = [
    { key: 'morning', icon: '🌅', name: '早晨', from: 8 },
    { key: 'day', icon: '☀️', name: '白天', from: 10 },
    { key: 'night', icon: '🌙', name: '夜晚', from: 20 },
  ];
  // 室内场景：昼夜权重完全不生效（游戏用 Math.max 取最大权重）
  const INDOOR_RE = /cave|tunnel|tower|mansion|silph|power-plant|well|ruins-of-alph-interior|ice-path|whirl|mortar|falls|dragons-den|seafoam|mt-moon|victory-road|underground|dojo|rocket-hq|house|lab|department|game-corner|pokemon-center/i;

  function phaseIndex(h = new Date().getHours()) {
    return h >= 20 || h < 8 ? 2 : h >= 10 ? 1 : 0;
  }
  function phaseInfo() {
    const d = new Date();
    const idx = phaseIndex(d.getHours());
    const next = new Date(d);
    if (idx === 2) {
      next.setHours(8, 0, 0, 0);
      if (next <= d) next.setDate(next.getDate() + 1);
    } else if (idx === 0) {
      next.setHours(10, 0, 0, 0);
    } else {
      next.setHours(20, 0, 0, 0);
    }
    const mins = Math.max(0, Math.round((next - d) / 60000));
    return { idx, ...PHASES[idx], until: next, mins, left: `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m` };
  }
  function nodeIndoor(node) {
    if (!node) return false;
    if (node.type === 'heal' || node.bg === 'pokecenter') return true;
    if (typeof node.indoor === 'boolean') return node.indoor;
    if (node.type === 'gift') return true;
    if (/^(cave|gym|pokecenter)/.test(node.bg || '')) return true;
    return INDOOR_RE.test(node.bg || '');
  }
