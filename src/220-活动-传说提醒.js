  /* ====================== 模块：活动 / 传说提醒 ====================== */

  function watchEvent() {
    const adv = (S.save && S.save.adv) || {};
    let key = '', label = '';
    if (adv.event) {
      key = 'event:' + (adv.event.id || '') + ':' + (adv.event.seq || '');
      label = (adv.event.raid ? '集体团体战' : '传说活动') + ' · No.' + (adv.event.id || '?');
    } else if (adv.zone) {
      key = 'zone:' + (adv.zone.id || '');
      label = '特殊区域 No.' + (adv.zone.foe || adv.zone.id || '?');
    }
    if (key === S.eventKey) return;
    const first = S.eventKey == null;
    S.eventKey = key;
    if (first || !key) return;
    log('event', '⚡ ' + label);
    beep('rare');
    notify("⚡ 限时活动", label + ' 已开放，尽快前往', 'pcauto-event');
    tallyEvent('events', label);
  }
