// storage.js
// localStorage 存取

// ---------- 儲存與載入 ----------
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.regions = data.regions && data.regions.length ? data.regions : [...DEFAULT_REGIONS];
    state.families = data.families || [];
    state.persons = data.persons || [];
    state.originOptions = data.originOptions && data.originOptions.length ? data.originOptions : [...DEFAULT_ORIGINS];

    if (Array.isArray(data.territoryOptions) && data.territoryOptions.length) {
      if (typeof data.territoryOptions[0] === "string") {
        state.territoryOptions = data.territoryOptions.map(name => ({ name, regionId: "" }));
      } else {
        state.territoryOptions = data.territoryOptions.map(t => ({
          name: t.name,
          regionId: t.regionId || ""
        }));
      }
    } else {
      state.territoryOptions = [...DEFAULT_TERRITORIES];
    }

    state.roleOptions = data.roleOptions && data.roleOptions.length ? data.roleOptions : [...DEFAULT_ROLES];
    
    state.occOptions = data.occOptions && data.occOptions.length ? data.occOptions : [...DEFAULT_OCCS];
    state.resOptions = data.resOptions && data.resOptions.length ? data.resOptions : [...DEFAULT_RES];
    state.nextFamilyId = data.nextFamilyId || 1;
    state.nextPersonId = data.nextPersonId || 1;
    state.selectedFamilyId = data.selectedFamilyId || null;
    state.selectedPersonId = data.selectedPersonId || null;
    state.childModeParentId = null;
    state.gameYear = data.gameYear || INITIAL_YEAR;

    state.persons.forEach(p => {
      if (p.deceased == null) p.deceased = false;
      if (!Array.isArray(p.spouseRelations)) p.spouseRelations = [];
      if (!Array.isArray(p.spouseIds)) p.spouseIds = p.spouseIds || [];
      if (!Array.isArray(p.parentIds)) p.parentIds = p.parentIds || [];
      if (!Array.isArray(p.childIds)) p.childIds = p.childIds || [];
    });

    // v3 新增欄位:向後相容處理
    state.families.forEach(f => {
      if (!Array.isArray(f.allies)) f.allies = [];
      // headId 留 undefined 也行, 不強制設定
    });
    state.chronicle = Array.isArray(data.chronicle) ? data.chronicle : [];

    normalizeRelations();
  } catch (e) {
    console.warn("載入存檔失敗", e);
  }
}

