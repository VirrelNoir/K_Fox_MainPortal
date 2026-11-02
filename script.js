const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

if("serviceWorker" in navigator && location.protocol.startsWith("http")){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("K-FOX offline cache:",err)));}

// CLOCK
function updateClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString("en-GB", { hour12: false });
  $("#date").textContent = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric", month: "long", year: "numeric"
  }).format(now);
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

// MISSIONS + PERSONAL DEVELOPMENT DATA
const missions=[
{id:"M-001",title:"تفکر انتقادی و تحلیل",desc:"یک ادعا را بررسی کن و شواهد موافق و مخالفش را بنویس."},
{id:"M-002",title:"روان‌شناسی و شناخت رفتار",desc:"یک مبحث را مطالعه کن و نکات کاربردی‌اش را ثبت کن."},
{id:"M-003",title:"سواد مالی و کسب‌وکار",desc:"یک مفهوم مالی یا مدیریتی را یاد بگیر و در عمل بررسی کن."},
{id:"M-004",title:"زبان انگلیسی",desc:"تمرین شنیدار، مکالمه، خواندن یا نوشتن را انجام بده."},
{id:"M-005",title:"شطرنج و تفکر استراتژیک",desc:"مسئله حل کن و تصمیم‌ها و پیامدهایشان را تحلیل کن."},
{id:"M-006",title:"آمادگی جسمانی و باشگاه",desc:"جلسه تمرین، ریکاوری و خواب مناسب را در برنامه نگه دار."},
{id:"M-007",title:"گزارش پایان روز",desc:"سه دستاورد و یک نکته برای بهبود را ثبت کن."},
{id:"M-008",title:"رقص و هماهنگی حرکتی",desc:"جلسه تمرین رقص و یادگیری یک حرکت یا ترکیب جدید."},
{id:"M-009",title:"سلامت پوست",desc:"روتین ساده و پایدار مراقبت از پوست را دنبال کن."},
{id:"M-010",title:"سلامت دندان",desc:"بهداشت روزانه، نخ دندان و مراقبت‌های دوره‌ای را پیگیری کن."},
{id:"M-011",title:"وزن و تناسب اندام",desc:"روند هفتگی وزن، تمرین باشگاه و عادت‌های سالم را ثبت کن."}
];
let missionStates=JSON.parse(localStorage.getItem("kfox_missions")||"{}");
const missionMeta=key=>missionStates[key]||{};
const saveMissionMeta=async()=>{localStorage.setItem("kfox_missions",JSON.stringify(missionStates));await persistOperationalData();};
function renderMissions(){
 const list=$("#missionList");if(!list)return;list.replaceChildren();
 const focusSelect=$("#missionFocusSelect"),selected=missionStates._focusMission||"";
 focusSelect.replaceChildren(new Option("بدون اولویت انتخاب‌شده",""));missions.forEach(m=>focusSelect.add(new Option(m.title,m.id)));focusSelect.value=selected;
 const focused=missions.find(m=>m.id===selected);$("#missionFocusDisplay").textContent=focused?focused.title:"هنوز مأموریت اصلی انتخاب نشده است.";
 $("#missionFocusDisplay").classList.toggle("is-selected",!!focused);
 missions.forEach(m=>{
  const status=typeof missionStates[m.id]==="string"?missionStates[m.id]:"pending",level=Number((missionStates._missionLevels||{})[m.id]||0),card=document.createElement("article");card.className="mission-card"+(selected===m.id?" mission-card-focused":"");
  const id=document.createElement("div");id.className="mission-id";id.textContent=m.id;
  const info=document.createElement("div");info.className="mission-info";const title=document.createElement("h3");title.textContent=m.title;const desc=document.createElement("p");desc.textContent=m.desc;info.append(title,desc);
  const controls=document.createElement("div");controls.className="mission-card-controls";const wrap=document.createElement("div");wrap.className="mission-status"+(status==="done"?" done":"");
  const select=document.createElement("select");select.setAttribute("aria-label","وضعیت مأموریت "+m.id);select.dataset.mission=m.id;
  [["pending","در انتظار"],["progress","در حال انجام"],["done","تکمیل‌شده"]].forEach(([v,l])=>select.add(new Option(l,v)));select.value=status;wrap.append(select);
  const levelWrap=document.createElement("div");levelWrap.className="mission-level";levelWrap.setAttribute("role","group");levelWrap.setAttribute("aria-label","سطح پیشرفت مأموریت "+m.title);
  const levelLabel=document.createElement("span");levelLabel.className="mission-level-label";levelLabel.textContent="سطح";
  const squares=document.createElement("div");squares.className="mission-level-squares";
  for(let n=1;n<=5;n++){const square=document.createElement("button");square.type="button";square.className="mission-level-square"+(n<=level?" active":"");square.dataset.missionLevel=m.id;square.dataset.level=n;square.setAttribute("aria-label",n+" از ۵");square.setAttribute("aria-pressed",String(n<=level));squares.append(square);}
  levelWrap.append(levelLabel,squares);
  const drawer=document.createElement("details");drawer.className="mission-analysis-drawer";
  const drawerTitle=document.createElement("summary");drawerTitle.textContent="تحلیل وضعیت · "+level+" از ۵";
  drawer.append(drawerTitle,levelWrap);
  const focusBtn=document.createElement("button");focusBtn.type="button";focusBtn.className="mission-focus-button";focusBtn.dataset.focusMission=m.id;focusBtn.textContent=selected===m.id?"اولویت فعلی":"انتخاب تمرکز";
  controls.append(wrap,drawer,focusBtn);card.append(id,info,controls);list.append(card);
 });
 const done=missions.filter(m=>missionStates[m.id]==="done").length,pct=Math.round(done/missions.length*100);
 $("#missionDone").textContent=done;$("#missionLeft").textContent=missions.length-done;$("#missionPercent").textContent=pct+"%";$("#bigProgress").style.width=pct+"%";$("#missionCount").innerHTML=`${String(done).padStart(2,"0")}<span>/${missions.length}</span>`;$("#missionBar").style.width=pct+"%";
}
$("#missionList").addEventListener("change",e=>{if(!e.target.matches("[data-mission]"))return;missionStates[e.target.dataset.mission]=e.target.value;saveMissionMeta();renderMissions();});
$("#missionList").addEventListener("click",e=>{
 const square=e.target.closest("[data-mission-level]");
 if(square){const id=square.dataset.missionLevel,n=Number(square.dataset.level);missionStates._missionLevels=missionStates._missionLevels||{};missionStates._missionLevels[id]=Number(missionStates._missionLevels[id]||0)===n?0:n;saveMissionMeta();renderMissions();return;}
 const b=e.target.closest("[data-focus-mission]");if(!b)return;missionStates._focusMission=b.dataset.focusMission;saveMissionMeta();renderMissions();
});
$("#missionFocusSelect").addEventListener("change",e=>{missionStates._focusMission=e.target.value;saveMissionMeta();renderMissions();});
renderMissions();

// WEIGHT & FITNESS TRACKER
function weightData(){return missionMeta("_weight");}
function renderWeight(){
 const d=weightData(),logs=d.logs||[];$("#weightStart").value=d.startWeight??"";$("#weightWeeklyGoal").value=d.weeklyGoal??"";$("#weightGymGoal").value=d.gymGoal??"";
 const latest=logs[logs.length-1],start=Number(d.startWeight||0);
 $("#weightCurrentSummary").textContent=latest?`آخرین وزن: ${latest.weight} کیلوگرم · تغییر نسبت به شروع: ${start?(latest.weight-start).toFixed(1):"—"} کیلوگرم · آخرین ثبت: ${latest.date}`:"هنوز وزن هفتگی ثبت نشده است.";
 const box=$("#weightHistory");box.replaceChildren();if(!logs.length){box.textContent="هنوز گزارشی ثبت نشده است.";return;}
 [...logs].reverse().forEach((x,i)=>{const row=document.createElement("div");row.className="workspace-item";const main=document.createElement("div");main.className="workspace-item-main";const title=document.createElement("h3");title.textContent=`گزارش ${logs.length-i}: ${x.weight} کیلوگرم`;const meta=document.createElement("p");meta.textContent=`باشگاه: ${x.gymSessions} جلسه · ${x.date}`;main.append(title,meta);row.append(main);box.append(row);});
}
$("#weightSettingsForm").addEventListener("submit",async e=>{e.preventDefault();const d=weightData();d.startWeight=$("#weightStart").value?Number($("#weightStart").value):null;d.weeklyGoal=$("#weightWeeklyGoal").value?Number($("#weightWeeklyGoal").value):null;d.gymGoal=$("#weightGymGoal").value?Number($("#weightGymGoal").value):null;missionStates._weight=d;await saveMissionMeta();renderWeight();});
$("#weightLogForm").addEventListener("submit",async e=>{e.preventDefault();const d=weightData();d.logs=d.logs||[];d.logs.push({weight:Number($("#weightLogValue").value),gymSessions:Number($("#weightGymSessions").value),date:new Intl.DateTimeFormat("fa-IR-u-ca-persian").format(new Date())});missionStates._weight=d;await saveMissionMeta();e.target.reset();renderWeight();});
renderWeight();

// SKILL LEVELS
const skillDefinitions=[
{id:"english",name:"زبان انگلیسی",type:"cefr",levels:["A1","A2","B1","B2","C1","C2"]},
{id:"programming",name:"برنامه‌نویسی",levels:["ضعیف","متوسط","قوی"]},
{id:"critical",name:"تفکر انتقادی و تحلیل",levels:["آغازین","مقدماتی","در حال رشد","متوسط","پیشرفته","مسلط"]},
{id:"psychology",name:"روان‌شناسی",levels:["آغازین","مقدماتی","در حال رشد","متوسط","پیشرفته","مسلط"]},
{id:"finance",name:"مالی و کسب‌وکار",levels:["آغازین","مقدماتی","در حال رشد","متوسط","پیشرفته","مسلط"]},
{id:"firstaid",name:"کمک‌های اولیه",levels:["آغازین","مقدماتی","در حال رشد","متوسط","پیشرفته","مسلط"]},
{id:"chess",name:"شطرنج و استراتژی",levels:["آغازین","مقدماتی","در حال رشد","متوسط","پیشرفته","مسلط"]},
{id:"dance",name:"رقص",levels:["آغازین","مقدماتی","در حال رشد","متوسط","پیشرفته","مسلط"]}
];
function renderSkills(){
 const box=$("#skillTracker");if(!box)return;box.replaceChildren();const saved=missionMeta("_skills");
 skillDefinitions.forEach(skill=>{const row=document.createElement("div");row.className="skill-row";const name=document.createElement("strong");name.textContent=skill.name;
 const select=document.createElement("select");select.dataset.skill=skill.id;select.add(new Option("انتخاب سطح",""));skill.levels.forEach((v,i)=>select.add(new Option(skill.type==="cefr"?v:`${i+1}. ${v}`,v)));select.value=saved[skill.id]?.level||"";
 const progress=document.createElement("select");progress.dataset.skillProgress=skill.id;[["progress","در حال پیشرفت"],["stable","بدون تغییر فعلی"],["paused","متوقف‌شده"]].forEach(([v,l])=>progress.add(new Option(l,v)));progress.value=saved[skill.id]?.progress||"progress";row.append(name,select,progress);box.append(row);});
}
$("#skillTracker").addEventListener("change",async e=>{const id=e.target.dataset.skill||e.target.dataset.skillProgress;if(!id)return;const d=missionMeta("_skills");d[id]=d[id]||{};if(e.target.dataset.skill)d[id].level=e.target.value;else d[id].progress=e.target.value;missionStates._skills=d;await saveMissionMeta();$("#skillFeedback").textContent="سطح مهارت ذخیره شد.";});
renderSkills();

// FINANCIAL VAULT · all values in toman
const toman=n=>new Intl.NumberFormat("fa-IR").format(Math.round(n||0))+" تومان";
function assetData(){return missionMeta("_finance");}
function assetTotal(){return (assetData().assets||[]).reduce((sum,a)=>sum+Number(a.quantity)*Number(a.unitValue),0);}
function renderAssets(){
 const d=assetData(),assets=d.assets||[],list=$("#assetList");list.replaceChildren();$("#financialTotal").textContent=toman(assetTotal());$("#assetCount").textContent=assets.length+" ASSETS";
 const sums={cash:0,bank:0,gold:0,coin:0,other:0};assets.forEach(a=>sums[a.type]=(sums[a.type]||0)+a.quantity*a.unitValue);
 $("#financialBreakdown").textContent=`نقد: ${toman(sums.cash)} · بانک: ${toman(sums.bank)} · طلا: ${toman(sums.gold)} · سکه: ${toman(sums.coin)} · سایر: ${toman(sums.other)}`;
 if(!assets.length)list.textContent="هنوز دارایی‌ای ثبت نشده است.";
 assets.forEach((a,i)=>{const row=document.createElement("div");row.className="workspace-item";const main=document.createElement("div");main.className="workspace-item-main";const title=document.createElement("h3");title.textContent=a.name;const meta=document.createElement("p");meta.textContent=`${({cash:"پول نقد",bank:"حساب بانکی",gold:"طلا",coin:"سکه",other:"سایر"})[a.type]} · تعداد/وزن: ${a.quantity} · ارزش هر واحد: ${toman(a.unitValue)} · جمع: ${toman(a.quantity*a.unitValue)}`;const del=document.createElement("button");del.type="button";del.className="workspace-delete";del.textContent="حذف";del.addEventListener("click",async()=>{const x=assetData();x.assets.splice(i,1);missionStates._finance=x;await saveMissionMeta();renderAssets();});main.append(title,meta);row.append(main,del);list.append(row);});
 const snaps=$("#assetSnapshots");snaps.replaceChildren();(d.snapshots||[]).slice().reverse().forEach(x=>{const row=document.createElement("div");row.className="workspace-item";row.textContent=x.date+" · "+toman(x.total);snaps.append(row);});
}
$("#assetForm").addEventListener("submit",async e=>{e.preventDefault();const d=assetData();d.assets=d.assets||[];d.assets.push({id:crypto.randomUUID(),type:$("#assetType").value,name:$("#assetName").value.trim(),quantity:Number($("#assetQuantity").value),unitValue:Number($("#assetUnitValue").value)});missionStates._finance=d;await saveMissionMeta();e.target.reset();$("#assetQuantity").value="1";renderAssets();});
$("#saveAssetSnapshot").addEventListener("click",async()=>{const d=assetData();d.snapshots=d.snapshots||[];d.snapshots.push({date:new Intl.DateTimeFormat("fa-IR-u-ca-persian").format(new Date()),total:assetTotal()});missionStates._finance=d;await saveMissionMeta();renderAssets();});
renderAssets();

// JOURNAL
let reports = JSON.parse(localStorage.getItem("kfox_reports") || "[]");
let operationalUserId = null;
let operationalCloudReady = false;
let operationalSyncInProgress = false;

function operationalReportKey(report) {
  return report.id || [report.date || "", report.title || "", report.content || ""].join("|");
}

async function persistOperationalData() {
  localStorage.setItem("kfox_missions", JSON.stringify(missionStates));
  localStorage.setItem("kfox_reports", JSON.stringify(reports));
  if (!operationalUserId || !operationalCloudReady) return;
  const result = await window.KFOX_SUPABASE
    .from("kfox_operational_data")
    .upsert({
      owner_id: operationalUserId,
      mission_states: missionStates,
      reports: reports,
      updated_at: new Date().toISOString()
    }, { onConflict: "owner_id" });
  if (result.error) {
    console.error("K-FOX cloud save failed:", result.error.message);
  }
}

async function syncOperationalData(userId) {
  if (!userId || operationalSyncInProgress) return;
  if (operationalUserId === userId && operationalCloudReady) return;
  operationalSyncInProgress = true;
  operationalCloudReady = false;
  operationalUserId = userId;
  try {
    const result = await window.KFOX_SUPABASE
      .from("kfox_operational_data")
      .select("mission_states,reports")
      .eq("owner_id", userId)
      .maybeSingle();
    if (result.error) throw result.error;

    const remote = result.data || { mission_states: {}, reports: [] };
    const localMissions = JSON.parse(localStorage.getItem("kfox_missions") || "{}");
    const localReports = JSON.parse(localStorage.getItem("kfox_reports") || "[]");

    missionStates = { ...localMissions, ...(remote.mission_states || {}) };
    const mergedReports = new Map();
    [...(remote.reports || []), ...localReports].forEach(report => {
      if (!report || !report.title || !report.content) return;
      const normalized = {
        ...report,
        id: report.id || "legacy-" + operationalReportKey(report)
      };
      mergedReports.set(operationalReportKey(normalized), normalized);
    });
    reports = Array.from(mergedReports.values()).sort((a,b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );

    localStorage.setItem("kfox_missions", JSON.stringify(missionStates));
    localStorage.setItem("kfox_reports", JSON.stringify(reports));
    renderMissions();
    renderReports();
    renderWeight();
    renderSkills();
    renderAssets();
    operationalCloudReady = true;
    await persistOperationalData();
    console.info("K-FOX operational data synchronized.");
  } catch (error) {
    operationalUserId = null;
    console.error("K-FOX cloud sync failed:", error.message || error);
    const feedback = document.getElementById("journalFeedback");
    if (feedback) feedback.textContent = "CLOUD SYNC ERROR: اطلاعات فعلی در همین مرورگر حفظ شده‌اند.";
  } finally {
    operationalSyncInProgress = false;
  }
}

function disconnectOperationalData() {
  operationalUserId = null;
  operationalCloudReady = false;
}


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
      persistOperationalData();
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
    id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "report-" + Date.now(),
    title,
    content,
    date: new Date().toLocaleString("fa-IR")
  });
  localStorage.setItem("kfox_reports", JSON.stringify(reports));
  persistOperationalData();
  $("#reportTitle").value = "";
  $("#reportText").value = "";
  $("#journalFeedback").textContent = "REPORT SUCCESSFULLY ARCHIVED.";
  renderReports();
});
renderReports();

// TERMINAL
const output = $("#terminalOutput");
function terminalLine(text, className = "") {
  const p = document.createElement("p"); p.textContent = text;
  if (className) p.className = className;
  output.appendChild(p); output.scrollTop = output.scrollHeight;
}
const builtInQuotes = [
  {text:"You have power over your mind — not outside events. Realize this, and you will find strength.",author:"Marcus Aurelius",category:"Stoicism"},
  {text:"We suffer more often in imagination than in reality.",author:"Seneca",category:"Stoicism"},
  {text:"It is not that we have a short time to live, but that we waste much of it.",author:"Seneca",category:"Time"},
  {text:"The greatest victory is that which requires no battle.",author:"Sun Tzu",category:"Strategy"},
  {text:"Knowing others is intelligence; knowing yourself is true wisdom.",author:"Lao Tzu",category:"Self-knowledge"},
  {text:"Nothing in life is to be feared; it is only to be understood.",author:"Marie Curie",category:"Knowledge"},
  {text:"He who has a why to live can bear almost any how.",author:"Friedrich Nietzsche",category:"Purpose"},
  {text:"First say to yourself what you would be; and then do what you have to do.",author:"Epictetus",category:"Discipline"},
  {text:"The secret of getting ahead is getting started.",author:"Mark Twain",category:"Action"},
  {text:"I am not afraid of storms, for I am learning how to sail my ship.",author:"Louisa May Alcott",category:"Resilience"}
];
let terminalQuotes = [];
let terminalQuoteUser = null;
function showRandomQuote(){
  const all=[...builtInQuotes,...terminalQuotes];
  if(!all.length){terminalLine("NO QUOTES AVAILABLE.");return;}
  const q=all[Math.floor(Math.random()*all.length)];
  terminalLine('“'+q.text+'”'); terminalLine("— "+(q.author||"UNKNOWN")+(q.category?" / "+q.category:""),"terminal-muted");
}
function loadTerminalQuotes(){
  const db=window.KFOX_SUPABASE;
  if(!db)return;
  async function refreshTerminalQuotes(sessionUser){
    terminalQuoteUser=sessionUser||null;
    if(!terminalQuoteUser){terminalQuotes=[];renderTerminalQuotes();return;}
    const result=await db.from("kfox_quotes").select("id,quote_text,author,category").order("created_at",{ascending:false});
    if(!result.error){terminalQuotes=(result.data||[]).map(q=>({id:q.id,text:q.quote_text,author:q.author,category:q.category}));renderTerminalQuotes();}
  }
  db.auth.getSession().then(({data})=>refreshTerminalQuotes(data.session?.user));
  db.auth.onAuthStateChange((_event,session)=>refreshTerminalQuotes(session?.user));
}
function renderTerminalQuotes(){
  const list=$("#terminalQuoteList"); if(!list)return; list.replaceChildren();
  if(!terminalQuotes.length){list.textContent="هنوز نقل‌قول شخصی ثبت نشده است.";return;}
  terminalQuotes.forEach(q=>{
    const row=document.createElement("div");row.className="quote-vault-row";
    const body=document.createElement("span");body.textContent="“"+q.text+"”";
    const meta=document.createElement("small");meta.textContent="— "+(q.author||"ناشناس")+(q.category?" / "+q.category:"");
    const del=document.createElement("button");del.type="button";del.className="archive-action danger";del.textContent="DELETE";
    del.addEventListener("click",async()=>{
      if(!confirm("این نقل‌قول حذف شود؟"))return;
      const res=await window.KFOX_SUPABASE.from("kfox_quotes").delete().eq("id",q.id);
      if(res.error){$("#terminalQuoteFeedback").textContent=res.error.message;return;}
      terminalQuotes=terminalQuotes.filter(x=>x.id!==q.id);renderTerminalQuotes();
    });
    row.append(body,meta,del);list.append(row);
  });
}
$("#terminalQuoteForm")?.addEventListener("submit",async e=>{
  e.preventDefault();const db=window.KFOX_SUPABASE;
  if(!db||!terminalQuoteUser){$("#terminalQuoteFeedback").textContent="برای ثبت نقل‌قول ابتدا از آرشیو شخصی وارد حساب شو.";return;}
  const payload={owner_id:terminalQuoteUser.id,quote_text:$("#terminalQuoteText").value.trim(),author:$("#terminalQuoteAuthor").value.trim(),category:$("#terminalQuoteCategory").value.trim()||null};
  const res=await db.from("kfox_quotes").insert(payload);
  if(res.error){$("#terminalQuoteFeedback").textContent=res.error.message;return;}
  $("#terminalQuoteForm").reset();$("#terminalQuoteFeedback").textContent="QUOTE SAVED."; 
  const loaded=await db.from("kfox_quotes").select("id,quote_text,author,category").order("created_at",{ascending:false});
  if(!loaded.error){terminalQuotes=(loaded.data||[]).map(q=>({id:q.id,text:q.quote_text,author:q.author,category:q.category}));renderTerminalQuotes();}
});
$("#terminalForm").addEventListener("submit", event => {
  event.preventDefault();const input=$("#terminalInput"),command=input.value.trim().toLowerCase();if(!command)return;
  terminalLine("K-07 > "+command,"terminal-muted");input.value="";
  switch(command){
    case "help": terminalLine("HELP / STATUS / DATE / PROFILE / MOTTO / QUOTE / TASKS / MISSIONS / TRAINING / FOCUS / SKILLS / ANALYSIS / DENTAL / PDFS / CLEAR");break;
    case "status": terminalLine("SYSTEM: OPERATIONAL");terminalLine("OPERATIVE: K-07");terminalLine("TRAINING SESSIONS: "+(JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}").training||[]).length);break;
    case "date": terminalLine(new Intl.DateTimeFormat("fa-IR-u-ca-persian",{dateStyle:"full",timeStyle:"short"}).format(new Date()));break;
    case "profile": terminalLine("OPERATIVE K-07 // STATUS: ACTIVE");terminalLine("DIVISION: PERSONAL DEVELOPMENT");break;
    case "motto": terminalLine("KNOWLEDGE IS AN ADVANTAGE.");terminalLine("DISCIPLINE IS A WEAPON.");break;
    case "quote": showRandomQuote();break;
    case "tasks": {const d=JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}");const a=d.tasks||[];terminalLine("TASKS: "+a.length+" / OPEN: "+a.filter(x=>!x.done).length);a.filter(x=>!x.done).slice(0,8).forEach(x=>terminalLine("• "+x.title));break;}
    case "missions": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}");terminalLine("COMPLETED MISSIONS: "+Object.values(m).filter(x=>x==="done").length);break;}
    case "training": {const d=JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}"),a=d.training||[],n=a.reduce((s,x)=>s+Number(x.minutes||0),0);terminalLine("TRAINING: "+Math.floor(n/60)+"h "+n%60+"m / "+a.length+" SESSIONS");break;}
    case "focus": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}"),item=missions.find(x=>x.id===m._focusMission);terminalLine("PRIMARY MISSION: "+(item?item.title:"NOT SET"));break;}
    case "skills": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}"),a=m._skills||{};terminalLine("SKILLS TRACKED: "+Object.keys(a).filter(k=>a[k]?.level).length);break;}
    case "analysis": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}");terminalLine("ANALYSIS FILES: "+((m._intelCases||[]).length)+" / DECISIONS: "+((m._intelDecisions||[]).length));break;}
    case "dental": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}"),d=m._dental||{},logs=d.logs||[],mins=logs.reduce((n,x)=>n+Number(x.minutes||0),0);terminalLine("DENTAL STUDY: "+logs.length+" LOGS / "+(mins/60).toFixed(1)+" HOURS / "+((d.exams||[]).length)+" EXAMS");break;}
    case "pdfs": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}");terminalLine("PDF LIBRARY: "+Object.keys(m._pdfLibrary||{}).length+" DOCUMENTS");break;}
    case "clear": output.replaceChildren();break;
    default: terminalLine("ERROR: COMMAND NOT RECOGNIZED. TYPE 'HELP'.","terminal-muted");
  }
});
loadTerminalQuotes();

// MUSIC VAULT: cloud-only private Supabase storage, synced across signed-in devices
(() => {
  const db=window.KFOX_SUPABASE, $id=id=>document.getElementById(id);
  const form=$id("musicUploadForm"); if(!form||!db)return;
  const bucket="kfox-music-vault", audio=$id("musicAudioPlayer");
  let user=null, tracks=[], activeTrack=null, activeObjectUrl=null;
  const say=(s,bad=false)=>{const el=$id("musicFeedback");el.textContent=s;el.style.color=bad?"#d58a7e":"var(--green)";};
  async function signed(path){
    const r=await db.storage.from(bucket).createSignedUrl(path,3600);
    if(r.error)throw r.error;return r.data.signedUrl;
  }
  async function load(){
    if(!user){tracks=[];render();return;}
    const r=await db.from("kfox_music_tracks").select("*").order("created_at",{ascending:false});
    if(r.error){say("اتصال به آرشیو ابری برقرار نشد: "+r.error.message,true);return;}
    tracks=r.data||[];render();
    say("CLOUD LIBRARY SYNCED · "+tracks.length+"/10 TRACKS");
  }
  async function render(){
    const list=$id("musicTrackList");list.replaceChildren();
    if(!tracks.length){list.textContent=user?"NO TRACKS IN CLOUD VAULT":"برای مشاهده‌ی آرشیو موسیقی وارد حساب شو.";return;}
    for(const t of tracks){
      const row=document.createElement("div");row.className="music-track";
      const img=document.createElement("img");img.alt="کاور";
      if(t.cover_path){try{img.src=await signed(t.cover_path);}catch{}}
      const main=document.createElement("div");main.className="music-track-main";
      const title=document.createElement("strong");title.textContent=t.title;
      const meta=document.createElement("small");meta.textContent=t.lyrics?"LYRICS ATTACHED · CLOUD":"PRIVATE CLOUD AUDIO";
      main.append(title,meta);
      const play=document.createElement("button");play.type="button";play.className="archive-action";play.textContent="PLAY";
      play.onclick=()=>selectTrack(t);
      const del=document.createElement("button");del.type="button";del.className="archive-action danger";del.textContent="DELETE";
      del.onclick=async()=>{if(!confirm("این آهنگ و فایل‌هایش از آرشیو ابری حذف شوند؟"))return;
        const removed=await db.storage.from(bucket).remove([t.audio_path,...(t.cover_path?[t.cover_path]:[])]);
        if(removed.error){say(removed.error.message,true);return;}
        const x=await db.from("kfox_music_tracks").delete().eq("id",t.id);
        if(x.error){say(x.error.message,true);return;}
        if(activeTrack?.id===t.id){audio.pause();audio.removeAttribute("src");activeTrack=null;}
        await load();say("TRACK DELETED FROM CLOUD VAULT.");
      };
      row.append(img,main,play,del);list.append(row);
    }
  }
  async function selectTrack(t){
    try{
      if(activeObjectUrl){URL.revokeObjectURL(activeObjectUrl);activeObjectUrl=null;}
      audio.src=await signed(t.audio_path);activeTrack=t;
      $id("musicNowTitle").textContent=t.title;
      $id("musicNowArtist").textContent="STREAMING FROM PRIVATE CLOUD VAULT";
      const cover=$id("musicNowCover");
      try{const cu=t.cover_path?await signed(t.cover_path):"";if(cu){cover.src=cu;cover.hidden=false;}else cover.hidden=true;}catch{cover.hidden=true;}
      $id("musicCopyLyrics").disabled=!t.lyrics;
      await audio.play();
    }catch(e){say("پخش آنلاین آهنگ ممکن نشد: "+e.message,true);}
  }
  $id("musicCopyLyrics").onclick=()=>{if(activeTrack?.lyrics)navigator.clipboard.writeText(activeTrack.lyrics).then(()=>say("LYRICS COPIED."),()=>say("کپی متن در این مرورگر مجاز نیست.",true));};
  form.addEventListener("submit",async e=>{
    e.preventDefault();if(!user){say("برای افزودن آهنگ ابتدا از آرشیو شخصی وارد حساب شو.",true);return;}
    if(tracks.length>=10){say("ظرفیت آرشیو ۱۰ آهنگ است. ابتدا یک آهنگ حذف کن.",true);return;}
    const file=$id("musicAudio").files[0],cover=$id("musicCover").files[0];
    if(!file||(!file.type.includes("mpeg")&&!/\.mp3$/i.test(file.name))){say("فقط فایل MP3 مجاز است.",true);return;}
    if(file.size>50*1024*1024){say("حجم هر آهنگ باید کمتر از ۵۰ مگابایت باشد.",true);return;}
    if(cover&&(!["image/jpeg","image/png","image/webp"].includes(cover.type)||cover.size>8*1024*1024)){say("کاور باید JPG، PNG یا WEBP و حداکثر ۸ مگابایت باشد.",true);return;}
    const id=crypto.randomUUID(),base=user.id+"/"+id;
    say("UPLOADING TO PRIVATE CLOUD...");
    const audioPath=base+".mp3",coverPath=cover?base+"-cover."+cover.name.split(".").pop().toLowerCase():null;
    const up=await db.storage.from(bucket).upload(audioPath,file,{contentType:"audio/mpeg",upsert:false});
    if(up.error){say(up.error.message,true);return;}
    if(coverPath){const cp=await db.storage.from(bucket).upload(coverPath,cover,{contentType:cover.type,upsert:false});if(cp.error){await db.storage.from(bucket).remove([audioPath]);say(cp.error.message,true);return;}}
    const saved=await db.from("kfox_music_tracks").insert({id,owner_id:user.id,title:$id("musicTitle").value.trim(),audio_path:audioPath,cover_path:coverPath,lyrics:$id("musicLyrics").value.trim()||null});
    if(saved.error){await db.storage.from(bucket).remove([audioPath,...(coverPath?[coverPath]:[])]);say(saved.error.message,true);return;}
    form.reset();await load();say("TRACK SAVED TO YOUR PRIVATE CLOUD VAULT.");
  });
  audio.addEventListener("error",()=>say("پخش آنلاین ناموفق بود؛ اتصال اینترنت را بررسی کن.",true));
  db.auth.getSession().then(({data})=>{user=data.session?.user||null;if(user)load();else say("برای دسترسی به آرشیو ابری از آرشیو شخصی وارد حساب شو.");});
  db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)load();else{tracks=[];render();audio.pause();audio.removeAttribute("src");activeTrack=null;}});
})();

// INITIAL GREETING
console.log("K-FOX OS initialized. Welcome, operative.");


/* PRIVATE ARCHIVE */
(() => {
  const db = window.KFOX_SUPABASE;
  if (!db || !document.querySelector("#archiveLoginForm")) return;
  const bucket = "personal-archive";
  const table = "kfox_quotes";
  let user = null;
  let quotes = [];
  const $id = id => document.getElementById(id);
  const message = (id, text, error=false) => {
    const el=$id(id); el.textContent=text; el.style.color=error?"#d58a7e":"var(--green)";
  };

  async function loadFiles() {
    const list=$id("archiveFileList");
    list.replaceChildren();
    const {data,error}=await db.storage.from(bucket).list(user.id,{limit:100,sortBy:{column:"created_at",order:"desc"}});
    if(error){message("archiveFileFeedback",error.message,true);return;}
    if(!data || !data.length){list.textContent="NO FILES FOUND";return;}
    data.filter(x=>x.name).forEach(async file=>{
      const path=user.id+"/"+file.name;
      const row=document.createElement("div"); row.className="archive-file-item";
      if(/\.(jpg|jpeg|png|webp)$/i.test(file.name)){
        const preview=await db.storage.from(bucket).createSignedUrl(path,300);
        if(!preview.error){
          const image=document.createElement("img");
          image.className="archive-thumb";
          image.src=preview.data.signedUrl;
          image.alt=file.name;
          row.append(image);
        }
      }
      const name=document.createElement("span"); name.className="archive-file-name"; name.textContent=file.name;
      const open=document.createElement("button"); open.type="button"; open.className="archive-action"; open.textContent="OPEN";
      open.addEventListener("click",async()=>{
        const popup=window.open("about:blank","_blank");
        if(!popup){message("archiveFileFeedback","اجازه بازشدن پنجره جدید را در مرورگر فعال کن.",true);return;}
        const result=await db.storage.from(bucket).createSignedUrl(path,60);
        if(result.error){popup.close();message("archiveFileFeedback",result.error.message,true);return;}
        popup.location.href=result.data.signedUrl;
      });
      const del=document.createElement("button"); del.type="button"; del.className="archive-action danger"; del.textContent="DELETE";
      del.addEventListener("click",async()=>{
        if(!confirm("Delete this file?"))return;
        const result=await db.storage.from(bucket).remove([path]);
        if(result.error){message("archiveFileFeedback",result.error.message,true);return;}
        loadFiles();
      });
      row.append(name,open,del); list.append(row);
    });
  }

  async function loadQuotes() {
    const list=$id("archiveQuoteList"); list.textContent="LOADING...";
    const result=await db.from(table).select("id,quote_text,author,category,created_at").order("created_at",{ascending:false});
    if(result.error){list.textContent="QUOTE TABLE NOT READY";message("archiveQuoteFeedback",result.error.message,true);return;}
    quotes=result.data||[]; renderQuotes();
  }

  function renderQuotes() {
    const list=$id("archiveQuoteList"); list.replaceChildren();
    const q=$id("quoteSearch").value.trim().toLowerCase();
    const matches=quotes.filter(x=>(x.quote_text+" "+(x.author||"")+" "+(x.category||"")).toLowerCase().includes(q));
    if(!matches.length){list.textContent="NO MATCHING QUOTES";return;}
    matches.forEach(item=>{
      const row=document.createElement("article"); row.className="archive-quote-item";
      const quote=document.createElement("blockquote"); quote.textContent=item.quote_text;
      const meta=document.createElement("div"); meta.className="archive-quote-meta";
      meta.textContent=[item.author,item.category,new Date(item.created_at).toLocaleDateString()].filter(Boolean).join(" / ");
      const edit=document.createElement("button"); edit.type="button"; edit.className="archive-action"; edit.textContent="EDIT";
      edit.addEventListener("click",async()=>{
        const nextQuote=prompt("متن نقل‌قول:",item.quote_text);
        if(nextQuote===null)return;
        if(!nextQuote.trim()){message("archiveQuoteFeedback","متن نقل‌قول نمی‌تواند خالی باشد.",true);return;}
        const nextAuthor=prompt("نویسنده:",item.author||"");
        if(nextAuthor===null)return;
        const nextCategory=prompt("دسته‌بندی:",item.category||"");
        if(nextCategory===null)return;
        const result=await db.from(table).update({quote_text:nextQuote.trim(),author:nextAuthor.trim()||null,category:nextCategory.trim()||null}).eq("id",item.id);
        if(result.error){message("archiveQuoteFeedback",result.error.message,true);return;}
        message("archiveQuoteFeedback","QUOTE UPDATED."); await loadQuotes();
      });
      const del=document.createElement("button"); del.type="button"; del.className="archive-action danger"; del.textContent="DELETE";
      del.addEventListener("click",async()=>{
        if(!confirm("Delete this quote?"))return;
        const result=await db.from(table).delete().eq("id",item.id);
        if(result.error){message("archiveQuoteFeedback",result.error.message,true);return;}
        await loadQuotes();
      });
      row.append(quote,meta,edit,del); list.append(row);
    });
  }

  async function refresh() {
    if(!user)return;
    await Promise.all([loadFiles(),loadQuotes()]);
  }

  $id("archiveLoginForm").addEventListener("submit",async event=>{
    event.preventDefault();
    const button=event.submitter; if(button)button.disabled=true;
    message("archiveAuthFeedback","VERIFYING...");
    const result=await db.auth.signInWithPassword({email:$id("archiveEmail").value.trim(),password:$id("archivePassword").value});
    if(button)button.disabled=false;
    if(result.error){message("archiveAuthFeedback",result.error.message,true);return;}
    $id("archivePassword").value="";
  });

  $id("archiveLogout").addEventListener("click",()=>db.auth.signOut());
  $id("archiveUploadForm").addEventListener("submit",async event=>{
    event.preventDefault(); if(!user)return;
    const input=$id("archiveFile"), file=input.files[0]; if(!file)return;
    const allowed=["application/pdf","image/jpeg","image/png","image/webp"];
    if(!allowed.includes(file.type)){message("archiveFileFeedback","Unsupported file type.",true);return;}
    if(file.size>50*1024*1024){message("archiveFileFeedback","File exceeds 50 MB.",true);return;}
    const path=user.id+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    message("archiveFileFeedback","UPLOADING...");
    const result=await db.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
    if(result.error){message("archiveFileFeedback",result.error.message,true);return;}
    input.value=""; message("archiveFileFeedback","FILE ARCHIVED."); await loadFiles();
  });

  $id("archiveQuoteForm").addEventListener("submit",async event=>{
    event.preventDefault(); if(!user)return;
    const result=await db.from(table).insert({owner_id:user.id,quote_text:$id("quoteText").value.trim(),author:$id("quoteAuthor").value.trim()||null,category:$id("quoteCategory").value.trim()||null});
    if(result.error){message("archiveQuoteFeedback",result.error.message,true);return;}
    $id("archiveQuoteForm").reset(); message("archiveQuoteFeedback","QUOTE SAVED."); await loadQuotes();
  });
  $id("quoteSearch").addEventListener("input",renderQuotes);

  window.KFOX_SYNC_OPERATIONAL_DATA = syncOperationalData;
  window.KFOX_DISCONNECT_OPERATIONAL_DATA = disconnectOperationalData;

  function setSession(session) {
    user=session?session.user:null;
    $id("archiveLogin").hidden=!!user;
    $id("archiveContent").hidden=!user;
    $id("archiveUserEmail").textContent=user?user.email:"";
    if(user){refresh(); window.KFOX_SYNC_OPERATIONAL_DATA(user.id);}
    else {window.KFOX_DISCONNECT_OPERATIONAL_DATA();$id("archiveFileList").replaceChildren();$id("archiveQuoteList").replaceChildren();}
  }
  db.auth.getSession().then(({data})=>setSession(data.session));
  db.auth.onAuthStateChange((_event,session)=>setSession(session));
})();
