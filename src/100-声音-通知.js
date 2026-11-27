  /* ====================== 声音 / 通知 ====================== */

  let sfxCtx = null;
  // 浏览器要求用户手势之后才能创建 / 启动 AudioContext：没有手势前的提示音直接跳过，避免控制台警告
  let sfxUnlocked = false;
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
      addEventListener(ev, (e) => { if (e.isTrusted) sfxUnlocked = true; }, { capture: true, passive: true }));
  function beep(kind = 'info') {
    if (!S.cfg.sound || !sfxUnlocked) return;
    try {
      sfxCtx = sfxCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (sfxCtx.state === 'suspended') sfxCtx.resume();
      const t0 = sfxCtx.currentTime;
      const notes = kind === 'rare' ? [880, 1175, 1568] : kind === 'warn' ? [520, 392] : [740];
      notes.forEach((f, i) => {
        const o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
        o.type = kind === 'rare' ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.13);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + i * 0.13 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.13 + 0.12);
        o.connect(g).connect(sfxCtx.destination);
        o.start(t0 + i * 0.13); o.stop(t0 + i * 0.13 + 0.14);
      });
    } catch { /* 忽略 */ }
  }

  function notify(title, body, tag) {
    if (!S.cfg.notify) return;
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const n = new Notification(title, { body, tag, silent: true });
      setTimeout(() => n.close(), 9000);
    } catch { /* 忽略 */ }
  }
