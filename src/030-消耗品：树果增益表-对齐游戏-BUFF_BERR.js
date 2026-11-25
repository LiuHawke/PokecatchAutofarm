  /* ====================== 消耗品：树果增益表（对齐游戏 BUFF_BERRIES） ====================== */

  // 一棵树果 = 该 family 的限时增益，BUFF_MIN=60 分钟，最多叠 BUFF_STACK=4 层（240 分钟）
  const BERRY_BUFFS = {
    'starf-berry':        { family: 'shiny',   mult: 2,    rank: 3, label: '闪光' },
    'enigma-berry':       { family: 'dex',     mult: 3,    rank: 3, label: '图鉴' },
    'nanab-berry':        { family: 'rare',    mult: 2,    rank: 3, label: '稀有' },
    'golden-razz-berry':  { family: 'capture', mult: 1.5,  rank: 2, label: '捕获' },
    'razz-berry':         { family: 'capture', mult: 1.25, rank: 1, label: '捕获' },
    'pinap-berry':        { family: 'xp',      mult: 1.25, rank: 1, label: '经验' },
    'lansat-berry':       { family: 'money',   mult: 1.25, rank: 1, label: '金钱' },
  };
  const BUFF_MIN_MS = 60 * 60 * 1000;
  const BUFF_STACK = 4;
