  /* ====================== 数据：属性表 / 图鉴属性 / 招式名 / 学习表 ====================== */
  /* 解析 060 的压缩数据（来自游戏 bundle 的 POKEDEX / MOVES / TYPE_CHART）。招式威力与命中以 __DATA__.battle 为准。 */

  const TA_TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison',
    'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  const TA_TYPE_CN = {
    normal: '一般', fire: '火', water: '水', electric: '电', grass: '草', ice: '冰',
    fighting: '格斗', poison: '毒', ground: '地面', flying: '飞行', psychic: '超能', bug: '虫',
    rock: '岩石', ghost: '幽灵', dragon: '龙', dark: '恶', steel: '钢', fairy: '妖精',
  };
  const TA_TI = Object.fromEntries(TA_TYPES.map((t, i) => [t, i]));
  const TA_TC = '0123456789abcdefgh';

  const TA_CHART = (() => {
    const out = TA_TYPES.map(() => new Array(18).fill(1));
    for (let a = 0; a < 18; a++) {
      for (let d = 0; d < 18; d++) {
        const c = TA_CHART_RAW[a * 18 + d];
        out[a][d] = c === '0' ? 0 : c === '1' ? 0.5 : c === '2' ? 1 : 2;
      }
    }
    return out;
  })();

  const TA_MVNAME_RAW = [
    'absorb:吸取|acid:溶解液|acid-armor:溶化|acid-spray:酸液炸弹|acrobatics:杂技|acupressure:点穴|aerial-ace:燕返|aeroblas',
    't:气旋攻击|after-you:您先请|agility:高速移动|air-cutter:空气利刃|air-slash:空气斩|ally-switch:交换场地|amnesia:瞬间失忆|ancien',
    't-power:原始之力|aqua-jet:水流喷射|aqua-ring:水流环|aqua-tail:水流尾|arm-thrust:猛推|aromatherapy:芳香治疗|aromatic-mist',
    ':芳香薄雾|assurance:恶意追击|astonish:惊吓|attack-order:攻击指令|attract:迷人|aura-sphere:波导弹|aurora-beam:极光束|aurora',
    '-veil:极光幕|autotomize:身体轻量化|axe-kick:下压踢|baby-doll-eyes:圆瞳|baton-pass:接棒|beat-up:围攻|belch:打嗝|belly-dr',
    'um:腹鼓|bind:绑紧|bite:咬住|blaze-kick:火焰踢|blizzard:暴风雪|block:挡路|body-press:扑击|body-slam:泰山压顶|bone-rush:骨棒',
    '乱打|bonemerang:骨头回力镖|boomburst:爆音波|bounce:弹跳|brave-bird:勇鸟猛攻|brick-break:劈瓦|brine:盐水|bubble-beam:泡沫光线',
    '|bug-bite:虫咬|bug-buzz:虫鸣|bulk-up:健美|bulldoze:重踏|bullet-punch:子弹拳|bullet-seed:种子机关枪|calm-mind:冥想|char',
    'ge:充电|charge-beam:充电光束|charm:撒娇|chatter:喋喋不休|clear-smog:清除之烟|close-combat:近身战|coil:盘蜷|comeuppance:复仇',
    '|confide:密语|confuse-ray:奇异之光|confusion:念力|conversion:纹理|conversion-2:纹理２|copycat:仿效|cosmic-power:宇宙力',
    '量|cotton-guard:棉花防守|cotton-spore:棉孢子|counter:双倍奉还|covet:渴望|crabhammer:蟹钳锤|cross-chop:十字劈|cross-poiso',
    'n:十字毒刃|crunch:咬碎|crush-claw:撕裂爪|crush-grip:捏碎|curse:诅咒|cut:居合斩|dark-pulse:恶之波动|dark-void:暗黑洞|dazzlin',
    'g-gleam:魔法闪耀|defend-order:防御指令|defense-curl:变圆|defog:清除浓雾|destiny-bond:同命|detect:看穿|dig:挖洞|disable:定',
    '身法|disarming-voice:魅惑之声|discharge:放电|dive:潜水|doom-desire:破灭之愿|double-edge:舍身冲撞|double-hit:二连击|double',
    '-kick:二连踢|double-team:影子分身|dragon-ascent:画龙点睛|dragon-breath:龙息|dragon-claw:龙爪|dragon-dance:龙之舞|drago',
    'n-pulse:龙之波动|dragon-rush:龙之俯冲|dragon-tail:龙尾|drain-punch:吸取拳|draining-kiss:吸取之吻|dream-eater:食梦|drill',
    '-peck:啄钻|drill-run:直冲钻|dual-chop:二连劈|dynamic-punch:爆裂拳|earth-power:大地之力|earthquake:地震|echoed-voice:回',
    '声|eerie-impulse:怪异电波|electric-terrain:电气场地|electro-ball:电球|ember:火花|encore:再来一次|endeavor:蛮干|endure:挺',
    '住|energy-ball:能量球|entrainment:找伙伴|eruption:喷火|explosion:大爆炸|extrasensory:神通力|extreme-speed:神速|facade',
    ':硬撑|fairy-wind:妖精之风|fake-out:击掌奇袭|fake-tears:假哭|false-swipe:点到为止|feather-dance:羽毛舞|feint:佯攻|fell-sti',
    'nger:致命针刺|final-gambit:搏命|fire-blast:大字爆炎|fire-fang:火焰牙|fire-punch:火焰拳|fire-spin:火焰旋涡|fissure:地裂|fla',
    'il:抓狂|flame-charge:蓄能焰袭|flame-wheel:火焰轮|flamethrower:喷射火焰|flare-blitz:闪焰冲锋|flash-cannon:加农光炮|flatter',
    ':吹捧|fling:投掷|fly:飞翔|focus-energy:聚气|focus-punch:真气拳|follow-me:看我嘛|force-palm:发劲|foul-play:欺诈|freeze-',
    'dry:冷冻干燥|frost-breath:冰息|fury-attack:乱击|fury-cutter:连斩|fury-swipes:乱抓|future-sight:预知未来|gastro-acid:',
    '胃液|giga-drain:终极吸取|giga-impact:终极冲击|glare:大蛇瞪眼|grass-knot:打草结|grassy-terrain:青草场地|gravity:重力|growl:叫',
    '声|growth:生长|guard-split:防守平分|guard-swap:防守互换|guillotine:断头钳|gunk-shot:垃圾射击|gust:起风|gyro-ball:陀螺球|hai',
    'l:冰雹|hammer-arm:臂锤|harden:变硬|haze:黑雾|head-smash:双刃头锤|headbutt:头锤|headlong-rush:突飞猛扑|heal-bell:治愈铃声|h',
    'eal-pulse:治愈波动|healing-wish:治愈之愿|heart-swap:心灵互换|heat-wave:热风|heavy-slam:重磅冲撞|helping-hand:帮助|hex:祸不',
    '单行|hidden-power:觉醒力量|high-horsepower:十万马力|high-jump-kick:飞膝踢|hone-claws:磨爪|horn-attack:角撞|horn-drill',
    ':角钻|howl:长嚎|hurricane:暴风|hydro-pump:水炮|hyper-beam:破坏光线|hyper-drill:强力钻|hyper-voice:巨声|hypnosis:催眠术|i',
    'ce-beam:冰冻光束|ice-fang:冰冻牙|ice-punch:冰冻拳|ice-shard:冰砾|icicle-spear:冰锥|icy-wind:冰冻之风|imprison:封印|incin',
    'erate:烧尽|inferno:炼狱|infestation:死缠烂打|ingrain:扎根|iron-defense:铁壁|iron-head:铁头|iron-tail:铁尾|judgment:制',
    '裁光砾|knock-off:拍落|laser-focus:磨砺|last-resort:珍藏|lava-plume:喷烟|leaf-blade:叶刃|leaf-storm:飞叶风暴|leaf-torn',
    'ado:青草搅拌器|leafage:树叶|leech-life:吸血|leech-seed:寄生种子|leer:瞪眼|lick:舌舔|life-dew:生命水滴|light-screen:光墙|liq',
    'uidation:水流裂破|lock-on:锁定|lovely-kiss:恶魔之吻|low-kick:踢倒|low-sweep:下盘踢|lunar-blessing:新月祈祷|lunar-dance:',
    '新月舞|lunge:猛扑|luster-purge:洁净光芒|mach-punch:音速拳|magic-room:魔法空间|magical-leaf:魔法叶|magma-storm:熔岩风暴|magn',
    'et-rise:电磁飘浮|magnetic-flux:磁场操控|mean-look:黑色目光|mega-drain:超级吸取|mega-kick:百万吨重踢|mega-punch:百万吨重拳|mega',
    'horn:超级角击|memento:临别礼物|metal-burst:金属爆炸|metal-claw:金属爪|metal-sound:金属音|meteor-mash:彗星拳|metronome:挥指|',
    'milk-drink:喝牛奶|mimic:模仿|mind-reader:心之眼|minimize:变小|mirror-coat:镜面反射|mist:白雾|mist-ball:薄雾球|moonblast',
    ':月亮之力|moonlight:月光|morning-sun:晨光|mud-shot:泥巴射击|mud-slap:掷泥|muddy-water:浊流|mystical-power:神秘之力|nasty',
    '-plot:诡计|night-shade:黑夜魔影|night-slash:暗袭要害|nuzzle:蹭蹭脸颊|octazooka:章鱼桶炮|origin-pulse:根源波动|outrage:逆鳞|o',
    'verheat:过热|pain-split:分担痛楚|parting-shot:抛下狠话|pay-day:聚宝功|payback:以牙还牙|peck:啄|perish-song:灭亡之歌|petal-',
    'blizzard:落英缤纷|petal-dance:花瓣舞|phantom-force:潜灵奇袭|pin-missile:飞弹针|play-nice:和睦相处|play-rough:嬉闹|pluck:',
    '啄食|poison-fang:剧毒牙|poison-gas:毒瓦斯|poison-jab:毒击|poison-powder:毒粉|poison-sting:毒针|poison-tail:毒尾|poun',
    'd:拍击|powder-snow:细雪|power-gem:力量宝石|power-split:力量平分|power-swap:力量互换|power-trick:力量戏法|power-trip:嚣张|p',
    'ower-whip:强力鞭打|precipice-blades:断崖之剑|present:礼物|protect:守住|psybeam:幻象光线|psych-up:自我暗示|psychic:精神强念|p',
    'sycho-boost:精神突进|psycho-cut:精神利刃|psycho-shift:精神转移|psyshock:精神冲击|psystrike:精神击破|quash:延后|quick-attac',
    'k:电光一闪|quick-guard:快速防守|quiver-dance:蝶舞|rage-fist:愤怒之拳|rage-powder:愤怒粉|raging-bull:怒牛|raging-fury:大愤',
    '慨|rain-dance:求雨|rapid-spin:高速旋转|razor-leaf:飞叶快刀|razor-shell:贝壳刃|recover:自我再生|recycle:回收利用|reflect:反射',
    '壁|reflect-type:镜面属性|rest:睡觉|retaliate:报仇|revenge:报复|reversal:起死回生|roar:吼叫|roar-of-time:时光咆哮|rock-bla',
    'st:岩石爆击|rock-polish:岩石打磨|rock-slide:岩崩|rock-smash:碎岩|rock-throw:落石|rock-tomb:岩石封锁|rock-wrecker:岩石炮|r',
    'ole-play:扮演|rollout:滚动|roost:羽栖|round:轮唱|sacred-fire:神圣之火|safeguard:神秘守护|sand-attack:泼沙|sand-tomb:流沙',
    '地狱|sandstorm:沙暴|scary-face:鬼面|scratch:抓|screech:刺耳声|seed-bomb:种子炸弹|seed-flare:种子闪光|seismic-toss:地球上投',
    '|self-destruct:自爆|shadow-ball:暗影球|shadow-claw:暗影爪|shadow-force:暗影潜袭|shadow-punch:暗影拳|shadow-sneak:影子',
    '偷袭|sheer-cold:绝对零度|shell-smash:破壳|shock-wave:电击波|simple-beam:单纯光束|sing:唱歌|sketch:写生|skill-swap:特性互换|',
    'sky-attack:神鸟猛击|slack-off:偷懒|slam:摔打|slash:劈开|sleep-powder:催眠粉|sleep-talk:梦话|sludge:污泥攻击|sludge-bomb',
    ':污泥炸弹|sludge-wave:污泥波|smack-down:击落|smart-strike:修长之角|smog:浊雾|smokescreen:烟幕|snarl:大声咆哮|snore:打鼾|sno',
    'wscape:雪景|soak:浸水|soft-boiled:生蛋|solar-beam:日光束|spacial-rend:亚空裂斩|spark:电光|spikes:撒菱|spiky-shield:尖刺',
    '防守|spit-up:喷出|spite:怨恨|splash:跃起|spore:蘑菇孢子|stealth-rock:隐形岩|steel-wing:钢翼|sticky-web:黏黏网|stockpile:',
    '蓄力|stomp:踩踏|stomping-tantrum:跺脚|stone-edge:尖石攻击|stored-power:辅助力量|storm-throw:山岚摔|strength:怪力|string',
    '-shot:吐丝|struggle:挣扎|struggle-bug:虫之抵抗|stun-spore:麻痹粉|submission:地狱翻滚|substitute:替身|sucker-punch:突袭|',
    'sunny-day:大晴天|super-fang:愤怒门牙|superpower:蛮力|supersonic:超音波|surf:冲浪|swagger:虚张声势|swallow:吞下|sweet-kis',
    's:天使之吻|sweet-scent:甜甜香气|swift:高速星星|switcheroo:掉包|swords-dance:剑舞|synthesis:光合作用|tackle:撞击|tail-glow:',
    '萤火|tail-whip:摇尾巴|tailwind:顺风|take-down:猛撞|take-heart:勇气填充|taunt:挑衅|tearful-look:泪眼汪汪|teeter-dance:摇晃',
    '舞|teleport:瞬间移动|thief:小偷|thrash:大闹一番|throat-chop:地狱突刺|thunder:打雷|thunder-fang:雷电牙|thunder-punch:雷电拳|',
    'thunder-shock:电击|thunder-wave:电磁波|thunderbolt:十万伏特|tickle:挠痒|torment:无理取闹|toxic:剧毒|toxic-spikes:毒菱|t',
    'oxic-thread:毒丝|transform:变身|tri-attack:三重攻击|trick:戏法|trick-room:戏法空间|triple-kick:三连踢|twin-beam:双光束|t',
    'wister:龙卷风|u-turn:急速折返|uproar:吵闹|vacuum-wave:真空波|venoshock:毒液冲击|vice-grip:夹住|vine-whip:藤鞭|vital-thro',
    'w:借力摔|volt-switch:伏特替换|water-gun:水枪|water-pulse:水之波动|water-spout:喷水|waterfall:攀瀑|wave-crash:波动冲|weat',
    'her-ball:气象球|whirlpool:潮旋|whirlwind:吹飞|wide-guard:广域防守|wild-charge:疯狂伏特|will-o-wisp:鬼火|wing-attack:翅',
    '膀攻击|wish:祈愿|withdraw:缩入壳中|wonder-room:奇妙空间|wood-hammer:木槌|work-up:自我激励|worry-seed:烦恼种子|wrap:紧束|x-sci',
    'ssor:十字剪|yawn:哈欠|zap-cannon:电磁炮|zen-headbutt:意念头锤',
  ].join('');

  const TA_MVNAME = (() => {
    const out = {};
    for (const item of TA_MVNAME_RAW.split('|')) {
      const sep = item.indexOf(':');
      if (sep > 0) out[item.slice(0, sep)] = item.slice(sep + 1);
    }
    return out;
  })();
  const TA_NAME = TA_NAME_RAW.split(',');
