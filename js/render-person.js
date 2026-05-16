// render-person.js
// 人物詳情渲染、刪除家族/人物、領養子女 UI
// (renderPersonDetail 為 562 行的巨型函式, 本次重構不拆其內部)

function renderPersonDetail() {
  const box = $("personDetail");
  box.innerHTML = "";
  if (!state.selectedPersonId) {
    box.innerHTML = '<p class="hint">請從家族詳情中的成員列表點選一人。</p>';
    return;
  }
  const p = state.persons.find(x => x.id === state.selectedPersonId);
  if (!p) {
    box.innerHTML = '<p class="hint">人物資料錯誤。</p>';
    return;
  }

  const fam = state.families.find(x => x.id === p.familyId);
  const title = document.createElement("h2");
  title.className = "detail-title";
  title.textContent = p.name + (p.deceased ? " 【已逝】" : "");
  box.appendChild(title);

  const info = document.createElement("div");
  info.className = "detail-section";
  const age = getAge(p);
  const ageText = age != null ? age + " 歲" : "年齡未記";
  const gen = computeGeneration(p.id);

  let expectedText = "";
  if (p.deathYear != null) {
    const lifeAge = p.birthYear != null ? (p.deathYear - p.birthYear) : null;
    expectedText = `預計卒於星曆 ${p.deathYear} 年`;
    if (lifeAge != null) expectedText += `（約享年 ${lifeAge} 歲）`;
    if (p.deceased) expectedText = `已於星曆 ${p.deathYear} 年辭世`;
  } else {
    expectedText = "未記載預期壽命";
  }

  info.innerHTML = `
    <div class="detail-label">身分／代數</div>
    <div class="detail-value">${p.role || "未標註"}｜${fam ? fam.name : "未歸宗族"}｜第 ${gen} 代成員</div>
    <div class="detail-label">出生年份／年齡</div>
    <div class="detail-value">${p.birthYear != null ? "星曆 " + p.birthYear + " 年" : "未記載"}｜${ageText}</div>
    <div class="detail-label">性別／身分／家族</div>
    <div class="detail-value">${p.gender || "未記載"}｜${p.role || "未標註"}｜${fam ? fam.name : "未歸宗族"}</div>
    <div class="detail-label">職業／住所</div>
    <div class="detail-value">${p.occupation || "未記載"}｜${p.residence || "未記載"}</div>
    <div class="detail-label">預期壽命</div>
    <div class="detail-value">${expectedText}</div>
  `;
  box.appendChild(info);

  // ===== v6:備註(可檢視 / 編輯) =====
  const notes = document.createElement("div");
  notes.className = "detail-section";
  notes.id = "personNotesSection";
  notes.innerHTML = `
    <div class="detail-label">
      備註
      <button id="editNotesBtn" class="btn btn-small btn-inline-edit" type="button">編輯備註</button>
    </div>
    <div id="personNotesView" class="detail-value">${p.notes ? escapeHtml(p.notes) : '<span class="hint">尚無備註。</span>'}</div>
    <div id="personNotesEdit" class="hidden">
      <textarea id="personNotesInput" class="notes-textarea" rows="4" placeholder="可記下此人物的性格、命格、關鍵事件、家族決議⋯⋯"></textarea>
      <div class="notes-edit-actions">
        <button id="saveNotesBtn" class="btn btn-small btn-primary" type="button">儲存</button>
        <button id="cancelNotesBtn" class="btn btn-small" type="button">取消</button>
      </div>
    </div>
  `;
  box.appendChild(notes);

  // 綁定事件(備註編輯)
  const notesView = notes.querySelector("#personNotesView");
  const notesEdit = notes.querySelector("#personNotesEdit");
  const notesInput = notes.querySelector("#personNotesInput");
  const editBtn = notes.querySelector("#editNotesBtn");
  const saveBtn = notes.querySelector("#saveNotesBtn");
  const cancelBtn = notes.querySelector("#cancelNotesBtn");

  editBtn.addEventListener("click", () => {
    notesInput.value = p.notes || "";
    notesView.classList.add("hidden");
    editBtn.classList.add("hidden");
    notesEdit.classList.remove("hidden");
    notesInput.focus();
  });
  cancelBtn.addEventListener("click", () => {
    notesEdit.classList.add("hidden");
    notesView.classList.remove("hidden");
    editBtn.classList.remove("hidden");
  });
  saveBtn.addEventListener("click", () => {
    const newNotes = notesInput.value.trim();
    p.notes = newNotes;
    saveState();
    renderPersonDetail();
    advisorSay(`已更新「${p.name}」的備註。`);
  });
  // ===== 備註結束 =====

  const spouses = (p.spouseIds || [])
    .map(id => state.persons.find(x => x.id === id))
    .filter(Boolean)
    .sort((sa, sb) => {
      const rA = (p.spouseRelations || []).find(r => r.id === sa.id);
      const rB = (p.spouseRelations || []).find(r => r.id === sb.id);
      const isMainA = rA && (rA.type === "婚配" || rA.type === "正妻" || rA.type === "夫") ? 0 : 1;
      const isMainB = rB && (rB.type === "婚配" || rB.type === "正妻" || rB.type === "夫") ? 0 : 1;
      if (isMainA !== isMainB) return isMainA - isMainB;
      // 同級：有成婚年份的排前，再依年份升序
      const yrA = rA?.marryYear ?? 99999;
      const yrB = rB?.marryYear ?? 99999;
      return yrA - yrB;
    });
  const parents = (p.parentIds || []).map(id => state.persons.find(x => x.id === id)).filter(Boolean);

  const children = (p.childIds || [])
    .map(id => state.persons.find(x => x.id === id))
    .filter(Boolean)
    
    .sort((a, b) => {
        const ageA = getAge(a) ?? -999;
        const ageB = getAge(b) ?? -999;
        return ageB - ageA;
    });


  const rel = document.createElement("div");
  rel.className = "detail-section";

  // 一行一筆,名字可點擊跳轉
  const spText = spouses.length ? spouses.map(sp => {
    const ag = getAge(sp);
    let metaParts = [];
    const sr = p.spouseRelations.find(r => r.id === sp.id);
    if (sr) {
      let s = sr.type;
      if (sr.marryYear != null) s += `，星曆 ${sr.marryYear} 年結婚`;
      else if (sr.year != null) s += `，星曆 ${sr.year} 年結婚`;
      metaParts.push(s);
    }
    if (ag != null) metaParts.push(`${ag} 歲`);
    if (sp.familyId) {
      const spFam = state.families.find(x => x.id === sp.familyId);
      if (spFam) metaParts.push(`${spFam.name}`);
    }
    if (sp.deceased) metaParts.push("已逝");
    const meta = metaParts.length ? ` <span class="relation-meta">（${metaParts.join("｜")}）</span>` : "";
    return `<div class="relation-item"><a href="#" class="person-link" onclick="goToPerson(${sp.id});return false;">${sp.name}</a>${meta}</div>`;
  }).join("") : '<div class="relation-empty">尚無婚配記錄。</div>';

  const paText = parents.length ? parents.map(pa => {
    const ag = getAge(pa);
    let label = pa.gender === "男" ? "父" : (pa.gender === "女" ? "母" : "父／母");
    let metaParts = [];
    if (ag != null) metaParts.push(`${ag} 歲`);
    if (pa.birthYear != null && p.birthYear != null) {
      const ageAtBirth = p.birthYear - pa.birthYear;
      if (!isNaN(ageAtBirth)) metaParts.push(`生育時 ${ageAtBirth} 歲`);
    }
    if (pa.deceased) metaParts.push("已逝");
    const meta = metaParts.length ? ` <span class="relation-meta">（${metaParts.join("｜")}）</span>` : "";
    return `<div class="relation-item"><span class="relation-label">${label}</span><a href="#" class="person-link" onclick="goToPerson(${pa.id});return false;">${pa.name}</a>${meta}</div>`;
  }).join("") : '<div class="relation-empty">生父／母未記。</div>';

  const chText = children.length ? children.map(ch => {
    const chAge = getAge(ch);
    let label = ch.gender === "男" ? "子" : (ch.gender === "女" ? "女" : "子女");
    let metaParts = [];
    if (chAge != null) metaParts.push(`${chAge} 歲`);
    if (p.birthYear != null && ch.birthYear != null) {
      const ageAtBirth = ch.birthYear - p.birthYear;
      if (!isNaN(ageAtBirth)) metaParts.push(`生育時 ${ageAtBirth} 歲`);
    }
    if (ch.deceased) metaParts.push("已逝");
    const meta = metaParts.length ? ` <span class="relation-meta">（${metaParts.join("｜")}）</span>` : "";
    return `<div class="relation-item"><span class="relation-label">${label}</span><a href="#" class="person-link" onclick="goToPerson(${ch.id});return false;">${ch.name}</a>${meta}</div>`;
  }).join("") : '<div class="relation-empty">尚無子女記錄。</div>';


  rel.innerHTML = `
    <div class="detail-label">配偶（婚配）</div>
    <div class="detail-value relation-list">${spText}</div>
    <div class="detail-label">父母（血親／繼親／養親）</div>
    <div class="detail-value relation-list">${paText}</div>
    <div class="detail-label">子女（血親／繼親／養親）</div>
    <div class="detail-value relation-list">${chText}</div>
  `;
  box.appendChild(rel);

  // 動作區塊
  const actions = document.createElement("div");
  actions.className = "detail-section action-group";

// --- 修改出生年份 ---
const editBirthBtn = document.createElement("button");
editBirthBtn.className = "btn btn-small";
editBirthBtn.textContent = "修改出生年份";
editBirthBtn.addEventListener("click", () => {
  const input = prompt(`請輸入「${p.name}」的新出生年份：`, p.birthYear ?? "");
  if (input === null) return;
  const y = Number(input);
  if (isNaN(y)) {
    alert("請輸入正確的數字年份。");
    return;
  }

  p.birthYear = y;

  // 若有死亡年份，自動檢查
  if (p.deathYear && p.deathYear <= state.gameYear) p.deceased = true;
  else p.deceased = false;

  saveState();
  renderPersonDetail();
  renderFamilyDetail();
  advisorSay(`已將「${p.name}」的出生年份更新為星曆 ${y} 年。`);
});
actions.appendChild(editBirthBtn);


  // --- 修改姓名按鈕
  const renameBtn = document.createElement("button");
  renameBtn.className = "btn btn-small";
  renameBtn.textContent = "修改姓名";
  renameBtn.addEventListener("click", () => {
    const newName = prompt("請輸入新的姓名：", p.name);
    if (newName && newName.trim() && newName.trim() !== p.name) {
      p.name = newName.trim();
      saveState();
      renderPersonDetail();
      renderFamilyDetail();
      advisorSay(`已將「${p.name}」改名為「${p.name}」。`);
    }
  });

  // --- 修改屬性按鈕 (新增功能)
  const editAttrBtn = document.createElement("button");
  editAttrBtn.className = "btn btn-small";
  editAttrBtn.textContent = "修改職業/住所/身分";
  editAttrBtn.addEventListener("click", () => {
    // 建立臨時修改 UI
    const promptBox = document.createElement("div");
    promptBox.style.padding = "10px";
    promptBox.style.border = "1px solid #ccc";
    promptBox.style.marginBottom = "10px";
    promptBox.innerHTML = `
      <p>修改人物屬性：</p>
      <label>職業：<select id="editOccSel" value="${p.occupation || ''}"></select></label><br>
      <label>居所：<select id="editResSel" value="${p.residence || ''}"></select></label><br>
      <label>身分：<select id="editRoleSel" value="${p.role || ''}"></select></label><br>
    `;
    
    // 填充下拉選單
    function populateSelect(id, options, currentValue) {
      const sel = promptBox.querySelector(`#${id}`);
      if (!sel) return;
      sel.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = ""; opt0.textContent = "未記載/未標註"; sel.appendChild(opt0);
      options.forEach(o => {
        const opt = document.createElement("option");
        opt.value = o; opt.textContent = o;
        sel.appendChild(opt);
      });
      sel.value = currentValue;
    }
    
    populateSelect("editOccSel", state.occOptions, p.occupation);
    populateSelect("editResSel", state.resOptions, p.residence);
    populateSelect("editRoleSel", state.roleOptions, p.role);

    const saveEditBtn = document.createElement("button");
    saveEditBtn.className = "btn btn-small";
    saveEditBtn.textContent = "確認修改";
    saveEditBtn.onclick = () => {
      const newOcc = promptBox.querySelector("#editOccSel").value;
      const newRes = promptBox.querySelector("#editResSel").value;
      const newRole = promptBox.querySelector("#editRoleSel").value;

      p.occupation = newOcc;
      p.residence = newRes;
      p.role = newRole;
      
      saveState();
      renderPersonDetail();
      renderFamilyDetail();
      advisorSay(`已更新「${p.name}」的職業/住所/身分。`);
      promptBox.remove();
    };

    const cancelEditBtn = document.createElement("button");
    cancelEditBtn.className = "btn btn-small";
    cancelEditBtn.textContent = "取消";
    cancelEditBtn.onclick = () => promptBox.remove();

    promptBox.appendChild(saveEditBtn);
    promptBox.appendChild(cancelEditBtn);
    
    actions.parentNode.insertBefore(promptBox, actions);
  });

  // --- 解除婚約按鈕 (新增功能)
  const divorceBtn = document.createElement("button");
  divorceBtn.className = "btn btn-small btn-warning";
  divorceBtn.textContent = "解除婚約";
  divorceBtn.addEventListener("click", () => {
      if (!spouses.length) {
          advisorSay(`「${p.name}」目前沒有婚配記錄，無法解除婚約。`);
          return;
      }
      
      const promptBox = document.createElement("div");
      promptBox.style.padding = "10px";
      promptBox.style.border = "1px solid #ccc";
      promptBox.style.marginBottom = "10px";
      promptBox.innerHTML = `
          <p>請選擇要解除婚約的配偶：</p>
          <label>配偶：<select id="divorceSpouseSel"></select></label><br>
      `;

      const sel = promptBox.querySelector("#divorceSpouseSel");
      spouses.forEach(sp => {
          const opt = document.createElement("option");
          opt.value = String(sp.id);
          const rel = p.spouseRelations.find(r => r.id === sp.id)?.type || '婚配';
          opt.textContent = `${sp.name}（${rel}）`;
          sel.appendChild(opt);
      });

      const confirmDivorceBtn = document.createElement("button");
      confirmDivorceBtn.className = "btn btn-small btn-danger";
      confirmDivorceBtn.textContent = "確認解除";
      confirmDivorceBtn.onclick = () => {
          const spouseId = Number(sel.value);
          const spouse = state.persons.find(x => x.id === spouseId);
          if (!spouse) return;

          // v6:不再直接刪除 spouseRelations,改成標記離異狀態,
          // 這樣家族詳情的聯姻紀錄仍能呈現這樁親事的存在與結局。
          const yr = state.gameYear;
          const relP = (p.spouseRelations || []).find(r => r.id === spouseId);
          const relS = (spouse.spouseRelations || []).find(r => r.id === p.id);
          if (relP) {
            relP.endYear = yr;
            relP.endReason = "離異";
            relP.matchStage = "已離異";
          }
          if (relS) {
            relS.endYear = yr;
            relS.endReason = "離異";
            relS.matchStage = "已離異";
          }
          // 從現役配偶清單移除(spouseIds 代表「現任」),
          // 但 spouseRelations 仍保留作為歷史紀錄。
          p.spouseIds = (p.spouseIds || []).filter(id => id !== spouseId);
          spouse.spouseIds = (spouse.spouseIds || []).filter(id => id !== p.id);

          saveState();
          renderPersonDetail();
          renderFamilyDetail();
          advisorSay(`已解除「${p.name}」與「${spouse.name}」的婚約,紀錄留作族譜參考。`);
          promptBox.remove();
      };

      const cancelDivorceBtn = document.createElement("button");
      cancelDivorceBtn.className = "btn btn-small";
      cancelDivorceBtn.textContent = "取消";
      cancelDivorceBtn.onclick = () => promptBox.remove();

      promptBox.appendChild(confirmDivorceBtn);
      promptBox.appendChild(cancelDivorceBtn);

      actions.parentNode.insertBefore(promptBox, actions);
  });

  // --- 修改結婚年份／名分 (議親室搬過來) ---
  const editMarriageBtn = document.createElement("button");
  editMarriageBtn.className = "btn btn-small";
  editMarriageBtn.textContent = "修改結婚年份/名分";
  editMarriageBtn.addEventListener("click", () => {
    if (!spouses.length) {
      advisorSay(`「${p.name}」目前沒有婚配記錄,無法修改。`);
      return;
    }

    const promptBox = document.createElement("div");
    promptBox.style.padding = "10px";
    promptBox.style.border = "1px solid #ccc";
    promptBox.style.marginBottom = "10px";
    promptBox.style.background = "#fef9ed";
    promptBox.style.borderRadius = "6px";

    // 名分可選項
    const TYPES = ["訂婚", "平妻", "妾", "繼室", "入贅"];

    promptBox.innerHTML = `
      <p style="margin:0 0 8px;"><strong>修改「${p.name}」的婚姻紀錄</strong></p>
      <label>配偶：<select id="emSpouseSel"></select></label><br>
      <label style="display:inline-block;margin-top:6px;">結婚年份:<input id="emYearInput" type="number" style="width:90px;" /></label>
      <label style="display:inline-block;margin-left:10px;">名分/類型:<select id="emTypeSel"></select></label><br>
      <p style="font-size:11px;color:#8b7355;margin:6px 0 0;">提示:會同步更新雙方紀錄。若名分改為「入贅」,日後新增的子嗣會自動歸到母方家族。</p>
    `;

    const spSel = promptBox.querySelector("#emSpouseSel");
    const yearInput = promptBox.querySelector("#emYearInput");
    const typeSel = promptBox.querySelector("#emTypeSel");

    // 填充配偶選單
    spouses.forEach(sp => {
      const rel = p.spouseRelations.find(r => r.id === sp.id);
      const opt = document.createElement("option");
      opt.value = String(sp.id);
      opt.textContent = `${sp.name}(${rel?.type || "未記"}・${rel?.marryYear ? "星曆 " + rel.marryYear + " 年" : "未成婚"})`;
      spSel.appendChild(opt);
    });

    // 填充名分選單
    TYPES.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      typeSel.appendChild(opt);
    });

    // 切換配偶時自動帶入該段現有資料
    function fillFromSelected() {
      const sId = Number(spSel.value);
      const rel = p.spouseRelations.find(r => r.id === sId);
      if (rel) {
        yearInput.value = rel.marryYear ?? "";
        typeSel.value = TYPES.includes(rel.type) ? rel.type : "平妻";
      }
    }
    fillFromSelected();
    spSel.addEventListener("change", fillFromSelected);

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-small btn-primary";
    confirmBtn.textContent = "確認修改";
    confirmBtn.style.marginTop = "8px";
    confirmBtn.onclick = () => {
      const spouseId = Number(spSel.value);
      const spouse = state.persons.find(x => x.id === spouseId);
      if (!spouse) return;

      const newYearRaw = yearInput.value.trim();
      const newType = typeSel.value;

      const rA = p.spouseRelations.find(r => r.id === spouseId);
      const rB = spouse.spouseRelations.find(r => r.id === p.id);

      const changes = [];

      if (newYearRaw !== "") {
        const yr = Number(newYearRaw);
        if (isNaN(yr)) {
          alert("結婚年份請輸入數字。");
          return;
        }
        if (rA) rA.marryYear = yr;
        if (rB) rB.marryYear = yr;
        // 若有 marryYear 則 matchStage 自動設為已婚
        if (rA) rA.matchStage = "已婚";
        if (rB) rB.matchStage = "已婚";
        changes.push(`結婚年份改為星曆 ${yr} 年`);
      } else {
        // 留空 = 解除已婚標記,改為未成婚(訂婚狀態)
        if (rA) { rA.marryYear = null; rA.matchStage = "已定親"; }
        if (rB) { rB.marryYear = null; rB.matchStage = "已定親"; }
        changes.push("結婚年份留空(視為未成婚/訂婚狀態)");
      }

      if (newType) {
        if (rA) rA.type = newType;
        if (rB) rB.type = newType;
        changes.push(`名分改為「${newType}」`);
      }

      saveState();
      renderPersonDetail();
      renderFamilyDetail();
      advisorSay(`已修改「${p.name}」與「${spouse.name}」的婚姻紀錄:${changes.join(",")}。`);
      promptBox.remove();
    };

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn btn-small";
    cancelBtn.textContent = "取消";
    cancelBtn.style.marginTop = "8px";
    cancelBtn.style.marginLeft = "6px";
    cancelBtn.onclick = () => promptBox.remove();

    promptBox.appendChild(confirmBtn);
    promptBox.appendChild(cancelBtn);

    actions.parentNode.insertBefore(promptBox, actions);
  });

// --- 修改父母 (v4:改為 modal 選擇式,不再輸入 ID) ---
const editParentsBtn = document.createElement("button");
editParentsBtn.className = "btn btn-small";
editParentsBtn.textContent = "修改父母";
editParentsBtn.addEventListener("click", () => {
  openEditParentsModal(p);
});
actions.appendChild(editParentsBtn);


// --- 為其增加父母
const fatherBtn = document.createElement("button");
fatherBtn.className = "btn btn-small";
fatherBtn.textContent = "為其添加父親";
fatherBtn.addEventListener("click", () => {
  enterParentMode(p.id, "男");
  window.location.hash = "addPerson";
});

actions.appendChild(fatherBtn);

const motherBtn = document.createElement("button");
motherBtn.className = "btn btn-small";
motherBtn.textContent = "為其添加母親";
motherBtn.addEventListener("click", () => {
  enterParentMode(p.id, "女");
  window.location.hash = "addPerson";
});

actions.appendChild(motherBtn);



  
  // --- 其他原有按鈕

  const childBtn = document.createElement("button");
  childBtn.className = "btn btn-small";
  childBtn.textContent = "為其添加子女";
  childBtn.addEventListener("click", () => {
    enterChildMode(p.id);
    window.location.hash = "addPerson";
  });

  const famSel = document.createElement("select");
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "變更隸屬家族"; famSel.appendChild(opt0);
  const optNone = document.createElement("option");
  optNone.value = "none"; optNone.textContent = "未歸宗族"; famSel.appendChild(optNone);
  state.families.forEach(f => {
    const opt = document.createElement("option");
    opt.value = String(f.id); opt.textContent = f.name; famSel.appendChild(opt);
  });

  const famBtn = document.createElement("button");
  famBtn.className = "btn btn-small";
  famBtn.textContent = "套用";
  famBtn.addEventListener("click", () => {
    const v = famSel.value;
    if (!v) return;
    if (v === "none") {
      p.familyId = null;
      advisorSay(`已將「${p.name}」設為未歸宗族。`);
    } else {
      p.familyId = Number(v);
      const ff = state.families.find(x => x.id === p.familyId);
      advisorSay(`已將「${p.name}」改隸屬於「${ff ? ff.name : "未知家族"}」。`);
    }
    saveState();
    renderFamilies();
    renderFamilyDetail();
    renderPersonDetail();
  });

  const spouseFamSel = document.createElement("select");
  const sf0 = document.createElement("option");
  sf0.value = ""; sf0.textContent = "配偶所屬家族"; spouseFamSel.appendChild(sf0);
  state.families.forEach(f => {
    const opt = document.createElement("option");
    opt.value = String(f.id); opt.textContent = f.name; spouseFamSel.appendChild(opt);
  });

  const spouseSel = document.createElement("select");
  const ss0 = document.createElement("option");
  ss0.value = ""; ss0.textContent = "選擇配偶"; spouseSel.appendChild(ss0);

  function populateSpouseOptions(familyId) {
    spouseSel.innerHTML = "";
    spouseSel.appendChild(ss0);
    const persons = state.persons.filter(p => {
      if (p.id === state.selectedPersonId) return false;
      if (p.spouseIds.includes(state.selectedPersonId)) return false; // 排除已婚
      if (familyId) {
        return p.familyId === Number(familyId);
      }
      return true; // 如果沒有選擇家族，顯示所有人
    });
    persons.forEach(sp => {
      const opt = document.createElement("option");
      opt.value = String(sp.id);
      opt.textContent = `${sp.name}（${sp.gender || "性別未記"}，${getAge(sp) != null ? getAge(sp) + '歲' : '年齡未記'}）`;
      spouseSel.appendChild(opt);
    });
  }

  spouseFamSel.addEventListener("change", () => {
    populateSpouseOptions(spouseFamSel.value);
  });
  populateSpouseOptions(null);

  const relSel = document.createElement("select");
  const rs0 = document.createElement("option");
  rs0.value = ""; rs0.textContent = "選擇關係"; relSel.appendChild(rs0);
  SPOUSE_TYPES.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t; relSel.appendChild(opt);
  });

  const spouseBtn = document.createElement("button");
  spouseBtn.className = "btn btn-small";
  spouseBtn.textContent = "結為連理";
  spouseBtn.addEventListener("click", () => {
    const spId = Number(spouseSel.value);
    const relType = relSel.value || "婚配";
    if (!spId) { advisorSay("請選擇一位配偶。"); return; }
    if (!relType) { advisorSay("請選擇一種關係類型。"); return; }
    const sp = state.persons.find(x => x.id === spId);
if (!sp) return;

// 取得結婚年份
let yearInput = prompt(`請輸入「${p.name}」與「${sp.name}」的結婚年份（可留空）`, state.gameYear);
let marryYear = null;
if (yearInput && !isNaN(Number(yearInput))) {
  marryYear = Number(yearInput);
}

// 建立 spouseIds
if (!p.spouseIds.includes(spId)) p.spouseIds.push(spId);
if (!sp.spouseIds.includes(p.id)) sp.spouseIds.push(p.id);

// 更新 spouseRelations
let pRel = p.spouseRelations.find(r => r.id === spId);
if (!pRel) {
  pRel = { id: spId, type: relType, year: marryYear };
  p.spouseRelations.push(pRel);
} else {
  pRel.type = relType;
  pRel.year = marryYear;
}

let spRel = sp.spouseRelations.find(r => r.id === p.id);
if (!spRel) {
  spRel = { id: p.id, type: relType, year: marryYear };
  sp.spouseRelations.push(spRel);
} else {
  spRel.type = relType;
  spRel.year = marryYear;
}

saveState();
renderPersonDetail();
renderFamilyDetail();
advisorSay(`已為「${p.name}」與「${sp.name}」訂下婚約（${relType}），結婚年份：${marryYear ?? "未記載"}。`);


    saveState();
    renderPersonDetail();
    renderFamilyDetail();
    advisorSay(`已為「${p.name}」與「${sp.name}」訂下婚約（${relType}）。`);
  });

  actions.appendChild(renameBtn);
  actions.appendChild(editAttrBtn); // 新增屬性修改按鈕
  actions.appendChild(divorceBtn);  // 新增離婚按鈕
  actions.appendChild(editMarriageBtn); // 修改結婚年份/名分
  actions.appendChild(childBtn);
  actions.appendChild(famSel);
  actions.appendChild(famBtn);
  actions.appendChild(spouseFamSel);
  actions.appendChild(spouseSel);
  actions.appendChild(relSel);
  actions.appendChild(spouseBtn);

  // 加入刪除按鈕
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn-small btn-danger";
  deleteBtn.textContent = "刪除人物記錄";
  deleteBtn.addEventListener("click", () => {
    if (confirm(`確定要刪除人物「${p.name}」的記錄嗎？此操作不可逆。`)) {
        deletePerson(p.id);
    }
  });
  actions.appendChild(deleteBtn);
  
  box.appendChild(actions);
  
  // 領養子女 UI
  box.appendChild(renderAdoptChildUi(p));
}

function deleteFamily(familyId) {
    const f = state.families.find(x => x.id === familyId);
    if (!f) return;

    // 1. 移除所有成員對該家族的歸屬
    state.persons.forEach(p => {
        if (p.familyId === familyId) {
            p.familyId = null;
        }
    });

    // 2. 移除家族本身
    state.families = state.families.filter(x => x.id !== familyId);

    // 3. 更新選中的家族/人物
    if (state.selectedFamilyId === familyId) {
        state.selectedFamilyId = null;
    }
    if (state.persons.find(p => p.familyId === state.selectedFamilyId) === undefined) {
      state.selectedFamilyId = state.families.length ? state.families[0].id : null;
    }
    state.selectedPersonId = null;

    saveState();
    renderFamilies();
    renderFamilyDetail();
    renderPersonDetail();
    renderRegions();
    renderAdvisorLocationSelect();
    advisorSay(`已將「${f.name}」的家族記錄徹底刪除。`);
}

function deletePerson(personId) {
    const p = state.persons.find(x => x.id === personId);
    if (!p) return;

    // 1. 移除所有親屬關係
    state.persons.forEach(person => {
        // 移除父母關係
        person.parentIds = (person.parentIds || []).filter(id => id !== personId);
        // 移除子女關係
        person.childIds = (person.childIds || []).filter(id => id !== personId);
        // 移除配偶關係
        person.spouseIds = (person.spouseIds || []).filter(id => id !== personId);
        person.spouseRelations = (person.spouseRelations || []).filter(r => r.id !== personId);
    });

    // 2. 移除人物本身
    state.persons = state.persons.filter(x => x.id !== personId);

    // 3. 更新選中的人物
    const oldFamilyId = p.familyId;
    state.selectedPersonId = null;
    state.childModeParentId = null;
    
    // 如果舊家族仍有成員，保持家族選中
    const familyHasMembers = state.persons.some(mem => mem.familyId === oldFamilyId);
    if (!familyHasMembers) {
      state.selectedFamilyId = null;
    }

    saveState();
    renderFamilies();
    renderFamilyDetail();
    renderPersonDetail();
    renderAdvisorLocationSelect();
    advisorSay(`已將「${p.name}」的族人記錄徹底刪除。`);
}


function renderAdoptChildUi(person) {
  const box = document.createElement("div");
  box.className = "detail-section";

  let title = document.createElement("div");
  title.className = "detail-label";
  title.textContent = "領養子女";
  box.appendChild(title);

  // 1. 家族篩選 Select
  const famSel = document.createElement("select");
  const fam0 = document.createElement("option");
  fam0.value = ""; fam0.textContent = "選擇子女所屬家族（可不選）"; famSel.appendChild(fam0);
  state.families.forEach(f => {
      const opt = document.createElement("option");
      opt.value = String(f.id); opt.textContent = f.name; famSel.appendChild(opt);
  });
  box.appendChild(famSel);

  // 2. 子女選擇 Select
  let sel = document.createElement("select");
  sel.id = "adoptChildSelect";
  box.appendChild(sel);

  // 3. 填充子女選項的函數
  function populateChildOptions(familyId) {
      sel.innerHTML = "";
      const def = document.createElement("option");
      def.value = "";
      def.textContent = "選擇子女";
      sel.appendChild(def);

      const persons = state.persons.filter(p => {
          if (p.id === person.id) return false; // 排除自己
          if ((p.parentIds || []).includes(person.id)) return false; // 排除已是子女的
          
          let candidateFamilies = state.families.map(f => f.id);
          if (familyId) {
              candidateFamilies = [Number(familyId)]; // 依家族篩選
          }
          
          const isCandidate = candidateFamilies.includes(p.familyId) || (!familyId && p.familyId === null);
          
          return isCandidate;
      });

      persons.forEach(p => {
          let opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = `${p.name}（${p.gender || "性別未記"}，${getAge(p) != null ? getAge(p) + '歲' : '年齡未記'}）`;
          sel.appendChild(opt);
      });
  }

  // 4. 家族選擇變更事件
  famSel.addEventListener("change", () => {
      populateChildOptions(famSel.value);
  });

  // 初始填充
  populateChildOptions(null);

  let btn = document.createElement("button");
  btn.className = "btn btn-small";
  btn.textContent = "確認領養";

  btn.onclick = () => {
    let cid = Number(sel.value);
    if (!cid) { advisorSay("請選擇一位子女進行領養。"); return; }

    let child = state.persons.find(p => p.id === cid);
    if (!child) return;

    if (linkParentChild(person, child, {})) {
      saveState();
      renderPersonDetail();
      renderFamilyDetail();
      advisorSay(`「${person.name}」已領養「${child.name}」。`);
    }
  };

  box.appendChild(btn);
  return box;
}



// ============================================================
// v4 新增:修改父母 modal (選人式, 不再輸入 ID)
// ============================================================

function openEditParentsModal(person) {
  // 先把同 ID 的舊 modal 清掉(避免重複開啟造成多個重疊)
  const old = document.getElementById("editParentsModal");
  if (old) old.remove();

  const modal = document.createElement("div");
  modal.id = "editParentsModal";
  modal.className = "modal";

  // 現有父母(用來預設選中)
  const currentParents = (person.parentIds || [])
    .map(id => state.persons.find(x => x.id === id))
    .filter(Boolean);
  const currentFather = currentParents.find(pp => pp.gender === "男");
  const currentMother = currentParents.find(pp => pp.gender === "女");
  // 性別未記的父母,我們將其視為 currentOther
  const currentOther = currentParents.find(pp => pp.gender !== "男" && pp.gender !== "女");

  // 候選人:排除自己與自己的子孫(避免迴圈)
  const descendants = collectDescendants(person.id);
  const candidates = state.persons.filter(pp =>
    pp.id !== person.id && !descendants.has(pp.id)
  );

  function buildOptions(filterGender, currentId) {
    let opts = '<option value="">— 未指定 —</option>';
    candidates.forEach(pp => {
      if (filterGender && pp.gender !== filterGender && pp.gender !== "") return;
      const age = getAge(pp);
      const ageTxt = age != null ? `,${age} 歲` : "";
      const famName = pp.familyId
        ? (state.families.find(f => f.id === pp.familyId)?.name || "未歸宗族")
        : "未歸宗族";
      const dead = pp.deceased ? " 【已逝】" : "";
      const selected = pp.id === currentId ? ' selected' : '';
      opts += `<option value="${pp.id}"${selected}>${pp.name} (${famName}${ageTxt})${dead}</option>`;
    });
    return opts;
  }

  modal.innerHTML = `
    <div class="modal-content">
      <h3>修改「${person.name}」的父母</h3>
      <div class="modal-body">
        <div style="margin-bottom:12px;">
          <label>父親</label>
          <select id="editFatherSel">${buildOptions("男", currentFather ? currentFather.id : null)}</select>
        </div>
        <div style="margin-bottom:12px;">
          <label>母親</label>
          <select id="editMotherSel">${buildOptions("女", currentMother ? currentMother.id : null)}</select>
        </div>
        <div style="margin-bottom:8px;">
          <label>其他(性別未記)</label>
          <select id="editOtherSel">${buildOptions(null, currentOther ? currentOther.id : null)}</select>
          <div class="hint">若有第三方養親或性別未記者,可在此選擇。</div>
        </div>
      </div>
      <div class="card-footer">
        <button id="editParentsCancelBtn" class="btn">取消</button>
        <button id="editParentsConfirmBtn" class="btn btn-primary">確認</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("editParentsCancelBtn").addEventListener("click", () => modal.remove());
  document.getElementById("editParentsConfirmBtn").addEventListener("click", () => {
    const fId = document.getElementById("editFatherSel").value;
    const mId = document.getElementById("editMotherSel").value;
    const oId = document.getElementById("editOtherSel").value;
    const newParentIds = [fId, mId, oId]
      .filter(v => v !== "")
      .map(v => Number(v))
      .filter(v => !isNaN(v));
    // 去重(萬一同一人在多 select 被選到)
    const uniqueIds = [...new Set(newParentIds)];

    // 清掉舊父母的 childIds
    (person.parentIds || []).forEach(pidOld => {
      const oldP = findPerson(pidOld);
      if (oldP) {
        oldP.childIds = (oldP.childIds || []).filter(cid => cid !== person.id);
      }
    });
    person.parentIds = [];

    // 接上新父母
    uniqueIds.forEach(pid => {
      const pa = findPerson(pid);
      if (pa) {
        person.parentIds.push(pa.id);
        if (!pa.childIds.includes(person.id)) pa.childIds.push(person.id);
      }
    });

    normalizeRelations();
    saveState();
    renderPersonDetail();
    renderFamilyDetail();
    advisorSay(`已更新「${person.name}」的父母資料。`);
    modal.remove();
  });

  // 點背景關閉
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal) modal.remove();
  });
}

// 收集某人的所有後代 ID (防止指定自己後代為父母)
function collectDescendants(rootId) {
  const result = new Set();
  const queue = [rootId];
  while (queue.length) {
    const curId = queue.shift();
    const cur = state.persons.find(x => x.id === curId);
    if (!cur) continue;
    (cur.childIds || []).forEach(cid => {
      if (!result.has(cid)) {
        result.add(cid);
        queue.push(cid);
      }
    });
  }
  return result;
}
