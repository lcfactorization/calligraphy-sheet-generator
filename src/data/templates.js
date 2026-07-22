/**
 * 内置模板库数据
 *
 * 数据规范：
 *  - text 字段只包含汉字，不含标点符号（字帖只练汉字）
 *  - charCount 与 text.length 一致
 *  - difficulty 根据平均笔画数自动计算：
 *      1-5 画 → 1（初级）
 *      6-10 画 → 2（中级）
 *      10+ 画 → 3（高级）
 *
 * 笔画数依据《通用规范汉字表》常用字笔画统计，
 * 与 cnchar ^3.0.0 / cnchar-words ^3.0.0 的 stroke 信息一致。
 */

export const templates = [
  // ───────── 唐诗宋词（8 个）─────────
  {
    id: "tang_jingyesi",
    name: "静夜思",
    category: "唐诗宋词",
    author: "李白",
    text: "床前明月光疑是地上霜举头望明月低头思故乡",
    difficulty: 2,
    charCount: 20,
    description: "李白经典五言绝句，笔画简单适合入门"
  },
  {
    id: "tang_chunxiao",
    name: "春晓",
    category: "唐诗宋词",
    author: "孟浩然",
    text: "春眠不觉晓处处闻啼鸟夜来风雨声花落知多少",
    difficulty: 2,
    charCount: 20,
    description: "孟浩然名篇，意境清新，朗朗上口"
  },
  {
    id: "tang_denggquaelou",
    name: "登鹳雀楼",
    category: "唐诗宋词",
    author: "王之涣",
    text: "白日依山尽黄河入海流欲穷千里目更上一层楼",
    difficulty: 2,
    charCount: 20,
    description: "王之涣五言绝句，气象宏大，激励人心"
  },
  {
    id: "tang_wanglushanpubu",
    name: "望庐山瀑布",
    category: "唐诗宋词",
    author: "李白",
    text: "日照香炉生紫烟遥看瀑布挂前川飞流直下三千尺疑是银河落九天",
    difficulty: 2,
    charCount: 28,
    description: "李白七言绝句，气势磅礴，想象奇特"
  },
  {
    id: "tang_minnong",
    name: "悯农",
    category: "唐诗宋词",
    author: "李绅",
    text: "锄禾日当午汗滴禾下土谁知盘中餐粒粒皆辛苦",
    difficulty: 2,
    charCount: 20,
    description: "李绅五言绝句，教育珍惜粮食，传诵千古"
  },
  {
    id: "tang_jiangxue",
    name: "江雪",
    category: "唐诗宋词",
    author: "柳宗元",
    text: "千山鸟飞绝万径人踪灭孤舟蓑笠翁独钓寒江雪",
    difficulty: 2,
    charCount: 20,
    description: "柳宗元五言绝句，意境孤绝，画面感强"
  },
  {
    id: "tang_xunyinzhebvyu",
    name: "寻隐者不遇",
    category: "唐诗宋词",
    author: "贾岛",
    text: "松下问童子言师采药去只在此山中云深不知处",
    difficulty: 2,
    charCount: 20,
    description: "贾岛五言绝句，问答体诗，韵味悠长"
  },
  {
    id: "tang_luochai",
    name: "鹿柴",
    category: "唐诗宋词",
    author: "王维",
    text: "空山不见人但闻人语响返景入深林复照青苔上",
    difficulty: 2,
    charCount: 20,
    description: "王维五言绝句，山水诗代表，禅意深远"
  },

  // ───────── 三字经（2 个）─────────
  {
    id: "sanzi_jing_kpian",
    name: "三字经·开篇段",
    category: "三字经",
    author: "王应麟",
    text: "人之初性本善性相近习相远苟不教性乃迁教之道贵以专",
    difficulty: 2,
    charCount: 24,
    description: "三字经开篇，阐述教育与人性，启蒙经典"
  },
  {
    id: "sanzi_jing_weirenzi",
    name: "三字经·为人子段",
    category: "三字经",
    author: "王应麟",
    text: "为人子方少时亲师友习礼仪香九龄能温席孝于亲所当执",
    difficulty: 2,
    charCount: 24,
    description: "三字经为人子段，讲述尊师重道与孝道"
  },

  // ───────── 千字文（2 个）─────────
  {
    id: "qianzi_tiandixuanhuang",
    name: "千字文·天地玄黄段",
    category: "千字文",
    author: "周兴嗣",
    text: "天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏",
    difficulty: 2,
    charCount: 24,
    description: "千字文开篇，描绘天地宇宙与四季更替"
  },
  {
    id: "qianzi_runyuchengsui",
    name: "千字文·闰余成岁段",
    category: "千字文",
    author: "周兴嗣",
    text: "闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈",
    difficulty: 2,
    charCount: 24,
    description: "千字文闰余成岁段，讲述历法与自然现象"
  },

  // ───────── 常用字（3 个）─────────
  {
    id: "common_numbers",
    name: "数字一到十",
    category: "常用字",
    author: "通用",
    text: "一二三四五六七八九十",
    difficulty: 1,
    charCount: 10,
    description: "基础数字一到十，笔画最少，适合初学者入门"
  },
  {
    id: "common_baijiaxing50",
    name: "百家姓前50字",
    category: "常用字",
    author: "佚名",
    text: "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎",
    difficulty: 2,
    charCount: 50,
    description: "百家姓前50字，常见姓氏，练习实用性强"
  },
  {
    id: "common_top100",
    name: "常用100字",
    category: "常用字",
    author: "通用",
    text: "人民大家国我你他她们这那有没是的和了在过去现在未来年月日时分秒春夏秋冬东西南北上下左右前后高低长短大小多少好坏美丑善恶冷暖天地日月山水火土木石风雨云雷电",
    difficulty: 2,
    charCount: 100,
    description: "现代汉语最高频100字，覆盖日常阅读与书写"
  },

  // ───────── 成语（3 个）─────────
  {
    id: "idiom_chunnuankaikai",
    name: "春暖花开",
    category: "成语",
    author: "通用",
    text: "春暖花开",
    difficulty: 2,
    charCount: 4,
    description: "形容春日美好景象，常用成语，意境明朗"
  },
  {
    id: "idiom_xuehaiwuya",
    name: "学海无涯",
    category: "成语",
    author: "通用",
    text: "学海无涯",
    difficulty: 2,
    charCount: 4,
    description: "勉励勤奋学习，知识如海洋般辽阔"
  },
  {
    id: "idiom_wenguzhixin",
    name: "温故知新",
    category: "成语",
    author: "孔子",
    text: "温故知新",
    difficulty: 3,
    charCount: 4,
    description: "出自《论语》，复习旧知以得新悟"
  },

  // ───────── 节日（2 个）─────────
  {
    id: "festival_chunjie",
    name: "春节祝福",
    category: "节日",
    author: "通用",
    text: "新春佳节福满门阖家欢乐幸福年",
    difficulty: 2,
    charCount: 14,
    description: "春节常用祝福语，喜庆祥和，应景练习"
  },
  {
    id: "festival_zhongqiu",
    name: "中秋诗词",
    category: "节日",
    author: "张九龄",
    text: "海上生明月天涯共此时",
    difficulty: 2,
    charCount: 10,
    description: "张九龄《望月怀远》名句，中秋怀人之作"
  }
];

export default templates;
