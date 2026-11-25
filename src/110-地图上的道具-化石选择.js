  /* ====================== 模块：地图上的道具 / 化石选择 ====================== */

  function handleItemChoice() {
    const box = document.querySelector('.item-choice');
    if (!box) return false;
    if (document.querySelector('.modal')) return false;      // 有弹窗时先处理弹窗
    if (userBusy(1800)) return true;                          // 玩家自己在选
    if (now() - (S.lastChoiceAt || 0) < 900) return true;

    const items = $$('.ic-item', box);
    if (!items.length) return true;
    const picked = items.find((i) => i.classList.contains('on'));
    if (!picked) { S.lastChoiceAt = now(); fire(items[0]); return true; }

    const go = box.querySelector('.ic-go');
    if (go && !go.disabled) {
      S.lastChoiceAt = now();
      const label = go.textContent.trim();
      fire(go);
      log('info', '自动选择：' + label);
      S.lastProgressAt = now();
    }
    return true;
  }
