// constants.js
// 遊戲常數定義 — 區域、出身、據點、職業、姓名片段等

// 宗族之書：家族經營遊戲 - 單一 JS 檔（V3 修正版 - 修正新增身份、領養 UI、新增年齡輸入、新增人物編輯與離婚）
// 世界設定：星曆 387 年為起點

const INITIAL_YEAR = 387;

const DEFAULT_REGIONS = [
  { id: "north", name: "漠北邊境", desc: "多山多關隘，邊疆軍鎮與遊牧勢力並立之地。" },
  { id: "central", name: "天府王畿", desc: "朝廷所在，商旅雲集，權力與文化中心。" },
  { id: "south", name: "南域水鄉", desc: "水網縱橫，魚米之鄉，多江湖幫會盤踞。" },
  { id: "east", name: "東海沿岸", desc: "臨海諸城與商港，外族與海商往來頻繁。" },
  { id: "west", name: "西川雲嶺", desc: "高山峽谷與古道關城，易守難攻。" },
  { id: "desert", name: "塞外沙漠", desc: "風沙孤城，絲路商隊與異族部落的領域。" },
  { id: "islands", name: "南海群島", desc: "散落海上的諸島，有海盜、有隱世門派。" }
];

const DEFAULT_ORIGINS = ["皇室貴族" ,"名門望族", "商賈世家", "武林門派", "落魄寒門", "平民百姓"];

// v6+:家族門第(用於議親計分時判斷門當戶對)
// 由高至低,index 越小代表門第越高
const DEFAULT_STANDINGS = ["上品世家", "中品仕宦", "尋常人家", "寒微之家"];

// 據點與區域為一對一對應（每個據點只屬於一個區域）
const DEFAULT_TERRITORIES = [
  { name: "京城王都", regionId: "central" },
  { name: "江南府城", regionId: "south" },
  { name: "關中城鎮", regionId: "central" },
  { name: "邊關要塞", regionId: "north" },
  { name: "東海港市", regionId: "east" },
  { name: "西川古鎮", regionId: "west" },
  { name: "水鄉集市", regionId: "south" }
];

const DEFAULT_OCCS = ["家主", "皇族", "軍師", "商人", "平民", "官員", "學生", "無業"];
const DEFAULT_RES = ["皇宮", "祖宅", "別莊", "工舍", "行腳在外"];

// [FIX 1] 增加 DEFAULT_ROLES
const DEFAULT_ROLES = ["家主（主君）","內眷（內郎）","嫡支子女", "庶出子女", "旁系宗親", "長老", "附庸"];

const STORAGE_KEY = "clanGame_star_v3";

const GIVEN_NAME_PARTS = [
  "清","海","季","秀","世","伊","雙","珊","玖","辰","嵐",
  "瑜","衡","蕙","岑","柏","霖","雪","庭","思","柳","琪",
  "琦","舞","綺","雲","澈","澄"
];

const SPOUSE_TYPES = ["平妻", "妾", "繼室", "入贅", "訂婚"];

