  /* ====================== 模块：弹窗托管 ====================== */

  function findModal() {
    return $('#modal-root .modal') || $('.modal-root.open .modal') || $('body > .modal');
  }

  function pickContinue(modal, test = false) {
    return $$('button, .btn', modal).find((b) => {
      const t = b.textContent.trim();
      if ((!test && b.offsetParent === null) || t.length > 14 || DENY.test(t)) return false;
      return /^(继续|太棒了|好的|明白了|知道了|OK|Okay|Continue|Continuer|Super|Génial|Bravo|Weiter|Continuar|계속|続ける|はい)[\s!！。.~～]*$/i.test(t);
    });
  }

  /**
   * 统一的「需要您亲自点一下」提醒。
   * 之前 DANGER 分支把 S.lastNotifyKey 当作「已处理」标记来用，结果和末尾的告警条件撞车，
   * 导致最需要提醒的那一类弹窗反而从不响铃。现在 lastNotifyKey 只负责通知去重。
   */
  function warnManual(m, sig, why, delay = 6000) {
    if (now() - S.modalSince < delay) return;   // 先留时间给玩家自己处理
    if (S.lastNotifyKey === sig) return;        // 同一个弹窗只提醒一次
    S.lastNotifyKey = sig;
    S.unknownModal = (m.innerText || '').trim().slice(0, 200) || '（无文字弹窗）';
    log('warn', `需要手动处理${why ? `（${why}）` : ''}：` + S.unknownModal.slice(0, 36));
    beep('warn');
    notify("Poke'Catch 需要一次点击", S.unknownModal.slice(0, 120), 'pcauto-modal');
    S.tally.manual++;
    scheduleHud();
  }

  /*
   * 弹窗类型按游戏 UI.modal({ className }) 的固定 class 判断，文案只作兜底：
   * 游戏换语言或改文案时，按 class 的规则仍然有效。
   */
  const MODAL_PLAYER = /\b(mon-modal|bag-modal|pl-modal|gt-modal|bs-modal|fc-modal|sup-modal|opt-modal)\b|\bevt-/;
  const MODAL_NOTICE = [
    [/\b(raid-dlg|rd-dlg)\b/, '团体战', 'raid'],
    [/\b(mk-dlg|mkc-modal)\b/, '黑市', 'market'],
    [/\bug-dlg\b/, '地下通道', 'manual'],
  ];
  const MODAL_KNOWN = new Set(['modal', 'dexcard-modal', 'oc-modal', 'ot-dlg', 'ot-dlg-bn', 'ot-pickdlg', 'mon-modal', 'bag-modal',
    'pl-modal', 'gt-modal', 'bs-modal', 'fc-modal', 'gd-modal', 'gd-tip-modal', 'raid-dlg', 'rd-dlg', 'mk-dlg', 'mkc-modal', 'ug-dlg',
    'ug-back', 'ug-recap', 'cr-back', 'tw-back', 'dp-modal', 'sup-modal', 'tab-modal', 'confirm-modal', 'opt-modal']);

  function modalButtons(m, test) {
    return $$('button, .btn', m).filter((b) => !b.disabled && (test || b.offsetParent !== null));
  }

  /**
   * 只判断、不点击：返回 { kind, act: 'click' | 'warn' | 'wait', btn, why, delay, push, log }。
   * test=true 时忽略可见性，供自检用脱离文档的样例弹窗调用。
   */
  function classifyModal(m, test = false) {
    const cls = m.className || '';
    const text = m.innerText || m.textContent || '';
    const btns = modalButtons(m, test);
    const byText = (re) => btns.find((b) => re.test((b.textContent || '').trim()));
    const primary = btns.find((b) => /\b(gold|primary)\b/.test(b.className) && !DENY.test(b.textContent || ''));

    // 玩家自己打开的详情/背包卡片：开着超过 20 秒说明是忘了关 —— 挂机已经停了，得提醒。
    // 必须排在 DANGER 前面：详情卡上可能有「放生」按钮
    if (MODAL_PLAYER.test(cls)) return { kind: 'player', act: 'warn', why: '详情卡未关闭，挂机已暂停', delay: 20000 };

    if (DANGER.test(text)) return { kind: 'danger', act: 'warn', why: '含不可逆操作，需您亲自确认' };

    for (const [re, label, push] of MODAL_NOTICE) {
      if (!re.test(cls)) continue;
      if (intentFresh('event', 15000) && primary) return { kind: 'notice', act: 'click', btn: primary, log: ['event', `${label}：已自动确认`] };
      return { kind: 'notice', act: 'warn', why: `${label}需要您处理`, push, delay: 3000 };
    }

    // 树果替换（ot-dlg）：脚本发起的选「替换」；玩家自己点的给 10 秒，超时「保留」关闭防卡死
    if (/\bot-dlg\b/.test(cls)) {
      const swap = byText(/替换|Remplacer|Replace|Reemplazar|Ersetzen/i);
      const keep = byText(/保留|Garder|Keep|Mantener|Behalten/i);
      if (intentFresh('berry', 10000) && swap) return { kind: 'berry', act: 'click', btn: swap, log: ['item', '树果替换已确认'] };
      if (keep) {
        if (now() - (S.userAt || 0) < 10000) return { kind: 'berry', act: 'wait' };
        return { kind: 'berry', act: 'click', btn: keep, log: ['item', '树果替换弹窗已自动关闭（保留原增益）'] };
      }
      if (swap) return { kind: 'berry', act: 'click', btn: swap };
      return { kind: 'berry', act: 'warn', why: '' };
    }

    // 捕获图鉴卡 / 回顾结算（oc-modal）/ 首次进入的指南（gd-modal）：只有「继续」类按钮才关
    if (/\b(dexcard-modal|oc-modal|gd-modal)\b/.test(cls) && S.cfg.autoDex) {
      const btn = pickContinue(m, test);
      if (btn) {
        const kind = /\boc-modal\b/.test(cls) ? 'recap' : /\bgd-modal\b/.test(cls) ? 'guide' : 'dex';
        return { kind, act: 'click', btn };
      }
    }

    // 礼物 / 单选类：先选一个再确认
    const picks = $$('.lk-slot.pick', m);
    if (picks.length && S.cfg.autoGift) {
      if (!picks.some((p) => p.classList.contains('on'))) return { kind: 'gift', act: 'click', btn: picks[0], progress: false };
      const go = $$('.lk-go, .btn.primary, .btn.gold', m).find((b) => !b.disabled);
      if (go) return { kind: 'gift', act: 'click', btn: go };
    }

    if (intentFresh('berry', 8000) && /Remplacer ta baie|替换|Replace your berry|Berry/i.test(text)) {
      const swap = btns.find((b) => /^\s*(替换|Remplacer|Replace|Reemplazar|Ersetzen)/i.test(b.textContent));
      if (swap) return { kind: 'berry', act: 'click', btn: swap };
    }
    if (intentFresh('evo', 5000)) {
      const evo = btns.find((b) => /^\s*(进化|Évoluer|Evolve|Faire évoluer)/i.test(b.textContent));
      if (evo) return { kind: 'evo', act: 'click', btn: evo };
    }

    // 普通确认：按钮 ≤ 3 且有安全文案；花钱的确认只放行脚本自己发起的
    const shown = btns.filter((b) => b.tagName === 'BUTTON');
    const spend = SPEND.test(text);
    const ownSpend = intentFresh('shop', 6000);
    const safe = shown.find((b) => { const t = b.textContent.trim(); return SAFE_EXACT.includes(t) && !DENY.test(t); });
    if (S.cfg.autoModal && (!spend || ownSpend)) {
      if (safe && shown.length <= 3) return { kind: 'confirm', act: 'click', btn: safe };
      // 只有一个主按钮的纯提示框：不认识文案也能关（换语言后仍有效）
      if (shown.length === 1 && primary === shown[0]) return { kind: 'confirm', act: 'click', btn: primary };
    }
    if (spend) return { kind: 'spend', act: 'warn', why: '涉及花费，需您确认' };
    return { kind: 'unknown', act: 'warn', why: '' };
  }

  /** 没登记过的 class 第一次出现时记一笔，方便以后补规则 */
  function noteModalClasses(m) {
    for (const c of (m.className || '').split(/\s+/)) {
      if (!c || MODAL_KNOWN.has(c) || S.modalClsSeen[c]) continue;
      S.modalClsSeen[c] = now();
      log('info', `遇到未登记的弹窗类型：${c}`);
    }
  }

  function handleModals() {
    const m = findModal();
    if (!m) {
      if (S.unknownModal) { S.unknownModal = ''; scheduleHud(); }
      S.modalKey = ''; S.modalSince = 0;
      return;
    }
    const sig = (m.className || '') + '|' + m.innerText.slice(0, 60);
    if (sig !== S.modalKey) { S.modalKey = sig; S.modalSince = now(); }
    if (now() - S.modalHandledAt < 700) return;  // 冷却，避免连点

    // 玩家正在操作（点开详情/翻背包）：一律不插手
    if (userBusy(2500)) {
      if (S.unknownModal) { S.unknownModal = ''; scheduleHud(); }
      return;
    }

    noteModalClasses(m);
    const r = classifyModal(m);
    if (r.act === 'click' && r.btn) {
      fire(r.btn);
      S.modalHandledAt = now();
      if (r.progress !== false) S.lastProgressAt = now();
      if (r.log) log(r.log[0], r.log[1]);
      return;
    }
    if (r.act === 'warn') warnManual(m, sig, r.why, r.delay, r.push);
  }
