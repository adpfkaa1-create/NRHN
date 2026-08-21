/* =========================================================
   노랑하늘 🏠  — 집안일 기록 웹사이트
   실시간 동기화: Firebase Realtime Database 사용
   =========================================================

   ▼▼▼ 아래 firebaseConfig 를 본인 Firebase 프로젝트 값으로 채워주세요 ▼▼▼
   Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성 에서
   복사할 수 있어요. Realtime Database 를 "테스트 모드"로 만들어두면 됩니다.
========================================================= */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
/* ========================================================= */

const PEOPLE = {
  yeram:  { label: "예람", tagClass: "tag-yeram",  btnClass: "btn-yeram" },
  haneul: { label: "하늘", tagClass: "tag-haneul", btnClass: "btn-haneul" }
};
const WEEKLY_GOAL = 100;

let db = null;
let chores = {};          // choreId -> {name, score, max, order}
let currentWeekKey = "";
let weekCounts = {};      // choreId -> count
let weekTotals = { yeram: 0, haneul: 0 };
let weekLogs = {};        // logId -> {choreId, name, score, person, time}
let editMode = false;
let editingChoreId = null; // 모달에서 수정 중인 chore id (null이면 신규 추가)

/* ---------- 초기화 ---------- */
function isConfigFilled(){
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("YOUR_");
}

function init(){
  if (!isConfigFilled()){
    document.getElementById("setupBanner").classList.remove("hidden");
    return;
  }

  firebase.initializeApp(firebaseConfig);
  db = firebase.database();

  currentWeekKey = getWeekKey(new Date());
  renderWeekRange();

  listenChores();
  listenWeekData();
  bindUI();
}

/* ---------- 주(week) 키 계산 ---------- */
function getWeekKey(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getMondayOfWeek(date){
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - day + 1);
  d.setHours(0,0,0,0);
  return d;
}

function renderWeekRange(){
  const monday = getMondayOfWeek(new Date());
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt) => `${dt.getMonth()+1}.${dt.getDate()}`;
  document.getElementById("weekRange").textContent =
    `이번 주 · ${fmt(monday)} ~ ${fmt(sunday)}`;
}

/* ---------- Firebase 리스너 ---------- */
function listenChores(){
  const choresRef = db.ref("chores");

  choresRef.once("value").then(snap => {
    if (!snap.exists()){
      seedDefaultChores();
    }
  });

  choresRef.on("value", snap => {
    chores = snap.val() || {};
    renderChoreList();
    renderActivityLog(); // 이름 변경 반영
  });
}

function listenWeekData(){
  const weekRef = db.ref(`weeks/${currentWeekKey}`);

  weekRef.child("counts").on("value", snap => {
    weekCounts = snap.val() || {};
    renderChoreList();
  });

  weekRef.child("totals").on("value", snap => {
    const v = snap.val() || {};
    weekTotals.yeram = v.yeram || 0;
    weekTotals.haneul = v.haneul || 0;
    renderScores();
  });

  weekRef.child("logs").on("value", snap => {
    weekLogs = snap.val() || {};
    renderActivityLog();
  });
}

/* ---------- 기본 집안일 목록 시딩 ---------- */
function seedDefaultChores(){
  const defaults = [
    { name: "화장실 청소",        score: 20, max: 1 },
    { name: "설거지",             score: 15, max: 3 },
    { name: "주방 청소",          score: 10, max: 1 },
    { name: "냉장고 청소",        score: 10, max: 1 },
    { name: "공용 식사 만들기",   score: 10, max: 1 },
    { name: "청소기",             score: 8,  max: 7 },
    { name: "걸레",               score: 8,  max: 7 },
    { name: "빨래 널기",          score: 5,  max: 1 },
    { name: "빨래 개기",          score: 5,  max: 1 },
    { name: "분리수거",           score: 5,  max: 2 },
    { name: "쓰봉 교체 및 버리기", score: 5,  max: 1 },
    { name: "음쓰 돌리기",        score: 3,  max: 3 },
    { name: "공용 공간 정리",     score: 3,  max: 7 },
    { name: "부탁 들어주기",      score: 5,  max: 1 }
  ];
  const updates = {};
  defaults.forEach((c, i) => {
    const id = db.ref("chores").push().key;
    updates[id] = { name: c.name, score: c.score, max: c.max, order: i };
  });
  db.ref("chores").update(updates);
}

/* ---------- 렌더링: 점수 카드 ---------- */
function renderScores(){
  document.getElementById("yeramScore").textContent = weekTotals.yeram;
  document.getElementById("haneulScore").textContent = weekTotals.haneul;

  const yPct = Math.min(100, Math.round((weekTotals.yeram / WEEKLY_GOAL) * 100));
  const hPct = Math.min(100, Math.round((weekTotals.haneul / WEEKLY_GOAL) * 100));
  document.getElementById("yeramBar").style.width = yPct + "%";
  document.getElementById("haneulBar").style.width = hPct + "%";

  document.querySelector(".person-yeram").classList.toggle("goal-hit", weekTotals.yeram >= WEEKLY_GOAL);
  document.querySelector(".person-haneul").classList.toggle("goal-hit", weekTotals.haneul >= WEEKLY_GOAL);
}

/* ---------- 렌더링: 집안일 목록 ---------- */
function renderChoreList(){
  const listEl = document.getElementById("choreList");
  const ids = Object.keys(chores).sort((a,b) => (chores[a].order ?? 0) - (chores[b].order ?? 0));

  if (ids.length === 0){
    listEl.innerHTML = `<p class="empty-log">등록된 집안일이 없어요. '목록 수정'에서 추가해보세요!</p>`;
    return;
  }

  listEl.innerHTML = ids.map(id => {
    const chore = chores[id];
    const done = weekCounts[id] || 0;
    const max = chore.max || 1;
    const isClosed = done >= max;

    const countHtml = max > 1
      ? `<span class="${isClosed ? 'count-full' : 'count-done'}">${done}/${max}회</span> · 주 최대 ${max}회`
      : (isClosed ? `<span class="count-full">이번 주 완료됨</span>` : `주 1회`);

    const buttons = Object.keys(PEOPLE).map(p => {
      const info = PEOPLE[p];
      return `<button class="done-btn ${info.btnClass}" data-chore="${id}" data-person="${p}" ${isClosed ? "disabled" : ""}>
                ${info.label} 완료
              </button>`;
    }).join("");

    const editBtn = editMode
      ? `<button class="edit-chore-btn" data-edit="${id}" title="수정">✏️</button>`
      : "";

    return `
      <div class="chore-item ${isClosed ? "closed" : ""}">
        <div class="chore-info">
          <div class="chore-name">${escapeHtml(chore.name)} · ${chore.score}점</div>
          <div class="chore-meta">${countHtml}</div>
        </div>
        <div class="chore-actions">
          ${buttons}
          ${editBtn}
        </div>
      </div>`;
  }).join("");

  // 완료 버튼 이벤트
  listEl.querySelectorAll(".done-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      markDone(btn.dataset.chore, btn.dataset.person);
    });
  });

  // 수정 버튼 이벤트
  listEl.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openChoreModal(btn.dataset.edit));
  });
}

/* ---------- 렌더링: 활동 로그 ---------- */
function renderActivityLog(){
  const logEl = document.getElementById("activityLog");
  const ids = Object.keys(weekLogs).sort((a,b) => (weekLogs[b].time || 0) - (weekLogs[a].time || 0));

  if (ids.length === 0){
    logEl.innerHTML = `<p class="empty-log">아직 기록이 없어요. 첫 집안일을 완료해보세요!</p>`;
    return;
  }

  logEl.innerHTML = ids.map(id => {
    const log = weekLogs[id];
    const info = PEOPLE[log.person] || { label: log.person, tagClass: "" };
    const time = log.time ? new Date(log.time) : null;
    const timeStr = time ? `${time.getMonth()+1}.${time.getDate()} ${String(time.getHours()).padStart(2,"0")}:${String(time.getMinutes()).padStart(2,"0")}` : "";

    return `
      <div class="log-item">
        <div class="log-left">
          <span class="log-tag ${info.tagClass}">${info.label}</span>
          <span>${escapeHtml(log.name)}</span>
          <span class="log-score">+${log.score}</span>
          <span class="log-time">${timeStr}</span>
        </div>
        <button class="log-del" data-log="${id}" title="기록 삭제">✕</button>
      </div>`;
  }).join("");

  logEl.querySelectorAll(".log-del").forEach(btn => {
    btn.addEventListener("click", () => undoLog(btn.dataset.log));
  });
}

/* ---------- 완료 기록 (동시 클릭 안전 처리) ---------- */
function markDone(choreId, person){
  const chore = chores[choreId];
  if (!chore) return;
  const max = chore.max || 1;

  const countRef = db.ref(`weeks/${currentWeekKey}/counts/${choreId}`);

  countRef.transaction(current => {
    const cur = current || 0;
    if (cur >= max) return; // abort: 이미 마감
    return cur + 1;
  }, (error, committed) => {
    if (error){
      alert("기록 중 오류가 발생했어요. 다시 시도해주세요.");
      return;
    }
    if (!committed){
      alert("앗, 이미 이번 주 마감된 집안일이에요!");
      return;
    }
    // 카운트 반영 성공 -> 로그 추가 + 점수 반영
    const logRef = db.ref(`weeks/${currentWeekKey}/logs`).push();
    logRef.set({
      choreId,
      name: chore.name,
      score: chore.score,
      person,
      time: Date.now()
    });
    db.ref(`weeks/${currentWeekKey}/totals/${person}`)
      .transaction(cur => (cur || 0) + chore.score);
  });
}

/* ---------- 기록 취소 ---------- */
function undoLog(logId){
  const log = weekLogs[logId];
  if (!log) return;
  if (!confirm(`'${log.name}' (${PEOPLE[log.person]?.label || log.person}) 기록을 삭제할까요?`)) return;

  db.ref(`weeks/${currentWeekKey}/logs/${logId}`).remove();
  db.ref(`weeks/${currentWeekKey}/counts/${log.choreId}`)
    .transaction(cur => Math.max(0, (cur || 0) - 1));
  db.ref(`weeks/${currentWeekKey}/totals/${log.person}`)
    .transaction(cur => Math.max(0, (cur || 0) - log.score));
}

/* ---------- 집안일 추가/수정 모달 ---------- */
function openChoreModal(choreId){
  editingChoreId = choreId || null;
  const modal = document.getElementById("choreModal");
  const nameInput = document.getElementById("choreNameInput");
  const scoreInput = document.getElementById("choreScoreInput");
  const maxInput = document.getElementById("choreMaxInput");
  const deleteBtn = document.getElementById("deleteChoreBtn");

  if (editingChoreId && chores[editingChoreId]){
    document.getElementById("modalTitle").textContent = "집안일 수정";
    nameInput.value = chores[editingChoreId].name;
    scoreInput.value = chores[editingChoreId].score;
    maxInput.value = chores[editingChoreId].max;
    deleteBtn.classList.remove("hidden");
  } else {
    document.getElementById("modalTitle").textContent = "집안일 추가";
    nameInput.value = "";
    scoreInput.value = "";
    maxInput.value = "";
    deleteBtn.classList.add("hidden");
  }

  modal.classList.remove("hidden");
}

function closeChoreModal(){
  document.getElementById("choreModal").classList.add("hidden");
  editingChoreId = null;
}

function saveChore(){
  const name = document.getElementById("choreNameInput").value.trim();
  const score = parseInt(document.getElementById("choreScoreInput").value, 10);
  const max = parseInt(document.getElementById("choreMaxInput").value, 10);

  if (!name || !score || !max){
    alert("모든 항목을 입력해주세요!");
    return;
  }

  if (editingChoreId){
    db.ref(`chores/${editingChoreId}`).update({ name, score, max });
  } else {
    const id = db.ref("chores").push().key;
    const order = Object.keys(chores).length;
    db.ref(`chores/${id}`).set({ name, score, max, order });
  }
  closeChoreModal();
}

function deleteChore(){
  if (!editingChoreId) return;
  if (!confirm("이 집안일을 목록에서 삭제할까요? (지난 기록은 유지돼요)")) return;
  db.ref(`chores/${editingChoreId}`).remove();
  closeChoreModal();
}

/* ---------- UI 이벤트 바인딩 ---------- */
function bindUI(){
  document.getElementById("editModeBtn").addEventListener("click", () => {
    editMode = !editMode;
    document.getElementById("editModeBtn").classList.toggle("active", editMode);
    document.getElementById("editModeBtn").textContent = editMode ? "✅ 수정 완료" : "✏️ 목록 수정";
    document.getElementById("addChoreBtn").classList.toggle("hidden", !editMode);
    renderChoreList();
  });

  document.getElementById("addChoreBtn").addEventListener("click", () => openChoreModal(null));
  document.getElementById("cancelChoreBtn").addEventListener("click", closeChoreModal);
  document.getElementById("saveChoreBtn").addEventListener("click", saveChore);
  document.getElementById("deleteChoreBtn").addEventListener("click", deleteChore);

  document.getElementById("choreModal").addEventListener("click", (e) => {
    if (e.target.id === "choreModal") closeChoreModal();
  });
}

/* ---------- 유틸 ---------- */
function escapeHtml(str){
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- 실행 ---------- */
document.addEventListener("DOMContentLoaded", init);
