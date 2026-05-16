// match.js
// 議親室 — 改寫自「亂點鴛鴦譜」,接到宗族之書 state
// 共用:state.persons / state.families / state.gameYear / spouseRelations / chronicle / localStorage

// =============== Stub:議親室頁面沒有主頁的 DOM,讓 addPerson 等共用函式不爆 ===============
// 強制覆蓋(不用 undefined 判斷),因為 family.js / utils.js 已先定義這些函式
(function(){
  const g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this);

  // null-safe proxy:讓 $("不存在元素").style.display = "none" 不爆
  const _nullProxy = new Proxy({}, {
    get(_, prop) { if (prop === "then") return undefined; return _nullProxy; },
    set() { return true; }
  });
  // 覆蓋 $ 函式:找不到元素時回傳 proxy 而非 null
  g.$ = function(id) { return document.getElementById(id) || _nullProxy; };

  // 強制覆蓋:這些函式在主頁 js 已定義,但議親室沒有對應 DOM,必須蓋掉
  g.exitChildModeUI = function(){ if (typeof state !== "undefined") state.childModeParentId = null; };
  g.advisorSay = function(msg){ /* noop in 議親室 */ };
  g.renderFamilies = function(){};
  g.renderFamilyOptions = function(){};
  g.renderFamilyDetail = function(){};
  g.renderPersonDetail = function(){};
  g.renderRegions = function(){};
  g.renderOptionOverview = function(){};
  g.renderAdvisorLocationSelect = function(){};
  g.renderRegionSelects = function(){};
  g.renderOptionSelects = function(){};
  g.openParentSelectDialog = function(){ /* 議親室不彈第二父母對話框 */ };
  g.recordChronicle = function(entry){ if (!state.chronicle) state.chronicle = []; state.chronicle.push(entry); };
})();

// =============== 議親室本身的暫存 ===============
const matchState = {
  aFamilyId: "all",          // A 的家族篩選("all" / "noFamily" / 家族 id)
  bFamilyId: "all",
  aId: null,
  bId: null,
  pendingAction: null,
  archiveTab: "people",
  archiveSearch: "",
  archiveFilter: "全部",
  forcePick: false,          // 強推:解除「適齡未婚」限制
  suggestionsTarget: "a",    // 看看誰適合:目前以 a 還是 b 為基準
  // 口頭議親不寫入 state,但需在本地記住階段,讓下一步按鈕能接續
  // key = pairKey(aId, bId), value = "已議親成功"(口頭議親後)
  oralEngagements: {}
};

function pairKey(x, y) { return [x, y].sort((a,b) => a - b).join("__"); }

// =============== 工具 ===============
function _$(id) { return document.getElementById(id); }
function getMA() { return findPerson(matchState.aId); }
function getMB() { return findPerson(matchState.bId); }

function getMatchAge(p) {
  if (!p) return null;
  return getAge(p); // 共用 time.js 的 getAge
}

// 適齡未婚池(議親室預設可挑的人)
function eligibleForMatch() {
  return state.persons.filter(p => {
    if (p.deceased) return false;
    if (p.spouseIds && p.spouseIds.length > 0) return false;
    const age = getMatchAge(p);
    if (age == null) return false;
    return age >= 15 && age <= 35;
  });
}

// 全人物池(強推模式)
function allLivingPeople() {
  return state.persons.filter(p => !p.deceased);
}

// 拿到目前選人的有效池
function pickablePool() {
  return matchState.forcePick ? allLivingPeople() : eligibleForMatch();
}

// 找兩人之間的 spouseRelation(雙向)
function relationBetween(aId, bId) {
  const a = findPerson(aId);
  if (!a) return null;
  return (a.spouseRelations || []).find(r => r.id === bId) || null;
}

// 取得人物現有的所有 spouseRelations 對象(已配對者)
function spouseListOf(p) {
  if (!p || !Array.isArray(p.spouseRelations)) return [];
  return p.spouseRelations.map(r => ({
    rel: r,
    other: findPerson(r.id)
  })).filter(x => x.other);
}

// =============== 案件類型推導 ===============
function deriveCaseType(a, b) {
  if (!a || !b) return "未開案";
  if (a.id === b.id) return "同人案";
  if (a.gender && b.gender && a.gender === b.gender) return "性別不合案";

  const rel = relationBetween(a.id, b.id);
  if (rel) {
    // 真正成婚才算「婚後案」:有 marryYear、matchStage===已婚、或 type 是成婚名分
    // v6:離異/喪偶等已結束的關係不算現任,改走普通議親(可考慮復合或另娶)。
    const _marriedTypes = ["婚配","正妻","夫","平妻","繼室","側室","妾","入贅","正室"];
    const ended = rel.endYear || rel.matchStage === "已離異" || rel.matchStage === "已喪偶";
    const trulyMarried = !ended && (!!rel.marryYear || rel.matchStage === "已婚" || _marriedTypes.includes(rel.type));
    if (trulyMarried) return "婚後案";
    // 否則(訂婚、婚期籌備中等)走議親流程
    return "普通議親案";
  }

  // 沒有直接關係,但雙方有別的配偶 → 納新人/續娶
  // 注意:只算「已成婚」的配偶,不算訂婚對象;
  // v6:離異/喪偶等已結束的關係(endYear/已離異/已喪偶)不算現任配偶。
  function hasRealSpouse(person) {
    if (!Array.isArray(person.spouseRelations) || !person.spouseRelations.length) return false;
    return person.spouseRelations.some(r => {
      if (r.endYear || r.matchStage === "已離異" || r.matchStage === "已喪偶") return false;
      return r.marryYear || r.matchStage === "已婚" || ["婚配","正妻","夫","平妻","繼室","側室","妾","入贅","正室"].includes(r.type);
    });
  }
  if (hasRealSpouse(a) || hasRealSpouse(b)) return "納新人／續娶案";

  const ageA = getMatchAge(a), ageB = getMatchAge(b);
  if ((ageA != null && ageA < 15) || (ageB != null && ageB < 15)) return "暫緩觀察案";
  return "普通議親案";
}


// 名分顯示：「正妻」和「夫」統一顯示為「婚配」
function displaySpouseType(type) {
  if (!type) return "婚配";
  if (type === "正妻" || type === "夫") return "婚配";
  return type;
}

// 取得兩人當前的階段(從 spouseRelation.matchStage 或 type 推導)
function getStageOfPair(a, b) {
  const rel = relationBetween(a.id, b.id);
  if (rel) {
    if (rel.matchStage) return rel.matchStage;
    if (rel.marryYear) return "已婚";
    return "已議親成功";
  }
  // 沒有寫入族譜的情況:看本地口頭議親紀錄
  const oral = matchState.oralEngagements[pairKey(a.id, b.id)];
  if (oral) return oral;
  return "未進入流程";
}

// =============== 可用動作 ===============
function getActions(a, b) {
  const type = deriveCaseType(a, b);
  if (type === "性別不合案" || type === "同人案") {
    return [{ key: "rejectByRite", label: "以禮法駁回（不合禮制）" }];
  }
  if (type === "婚後案") {
    return [
      { key: "settleHousehold", label: "安排／調整院落與婚後名分" },
      { key: "addChild", label: "新增子嗣線" },
      { key: "maritalConflict", label: "推進婚後衝突" },
      { key: "spousalAlliance", label: "讓夫妻結盟" },
    ];
  }
  if (type === "納新人／續娶案") {
    return [
      { key: "consultHousehold", label: "先查既有正室、側室與子嗣反應" },
      { key: "takeConsort", label: "納為側妃／妾室／繼室" },
      { key: "rejectByHousehold", label: "以後宅不穩駁回" },
      { key: "delayCase", label: "暫緩，封存名冊" },
    ];
  }
  if (type === "暫緩觀察案") {
    return [
      { key: "protocolSchool", label: "改入女史禮制課／旁修觀察" },
      { key: "askPeople", label: "先問當事人意願" },
      { key: "rejectByRite", label: "以年齡與禮法駁回" },
      { key: "delayCase", label: "暫緩，不准外傳" },
    ];
  }
  const stage = getStageOfPair(a, b);
  if (stage === "未進入流程") {
    return [
      { key: "askPeople", label: "先問當事人意願" },
      { key: "engage", label: "議親成功（口頭說定）" },
      { key: "rejectByRite", label: "以禮法駁回" },
      { key: "delayCase", label: "暫緩，封存名冊" },
    ];
  }
  if (stage === "已議親成功") {
    return [
      { key: "formalBetrothal", label: "正式定親（換婚書信物，寫入族譜）" },
      { key: "breakOldPromise", label: "翻案改議（傷兩家面子）" },
      { key: "preWeddingIncident", label: "婚前生變" },
      { key: "delayCase", label: "暫緩處置" },
    ];
  }
  if (stage === "已定親") {
    return [
      { key: "setWeddingDate", label: "商定婚期" },
      { key: "preWeddingIncident", label: "婚前生變" },
      { key: "breakOldPromise", label: "悔婚（撕婚書）" },
    ];
  }
  if (stage === "婚期籌備") {
    return [
      { key: "marry", label: "正式成婚" },
      { key: "preWeddingIncident", label: "婚前生變" },
      { key: "delayCase", label: "婚期延後" },
    ];
  }
  return [{ key: "delayCase", label: "暫緩處置" }];
}

// 動作需要的欄位
function getRequiredFields(action) {
  switch (action) {
    case "marry": return ["aTitle", "bTitle", "courtyard", "marryYear"];
    case "takeConsort": return ["sharedTitle", "courtyard", "marryYear"];
    case "settleHousehold": return ["courtyard"];
    case "addChild": return ["child"];
    case "formalBetrothal": return ["spouseType"];
    case "editMarriage": return ["editMarryYear", "editSpouseType"];
    default: return [];
  }
}

// =============== 案情摘要 ===============
function buildSummary(a, b) {
  if (!a || !b) return "請挑選兩位人物。";
  const type = deriveCaseType(a, b);
  const stage = getStageOfPair(a, b);
  const rel = relationBetween(a.id, b.id);
  const lines = [];
  lines.push(`案件類型：${type}`);
  lines.push(`人物：${a.name} × ${b.name}`);
  lines.push(`當前階段：${stage}`);

  if (type === "性別不合案") {
    lines.push("兩人性別相同，不符當時婚配禮制，無法走一般議親流程。");
    return lines.join("\n");
  }
  if (type === "同人案") {
    lines.push("無法為同一人開議親案。");
    return lines.join("\n");
  }

  if (rel) {
    lines.push(`既有關係：${displaySpouseType(rel.type)}；於星曆 ${rel.marryYear || "未記"} 年成立。`);
    if (rel.courtyard) lines.push(`院落：${rel.courtyard}`);
    lines.push("此案應處理婚後秩序、子嗣、衝突或同盟。");
  } else if (type === "納新人／續娶案") {
    const aHas = (a.spouseIds || []).length > 0;
    const married = aHas ? a : b;
    const incoming = aHas ? b : a;
    const others = spouseListOf(married).map(x => `${x.other.name}（${displaySpouseType(x.rel.type)}）`).join("、") || "無紀錄";
    lines.push(`${married.name}既有配偶：${others}`);
    lines.push(`若納${incoming.name}，應走側妃／妾／繼室路線，並安排院落。`);
  } else if (type === "暫緩觀察案") {
    const young = (getMatchAge(a) || 99) < (getMatchAge(b) || 99) ? a : b;
    lines.push(`${young.name}年紀尚小(${getMatchAge(young)}歲),不宜直接推成婚事。`);
  } else {
    lines.push("兩人目前可進入一般議親流程。");
  }

  // 牽涉家族
  const aFam = a.familyId ? getFamilyNameById(a.familyId) : "未歸宗族";
  const bFam = b.familyId ? getFamilyNameById(b.familyId) : "未歸宗族";
  lines.push(`牽涉家族：${aFam} × ${bFam}`);

  return lines.join("\n");
}

// =============== 隨機事件(擲一下) ===============
const randomEvents = [
  { id: "rumor", title: "流言：暗中通信被外人撞見",
    body: (a, b) => `京中傳出${a.name}與${b.name}暗中通信。流言發酵的速度比議親本身還快,兩家臉面都被人盯著。`,
    caseTypes: ["普通議親案"], stages: ["未進入流程", "已議親成功"] },
  { id: "third-suitor", title: "第三人加入：另有提親者",
    body: (a, b) => `${a.name}與${b.name}議親消息傳開後,另一家也派人來向同一人提親。簡單的議親變成兩家暗中較勁。`,
    caseTypes: ["普通議親案"], stages: ["未進入流程", "已議親成功"] },
  { id: "elder", title: "長輩插手：朝中長輩過問",
    body: (a, b) => `上頭過問了。${a.name}與${b.name}的婚事被朝中長輩召見問話,原本可慢慢談的事,現在必須給回應。`,
    caseTypes: ["普通議親案", "改議風波案"], stages: ["未進入流程", "已議親成功", "已定親"] },
  { id: "old-flame", title: "舊情未斷：心上人出現",
    body: (a, b) => `事情看似要走向定局時,${a.name}或${b.name}舊日的心上人重新出現。`,
    caseTypes: ["普通議親案"], stages: ["已議親成功", "已定親", "婚期籌備"] },
  { id: "wedding-disaster", title: "婚當日：迎親隊伍出事",
    body: (a, b) => `迎親當日,隊伍中途出了意外。可能是有人故意,也可能是天意。${a.name}與${b.name}的婚事在最後一刻被打斷。`,
    caseTypes: ["普通議親案"], stages: ["婚期籌備"] },
  { id: "family-scandal", title: "家中變故：一方家族出事",
    body: (a, b) => `${a.name}或${b.name}家中突然出事——可能是父輩被彈劾、可能是兄姐惹禍。婚事在這節骨眼變得尷尬。`,
    caseTypes: ["普通議親案"], stages: ["已議親成功", "已定親", "婚期籌備"] },
  { id: "side-vs-main", title: "後宅震動：側室質疑正室",
    body: (a) => `偏院的人開始不安分。請安順序、月例、子嗣排行——${a.name}府中的秩序開始被測試。`,
    caseTypes: ["婚後案", "納新人／續娶案"], stages: [] },
  { id: "pregnant-side", title: "侍妾有孕：嫡庶之爭浮上檯面",
    body: (a, b) => `府中傳出有人有孕,且不是正室。${a.name}與${b.name}必須處理嫡庶、撫養、名分這些原本可拖的問題。`,
    caseTypes: ["婚後案"], stages: [] },
  { id: "old-promise-leak", title: "舊約洩漏：婚前那段被人翻出",
    body: (a, b) => `成婚前那段沒講清楚的事被人翻出來了。${a.name}與${b.name}的婚姻信任面臨第一次大考。`,
    caseTypes: ["婚後案"], stages: [] },
  { id: "main-counter", title: "正室反擊：以禮制壓回新人",
    body: () => "既有的正室不會坐視新人入府。她以禮制、家族、皇命之中可動用的東西去壓回這次納娶。",
    caseTypes: ["納新人／續娶案"], stages: [] },
  { id: "young-self-aware", title: "當事人自覺：年幼者主動表態",
    body: () => "年紀尚小的那一位主動表態了——可能說不要嫁,可能說願意等。",
    caseTypes: ["暫緩觀察案"], stages: [] },
];

function pickRandomEvent(a, b) {
  if (!a || !b) return { title: "風平浪靜", body: "尚未選定人物，案卷無事可記。" };
  const type = deriveCaseType(a, b);
  const stage = getStageOfPair(a, b);
  const candidates = randomEvents.filter(ev => {
    if (!ev.caseTypes.includes(type)) return false;
    if (ev.stages && ev.stages.length > 0 && !ev.stages.includes(stage)) return false;
    return true;
  });
  if (!candidates.length) {
    return { title: "風平浪靜", body: `這一輪${a.name}與${b.name}的案卷沒有任何意外發生。可繼續推進。` };
  }
  const ev = pickRandom(candidates);
  return { title: ev.title, body: ev.body(a, b) };
}

// =============== 第三方反應 ===============
function getThirdPartyReactions(action, a, b) {
  const reactions = [];

  if (action === "takeConsort" || action === "marry") {
    // 既有配偶
    const existing = [...spouseListOf(a), ...spouseListOf(b)]
      .filter(x => x.other.id !== a.id && x.other.id !== b.id);
    const seen = new Set();
    existing.forEach(x => {
      if (seen.has(x.other.id)) return;
      seen.add(x.other.id);
      reactions.push({
        who: x.other.name,
        role: displaySpouseType(x.rel.type),
        reaction: "地位受威脅,會試探新人來歷與家族背景,可能藉禮制壓回。"
      });
    });
  }

  if (action === "takeConsort" || action === "marry" || action === "addChild") {
    // 既有子女
    const kids = new Set();
    [a, b].forEach(p => {
      (p.childIds || []).forEach(cid => kids.add(cid));
    });
    if (kids.size > 0) {
      const names = Array.from(kids).slice(0, 3).map(id => findPerson(id)?.name).filter(Boolean);
      reactions.push({
        who: `既有子嗣(${names.join("、")}${kids.size > 3 ? "...等" : ""})`,
        role: "子女",
        reaction: "排行、嫡庶身分、未來繼承都可能因此變化,撫養者會替他們爭。"
      });
    }
  }

  if (action === "engage" || action === "formalBetrothal" || action === "marry") {
    // 兩家族反應
    if (a.familyId && b.familyId && a.familyId !== b.familyId) {
      reactions.push({
        who: `${getFamilyNameById(a.familyId)} × ${getFamilyNameById(b.familyId)}`,
        role: "雙方家族",
        reaction: "兩家正式建立姻親聯繫,連帶影響各自的盟友網絡與商議席次。"
      });
    }
  }

  if (action === "rejectByRite" || action === "rejectByHousehold" || action === "breakOldPromise") {
    if (a.familyId && b.familyId && a.familyId !== b.familyId) {
      reactions.push({
        who: `${getFamilyNameById(a.familyId)} × ${getFamilyNameById(b.familyId)}`,
        role: "雙方家族",
        reaction: "被駁回／翻案的那方臉面受損,另一方則需自證沒有趁機落井下石。"
      });
    }
  }

  if (action === "protocolSchool") {
    reactions.push({
      who: "提親者",
      role: "原本想推這樁親事的人",
      reaction: "失了著力點。若再強推會顯得不合禮法。"
    });
  }

  return reactions;
}

// =============== 執行動作:這裡是真會改 state 的地方 ===============
function makeOutcome(action, a, b, inputs) {
  const out = {
    title: "",
    immediate: "",
    next: "",
    hint: "",
    actionLabel: "",
    reactions: [],
    kind: "action",
    // 副作用旗標
    writeBetrothal: false,      // 寫入訂婚到 spouseRelations
    updateStage: null,          // 更新 matchStage
    writeMarry: false,          // 正式婚禮:寫 marryYear、改 type
    writeConsort: false,        // 納妾:新關係
    consortType: "",
    courtyard: "",
    spouseTypeChosen: "正妻",
    addChild: false,
    breakBetrothal: false,
  };

  switch (action) {
    case "askPeople":
      out.title = `問意願:${a.name} × ${b.name}`;
      out.immediate = `先不急著寫入名冊，分別詢問${a.name}與${b.name}的意願。`;
      out.next = "兩人的回應保留，婚事暫時還能轉圜。";
      out.hint = "接下來可議親成功，也可駁回或暫緩。";
      break;

    case "engage":
      out.title = `議親成功:${a.name} × ${b.name}`;
      out.immediate = "兩家口頭說成婚事。從這一刻開始，之後若再議他人，就不是普通議親，而是改議或悔婚。";
      out.next = "下一步可正式定親（寫入族譜）、駁回，或在婚前插入變故。";
      out.hint = "口頭議親不寫入族譜，但記在議親室，下一步按鈕會接續。";
      out.updateStage = "已議親成功";
      out.writeOralEngage = true;
      break;

    case "formalBetrothal":
      out.title = `正式定親:${a.name} × ${b.name}`;
      out.immediate = `婚書與信物交換,${a.name}與${b.name}的婚約正式定下,寫入宗族之書（訂婚）。`;
      out.next = "聘禮、嫁妝、主婚人與禮序會成為下一輪重點。";
      out.hint = "已寫入 spouseRelations，類型為「訂婚」，但 marryYear 留空，等成婚時補上。";
      out.writeBetrothal = true;
      out.spouseTypeChosen = inputs.spouseType || "訂婚";
      out.updateStage = "已定親";
      break;

    case "setWeddingDate":
      out.title = `商定婚期:${a.name} × ${b.name}`;
      out.immediate = "婚期被排入禮單,婚事從可議進入籌備。";
      out.next = "旁人若要阻止，必須趕在禮成之前。";
      out.hint = "下一步可正式成婚,也可婚前生變。";
      out.updateStage = "婚期籌備";
      break;

    case "marry": {
      const yr = parseInt(inputs.marryYear) || state.gameYear;
      const aTitleRaw = inputs.aTitle || "夫";
      const bTitleRaw = inputs.bTitle || "正妻";
      // 「夫」或「正妻」寫入族譜時統一存為「婚配」
      const toWriteType = (t) => (t === "夫" || t === "正妻") ? "婚配" : t;
      const bWriteType = toWriteType(bTitleRaw);
      out.title = `正式成婚：${a.name} × ${b.name}`;
      out.immediate = `${a.name}以「${aTitleRaw}」身分成婚，${b.name}以「${bTitleRaw}」身分入局，院落安排為「${inputs.courtyard || "未定"}」，於星曆 ${yr} 年成婚。`;
      out.next = "此後不再走議親流程，改為婚後院落、子嗣、衝突與夫妻同盟。";
      out.hint = "spouseRelations 補上 marryYear，夫／正妻統一以「婚配」寫入族譜。";
      out.writeMarry = true;
      out.marryYearChosen = yr;
      out.courtyard = inputs.courtyard || "";
      out.spouseTypeChosen = bWriteType;
      out.updateStage = "已婚";
      break;
    }

    case "takeConsort": {
      const aHas = (a.spouseIds || []).length > 0;
      const main = aHas ? a : b;
      const incoming = aHas ? b : a;
      const t = inputs.sharedTitle || "妾";
      const yr = parseInt(inputs.marryYear) || state.gameYear;
      out.title = `納新人入府:${main.name} × ${incoming.name}`;
      out.immediate = `${incoming.name}以「${t}」名分入局,院落安排為「${inputs.courtyard || "未定"}」,於星曆 ${yr} 年入府。`;
      out.next = "既有正室、側室與子嗣都會受到影響。";
      out.hint = "會新增一筆 spouseRelations，類型為輸入的名分。";
      out.writeConsort = true;
      out.consortType = t;
      out.courtyard = inputs.courtyard || "";
      out.marryYearChosen = yr;
      break;
    }

    case "editMarriage": {
      const yr = parseInt(inputs.editMarryYear);
      const t = inputs.editSpouseType || "";
      out.title = `修改婚姻紀錄:${a.name} × ${b.name}`;
      const changes = [];
      if (!isNaN(yr)) changes.push(`結婚年份改為星曆 ${yr} 年`);
      if (t) changes.push(`名分改為「${t}」`);
      out.immediate = changes.length ? changes.join("，") + "。" : "未輸入要修改的欄位。";
      out.next = "此修改僅調整既有 spouseRelations 紀錄，不會新增關係。";
      out.hint = "若兩人並未真正成婚或定親，不會生效。";
      if (!isNaN(yr)) out.editMarryYear = yr;
      if (t) out.editSpouseType = t;
      break;
    }

    case "settleHousehold":
      out.title = `婚後安置:${a.name} × ${b.name}`;
      out.immediate = `院落安排為「${inputs.courtyard || "未定"}」。`;
      out.next = "院落、請安、帳冊與稱呼會影響後宅秩序。";
      out.hint = "只調整既有 spouseRelations 的 courtyard 欄位。";
      out.courtyard = inputs.courtyard || "";
      break;

    case "addChild": {
      const childName = inputs.childName || "未命名";
      const childGender = inputs.childGender || "子";
      const childStatus = inputs.childStatus || "嫡出";
      out.title = `子嗣線:${a.name} × ${b.name}`;
      out.immediate = `${childStatus}${childGender}「${childName}」加入兩人的子嗣線。`;
      out.next = "嫡庶、排行、由誰撫養，會牽動後宅與繼承。";
      out.hint = "會新建一位人物並連結父母。";
      out.addChild = true;
      break;
    }

    case "maritalConflict":
      out.title = `婚後衝突:${a.name} × ${b.name}`;
      out.immediate = "成婚後的矛盾浮出水面。";
      out.next = "若處理不好，後續可能演變成冷戰、納新人或家族介入。";
      out.hint = "這是婚後線，不會退回普通議親。";
      break;

    case "spousalAlliance":
      out.title = `夫妻結盟:${a.name} × ${b.name}`;
      out.immediate = "兩人選擇先站在同一邊。";
      out.next = "長輩再想分化兩人會變得更困難。";
      out.hint = "婚事從被安排,轉為兩人主動經營。";
      break;

    case "consultHousehold":
      out.title = `查後宅:${a.name} × ${b.name}`;
      out.immediate = "先查既有正室、側室、侍妾與子嗣，暫不推進婚事。";
      out.next = "若既有秩序不穩，新人入府會成為風波。";
      out.hint = "納新人前的合理步驟。";
      break;

    case "protocolSchool": {
      const young = (getMatchAge(a) || 99) < (getMatchAge(b) || 99) ? a : b;
      out.title = `保護性暫緩:${young.name}`;
      out.immediate = `${young.name}改入女史禮制課或旁修觀察,從待嫁名冊退出。`;
      out.next = "提親者若再逼迫，就會顯得不合禮法。";
      out.hint = "適合年紀過小者。";
      break;
    }

    case "rejectByRite":
    case "rejectByHousehold":
      out.title = `正式駁回:${a.name} × ${b.name}`;
      out.immediate = "這樁婚事被以禮法、年齡、名分或後宅秩序駁回。";
      out.next = "提議者可能失面子，也可能換一種方式再推。";
      out.hint = "案卷暫時結束。";
      out.breakBetrothal = true;
      out.updateStage = "未進入流程";
      break;

    case "delayCase":
      out.title = `暫緩封存:${a.name} × ${b.name}`;
      out.immediate = "名冊暫時封存，不准外傳。";
      out.next = "各方會私下打聽真正原因。";
      out.hint = "暫緩會保留轉圜空間。";
      break;

    case "breakOldPromise":
      out.title = `翻案改議／悔婚:${a.name} × ${b.name}`;
      out.immediate = "已議的婚事被翻案，信物退還，婚書作廢。";
      out.next = "兩家臉面與後續議親都會受影響。";
      out.hint = "若已寫入族譜的訂婚紀錄會被移除。";
      out.breakBetrothal = true;
      out.updateStage = "未進入流程";
      break;

    case "preWeddingIncident":
      out.title = `婚前生變:${a.name} × ${b.name}`;
      out.immediate = "在禮成之前出了事。可能是迎親隊伍受阻、可能是長輩出面、可能是當事人臨陣反悔。";
      out.next = "婚事被打斷，下一步要決定是繼續推、改議、或全盤推翻。";
      out.hint = "案卷會停在婚前階段，不會自動推到已婚。";
      break;

    default:
      out.title = "案卷停滯";
      out.immediate = "這一步尚未推動劇情。";
      out.next = "眾人繼續觀望。";
      out.hint = "請改選更符合目前關係的操作。";
  }

  return out;
}

// 真正改變 state 的副作用
function applySideEffects(out, a, b, inputs) {
  let touched = false;

  // 寫入訂婚:在 spouseRelations 加一筆「訂婚」
  if (out.writeBetrothal) {
    if (!Array.isArray(a.spouseRelations)) a.spouseRelations = [];
    if (!Array.isArray(b.spouseRelations)) b.spouseRelations = [];
    if (!a.spouseIds) a.spouseIds = [];
    if (!b.spouseIds) b.spouseIds = [];

    const existsA = a.spouseRelations.find(r => r.id === b.id);
    if (!existsA) {
      a.spouseRelations.push({
        id: b.id,
        type: "訂婚",
        marryYear: null,
        matchStage: "已定親",
        courtyard: "",
        betrothalYear: state.gameYear
      });
    }
    const existsB = b.spouseRelations.find(r => r.id === a.id);
    if (!existsB) {
      b.spouseRelations.push({
        id: a.id,
        type: "訂婚",
        marryYear: null,
        matchStage: "已定親",
        courtyard: "",
        betrothalYear: state.gameYear
      });
    }
    if (!a.spouseIds.includes(b.id)) a.spouseIds.push(b.id);
    if (!b.spouseIds.includes(a.id)) b.spouseIds.push(a.id);
    // 正式定親後清掉口頭議親暫存，避免 getStageOfPair 仍回傳「已議親成功」
    delete matchState.oralEngagements[pairKey(a.id, b.id)];
    touched = true;
  }

  // 正式成婚:把訂婚補完(或新建)
  if (out.writeMarry) {
    if (!Array.isArray(a.spouseRelations)) a.spouseRelations = [];
    if (!Array.isArray(b.spouseRelations)) b.spouseRelations = [];
    if (!a.spouseIds) a.spouseIds = [];
    if (!b.spouseIds) b.spouseIds = [];

    const marryYr = out.marryYearChosen || state.gameYear;
    const rA = a.spouseRelations.find(r => r.id === b.id);
    const newType = out.spouseTypeChosen || "正妻";
    if (rA) {
      rA.type = newType;
      rA.marryYear = marryYr;
      rA.matchStage = "已婚";
      if (out.courtyard) rA.courtyard = out.courtyard;
    } else {
      a.spouseRelations.push({
        id: b.id, type: newType, marryYear: marryYr,
        matchStage: "已婚", courtyard: out.courtyard || ""
      });
    }
    const rB = b.spouseRelations.find(r => r.id === a.id);
    if (rB) {
      rB.type = newType;
      rB.marryYear = marryYr;
      rB.matchStage = "已婚";
      if (out.courtyard) rB.courtyard = out.courtyard;
    } else {
      b.spouseRelations.push({
        id: a.id, type: newType, marryYear: marryYr,
        matchStage: "已婚", courtyard: out.courtyard || ""
      });
    }
    if (!a.spouseIds.includes(b.id)) a.spouseIds.push(b.id);
    if (!b.spouseIds.includes(a.id)) b.spouseIds.push(a.id);

    // 年史
    recordChronicleSafe({
      year: marryYr, kind: "event", eventKind: "marriage",
      decision: `議親室成婚:${a.name} × ${b.name}(${newType})`,
      actors: { person1Id: a.id, person2Id: b.id }
    });
    // 成婚後清掉本地口頭議親
    delete matchState.oralEngagements[pairKey(a.id, b.id)];
    touched = true;
  }

  // 納妾:新增一筆 spouseRelations,類型為輸入
  if (out.writeConsort) {
    const aHas = (a.spouseIds || []).length > 0;
    const main = aHas ? a : b;
    const incoming = aHas ? b : a;
    if (!Array.isArray(main.spouseRelations)) main.spouseRelations = [];
    if (!Array.isArray(incoming.spouseRelations)) incoming.spouseRelations = [];
    if (!main.spouseIds) main.spouseIds = [];
    if (!incoming.spouseIds) incoming.spouseIds = [];

    const marryYr = out.marryYearChosen || state.gameYear;
    if (!main.spouseRelations.find(r => r.id === incoming.id)) {
      main.spouseRelations.push({
        id: incoming.id, type: out.consortType || "妾",
        marryYear: marryYr, matchStage: "已婚",
        courtyard: out.courtyard || ""
      });
    }
    if (!incoming.spouseRelations.find(r => r.id === main.id)) {
      incoming.spouseRelations.push({
        id: main.id, type: out.consortType || "妾",
        marryYear: marryYr, matchStage: "已婚",
        courtyard: out.courtyard || ""
      });
    }
    if (!main.spouseIds.includes(incoming.id)) main.spouseIds.push(incoming.id);
    if (!incoming.spouseIds.includes(main.id)) incoming.spouseIds.push(main.id);

    recordChronicleSafe({
      year: marryYr, kind: "event", eventKind: "marriage",
      decision: `議親室納:${main.name} 納 ${incoming.name}(${out.consortType})`,
      actors: { person1Id: main.id, person2Id: incoming.id }
    });
    touched = true;
  }

  // 院落改動
  if (!out.writeMarry && !out.writeConsort && out.courtyard) {
    const rA = (a.spouseRelations || []).find(r => r.id === b.id);
    const rB = (b.spouseRelations || []).find(r => r.id === a.id);
    if (rA) rA.courtyard = out.courtyard;
    if (rB) rB.courtyard = out.courtyard;
    if (rA || rB) touched = true;
  }

  // 修改結婚年份
  if (out.editMarryYear != null) {
    const rA = (a.spouseRelations || []).find(r => r.id === b.id);
    const rB = (b.spouseRelations || []).find(r => r.id === a.id);
    if (rA) { rA.marryYear = out.editMarryYear; touched = true; }
    if (rB) { rB.marryYear = out.editMarryYear; touched = true; }
  }

  // 修改名分／關係類型
  if (out.editSpouseType) {
    const rA = (a.spouseRelations || []).find(r => r.id === b.id);
    const rB = (b.spouseRelations || []).find(r => r.id === a.id);
    if (rA) { rA.type = out.editSpouseType; touched = true; }
    if (rB) { rB.type = out.editSpouseType; touched = true; }
  }

  // 更新 matchStage(僅在已有 relation 時)
  if (out.updateStage && !out.writeBetrothal && !out.writeMarry && !out.writeConsort) {
    const rA = (a.spouseRelations || []).find(r => r.id === b.id);
    const rB = (b.spouseRelations || []).find(r => r.id === a.id);
    if (rA) { rA.matchStage = out.updateStage; touched = true; }
    if (rB) { rB.matchStage = out.updateStage; touched = true; }
  }

  // 口頭議親:寫入本地暫存(讓 getStageOfPair 抓得到「已議親成功」)
  if (out.writeOralEngage) {
    matchState.oralEngagements[pairKey(a.id, b.id)] = "已議親成功";
  }

  // 駁回／悔婚:若有訂婚紀錄就移除;同時清掉本地口頭議親
  if (out.breakBetrothal) {
    const rA = (a.spouseRelations || []).find(r => r.id === b.id);
    const rB = (b.spouseRelations || []).find(r => r.id === a.id);
    if (rA && rA.type === "訂婚" && !rA.marryYear) {
      a.spouseRelations = a.spouseRelations.filter(r => r.id !== b.id);
      a.spouseIds = (a.spouseIds || []).filter(id => id !== b.id);
      touched = true;
    }
    if (rB && rB.type === "訂婚" && !rB.marryYear) {
      b.spouseRelations = b.spouseRelations.filter(r => r.id !== a.id);
      b.spouseIds = (b.spouseIds || []).filter(id => id !== a.id);
      touched = true;
    }
    delete matchState.oralEngagements[pairKey(a.id, b.id)];
  }

  // 新增子嗣 — 規則:子女預設 familyId = 父方家族(以性別為準),入贅婚則 = 母方
  if (out.addChild) {
    const childName = inputs.childName || generateGivenName();
    const childGenderInput = inputs.childGender || "子";
    const gender = (childGenderInput === "女") ? "女" : "男";
    const role = inputs.childRole || (inputs.childStatus === "庶出" ? "庶出子女" : "嫡支子女");
    const birthYearInput = inputs.childBirthYear;

    // 找雙方關係,判斷是否入贅婚
    const rel = (a.spouseRelations || []).find(r => r.id === b.id)
             || (b.spouseRelations || []).find(r => r.id === a.id);
    const isUxorilocal = rel && rel.type === "入贅"; // 入贅婚

    // 找出父親與母親
    let father = null, mother = null;
    if (a.gender === "男") { father = a; mother = b; }
    else if (b.gender === "男") { father = b; mother = a; }
    else { father = a; mother = b; } // 兩人都沒性別,A 預設為父

    // 子女家族歸屬:入贅 → 母方;否則 → 父方
    const inheritFamilyFrom = isUxorilocal ? mother : father;
    const childFamilyId = inheritFamilyFrom?.familyId || father?.familyId || mother?.familyId || null;

    // 暫時擋掉 childMode / parentMode，避免觸發主頁 DOM 流程
    const savedChildMode = state.childModeParentId;
    const savedParentMode = state.parentModeChildId;
    state.childModeParentId = null;
    state.parentModeChildId = null;

    const baby = addPerson({
      name: childName,
      gender: gender,
      role: role,
      familyId: childFamilyId,
      occupation: "",
      residence: "",
      ageOrBirthInput: birthYearInput ? String(birthYearInput) : String(state.gameYear),
      notes: `(議親室子嗣${isUxorilocal ? "・入贅母方家族" : ""})`
    });
    // 還原 childMode / parentMode
    state.childModeParentId = savedChildMode;
    state.parentModeChildId = savedParentMode;

    if (baby) {
      // 父母連結:兩位都要連
      linkParentChild(father, baby, { ignoreRule: true, silent: true });
      linkParentChild(mother, baby, { ignoreRule: true, silent: true });
      normalizeRelations();
      touched = true;
      out._babyName = baby.name;
      out._babyFamily = childFamilyId ? getFamilyNameById(childFamilyId) : "未歸宗族";
    }
  }

  if (touched) {
    saveState();
  }
  return touched;
}

// safe wrapper: recordChronicle 在 events.js 已宣告
function recordChronicleSafe(entry) {
  try {
    if (typeof recordChronicle === "function") recordChronicle(entry);
    else {
      if (!state.chronicle) state.chronicle = [];
      state.chronicle.push(entry);
    }
  } catch (e) { /* noop */ }
}

// =============== 看看誰適合 ===============
function suggestMatchesFor(target) {
  if (!target) return [];
  const oppositeGender = target.gender === "男" ? "女" : (target.gender === "女" ? "男" : null);
  const pool = matchState.forcePick ? allLivingPeople() : eligibleForMatch();
  return pool
    .filter(c => c.id !== target.id)
    .filter(c => oppositeGender ? c.gender === oppositeGender : true)
    .map(c => {
      const reasons = [];
      const concerns = [];
      let score = 0;
      const tAge = getMatchAge(target);
      const cAge = getMatchAge(c);
      const ageDiff = (tAge != null && cAge != null) ? Math.abs(tAge - cAge) : null;
      if (ageDiff != null) {
        if (ageDiff <= 3) { reasons.push("年齡相當"); score += 3; }
        else if (ageDiff <= 6) { reasons.push("年齡尚可"); score += 1; }
        else if (ageDiff > 10) { concerns.push(`年齡差 ${ageDiff} 歲偏大`); score -= 2; }
      }
      if (cAge != null && cAge < 15) { concerns.push(`${c.name}年紀過小，需走暫緩觀察案`); score -= 3; }
      if (tAge != null && tAge < 15) concerns.push(`${target.name}年紀過小`);

      const cHas = (c.spouseIds || []).length > 0;
      const tHas = (target.spouseIds || []).length > 0;
      if (cHas && !tHas) { concerns.push(`${c.name}已有婚配，只能納為側室／繼室`); score -= 1; }
      if (tHas && !cHas) reasons.push(`${target.name}已有婚配，${c.name}可作側妃／侍妾／續弦人選`);
      if (cHas && tHas) { concerns.push("雙方都已有婚配"); score -= 3; }

      // 同家族需查血緣
      if (c.familyId && target.familyId && c.familyId === target.familyId) {
        concerns.push("同家族,需查血緣");
        score -= 2;
      }

      // 區域同地加分(交通方便)
      const tFam = state.families.find(f => f.id === target.familyId);
      const cFam = state.families.find(f => f.id === c.familyId);
      if (tFam && cFam && tFam.regionId && tFam.regionId === cFam.regionId) {
        reasons.push("同區域,聯姻易行");
        score += 1;
      }

      // 盟友家族加分
      if (tFam && cFam && (tFam.allies || []).includes(cFam.id)) {
        reasons.push("兩家已為盟友,聯姻可深化");
        score += 2;
      }

      // 死者不行(理論上池子已過濾)
      if (c.deceased) { concerns.push("已逝"); score -= 99; }

      return { person: c, reasons, concerns, score };
    })
    .filter(item => item.score > -10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

// =============== 人物資訊文字 ===============
function statusText(person) {
  if (!person) return "";
  const age = getMatchAge(person);
  const famName = person.familyId ? getFamilyNameById(person.familyId) : "未歸宗族";
  const lines = [
    `姓名:${person.name}${person.deceased ? "【已逝】" : ""}`,
    `年齡:${age != null ? age + " 歲" : "未記"}`,
    `性別:${person.gender || "未指定"}`,
    `身分:${person.role || "未指定"}`,
    `家族:${famName}`,
  ];
  const sp = spouseListOf(person);
  if (sp.length) {
    lines.push(`配偶／訂親：${sp.map(x => `${x.other.name}（${displaySpouseType(x.rel.type)}${x.rel.marryYear ? `，${x.rel.marryYear}年成婚` : (x.rel.matchStage === "已婚" ? "，已成婚" : "，未成婚")}${x.rel.courtyard ? `，${x.rel.courtyard}` : ""}）`).join("、")}`);
  } else {
    lines.push("配偶／訂親：無");
  }
  if (person.childIds && person.childIds.length) {
    const kids = person.childIds.map(id => findPerson(id)?.name).filter(Boolean).join("、");
    lines.push(`子女:${kids}`);
  }
  return lines.join("\n");
}

// =============== 渲染 ===============
function renderPersonSelector(selectId, currentId, pool) {
  const sel = _$(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  if (!pool.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "(無可選人物)";
    sel.appendChild(opt);
    return;
  }
  pool.forEach(p => {
    const opt = document.createElement("option");
    opt.value = String(p.id);
    const age = getMatchAge(p);
    const fam = p.familyId ? getFamilyNameById(p.familyId) : "未歸宗族";
    opt.textContent = `${p.name}(${p.gender || "?"}・${age != null ? age + "歲" : "?歲"}・${fam})`;
    if (p.id === currentId) opt.selected = true;
    sel.appendChild(opt);
  });
}

// 依家族篩選 + 強推模式組合人物池
function poolByFamilyFilter(famFilter) {
  const base = pickablePool();
  if (!famFilter || famFilter === "all") return base;
  if (famFilter === "noFamily") return base.filter(p => !p.familyId);
  const fid = Number(famFilter);
  return base.filter(p => p.familyId === fid);
}

function renderFamilyFilters() {
  const fams = state.families || [];
  const options = [
    `<option value="all">全部家族</option>`,
    ...fams.map(f => `<option value="${f.id}">${f.name}</option>`),
    `<option value="noFamily">未歸宗族</option>`
  ].join("");
  const aSel = _$("aFamilyFilter");
  const bSel = _$("bFamilyFilter");
  if (aSel) {
    aSel.innerHTML = options;
    aSel.value = String(matchState.aFamilyId);
  }
  if (bSel) {
    bSel.innerHTML = options;
    bSel.value = String(matchState.bFamilyId);
  }
}

function renderSelectors() {
  const poolA = poolByFamilyFilter(matchState.aFamilyId);
  const poolB = poolByFamilyFilter(matchState.bFamilyId);

  // 若已選的人物仍存在(即使不在池子裡,如已訂親/已婚),保留選擇;
  // 只在「完全沒選」或「人物已不存在(如已逝)」時才自動挑
  const personA = matchState.aId ? findPerson(matchState.aId) : null;
  if (!personA || personA.deceased) {
    matchState.aId = poolA[0]?.id || null;
  }
  const personB = matchState.bId ? findPerson(matchState.bId) : null;
  if (!personB || personB.deceased) {
    const aPerson = findPerson(matchState.aId);
    const second = poolB.find(p => p.id !== matchState.aId && p.gender && aPerson?.gender && p.gender !== aPerson.gender)
                || poolB.find(p => p.id !== matchState.aId)
                || poolB[0];
    matchState.bId = second?.id || null;
  }

  // 顯示選單:若當事人不在池子裡,額外補入供顯示
  const displayPoolA = poolA.find(p => p.id === matchState.aId)
    ? poolA
    : [...(personA && !personA.deceased ? [personA] : []), ...poolA];
  const displayPoolB = poolB.find(p => p.id === matchState.bId)
    ? poolB
    : [...(personB && !personB.deceased ? [personB] : []), ...poolB];

  renderPersonSelector("aPerson", matchState.aId, displayPoolA);
  renderPersonSelector("bPerson", matchState.bId, displayPoolB);
}

function renderPersonInfo() {
  const a = getMA();
  const b = getMB();
  _$("aInfo").textContent = a ? statusText(a) : "尚未選人";
  _$("bInfo").textContent = b ? statusText(b) : "尚未選人";
}

function renderCase() {
  const a = getMA();
  const b = getMB();
  _$("caseTitle").textContent = a && b ? `${a.name} × ${b.name}` : "未開案";
  _$("caseSummary").textContent = buildSummary(a, b);
}

function renderActions() {
  const a = getMA(), b = getMB();
  if (!a || !b) {
    _$("actions").innerHTML = `<p class="empty">請先選定兩位人物。</p>`;
    return;
  }
  const actions = getActions(a, b);
  _$("actions").innerHTML = actions.map(act => `
    <button class="action-btn ${matchState.pendingAction === act.key ? "pending" : ""}" data-action="${act.key}">
      ${act.label}${matchState.pendingAction === act.key ? '<span class="pending-note">← 填寫下方欄位後確認</span>' : ""}
    </button>
  `).join("");
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => handleActionClick(btn.dataset.action));
  });
  renderInputPanel();
}

function renderInputPanel() {
  const panel = _$("inputPanel");
  const fields = matchState.pendingAction ? getRequiredFields(matchState.pendingAction) : [];
  if (!matchState.pendingAction || fields.length === 0) {
    panel.classList.add("hidden");
    _$("dynamicInputs").innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  const a = getMA(), b = getMB();
  const chunks = [];

  // 名分用選單(可選 SPOUSE_TYPES 或自訂)
  const titleOptions = ["夫", "正妻", "平妻", "繼室", "側室", "妾", "入贅"];
  if (fields.includes("aTitle")) {
    chunks.push(`<div><label>${a.name} 的名分</label>
      <select id="aTitle">
        ${titleOptions.map(t => `<option>${t}</option>`).join("")}
      </select>
    </div>`);
  }
  if (fields.includes("bTitle")) {
    chunks.push(`<div><label>${b.name} 的名分</label>
      <select id="bTitle">
        ${titleOptions.map(t => `<option ${t === "婚配" ? "selected" : ""}>${t}</option>`).join("")}
      </select>
    </div>`);
  }
  if (fields.includes("sharedTitle")) {
    chunks.push(`<div><label>納入名分</label><select id="sharedTitle">${SPOUSE_TYPES.filter(t => t !== "訂婚").map(t => `<option>${t}</option>`).join("")}</select></div>`);
  }
  if (fields.includes("spouseType")) {
    chunks.push(`<div><label>訂婚預定名分</label><select id="spouseType">${["訂婚","婚配","平妻","妾","繼室","入贅"].map(t => `<option>${t}</option>`).join("")}</select></div>`);
  }
  if (fields.includes("courtyard")) {
    chunks.push(`<div><label>院落安排</label><input id="courtyard" placeholder="如:正院／聽雪院／偏院" /></div>`);
  }
  if (fields.includes("marryYear")) {
    chunks.push(`<div><label>結婚年份(星曆)</label><input id="marryYear" type="number" value="${state.gameYear}" /></div>`);
  }
  if (fields.includes("editMarryYear")) {
    // 找出當前 spouseRelations 的年份
    const rel = relationBetween(a.id, b.id);
    const currentYear = rel?.marryYear || state.gameYear;
    const currentType = displaySpouseType(rel?.type);
    chunks.push(`<div><label>修改結婚年份(星曆)</label><input id="editMarryYear" type="number" value="${currentYear}" /></div>`);
  }
  if (fields.includes("editSpouseType")) {
    const rel = relationBetween(a.id, b.id);
    const currentType = displaySpouseType(rel?.type);
    chunks.push(`<div><label>修改名分／關係類型</label>
      <select id="editSpouseType">
        ${SPOUSE_TYPES.map(t => `<option ${t === currentType ? "selected" : ""}>${t}</option>`).join("")}
      </select>
    </div>`);
  }
  if (fields.includes("child")) {
    // 身分選項取自 state.roleOptions(就是 DEFAULT_ROLES)
    const roleOpts = (state.roleOptions || ["嫡支子女", "庶出子女", "旁系宗親"]);
    chunks.push(`
      <div style="grid-column:1/-1;">
        <label>子嗣資訊</label>
        <div class="input-grid three" style="margin-bottom:8px;">
          <input id="childName" placeholder="姓名" />
          <select id="childGender"><option>男</option><option>女</option></select>
          <input id="childBirthYear" type="number" placeholder="出生年(星曆)" value="${state.gameYear}" />
        </div>
        <div class="input-grid">
          <select id="childRole">
            ${roleOpts.map(r => `<option ${r === "嫡支子女" ? "selected" : ""}>${r}</option>`).join("")}
          </select>
          <select id="childStatus">
            <option>嫡出</option>
            <option>庶出</option>
          </select>
        </div>
      </div>
    `);
  }
  _$("dynamicInputs").innerHTML = `<div class="input-grid">${chunks.join("")}</div>`;
}

function getInputValues() {
  return {
    aTitle: _$("aTitle")?.value || "",
    bTitle: _$("bTitle")?.value || "",
    sharedTitle: _$("sharedTitle")?.value || "",
    spouseType: _$("spouseType")?.value || "",
    courtyard: _$("courtyard")?.value || "",
    marryYear: _$("marryYear")?.value || "",
    editMarryYear: _$("editMarryYear")?.value || "",
    editSpouseType: _$("editSpouseType")?.value || "",
    childName: _$("childName")?.value || "",
    childGender: _$("childGender")?.value || "男",
    childStatus: _$("childStatus")?.value || "嫡出",
    childRole: _$("childRole")?.value || "",
    childBirthYear: _$("childBirthYear")?.value || "",
  };
}

function getChapters() {
  if (!state.matchChapters) state.matchChapters = [];
  return state.matchChapters;
}

function addChapter(ch) {
  getChapters().unshift(ch);
  // 避免過多
  if (getChapters().length > 500) {
    state.matchChapters = getChapters().slice(0, 500);
  }
  saveState();
}

function renderChapters() {
  const chs = getChapters();
  _$("historyCount").textContent = `共 ${chs.length} 筆`;
  const latest = chs.slice(0, 6);
  if (!latest.length) {
    _$("chapters").innerHTML = `<p class="empty">尚未處理。選一個合理操作,或擲一下。</p>`;
    return;
  }
  _$("chapters").innerHTML = latest.map(ch => `
    <div class="chapter ${ch.kind === "event" ? "event" : ""}">
      <div class="chapter-title">${ch.title}</div>
      <div class="small-muted">處理:${ch.actionLabel} ・ 星曆 ${ch.year} 年${ch.pair ? ` ・ ${ch.pair}` : ""}</div>
      <div><strong>當下:</strong>${ch.immediate}</div>
      <div><strong>後續:</strong>${ch.next}</div>
      <div><strong>提示:</strong>${ch.hint}</div>
      ${ch.reactions && ch.reactions.length ? `
        <div class="reaction-box">
          <div class="reaction-title">相關人物反應</div>
          ${ch.reactions.map(r => `<div><strong>${r.who}</strong><span class="small-muted">(${r.role})</span>:${r.reaction}</div>`).join("")}
        </div>
      ` : ""}
    </div>
  `).join("");
}

function renderAll() {
  renderFamilyFilters();
  renderSelectors();
  renderPersonInfo();
  renderCase();
  renderActions();
  renderChapters();
}

// =============== 動作觸發 ===============
function handleActionClick(actionKey) {
  const fields = getRequiredFields(actionKey);
  if (!fields.length) {
    executeAction(actionKey);
  } else {
    matchState.pendingAction = actionKey;
    renderActions();
  }
}

// 暴露為全域,讓 onclick 抓得到
function matchConfirm() {
  if (matchState.pendingAction) executeAction(matchState.pendingAction);
}
function matchCancel() {
  matchState.pendingAction = null;
  renderAll();
}
if (typeof window !== "undefined") {
  window.matchConfirm = matchConfirm;
  window.matchCancel = matchCancel;
}

function executeAction(action) {
  const a = getMA(), b = getMB();
  if (!a || !b) return;
  try {
    const actions = getActions(a, b);
    const inputs = getInputValues();
    const out = makeOutcome(action, a, b, inputs);
    applySideEffects(out, a, b, inputs);

    const reactions = getThirdPartyReactions(action, a, b);
    addChapter({
      title: out.title,
      actionLabel: actions.find(x => x.key === action)?.label || action,
      immediate: out.immediate,
      next: out.next,
      hint: out.hint,
      reactions,
      kind: "action",
      year: state.gameYear,
      aId: a.id,
      bId: b.id,
      pair: `${a.name} × ${b.name}`,
    });
    matchState.pendingAction = null;
    renderAll();
  } catch (err) {
    console.error("執行動作時出錯：", err);
    alert("執行動作時發生錯誤,請打開瀏覽器主控台(F12)查看細節:\n\n" + err.message);
  }
}

function rollRandomEvent() {
  const a = getMA(), b = getMB();
  if (!a || !b) return;
  const ev = pickRandomEvent(a, b);
  addChapter({
    title: ev.title,
    actionLabel: "擲了一下",
    immediate: ev.body,
    next: "事件本身不會改變人物狀態,請決定要不要繼續推進、改議、或駁回。",
    hint: "隨機事件僅作為劇情催化。",
    reactions: [],
    kind: "event",
    year: state.gameYear,
    aId: a.id,
    bId: b.id,
    pair: `${a.name} × ${b.name}`,
  });
  renderAll();
}

function randomizePair() {
  const pool = pickablePool();
  if (pool.length < 2) return;
  const first = pickRandom(pool);
  let second = pickRandom(pool);
  let guard = 0;
  while ((second.id === first.id || (first.gender && second.gender && first.gender === second.gender)) && guard < 80) {
    second = pickRandom(pool);
    guard++;
  }
  matchState.aId = first.id;
  matchState.bId = second.id;
  matchState.pendingAction = null;
  renderAll();
}

// =============== 翻檔案 / 看看誰適合 ===============
function openArchive() {
  _$("archiveModal").classList.add("active");
  renderArchive();
}

function renderArchive() {
  const body = _$("archiveBody");
  const filter = _$("archiveFilter");
  const search = (matchState.archiveSearch || "").toLowerCase();

  if (matchState.archiveTab === "people") {
    // 篩選家族
    const fams = ["全部", ...state.families.map(f => f.name), "未歸宗族"];
    filter.innerHTML = fams.map(g => `<option value="${g}" ${g === matchState.archiveFilter ? "selected" : ""}>${g}</option>`).join("");
    const filtered = state.persons.filter(p => {
      // 家族過濾
      if (matchState.archiveFilter !== "全部") {
        const fname = p.familyId ? getFamilyNameById(p.familyId) : "未歸宗族";
        if (fname !== matchState.archiveFilter) return false;
      }
      if (!search) return true;
      const fname = p.familyId ? getFamilyNameById(p.familyId) : "未歸宗族";
      return `${p.name} ${p.role || ""} ${fname} ${p.notes || ""}`.toLowerCase().includes(search);
    });
    body.innerHTML = filtered.length ? filtered.map(p => `
      <div class="archive-item">
        <div class="archive-top">
          <div>
            <div class="archive-name">${p.name}${p.deceased ? "【已逝】" : ""}</div>
            <div class="archive-sub">${getMatchAge(p) != null ? getMatchAge(p) + "歲" : "?歲"} · ${p.role || "未指定"} · ${p.familyId ? getFamilyNameById(p.familyId) : "未歸宗族"}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn" data-jump-a="${p.id}" style="font-size:12px;padding:7px 10px;">設為 A</button>
            <button class="btn" data-jump-b="${p.id}" style="font-size:12px;padding:7px 10px;">設為 B</button>
          </div>
        </div>
        <pre class="archive-pre">${statusText(p)}</pre>
      </div>
    `).join("") : `<p class="empty">沒有符合的人物</p>`;
    document.querySelectorAll("[data-jump-a]").forEach(btn => {
      btn.addEventListener("click", () => {
        matchState.aId = Number(btn.dataset.jumpA);
        _$("archiveModal").classList.remove("active");
        renderAll();
      });
    });
    document.querySelectorAll("[data-jump-b]").forEach(btn => {
      btn.addEventListener("click", () => {
        matchState.bId = Number(btn.dataset.jumpB);
        _$("archiveModal").classList.remove("active");
        renderAll();
      });
    });
  } else {
    // 事件頁:列出議親室持久化的案卷
    filter.innerHTML = ["全部", "動作", "事件"].map(v => `<option value="${v}" ${v === matchState.archiveFilter ? "selected" : ""}>${v}</option>`).join("");
    const chs = getChapters();
    const filtered = chs.filter(ch => {
      if (matchState.archiveFilter === "動作" && ch.kind === "event") return false;
      if (matchState.archiveFilter === "事件" && ch.kind !== "event") return false;
      if (!search) return true;
      return `${ch.title} ${ch.immediate} ${ch.actionLabel} ${ch.pair || ""}`.toLowerCase().includes(search);
    });
    body.innerHTML = filtered.length ? filtered.map(ch => `
      <div class="archive-item ${ch.kind === "event" ? "event-archive" : ""}">
        <div class="archive-top">
          <div>
            <div class="chapter-title">${ch.title}</div>
            <div class="small-muted">處理:${ch.actionLabel} · 星曆 ${ch.year} 年${ch.pair ? ` · ${ch.pair}` : ""}</div>
          </div>
          ${(ch.aId != null && ch.bId != null) ? `<button class="btn" data-reopen-a="${ch.aId}" data-reopen-b="${ch.bId}" style="font-size:12px;padding:7px 10px;white-space:nowrap;">重開此案</button>` : ""}
        </div>
        <div style="margin-top:4px;">${ch.immediate}</div>
        ${ch.next ? `<div class="small-muted" style="margin-top:4px;">後續:${ch.next}</div>` : ""}
      </div>
    `).join("") : `<p class="empty">沒有符合的紀錄</p>`;
    document.querySelectorAll("[data-reopen-a]").forEach(btn => {
      btn.addEventListener("click", () => {
        matchState.aId = Number(btn.dataset.reopenA);
        matchState.bId = Number(btn.dataset.reopenB);
        matchState.pendingAction = null;
        _$("archiveModal").classList.remove("active");
        renderAll();
      });
    });
  }
}

function openSuggestions(targetWhich) {
  matchState.suggestionsTarget = targetWhich || "a";
  _$("suggestionsModal").classList.add("active");
  renderSuggestions();
}

function renderSuggestions() {
  const target = matchState.suggestionsTarget === "b" ? getMB() : getMA();
  if (!target) {
    _$("suggestionsTitle").textContent = "尚未選人";
    _$("suggestionsBody").innerHTML = `<p class="empty">請先選定人物。</p>`;
    return;
  }
  _$("suggestionsTitle").textContent = `給 ${target.name} 的議親建議`;
  const suggestions = suggestMatchesFor(target);
  _$("suggestionsBody").innerHTML = suggestions.length ? suggestions.map(({ person, reasons, concerns, score }) => `
    <div class="archive-item">
      <div class="archive-top">
        <div>
          <div class="archive-name">${person.name}</div>
          <div class="archive-sub">${getMatchAge(person)}歲 · ${person.gender || "?"} · ${person.familyId ? getFamilyNameById(person.familyId) : "未歸宗族"}</div>
          <div class="suggestion-score">合適度 ${score}</div>
        </div>
        <button class="btn" data-pick="${person.id}" style="font-size:12px;padding:7px 10px;">選為對方</button>
      </div>
      ${reasons.length ? `<div class="reason"><span class="small-muted">合適:</span>${reasons.join("、")}</div>` : ""}
      ${concerns.length ? `<div class="reason"><span class="concern-label">阻礙:</span>${concerns.join("、")}</div>` : ""}
    </div>
  `).join("") : `<p class="empty">沒有合適對象。試試切換「強推」拿任意人物。</p>`;
  document.querySelectorAll("[data-pick]").forEach(btn => {
    btn.addEventListener("click", () => {
      const pid = Number(btn.dataset.pick);
      if (matchState.suggestionsTarget === "b") matchState.aId = pid;
      else matchState.bId = pid;
      _$("suggestionsModal").classList.remove("active");
      renderAll();
    });
  });
}

// =============== 初始化 ===============
document.addEventListener("DOMContentLoaded", () => {
  loadState();

  // 強推開關
  _$("forcePickToggle").addEventListener("change", e => {
    matchState.forcePick = e.target.checked;
    renderAll();
  });

  // 人物選擇
  _$("aPerson").addEventListener("change", e => { matchState.aId = Number(e.target.value); matchState.pendingAction = null; renderAll(); });
  _$("bPerson").addEventListener("change", e => { matchState.bId = Number(e.target.value); matchState.pendingAction = null; renderAll(); });

  // 家族篩選
  if (_$("aFamilyFilter")) {
    _$("aFamilyFilter").addEventListener("change", e => {
      matchState.aFamilyId = e.target.value === "noFamily" || e.target.value === "all" ? e.target.value : e.target.value;
      matchState.aId = null; // 觸發重新挑預設
      matchState.pendingAction = null;
      renderAll();
    });
  }
  if (_$("bFamilyFilter")) {
    _$("bFamilyFilter").addEventListener("change", e => {
      matchState.bFamilyId = e.target.value;
      matchState.bId = null;
      matchState.pendingAction = null;
      renderAll();
    });
  }

  // 清空案卷
  if (_$("clearChaptersBtn")) {
    _$("clearChaptersBtn").addEventListener("click", () => {
      if (confirm("確定要清空所有案卷紀錄?(不會影響族譜)")) {
        state.matchChapters = [];
        saveState();
        renderAll();
      }
    });
  }

  // 按鈕
  _$("confirmActionBtn").addEventListener("click", () => { if (matchState.pendingAction) executeAction(matchState.pendingAction); });
  _$("cancelActionBtn").addEventListener("click", () => { matchState.pendingAction = null; renderAll(); });
  _$("randomizeBtn").addEventListener("click", randomizePair);
  _$("rollBtn").addEventListener("click", rollRandomEvent);
  _$("archiveBtn").addEventListener("click", openArchive);
  _$("closeArchiveBtn").addEventListener("click", () => _$("archiveModal").classList.remove("active"));
  _$("archiveModal").addEventListener("click", e => { if (e.target.id === "archiveModal") _$("archiveModal").classList.remove("active"); });
  _$("peopleTab").addEventListener("click", () => { matchState.archiveTab = "people"; matchState.archiveFilter = "全部"; _$("peopleTab").classList.add("active"); _$("eventsTab").classList.remove("active"); renderArchive(); });
  _$("eventsTab").addEventListener("click", () => { matchState.archiveTab = "events"; matchState.archiveFilter = "全部"; _$("eventsTab").classList.add("active"); _$("peopleTab").classList.remove("active"); renderArchive(); });
  _$("archiveSearch").addEventListener("input", e => { matchState.archiveSearch = e.target.value; renderArchive(); });
  _$("archiveFilter").addEventListener("change", e => { matchState.archiveFilter = e.target.value; renderArchive(); });
  _$("suggestABtn").addEventListener("click", () => openSuggestions("a"));
  _$("suggestBBtn").addEventListener("click", () => openSuggestions("b"));
  _$("closeSuggestionsBtn").addEventListener("click", () => _$("suggestionsModal").classList.remove("active"));
  _$("suggestionsModal").addEventListener("click", e => { if (e.target.id === "suggestionsModal") _$("suggestionsModal").classList.remove("active"); });

  renderAll();
});
