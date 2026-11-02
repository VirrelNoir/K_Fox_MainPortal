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
  $("#missionCount").innerHTML = `${String(done).padStart(2, "0")}<span>/${missions.length}</span>`;
  $("#missionBar").style.width = progress + "%";
}

$("#missionList").addEventListener("change", event => {
  if (!event.target.matches("[data-mission]")) return;
  missionStates[event.target.dataset.mission] = event.target.value;
  localStorage.setItem("kfox_missions", JSON.stringify(missionStates));
  persistOperationalData();
  renderMissions();
});
renderMissions();

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
    case "help": terminalLine("HELP / STATUS / DATE / PROFILE / MOTTO / QUOTE / TASKS / MISSIONS / TRAINING / CLEAR");break;
    case "status": terminalLine("SYSTEM: OPERATIONAL");terminalLine("OPERATIVE: K-07");terminalLine("TRAINING SESSIONS: "+(JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}").training||[]).length);break;
    case "date": terminalLine(new Intl.DateTimeFormat("fa-IR-u-ca-persian",{dateStyle:"full",timeStyle:"short"}).format(new Date()));break;
    case "profile": terminalLine("OPERATIVE K-07 // STATUS: ACTIVE");terminalLine("DIVISION: PERSONAL DEVELOPMENT");break;
    case "motto": terminalLine("KNOWLEDGE IS AN ADVANTAGE.");terminalLine("DISCIPLINE IS A WEAPON.");break;
    case "quote": showRandomQuote();break;
    case "tasks": {const d=JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}");const a=d.tasks||[];terminalLine("TASKS: "+a.length+" / OPEN: "+a.filter(x=>!x.done).length);a.filter(x=>!x.done).slice(0,8).forEach(x=>terminalLine("• "+x.title));break;}
    case "missions": {const m=JSON.parse(localStorage.getItem("kfox_missions")||"{}");terminalLine("COMPLETED MISSIONS: "+Object.values(m).filter(x=>x==="done").length);break;}
    case "training": {const d=JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}"),a=d.training||[],n=a.reduce((s,x)=>s+Number(x.minutes||0),0);terminalLine("TRAINING: "+Math.floor(n/60)+"h "+n%60+"m / "+a.length+" SESSIONS");break;}
    case "clear": output.replaceChildren();break;
    default: terminalLine("ERROR: COMMAND NOT RECOGNIZED. TYPE 'HELP'.","terminal-muted");
  }
});
loadTerminalQuotes();

// MUSIC VAULT: private Supabase storage + per-device offline cache
(() => {
  const db=window.KFOX_SUPABASE, $id=id=>document.getElementById(id);
  const form=$id("musicUploadForm"); if(!form||!db)return;
  const bucket="kfox-music-vault", audio=$id("musicAudioPlayer");
  let user=null, tracks=[], activeTrack=null, activeObjectUrl=null;
  const say=(s,bad=false)=>{const el=$id("musicFeedback");el.textContent=s;el.style.color=bad?"#d58a7e":"var(--green)";};
  function openCache(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open("KFOX-MUSIC-OFFLINE",1);
      req.onupgradeneeded=()=>req.result.createObjectStore("files");
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function cacheGet(key){
    const d=await openCache();return new Promise((resolve,reject)=>{
      const q=d.transaction("files","readonly").objectStore("files").get(key);
      q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error);
    });
  }
  async function cachePut(key,blob){
    const d=await openCache();return new Promise((resolve,reject)=>{
      const tx=d.transaction("files","readwrite");tx.objectStore("files").put(blob,key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
  }
  async function cacheDelete(key){
    const d=await openCache();return new Promise(resolve=>{
      const tx=d.transaction("files","readwrite");tx.objectStore("files").delete(key);tx.oncomplete=resolve;tx.onerror=resolve;
    });
  }
  async function signed(path){
    const r=await db.storage.from(bucket).createSignedUrl(path,3600);
    if(r.error)throw r.error;return r.data.signedUrl;
  }
  async function load(){
    const r=await db.from("kfox_music_tracks").select("*").order("created_at",{ascending: false});
    if(r.error){say("برای راه‌اندازی Music Vault ابتدا فایل SQL را در Supabase اجرا کن. "+r.error.message,true);return;}
    tracks=r.data||[];render();
  }
  async function coverUrl(t){
    if(!t.cover_path)return "";
    const cached=await cacheGet(t.id+":cover");if(cached)return URL.createObjectURL(cached);
    return signed(t.cover_path);
  }
  async function render(){
    const list=$id("musicTrackList");list.replaceChildren();
    if(!tracks.length){list.textContent="NO TRACKS IN VAULT";return;}
    for(const t of tracks){
      const row=document.createElement("div");row.className="music-track";
      const img=document.createElement("img");img.alt="کاور";
      try{const u=await coverUrl(t);if(u)img.src=u;}catch{}
      const main=document.createElement("div");main.className="music-track-main";
      const title=document.createElement("strong");title.textContent=t.title;
      const meta=document.createElement("small");meta.textContent=t.lyrics?"LYRICS ATTACHED":"K-FOX AUDIO FILE";
      main.append(title,meta);
      const play=document.createElement("button");play.type="button";play.className="archive-action";play.textContent="PLAY";
      play.onclick=()=>selectTrack(t);
      const offline=document.createElement("button");offline.type="button";offline.className="archive-action";offline.textContent="SAVE OFFLINE";
      offline.onclick=async()=>{offline.disabled=true;try{
        const u=await signed(t.audio_path),res=await fetch(u);if(!res.ok)throw new Error("Download failed");
        await cachePut(t.id+":audio",await res.blob());
        if(t.cover_path){const cu=await signed(t.cover_path),cr=await fetch(cu);if(cr.ok)await cachePut(t.id+":cover",await cr.blob());}
        say("نسخه‌ی آفلاین «"+t.title+"» روی همین دستگاه ذخیره شد.");
      }catch(e){say("ذخیره‌ی آفلاین انجام نشد: "+e.message,true);}finally{offline.disabled=false;}};
      const del=document.createElement("button");del.type="button";del.className="archive-action danger";del.textContent="DELETE";
      del.onclick=async()=>{if(!confirm("این آهنگ و فایل‌هایش حذف شوند؟"))return;
        await db.storage.from(bucket).remove([t.audio_path,...(t.cover_path?[t.cover_path]:[])]);
        const x=await db.from("kfox_music_tracks").delete().eq("id",t.id);
        if(x.error){say(x.error.message,true);return;}
        await cacheDelete(t.id+":audio");await cacheDelete(t.id+":cover");
        if(activeTrack?.id===t.id){audio.pause();audio.removeAttribute("src");activeTrack=null;}
        await load();say("TRACK DELETED.");
      };
      row.append(img,main,play,offline,del);list.append(row);
    }
  }
  async function selectTrack(t){
    try{
      if(activeObjectUrl)URL.revokeObjectURL(activeObjectUrl);
      const cached=await cacheGet(t.id+":audio");
      let src;
      if(cached){activeObjectUrl=URL.createObjectURL(cached);src=activeObjectUrl;}
      else src=await signed(t.audio_path);
      audio.src=src;activeTrack=t;
      $id("musicNowTitle").textContent=t.title;$id("musicNowArtist").textContent=cached?"OFFLINE COPY AVAILABLE":"STREAMING FROM PRIVATE VAULT";
      const cover=$id("musicNowCover");
      try{const cu=await coverUrl(t);if(cu){cover.src=cu;cover.hidden=false;}else cover.hidden=true;}catch{cover.hidden=true;}
      $id("musicCopyLyrics").disabled=!t.lyrics;
      await audio.play();
    }catch(e){say("پخش آهنگ ممکن نشد: "+e.message,true);}
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
    say("UPLOADING TRACK...");
    let audioPath=base+".mp3",coverPath=cover?base+"-cover."+cover.name.split(".").pop().toLowerCase():null;
    const up=await db.storage.from(bucket).upload(audioPath,file,{contentType:"audio/mpeg",upsert:false});
    if(up.error){say(up.error.message,true);return;}
    if(coverPath){const cp=await db.storage.from(bucket).upload(coverPath,cover,{contentType:cover.type,upsert:false});if(cp.error){await db.storage.from(bucket).remove([audioPath]);say(cp.error.message,true);return;}}
    const saved=await db.from("kfox_music_tracks").insert({id,owner_id:user.id,title:$id("musicTitle").value.trim(),audio_path:audioPath,cover_path:coverPath,lyrics:$id("musicLyrics").value.trim()||null});
    if(saved.error){await db.storage.from(bucket).remove([audioPath,...(coverPath?[coverPath]:[])]);say(saved.error.message,true);return;}
    form.reset();await load();say("TRACK ADDED TO PRIVATE MUSIC VAULT.");
  });
  db.auth.getSession().then(({data})=>{user=data.session?.user||null;if(user)load();else say("برای دسترسی به Music Vault از آرشیو شخصی وارد حساب شو.");});
  db.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;if(user)load();else{tracks=[];render();audio.pause();audio.removeAttribute("src");}});
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
