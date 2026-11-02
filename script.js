const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// CLOCK
function updateClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString("en-GB", { hour12: false });
  $("#date").textContent = now.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  }).toUpperCase();
}
updateClock();
setInterval(updateClock, 1000);

// NAVIGATION
function openPage(pageId) {
  $$(".page").forEach(page => page.classList.toggle("active", page.id === pageId));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === pageId));
  const active = document.querySelector(`[data-page="${pageId}"]`);
  $("#crumb").textContent = active ? active.textContent.trim().replace(/\s+\d+$/, "").toUpperCase() : pageId.toUpperCase();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$(".nav-link").forEach(link => {
  link.addEventListener("click", () => openPage(link.dataset.page));
});
$$("[data-goto]").forEach(button => {
  button.addEventListener("click", () => openPage(button.dataset.goto));
});

// MISSIONS
const missions = [
  { id: "M-001", title: "تمرین تفکر انتقادی", desc: "یک ادعا را بررسی کن و شواهد موافق و مخالفش را بنویس." },
  { id: "M-002", title: "مطالعه‌ی روان‌شناسی", desc: "یک مبحث از روان‌شناسی را بخوان و خلاصه کن." },
  { id: "M-003", title: "ثبت وضعیت مالی", desc: "هزینه‌ها و منابع مالی خودت را فهرست کن." },
  { id: "M-004", title: "تمرین زبان انگلیسی", desc: "یک فایل صوتی گوش کن و خلاصه‌اش را با صدای بلند بگو." },
  { id: "M-005", title: "تمرین شطرنج", desc: "حداقل پنج مسئله‌ی تاکتیکی حل کن." },
  { id: "M-006", title: "آمادگی جسمانی", desc: "برنامه‌ی تمرینی و ریکاوری خودت را اجرا کن." },
  { id: "M-007", title: "گزارش پایان روز", desc: "سه دستاورد و یک مورد قابل بهبود را ثبت کن." }
];

let missionStates = JSON.parse(localStorage.getItem("kfox_missions") || "{}");

function renderMissions() {
  const list = $("#missionList");
  list.innerHTML = "";

  missions.forEach(mission => {
    const status = missionStates[mission.id] || "pending";
    const card = document.createElement("article");
    card.className = "mission-card";
    card.innerHTML = `
      <div class="mission-id">${mission.id}</div>
      <div class="mission-info">
        <h3>${mission.title}</h3>
        <p>${mission.desc}</p>
      </div>
      <div class="mission-status ${status === "done" ? "done" : ""}">
        <select aria-label="وضعیت مأموریت ${mission.id}" data-mission="${mission.id}">
          <option value="pending" ${status === "pending" ? "selected" : ""}>PENDING</option>
          <option value="progress" ${status === "progress" ? "selected" : ""}>IN PROGRESS</option>
          <option value="done" ${status === "done" ? "selected" : ""}>COMPLETED</option>
        </select>
      </div>`;
    list.appendChild(card);
  });

  const done = missions.filter(m => missionStates[m.id] === "done").length;
  const progress = Math.round(done / missions.length * 100);
  $("#missionDone").textContent = done;
  $("#missionLeft").textContent = missions.length - done;
  $("#missionPercent").textContent = progress + "%";
  $("#bigProgress").style.width = progress + "%";
  $("#missionCount").innerHTML = `${String(done).padStart(2, "0")}<span>/35</span>`;
  $("#missionBar").style.width = progress + "%";
}

$("#missionList").addEventListener("change", event => {
  if (!event.target.matches("[data-mission]")) return;
  missionStates[event.target.dataset.mission] = event.target.value;
  localStorage.setItem("kfox_missions", JSON.stringify(missionStates));
  renderMissions();
});
renderMissions();

// JOURNAL
let reports = JSON.parse(localStorage.getItem("kfox_reports") || "[]");

function renderReports() {
  const container = $("#reportList");
  if (!reports.length) {
    container.innerHTML = '<div class="empty-state">NO REPORTS FOUND<br><small>YOUR FIRST REPORT IS WAITING.</small></div>';
    return;
  }

  container.innerHTML = "";
  reports.forEach((report, index) => {
    const entry = document.createElement("article");
    entry.className = "report-entry";
    const title = document.createElement("h4");
    title.textContent = report.title;
    const date = document.createElement("time");
    date.textContent = report.date;
    const content = document.createElement("p");
    content.textContent = report.content;
    const del = document.createElement("button");
    del.className = "delete-report";
    del.textContent = "DELETE REPORT";
    del.addEventListener("click", () => {
      reports.splice(index, 1);
      localStorage.setItem("kfox_reports", JSON.stringify(reports));
      renderReports();
    });
    entry.append(title, date, content, del);
    container.appendChild(entry);
  });
}

$("#saveReport").addEventListener("click", () => {
  const title = $("#reportTitle").value.trim();
  const content = $("#reportText").value.trim();
  if (!title || !content) {
    $("#journalFeedback").textContent = "ERROR: عنوان و محتوای گزارش را وارد کن.";
    return;
  }
  reports.unshift({
    title,
    content,
    date: new Date().toLocaleString("fa-IR")
  });
  localStorage.setItem("kfox_reports", JSON.stringify(reports));
  $("#reportTitle").value = "";
  $("#reportText").value = "";
  $("#journalFeedback").textContent = "REPORT SUCCESSFULLY ARCHIVED.";
  renderReports();
});
renderReports();

// TERMINAL
const output = $("#terminalOutput");

function terminalLine(text, className = "") {
  const p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  output.appendChild(p);
  output.scrollTop = output.scrollHeight;
}

$("#terminalForm").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("#terminalInput");
  const command = input.value.trim().toLowerCase();
  if (!command) return;

  terminalLine("K-07 > " + command, "terminal-muted");
  input.value = "";

  switch (command) {
    case "help":
      terminalLine("AVAILABLE COMMANDS:");
      terminalLine("STATUS  - System status");
      terminalLine("DATE    - Current date");
      terminalLine("PROFILE - Operative profile");
      terminalLine("MOTTO   - Directorate doctrine");
      terminalLine("CLEAR   - Clear terminal");
      break;
    case "status":
      terminalLine("SYSTEM: OPERATIONAL");
      terminalLine("CONNECTION: SECURE");
      terminalLine("OPERATIVE: K-07");
      terminalLine("ACCESS LEVEL: 05");
      break;
    case "date":
      terminalLine(new Date().toString());
      break;
    case "profile":
      terminalLine("OPERATIVE K-07 // STATUS: ACTIVE");
      terminalLine("DIVISION: PERSONAL DEVELOPMENT");
      terminalLine("CLASSIFICATION: RESTRICTED");
      break;
    case "motto":
      terminalLine("KNOWLEDGE IS AN ADVANTAGE.");
      terminalLine("DISCIPLINE IS A WEAPON.");
      break;
    case "clear":
      output.innerHTML = "";
      break;
    default:
      terminalLine("ERROR: COMMAND NOT RECOGNIZED. TYPE 'HELP'.", "terminal-muted");
  }
});

// INITIAL GREETING
console.log("K-FOX OS initialized. Welcome, operative.");
