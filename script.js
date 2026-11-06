const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// Initialize the private archive before optional site modules.
/* PRIVATE ARCHIVE */
(() => {
  const loginForm = document.querySelector("#archiveLoginForm");
  if (!loginForm) return;
  const $id = id => document.getElementById(id);
  const message = (id, text, error=false) => {
    const el = $id(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = error ? "#d58a7e" : "var(--green)";
  };

  const db = window.KFOX_SUPABASE;
  if (!db || !db.auth) {
    loginForm.addEventListener("submit", event => {
      event.preventDefault();
      const reason = window.KFOX_SUPABASE_INIT_ERROR?.message;
      message(
        "archiveAuthFeedback",
        "سرویس ورود بارگذاری نشده است. اتصال اینترنت یا بارگذاری کتابخانه Supabase را بررسی کن." +
          (reason ? " (" + reason + ")" : ""),
        true
      );
    });
    message("archiveAuthFeedback", "سرویس ورود آماده نیست؛ ارسال فرم خطای بارگذاری را نشان می‌دهد.", true);
    return;
  }

  const bucket = "personal-archive";
  const table = "kfox_quotes";
  let user = null;
  let quotes = [];

  async function loadFiles() {
    const list=$id("archiveFileList");
    list.replaceChildren();
    if(!user){list.textContent="برای دیدن فایل‌ها وارد حساب شو.";return;}
    // Private files are isolated under the authenticated user's own folder.
    const archiveFolder=user.id+"/archive";
    const {data,error}=await db.storage.from(bucket).list(archiveFolder,{limit:100,sortBy:{column:"created_at",order:"desc"}});
    if(error){message("archiveFileFeedback",error.message,true);return;}
    if(!data || !data.length){list.textContent="NO FILES FOUND";return;}
    data.filter(x=>x.name).forEach(async file=>{
      const path=archiveFolder+"/"+file.name;
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

  loginForm.addEventListener("submit",async event=>{
    event.preventDefault();
    loginForm.dataset.kfoxSubmitting = "true";
    const button=event.submitter;
    if(button)button.disabled=true;
    message("archiveAuthFeedback","در حال بررسی اطلاعات ورود...");
    try{
      const email=$id("archiveEmail").value.trim().toLowerCase();
      const password=$id("archivePassword").value;
      const result=await db.auth.signInWithPassword({email,password});
      if(result.error){
        const raw=result.error.message||"";
        const friendly=/invalid login credentials/i.test(raw)
          ?"ایمیل یا رمز عبور صحیح نیست. آدرس ایمیل حساب را دقیق وارد کن."
          :raw;
        message("archiveAuthFeedback",friendly,true);
        return;
      }
      $id("archivePassword").value="";
      if(result.data?.session){
        setSession(result.data.session);
        message("archiveAuthFeedback","ورود موفق بود؛ آرشیو در حال بارگذاری است.");
      }else{
        message("archiveAuthFeedback","ورود انجام شد اما نشست دریافت نشد؛ دوباره تلاش کن.",true);
      }
    }catch(error){
      message("archiveAuthFeedback","ارتباط با سرویس ورود برقرار نشد: "+(error?.message||"خطای ناشناخته"),true);
    }finally{
      delete loginForm.dataset.kfoxSubmitting;
      if(button)button.disabled=false;
    }
  });

  $id("archiveLogout").addEventListener("click",()=>db.auth.signOut());
  $id("archiveUploadForm").addEventListener("submit",async event=>{
    event.preventDefault(); if(!user)return;
    const input=$id("archiveFile"), file=input.files[0]; if(!file)return;
    const allowed=["application/pdf","image/jpeg","image/png","image/webp"];
    if(!allowed.includes(file.type)){message("archiveFileFeedback","Unsupported file type.",true);return;}
    if(file.size>50*1024*1024){message("archiveFileFeedback","File exceeds 50 MB.",true);return;}
    const path=user.id+"/archive/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
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
    const nextUser=session?.user||null;
    const previousId=user?.id||null;
    user=nextUser;
    $id("archiveLogin").hidden=!!user;
    $id("archiveContent").hidden=!user;
    $id("archiveUserEmail").textContent=user?user.email:"";
    if(user && previousId!==user.id){
      void refresh().catch(error => message("archiveFileFeedback", error?.message || "خطا در بارگذاری آرشیو.", true));
      if (typeof window.KFOX_SYNC_OPERATIONAL_DATA === "function") {
        Promise.resolve(window.KFOX_SYNC_OPERATIONAL_DATA(user.id))
          .catch(error => console.warn("K-FOX operational sync:", error));
      }
    }else if(!user && previousId){
      window.KFOX_DISCONNECT_OPERATIONAL_DATA();
      $id("archiveFileList").replaceChildren();
      $id("archiveQuoteList").replaceChildren();
    }
  }
  // Expose the same session handler used by auth events so the early
  // submit guard can initialize the archive UI without duplicating logic.
  window.KFOX_SET_ARCHIVE_SESSION = setSession;

  db.auth.getSession().then(({data,error})=>{
    if(error)message("archiveAuthFeedback","خطا در بازیابی نشست: "+error.message,true);
    setSession(data?.session||null);
  }).catch(error=>message("archiveAuthFeedback","خطا در بازیابی نشست: "+(error?.message||"unknown"),true));
  // Never call Supabase APIs inside onAuthStateChange; defer work until its internal lock is released.
  db.auth.onAuthStateChange((_event,session)=>{
    window.setTimeout(()=>setSession(session),0);
  });
})();


// K-FOX neon switch: remember the user's preference on this device.
(function(){
  const key="kfox-neon-enabled";
  function applyNeon(enabled){
    document.body.classList.toggle("neon-off",!enabled);
    const button=document.getElementById("kfoxNeonToggle");
    if(button){
      button.classList.toggle("is-on",enabled);
      button.setAttribute("aria-pressed",String(enabled));
      button.title=enabled?"خاموش کردن خطوط نئونی":"روشن کردن خطوط نئونی";
      const label=button.querySelector(".neon-toggle-label");
      if(label)label.textContent=enabled?"NEON ON":"NEON OFF";
    }
  }
  let enabled=localStorage.getItem(key)!=="off";
  applyNeon(enabled);
  document.addEventListener("DOMContentLoaded",()=>{
    const button=document.getElementById("kfoxNeonToggle");
    if(button)button.addEventListener("click",()=>{
      enabled=!enabled;
      localStorage.setItem(key,enabled?"on":"off");
      applyNeon(enabled);
    });
    applyNeon(enabled);
  });
})();

// Check for new releases without ever forcing a reload on an active page.
// A controller change must not interrupt authentication, uploads, or navigation.
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    console.info("K-FOX service worker updated; current page remains active.");
  });
  window.addEventListener("load",async()=>{
    try{
      const registration=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});
      const checkForUpdate=()=>registration.update().catch(()=>{});
      await checkForUpdate();
      document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState==="visible")checkForUpdate();
      });
      window.addEventListener("focus",checkForUpdate);
      window.setInterval(()=>{
        if(document.visibilityState==="visible")checkForUpdate();
      },60000);
    }catch(err){console.warn("K-FOX service worker update:",err);}
  });
}

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
// Restore user-created missions from the synced operational state.
(missionStates._customMissions||[]).forEach(m=>{if(m&&m.id&&m.title&&!missions.some(existing=>existing.id===m.id))missions.push({id:m.id,title:m.title,desc:m.desc||""});});
const missionMeta=key=>missionStates[key]||{};
const saveMissionMeta=async()=>{localStorage.setItem("kfox_missions",JSON.stringify(missionStates));await persistOperationalData();};
function renderMissions(){
 const list=$("#missionList");if(!list)return;list.replaceChildren();
 const focusSelect=$("#missionFocusSelect"),selected=missionStates._focusMission||"";
 focusSelect.replaceChildren(new Option("بدون اولویت انتخاب‌شده",""));missions.forEach(m=>focusSelect.add(new Option(m.title,m.id)));focusSelect.value=selected;
 const focused=missions.find(m=>m.id===selected);$("#missionFocusDisplay").textContent=focused?focused.title:"هنوز مأموریت اصلی انتخاب نشده است.";
 $("#missionFocusDisplay").classList.toggle("is-selected",!!focused);
 missions.forEach(m=>{
  const status=typeof missionStates[m.id]==="string"?missionStates[m.id]:"pending",level=Number((missionStates._missionLevels||{})[m.id]||0),statusClass=status==="done"?"status-done":status==="progress"?"status-progress":"status-pending",card=document.createElement("article");card.className="mission-card "+statusClass+(selected===m.id?" mission-card-focused":"");
  const id=document.createElement("div");id.className="mission-id";id.textContent=m.id;
  const info=document.createElement("div");info.className="mission-info";const title=document.createElement("h3");title.textContent=m.title;const desc=document.createElement("p");desc.textContent=m.desc;info.append(title,desc);
  const controls=document.createElement("div");controls.className="mission-card-controls";const wrap=document.createElement("div");wrap.className="mission-status "+statusClass;
  const select=document.createElement("select");select.setAttribute("aria-label","وضعیت مأموریت "+m.id);select.dataset.mission=m.id;
  [["pending","در انتظار"],["progress","در حال انجام"],["done","تکمیل‌شده"]].forEach(([v,l])=>select.add(new Option(l,v)));select.value=status;wrap.append(select);
  const levelWrap=document.createElement("div");levelWrap.className="mission-level";levelWrap.setAttribute("role","group");levelWrap.setAttribute("aria-label","سطح پیشرفت مأموریت "+m.title);
  const levelLabel=document.createElement("span");levelLabel.className="mission-level-label";levelLabel.textContent="سطح";
  const squares=document.createElement("div");squares.className="mission-level-squares";
  for(let n=1;n<=5;n++){const square=document.createElement("button");square.type="button";square.className="mission-level-square"+(n<=level?" active":"");square.dataset.missionLevel=m.id;square.dataset.level=n;square.setAttribute("aria-label",n+" از ۵");square.setAttribute("aria-pressed",String(n<=level));squares.append(square);}
  levelWrap.append(levelLabel,squares);
  const focusBtn=document.createElement("button");focusBtn.type="button";focusBtn.className="mission-focus-button";focusBtn.dataset.focusMission=m.id;focusBtn.textContent=selected===m.id?"اولویت فعلی":"انتخاب تمرکز";
  controls.append(wrap,levelWrap,focusBtn);card.append(id,info,controls);list.append(card);
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
$("#missionCreateForm").addEventListener("submit",async e=>{e.preventDefault();const title=$("#newMissionTitle").value.trim();if(!title)return;const custom=missionStates._customMissions=missionStates._customMissions||[];const next=custom.reduce((max,item)=>Math.max(max,Number(String(item.id).replace(/^C-/,""))||0),0)+1;const id="C-"+String(next).padStart(3,"0");const mission={id,title,desc:$("#newMissionDesc").value.trim()};custom.push(mission);missions.push(mission);await saveMissionMeta();e.target.reset();renderMissions();});
renderMissions();

// WEIGHT & FITNESS TRACKER
function weightData(){return missionMeta("_weight");}
function renderWeight(){
 if(!$("weightSettingsForm"))return;
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

// FINANCIAL VAULT · multi-account assets, cash flow, coins and USD
const toman=n=>new Intl.NumberFormat("fa-IR").format(Math.round(Number(n)||0))+" تومان";
const faDigits={"۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9","٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9"};
function parseFinanceNumber(value){return Number(String(value??"").replace(/[۰-۹٠-٩]/g,c=>faDigits[c]||c).replace(/[,\u066C\s٬]/g,"").replace(/[٫]/g,"."))||0;}
function financeWordsUnder1000(n){
 const ones=["","یک","دو","سه","چهار","پنج","شش","هفت","هشت","نه","ده","یازده","دوازده","سیزده","چهارده","پانزده","شانزده","هفده","هجده","نوزده"];
 const tens=["","","بیست","سی","چهل","پنجاه","شصت","هفتاد","هشتاد","نود"],hundreds=["","صد","دویست","سیصد","چهارصد","پانصد","ششصد","هفتصد","هشتصد","نهصد"];
 const parts=[];if(n>=100){parts.push(hundreds[Math.floor(n/100)]);n%=100;}if(n>=20){parts.push(tens[Math.floor(n/10)]);n%=10;}if(n>0)parts.push(ones[n]);return parts.join(" و ");
}
function financeAmountWords(value){
 let n=Math.floor(Math.abs(Number(value)||0));if(!n)return "صفر تومان";
 const scales=["","هزار","میلیون","میلیارد","تریلیون"],parts=[];let i=0;
 while(n>0&&i<scales.length){const chunk=n%1000;if(chunk){const part=financeWordsUnder1000(chunk);parts.unshift(part+(scales[i]?" "+scales[i]:""));}n=Math.floor(n/1000);i++;}
 return parts.join(" و ")+" تومان";
}
function formatFinanceMoney(value){return value?new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(value):"";}
function updateFinanceWords(input){
 const target=document.getElementById(input.dataset.words);if(target)target.textContent=input.value?financeAmountWords(parseFinanceNumber(input.value)):"";
}
function bindFinanceMoneyInputs(root=document){
 root.querySelectorAll(".finance-money").forEach(input=>{
  if(input.dataset.moneyBound)return;input.dataset.moneyBound="1";
  input.addEventListener("input",()=>{const raw=input.value.replace(/[۰-۹٠-٩]/g,c=>faDigits[c]||c).replace(/[^\d]/g,"");const formatted=raw?new Intl.NumberFormat("en-US").format(Number(raw)):"";input.value=formatted;updateFinanceWords(input);});
  input.addEventListener("blur",()=>updateFinanceWords(input));
 });
}
function setFinanceMoney(id,value){const input=$("#"+id);if(!input)return;input.value=formatFinanceMoney(Number(value)||0);updateFinanceWords(input);}
function assetData(){
 const d=missionMeta("_finance");
 if(!d.ledgerVersion){
  const old=d.assets||[];
  d.openingCash=old.filter(a=>a.type==="cash").reduce((s,a)=>s+Number(a.quantity||0)*Number(a.unitValue||0),0);
  d.openingCard=old.filter(a=>a.type==="bank").reduce((s,a)=>s+Number(a.quantity||0)*Number(a.unitValue||0),0);
  d.legacyValue=old.filter(a=>!["cash","bank"].includes(a.type)).reduce((s,a)=>s+Number(a.quantity||0)*Number(a.unitValue||0),0);
  d.coins=d.coins||[];d.transactions=d.transactions||[];d.goldPrice18=Number(d.goldPrice18||0);d.ledgerVersion=1;
 }
 d.coins=d.coins||[];d.transactions=d.transactions||[];d.bankAccounts=d.bankAccounts||[];
 if(!d.bankAccounts.length&&(Number(d.openingCard||0)>0||d.transactions.some(t=>t.account==="card"))){
  d.bankAccounts.push({id:"bank-legacy-1",name:"حساب بانکی قبلی",openingBalance:Number(d.openingCard||0)});
  d.transactions.forEach(t=>{if(t.account==="card")t.account="bank-legacy-1";});
  d.openingCard=0;
 }
 d.cashOpening=Number(d.cashOpening??d.openingCash??0);
 d.dollarAmount=Number(d.dollarAmount||0);d.dollarRate=Number(d.dollarRate||0);
 return d;
}
function financeBalances(d){
 const cash=Number(d.cashOpening||0),banks={};
 (d.bankAccounts||[]).forEach(a=>banks[a.id]=Number(a.openingBalance||0));
 (d.transactions||[]).forEach(t=>{const amount=Number(t.amount)||0,delta=t.type==="income"?amount:-amount;if(t.account==="cash"){}else if(t.account in banks){}else return;
  if(t.account==="cash"){}else banks[t.account]+=delta;
 });
 let cashBalance=cash;
 (d.transactions||[]).forEach(t=>{if(t.account==="cash")cashBalance+=(t.type==="income"?1:-1)*Number(t.amount||0);});
 return {cash:cashBalance,banks};
}
function financeBankTotal(d){const b=financeBalances(d);return Object.values(b.banks).reduce((s,n)=>s+n,0);}
function financeCoinValue(d,coin){const purity=coin.purity==="900"?1.2:1;return Number(coin.count||0)*Number(coin.weightSoot||0)/1000*Number(d.goldPrice18||0)*purity;}
function financeCoinTotal(d){return (d.coins||[]).reduce((sum,coin)=>sum+financeCoinValue(d,coin),0);}
function financeTotal(d){const b=financeBalances(d);return b.cash+financeBankTotal(d)+financeCoinTotal(d)+Number(d.dollarAmount||0)*Number(d.dollarRate||0)+Number(d.legacyValue||0);}
function saveFinance(d){missionStates._finance=d;return saveMissionMeta();}
function renderAssets(){
 const d=assetData(),balances=financeBalances(d),coins=d.coins||[],transactions=d.transactions||[];
 setFinanceMoney("financeCashOpening",d.cashOpening);
 setFinanceMoney("financeGoldPrice",d.goldPrice18);
 setFinanceMoney("financeDollarRate",d.dollarRate);
 $("#financeDollarAmount").value=d.dollarAmount||0;
 $("#financialTotal").textContent=toman(financeTotal(d));
 $("#financialBreakdown").textContent="نقد: "+toman(balances.cash)+" · بانک: "+toman(financeBankTotal(d))+" · سکه: "+toman(financeCoinTotal(d))+" · دلار: "+toman(Number(d.dollarAmount||0)*Number(d.dollarRate||0))+(d.legacyValue?" · دارایی قدیمی: "+toman(d.legacyValue):"");
 $("#financeCashCurrent").textContent=toman(balances.cash);$("#financeBankCurrent").textContent=toman(financeBankTotal(d));
 $("#financeGoldDate").textContent=d.goldPriceDate?"آخرین تاریخ ثبت قیمت: "+d.goldPriceDate:"قیمت طلا را خودت به‌صورت دستی به‌روز کن.";
 $("#financeDollarValue").textContent="ارزش "+new Intl.NumberFormat("fa-IR").format(d.dollarAmount||0)+" دلار: "+toman(Number(d.dollarAmount||0)*Number(d.dollarRate||0));
 const bankList=$("#financeBankList");bankList.replaceChildren();
 if(!d.bankAccounts.length)bankList.textContent="هنوز حساب بانکی ثبت نشده است.";
 d.bankAccounts.forEach(account=>{
  const row=document.createElement("article");row.className="workspace-item finance-bank-row";
  const main=document.createElement("div");main.className="workspace-item-main";
  const name=document.createElement("input");name.type="text";name.maxLength=60;name.className="finance-bank-name";name.value=account.name;name.setAttribute("aria-label","نام حساب بانکی");
  const opening=document.createElement("input");opening.type="text";opening.inputMode="numeric";opening.className="finance-money finance-bank-opening";opening.value=formatFinanceMoney(account.openingBalance);opening.dataset.words="financeBankWords-"+account.id;opening.setAttribute("aria-label","موجودی اولیه حساب");
  const current=document.createElement("p");current.textContent="موجودی فعلی: "+toman(balances.banks[account.id]||0);
  const save=document.createElement("button");save.type="button";save.className="archive-action";save.textContent="ذخیره تغییرات";save.dataset.bankSave=account.id;
  const del=document.createElement("button");del.type="button";del.className="workspace-delete";del.textContent="حذف حساب";del.dataset.bankDelete=account.id;
  const words=document.createElement("small");words.className="finance-words";words.id="financeBankWords-"+account.id;words.textContent=financeAmountWords(Number(account.openingBalance)||0);const fields=document.createElement("div");fields.className="finance-bank-fields";const openingWrap=document.createElement("div");openingWrap.append(opening,words);fields.append(name,openingWrap);
  main.append(fields,current);row.append(main,save,del);bankList.append(row);
 });
 bindFinanceMoneyInputs(bankList);
 const accountSelect=$("#financeTransactionAccount"),selected=accountSelect.value;accountSelect.replaceChildren(new Option("پول نقد","cash"));
 d.bankAccounts.forEach(a=>accountSelect.add(new Option(a.name,a.id)));
 if([...accountSelect.options].some(o=>o.value===selected))accountSelect.value=selected;
 const coinList=$("#financeCoinList");coinList.replaceChildren();
 if(!coins.length)coinList.textContent="هنوز سکه‌ای ثبت نشده است.";
 const coinNames={parsian:"پارسیان ۱۸ عیار",parsian18:"پارسیان ۱۸ عیار",parsian750:"پارسیان ۷۵۰",quarter:"ربع سکه",half:"نیم سکه",full:"تمام سکه",gram:"سکه گرمی",custom18:"سایر ـ ۱۸ عیار",custom900:"سایر ـ ۹۰۰"};
 coins.forEach((coin,i)=>{
  const row=document.createElement("div");row.className="workspace-item";const main=document.createElement("div");main.className="workspace-item-main";
  const title=document.createElement("h3");title.textContent=(coinNames[coin.type]||"سکه")+" · "+coin.count+" عدد";
  const meta=document.createElement("p");meta.textContent="وزن هر عدد: "+coin.weightSoot+" سوت · ارزش تقریبی طلا: "+toman(financeCoinValue(d,coin));
  const del=document.createElement("button");del.type="button";del.className="workspace-delete";del.textContent="حذف";del.addEventListener("click",async()=>{const x=assetData();x.coins.splice(i,1);await saveFinance(x);renderAssets();});
  main.append(title,meta);row.append(main,del);coinList.append(row);
 });
 $("#financeCoinTotal").textContent="ارزش طلای سکه‌ها: "+toman(financeCoinTotal(d));
 const txList=$("#financeTransactionList");txList.replaceChildren();$("#financeTransactionCount").textContent=new Intl.NumberFormat("fa-IR").format(transactions.length)+" تراکنش";
 if(!transactions.length)txList.textContent="هنوز درآمد یا هزینه‌ای ثبت نشده است.";
 [...transactions].reverse().forEach((t,reverseIndex)=>{
  const i=transactions.length-1-reverseIndex,row=document.createElement("div");row.className="workspace-item";
  const main=document.createElement("div");main.className="workspace-item-main";const title=document.createElement("h3");
  title.textContent=(t.type==="income"?"＋ درآمد":"− هزینه")+" · "+toman(t.amount);
  const accountName=t.account==="cash"?"پول نقد":(d.bankAccounts.find(a=>a.id===t.account)?.name||"حساب بایگانی‌شده");
  const meta=document.createElement("p");meta.textContent=accountName+" · "+(t.note||"بدون توضیح")+" · "+(t.date||"");
  const del=document.createElement("button");del.type="button";del.className="workspace-delete";del.textContent="حذف";del.addEventListener("click",async()=>{const x=assetData();x.transactions.splice(i,1);await saveFinance(x);renderAssets();});
  main.append(title,meta);row.append(main,del);txList.append(row);
 });
 $("#financeLegacyNote").textContent=d.legacyValue?"ارزش "+toman(d.legacyValue)+" از دارایی‌های قدیمی برای جلوگیری از حذف اطلاعات قبلی در جمع کل باقی مانده است.":"";
}
bindFinanceMoneyInputs();
$("#financialCashForm").addEventListener("submit",async e=>{e.preventDefault();const d=assetData();d.cashOpening=parseFinanceNumber($("#financeCashOpening").value);await saveFinance(d);renderAssets();});
$("#financeBankForm").addEventListener("submit",async e=>{
 e.preventDefault();const d=assetData();d.bankAccounts.push({id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"bank-"+Date.now(),name:$("#financeBankName").value.trim(),openingBalance:parseFinanceNumber($("#financeBankOpening").value)});
 await saveFinance(d);e.target.reset();renderAssets();
});
$("#financeBankList").addEventListener("click",async e=>{
 const save=e.target.closest("[data-bank-save]"),del=e.target.closest("[data-bank-delete]");if(!save&&!del)return;
 const d=assetData(),id=(save||del).dataset.bankSave||(save||del).dataset.bankDelete,index=d.bankAccounts.findIndex(a=>a.id===id);if(index<0)return;
 if(save){const row=save.closest(".finance-bank-row");d.bankAccounts[index].name=row.querySelector(".finance-bank-name").value.trim()||"حساب بانکی";d.bankAccounts[index].openingBalance=parseFinanceNumber(row.querySelector(".finance-bank-opening").value);await saveFinance(d);renderAssets();return;}
 if(d.transactions.some(t=>t.account===id)){alert("برای حفظ تاریخچه، ابتدا تراکنش‌های این حساب را حذف یا به حساب دیگری منتقل کن.");return;}
 if(!confirm("این حساب بانکی حذف شود؟"))return;d.bankAccounts.splice(index,1);await saveFinance(d);renderAssets();
});
$("#financeGoldForm").addEventListener("submit",async e=>{e.preventDefault();const d=assetData();d.goldPrice18=parseFinanceNumber($("#financeGoldPrice").value);d.goldPriceDate=new Intl.DateTimeFormat("fa-IR-u-ca-persian").format(new Date());await saveFinance(d);renderAssets();});
$("#financeCoinForm").addEventListener("submit",async e=>{
 e.preventDefault();const d=assetData(),type=$("#financeCoinType").value,purity=type==="quarter"||type==="half"||type==="full"||type==="gram"||type==="custom900"?"900":"750";
 d.coins.push({id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"coin-"+Date.now(),type,purity,count:Number($("#financeCoinCount").value),weightSoot:Number($("#financeCoinWeight").value)});
 await saveFinance(d);e.target.reset();$("#financeCoinCount").value="1";renderAssets();
});
$("#financeDollarForm").addEventListener("submit",async e=>{e.preventDefault();const d=assetData();d.dollarAmount=Number($("#financeDollarAmount").value)||0;d.dollarRate=parseFinanceNumber($("#financeDollarRate").value);await saveFinance(d);renderAssets();});
$("#financeTransactionForm").addEventListener("submit",async e=>{
 e.preventDefault();const d=assetData(),amount=parseFinanceNumber($("#financeTransactionAmount").value),type=$("#financeTransactionType").value,account=$("#financeTransactionAccount").value,balances=financeBalances(d),available=account==="cash"?balances.cash:balances.banks[account];
 if(amount<=0){alert("مبلغ تراکنش باید بیشتر از صفر باشد.");return;}
 if(type==="expense"&&amount>Number(available||0)){alert("مبلغ هزینه از موجودی انتخاب‌شده بیشتر است.");return;}
 d.transactions.push({id:(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"tx-"+Date.now(),type,account,amount,note:$("#financeTransactionNote").value.trim(),date:new Intl.DateTimeFormat("fa-IR-u-ca-persian").format(new Date())});
 await saveFinance(d);e.target.reset();renderAssets();
});
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

window.KFOX_LOG_ACTIVITY = (kind, title) => {
  try {
    const log = Array.isArray(missionStates._activityLog) ? missionStates._activityLog : [];
    log.push({id:(window.crypto?.randomUUID?.()||("act-"+Date.now()+"-"+Math.random().toString(36).slice(2))),kind:String(kind||"activity"),title:String(title||"فعالیت K-FOX").slice(0,140),at:new Date().toISOString()});
    missionStates._activityLog = log.slice(-700);
    localStorage.setItem("kfox_missions", JSON.stringify(missionStates));
    if (typeof persistOperationalData === "function") persistOperationalData();
    if (typeof window.KFOX_RENDER_WEEKLY_REVIEW === "function") window.KFOX_RENDER_WEEKLY_REVIEW();
  } catch (error) { console.warn("K-FOX activity log:", error); }
};
document.addEventListener("click", event => {
  const nav = event.target.closest(".nav-link,[data-goto]");
  if (!nav) return;
  const page = nav.dataset.page || nav.dataset.goto || "overview";
  const label = nav.textContent.trim().split(/\s+/).join(" ").slice(0,80);
  window.KFOX_LOG_ACTIVITY?.("visit", label || page);
});
document.addEventListener("change", event => {
  if (event.target.matches("#missionList [data-mission]")) {
    const option=event.target.selectedOptions?.[0]?.textContent||"";
    window.KFOX_LOG_ACTIVITY?.("action","تغییر وضعیت مأموریت به "+option);
  }
});
document.addEventListener("click", event => {
  const level=event.target.closest("[data-mission-level]");
  if(level)window.KFOX_LOG_ACTIVITY?.("action","به‌روزرسانی پیشرفت مأموریت");
});
document.addEventListener("click", event => {
  const target=event.target.closest("[data-task-done],[data-task-delete],[data-dossier-delete],[data-event-delete],[data-training-delete],#saveReport,#musicCopyLyrics");
  if(!target)return;
  const labels={"saveReport":"ثبت گزارش روزانه","musicCopyLyrics":"کپی متن آهنگ"};
  const label=labels[target.id]||"به‌روزرسانی یا حذف یک مورد در K-FOX";
  window.KFOX_LOG_ACTIVITY?.("action",label);
});
document.addEventListener("submit", event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const labels = {
    taskForm:"ثبت وظیفه",dossierForm:"ساخت پرونده",trainingForm:"ثبت جلسه آموزش",
    eventForm:"ثبت رویداد تقویم",missionCreateForm:"ساخت مأموریت",
    weightSettingsForm:"تنظیم هدف ورزشی",weightLogForm:"ثبت گزارش وزن",
    intelCaseForm:"ثبت تحلیل",intelDecisionForm:"ثبت تصمیم",
    dentalLogForm:"ثبت مطالعه دندان‌پزشکی",dentalExamForm:"ثبت آزمون",
    pdfUploadForm:"بارگذاری PDF",musicUploadForm:"افزودن آهنگ",
    terminalQuoteForm:"افزودن نقل‌قول",archiveQuoteForm:"ذخیره نقل‌قول",
    archiveUploadForm:"بارگذاری سند"
  };
  const label = labels[form.id];
  if (label) window.KFOX_LOG_ACTIVITY?.("action", label);
}, true);

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

    const remoteStates = remote.mission_states || {};
    missionStates = { ...localMissions, ...remoteStates };

    // Merge gym records instead of replacing the whole local object with the
    // cloud snapshot. This protects device-only logs while restoring cloud data.
    const localGym = localMissions._gym || {};
    const remoteGym = remoteStates._gym || {};
    const mergeGymRows = (cloudRows, localRows, key) => {
      const rows = new Map();
      [...(Array.isArray(cloudRows) ? cloudRows : []), ...(Array.isArray(localRows) ? localRows : [])]
        .forEach(row => { if (row && (row[key] || row.id)) rows.set(row[key] || row.id, row); });
      return Array.from(rows.values());
    };
    missionStates._gym = {
      ...remoteGym,
      ...localGym,
      profile: { ...(remoteGym.profile || {}), ...(localGym.profile || {}) },
      targets: { ...(remoteGym.targets || {}), ...(localGym.targets || {}) },
      weeklyLogs: mergeGymRows(remoteGym.weeklyLogs, localGym.weeklyLogs, "date"),
      nutrition: mergeGymRows(remoteGym.nutrition, localGym.nutrition, "date"),
      photos: mergeGymRows(remoteGym.photos, localGym.photos, "id")
    };

    const activityMap = new Map();
    [...(remote.mission_states?._activityLog||[]), ...(localMissions._activityLog||[])].forEach(entry => {
      if (entry?.id) activityMap.set(entry.id, entry);
    });
    missionStates._activityLog = Array.from(activityMap.values()).sort((a,b)=>String(a.at).localeCompare(String(b.at))).slice(-700);
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
    // Notify separately loaded modules (gym/nutrition) that cloud state is ready.
    window.dispatchEvent(new CustomEvent("kfox:operational-data-synced"));
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
  db.auth.onAuthStateChange((_event,session)=>{window.setTimeout(()=>refreshTerminalQuotes(session?.user).catch(error=>console.warn("K-FOX terminal quotes:",error)),0);});
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
  let user=null, tracks=[], activeTrack=null, activeObjectUrl=null, repeatMode="off", shuffleOn=false, shuffleRemaining=[];
  const say=(s,bad=false)=>{const el=$id("musicFeedback");el.textContent=s;el.style.color=bad?"#d58a7e":"var(--green)";};
  const repeatButton=$id("musicRepeatMode"), shuffleButton=$id("musicShuffle");
  function syncPlaybackControls(){
    repeatButton.textContent="REPEAT: "+({off:"OFF",one:"ONE",all:"ALL"}[repeatMode]);
    repeatButton.setAttribute("aria-label","حالت تکرار: "+({off:"خاموش",one:"تکرار همین آهنگ",all:"تکرار همه آهنگ‌ها"}[repeatMode]));
    shuffleButton.textContent="SHUFFLE: "+(shuffleOn?"ON":"OFF");
    shuffleButton.setAttribute("aria-pressed",String(shuffleOn));
    audio.loop=repeatMode==="one";
  }
  repeatButton.addEventListener("click",()=>{repeatMode=({off:"one",one:"all",all:"off"})[repeatMode];syncPlaybackControls();});
  shuffleButton.addEventListener("click",()=>{shuffleOn=!shuffleOn;shuffleRemaining=tracks.filter(t=>t.id!==activeTrack?.id).map(t=>t.id);syncPlaybackControls();});
  function showLyrics(track){
    const box=$id("musicLyricsText"),panel=$id("musicLyricsPanel"),lyrics=String(track?.lyrics||"").trim();
    box.textContent=lyrics||"برای این آهنگ متنی ثبت نشده است.";
    panel.classList.toggle("has-lyrics",!!lyrics);
    $id("musicCopyLyrics").disabled=!lyrics;
  }
  function nextTrack(){
    if(!tracks.length||!activeTrack)return;
    let next=null;
    if(shuffleOn){
      shuffleRemaining=shuffleRemaining.filter(id=>tracks.some(t=>t.id===id)&&id!==activeTrack.id);
      if(!shuffleRemaining.length&&repeatMode==="all")shuffleRemaining=tracks.filter(t=>t.id!==activeTrack.id).map(t=>t.id);
      if(shuffleRemaining.length){
        const pick=Math.floor(Math.random()*shuffleRemaining.length),id=shuffleRemaining.splice(pick,1)[0];
        next=tracks.find(t=>t.id===id)||null;
      }
    }else{
      const index=tracks.findIndex(t=>t.id===activeTrack.id);
      if(index>=0&&index<tracks.length-1)next=tracks[index+1];
      else if(repeatMode==="all")next=tracks[0];
    }
    if(next)selectTrack(next,true);else say("پخش فهرست تمام شد.");
  }
  audio.addEventListener("ended",()=>{if(repeatMode!=="one")nextTrack();});
  syncPlaybackControls();
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
        if(activeTrack?.id===t.id){audio.pause();audio.removeAttribute("src");activeTrack=null;showLyrics(null);$id("musicNowTitle").textContent="NO TRACK SELECTED";}
        await load();say("TRACK DELETED FROM CLOUD VAULT.");
      };
      row.append(img,main,play,del);list.append(row);
    }
  }
  async function selectTrack(t,automatic=false){
    if(!automatic)shuffleRemaining=tracks.filter(x=>x.id!==t.id).map(x=>x.id);
    try{
      if(activeObjectUrl){URL.revokeObjectURL(activeObjectUrl);activeObjectUrl=null;}
      audio.src=await signed(t.audio_path);activeTrack=t;
      $id("musicNowTitle").textContent=t.title;
      $id("musicNowArtist").textContent="STREAMING FROM PRIVATE CLOUD VAULT";
      const cover=$id("musicNowCover");
      try{const cu=t.cover_path?await signed(t.cover_path):"";if(cu){cover.src=cu;cover.hidden=false;}else cover.hidden=true;}catch{cover.hidden=true;}
      showLyrics(t);
      window.KFOX_LOG_ACTIVITY?.("music","پخش آهنگ: "+t.title);
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
    const id=crypto.randomUUID(),base=user.id+"/music/"+id;
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
  db.auth.onAuthStateChange((_event,session)=>{window.setTimeout(()=>{user=session?.user||null;if(user)load().catch(error=>say(error.message,true));else{tracks=[];render();audio.pause();audio.removeAttribute("src");activeTrack=null;}},0);});
})();

// INITIAL GREETING
console.log("K-FOX OS initialized. Welcome, operative.");


