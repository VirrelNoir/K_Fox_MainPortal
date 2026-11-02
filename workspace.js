(() => {
  "use strict";
  const db = window.KFOX_SUPABASE;
  const $ = id => document.getElementById(id);
  const KEY = "kfox_workspace_v2";
  const empty = () => ({tasks:[],dossiers:[],events:[],training:[]});
  let data = loadLocal(), userId = null, ready = false, syncing = false;
  function loadLocal(){try{return {...empty(),...(JSON.parse(localStorage.getItem(KEY)||"{}"))};}catch{return empty();}}
  function saveLocal(){localStorage.setItem(KEY,JSON.stringify(data));}
  const uid=()=>window.crypto?.randomUUID?.()||"kf-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  const dateNow=()=>new Date().toISOString();
  const jalaliDate=value=>{
    if(!value)return "بدون تاریخ";
    const date=/^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(value+"T12:00:00")
      : new Date(value);
    if(Number.isNaN(date.getTime()))return value;
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"long",day:"numeric"}).format(date);
  };
  async function persist(){
    saveLocal();
    if(!db||!userId||!ready)return;
    const {error}=await db.from("kfox_workspace_data").upsert({owner_id:userId,workspace:data,updated_at:dateNow()},{onConflict:"owner_id"});
    if(error){ready=false;feedback("ذخیره‌ی ابری انجام نشد؛ اطلاعات فعلاً روی همین دستگاه نگه داشته شد. جدول Workspace را در Supabase بررسی کن.");console.error(error);}
  }
  function feedback(msg){const el=$("backupFeedback");if(el)el.textContent=msg;}
  function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function item(title,detail,meta,actions=""){return `<article class="workspace-item"><div class="workspace-item-main"><h3>${esc(title)}</h3><p>${esc(detail)}</p><div class="workspace-meta">${esc(meta)}</div></div>${actions}</article>`;}
  function renderTasks(){
    const el=$("taskList");if(!el)return;
    const sorted=[...data.tasks].sort((a,b)=>(a.done-b.done)||String(a.due||"9999").localeCompare(String(b.due||"9999")));
    $("taskSummary").textContent=data.tasks.filter(x=>!x.done).length+" OPEN / "+data.tasks.length+" TOTAL";
    el.innerHTML=sorted.length?sorted.map(t=>item(t.title,t.project||"بدون دسته‌بندی",(t.priority==="urgent"?"فوری":t.priority==="high"?"مهم":"عادی")+" • "+(t.due?jalaliDate(t.due):"بدون مهلت"),`<button data-task-done="${t.id}">${t.done?"REOPEN":"COMPLETE"}</button><button class="workspace-delete" data-task-delete="${t.id}">DELETE</button>`)).join(""):'<div class="empty-state">NO TASKS REGISTERED</div>';
    el.querySelectorAll("[data-task-done]").forEach(b=>b.onclick=()=>{const t=data.tasks.find(x=>x.id===b.dataset.taskDone);if(t)t.done=!t.done;persist().then(renderAll);});
    el.querySelectorAll("[data-task-delete]").forEach(b=>b.onclick=()=>{data.tasks=data.tasks.filter(x=>x.id!==b.dataset.taskDelete);persist().then(renderAll);});
  }
  function renderDossiers(){
    const el=$("dossierList");if(!el)return;$("dossierSummary").textContent=data.dossiers.length+" FILES";
    el.innerHTML=data.dossiers.length?[...data.dossiers].reverse().map(d=>`<article class="dossier-card"><h3>${esc(d.title)}</h3><div class="workspace-meta">${esc(d.category)} • ${jalaliDate(d.created)}</div><p>${esc(d.notes||"بدون یادداشت")}</p><button class="workspace-delete" data-dossier-delete="${d.id}">DELETE FILE</button></article>`).join(""):'<div class="empty-state">NO DOSSIERS CREATED</div>';
    el.querySelectorAll("[data-dossier-delete]").forEach(b=>b.onclick=()=>{data.dossiers=data.dossiers.filter(x=>x.id!==b.dataset.dossierDelete);persist().then(renderAll);});
  }
  function renderEvents(){
    const el=$("eventList");if(!el)return;const sorted=[...data.events].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    el.innerHTML=sorted.length?sorted.map(e=>item(e.title,e.note||"—",jalaliDate(e.date)+" "+(e.time||"") ,`<button class="workspace-delete" data-event-delete="${e.id}">DELETE</button>`)).join(""):'<div class="empty-state">NO EVENTS SCHEDULED</div>';
    el.querySelectorAll("[data-event-delete]").forEach(b=>b.onclick=()=>{data.events=data.events.filter(x=>x.id!==b.dataset.eventDelete);persist().then(renderAll);});
  }
  function renderTraining(){
    const el=$("trainingList");if(!el)return;const sorted=[...data.training].sort((a,b)=>b.date.localeCompare(a.date));
    $("trainingSummary").textContent=sorted.length+" SESSIONS";
    el.innerHTML=sorted.length?sorted.map(t=>item(t.topic,t.minutes+" دقیقه",jalaliDate(t.date),`<button class="workspace-delete" data-training-delete="${t.id}">DELETE</button>`)).join(""):'<div class="empty-state">NO TRAINING LOGS</div>';
    el.querySelectorAll("[data-training-delete]").forEach(b=>b.onclick=()=>{data.training=data.training.filter(x=>x.id!==b.dataset.trainingDelete);persist().then(renderAll);});
  }
  function renderDashboard(){
    const total=data.training.reduce((n,x)=>n+Number(x.minutes||0),0), hours=Math.floor(total/60), mins=total%60;
    if($("trainingMinutes"))$("trainingMinutes").innerHTML=String(hours).padStart(2,"0")+'<span>h '+String(mins).padStart(2,"0")+'m</span>';
    if($("trainingBar"))$("trainingBar").style.width=Math.min(100,total/600*100)+"%";
    const points=data.tasks.filter(x=>x.done).length*10+data.training.reduce((n,x)=>n+Math.floor(Number(x.minutes||0)/15),0)+data.dossiers.length*5;
    const level=Math.min(10,1+Math.floor(points/100)), progress=points%100;
    if($("rankLevel"))$("rankLevel").innerHTML=String(level).padStart(2,"0")+'<span>/10</span>';
    if($("rankPointsLabel"))$("rankPointsLabel").textContent="امتیاز پیشرفت: "+points;
    if($("rankBar"))$("rankBar").style.width=(level===10?100:progress)+"%";
    const acts=[
      ...data.tasks.map(x=>({date:x.updated||x.created,title:(x.done?"تکمیل وظیفه: ":"ثبت وظیفه: ")+x.title,kind:"OPERATIONS"})),
      ...data.dossiers.map(x=>({date:x.created,title:"ایجاد پرونده: "+x.title,kind:"DOSSIER"})),
      ...data.training.map(x=>({date:x.created,title:"ثبت آموزش: "+x.topic,kind:"TRAINING"})),
      ...data.events.map(x=>({date:x.created,title:"ثبت رویداد: "+x.title,kind:"CALENDAR"}))
    ].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
    const feed=$("liveActivity");if(feed)feed.innerHTML=acts.length?acts.map(a=>`<div class="activity-item"><span class="activity-mark green"></span><div><b>${esc(a.title)}</b><small>${esc(a.kind)}</small></div><time>${jalaliDate(a.date)}</time></div>`).join(""):'<div class="empty-state">هنوز فعالیت جدیدی ثبت نشده است.</div>';
  }

  const jalaliParts=date=>{
    const parts=new Intl.DateTimeFormat("en-US-u-ca-persian",{year:"numeric",month:"numeric",day:"numeric"}).formatToParts(date);
    const get=t=>Number(parts.find(p=>p.type===t)?.value);
    return {year:get("year"),month:get("month"),day:get("day")};
  };
  const jalaliMonthName=date=>new Intl.DateTimeFormat("fa-IR-u-ca-persian",{month:"long",year:"numeric"}).format(date);
  let calendarCursor=new Date(); calendarCursor.setHours(12,0,0,0);
  function monthStart(date){
    const p=jalaliParts(date), d=new Date(date); d.setHours(12,0,0,0);
    while(true){const prev=new Date(d);prev.setDate(d.getDate()-1);const q=jalaliParts(prev);if(q.year!==p.year||q.month!==p.month)break;d.setDate(d.getDate()-1);}
    return d;
  }

  const isoFromDate=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  function jalaliToIso(year,month,day){
    const start=new Date(Date.UTC(year+621,2,15,12));
    for(let offset=0;offset<390;offset++){
      const candidate=new Date(start.getTime()+offset*86400000);
      const parts=new Intl.DateTimeFormat("en-US-u-ca-persian",{year:"numeric",month:"numeric",day:"numeric",timeZone:"UTC"}).formatToParts(candidate);
      const get=t=>Number(parts.find(p=>p.type===t)?.value);
      if(get("year")===year&&get("month")===month&&get("day")===day){
        return [candidate.getUTCFullYear(),String(candidate.getUTCMonth()+1).padStart(2,"0"),String(candidate.getUTCDate()).padStart(2,"0")].join("-");
      }
    }
    return "";
  }
  function initJalaliDatePickers(){
    ["taskDue","trainingDate","eventDate"].forEach(id=>{
      const hidden=$(id),display=$(id+"Display");if(!hidden||!display)return;
      const wrap=display.parentElement;wrap.classList.add("jalali-date-field");
      const popup=document.createElement("div");popup.className="jalali-picker-popup";popup.hidden=true;
      wrap.appendChild(popup);
      let cursor=new Date();cursor.setHours(12,0,0,0);
      function draw(){
        const first=monthStart(cursor),p0=jalaliParts(first);
        const names=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
        let d=new Date(first);d.setDate(first.getDate()-((first.getDay()+1)%7));
        popup.innerHTML='<div class="jalali-picker-head"><button type="button" data-shift="-1">‹</button><strong>'+jalaliMonthName(first)+'</strong><button type="button" data-shift="1">›</button></div><div class="jalali-picker-grid">'+names.map(n=>'<span class="jalali-picker-weekday">'+n+'</span>').join("")+'</div>';
        const grid=popup.querySelector(".jalali-picker-grid");
        for(let i=0;i<42;i++){
          const day=jalaliParts(d),iso=isoFromDate(d),b=document.createElement("button");
          b.type="button";b.className="jalali-picker-day"+(day.month===p0.month&&day.year===p0.year?"":" outside")+(iso===hidden.value?" selected":"");
          b.textContent=new Intl.NumberFormat("fa-IR").format(day.day);
          b.addEventListener("click",()=>{
            hidden.value=iso;display.value=jalaliDate(iso);popup.hidden=true;
            display.dispatchEvent(new Event("change",{bubbles:true}));
          });
          grid.appendChild(b);d.setDate(d.getDate()+1);
        }
        popup.querySelectorAll("[data-shift]").forEach(button=>button.addEventListener("click",()=>{
          cursor=monthStart(cursor);cursor.setDate(cursor.getDate()+(Number(button.dataset.shift)<0?-1:40));draw();
        }));
      }
      display.addEventListener("click",()=>{cursor=hidden.value?new Date(hidden.value+"T12:00:00"):new Date();draw();popup.hidden=!popup.hidden;});
      display.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();display.click();}});
      display.addEventListener("blur",()=>{if(!hidden.value)display.value="";});
      const form=display.closest("form");
      form?.addEventListener("reset",()=>{hidden.value="";display.value="";popup.hidden=true;});
    });
  }
  initJalaliDatePickers();

  function renderJalaliCalendar(){
    const grid=$("jalaliCalendarGrid"),title=$("jalaliCalendarTitle");if(!grid||!title)return;
    const first=monthStart(calendarCursor),current=jalaliParts(first),today=new Date();
    title.textContent=jalaliMonthName(first);
    const weekdays=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
    const eventsByDay=new Set(data.events.map(e=>e.date).filter(Boolean));
    grid.innerHTML=weekdays.map(x=>'<div class="jalali-calendar-weekday">'+x+'</div>').join("");
    const offset=(first.getDay()+1)%7;
    const count=new Date(first.getFullYear(),first.getMonth(),first.getDate()+40).getTime();
    let d=new Date(first);d.setDate(first.getDate()-offset);
    for(let i=0;i<42;i++){
      const p=jalaliParts(d),iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
      const same=p.year===current.year&&p.month===current.month;
      const isToday=d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
      const cell=document.createElement("div");
      cell.className="jalali-calendar-day"+(same?"":" outside")+(isToday?" today":"")+(eventsByDay.has(iso)?" has-event":"");
      cell.textContent=new Intl.NumberFormat("fa-IR").format(p.day);
      cell.title=jalaliDate(iso)+(eventsByDay.has(iso)?" • رویداد ثبت‌شده":"");
      grid.appendChild(cell);d.setDate(d.getDate()+1);
    }
  }
  $("jalaliPrev")?.addEventListener("click",()=>{calendarCursor=monthStart(calendarCursor);calendarCursor.setDate(calendarCursor.getDate()-1);renderJalaliCalendar();});
  $("jalaliNext")?.addEventListener("click",()=>{calendarCursor=monthStart(calendarCursor);calendarCursor.setDate(calendarCursor.getDate()+40);renderJalaliCalendar();});

  function renderAll(){renderTasks();renderDossiers();renderEvents();renderTraining();renderDashboard();renderJalaliCalendar();}
  $("taskForm")?.addEventListener("submit",e=>{e.preventDefault();data.tasks.push({id:uid(),title:$("taskTitle").value.trim(),project:$("taskProject").value.trim(),priority:$("taskPriority").value,due:$("taskDue").value,done:false,created:dateNow(),updated:dateNow()});e.target.reset();persist().then(renderAll);});
  $("dossierForm")?.addEventListener("submit",e=>{e.preventDefault();data.dossiers.push({id:uid(),title:$("dossierTitle").value.trim(),category:$("dossierCategory").value,notes:$("dossierNotes").value.trim(),created:dateNow()});e.target.reset();persist().then(renderAll);});
  $("trainingForm")?.addEventListener("submit",e=>{e.preventDefault();data.training.push({id:uid(),topic:$("trainingTopic").value.trim(),minutes:Number($("trainingDuration").value),date:$("trainingDate").value,created:dateNow()});e.target.reset();persist().then(renderAll);});
  $("eventForm")?.addEventListener("submit",e=>{e.preventDefault();data.events.push({id:uid(),title:$("eventTitle").value.trim(),date:$("eventDate").value,time:$("eventTime").value,note:$("eventNote").value.trim(),created:dateNow()});e.target.reset();persist().then(renderAll);});
  $("exportBackup")?.addEventListener("click",()=>{
    const backup={format:"KFOX_BACKUP",version:2,created_at:dateNow(),workspace:data,missions:JSON.parse(localStorage.getItem("kfox_missions")||"{}"),reports:JSON.parse(localStorage.getItem("kfox_reports")||"[]")};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="KFOX-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(url);feedback("BACKUP EXPORTED SUCCESSFULLY.");
  });
  $("importBackup")?.addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{const b=JSON.parse(await file.text());if(b.format!=="KFOX_BACKUP"||!b.workspace)throw new Error("فرمت فایل معتبر نیست.");
      if(!confirm("اطلاعات فعلی با اطلاعات داخل نسخه پشتیبان جایگزین شود؟"))return;
      data={...empty(),...b.workspace};if(b.missions)localStorage.setItem("kfox_missions",JSON.stringify(b.missions));if(b.reports)localStorage.setItem("kfox_reports",JSON.stringify(b.reports));
      await persist();renderAll();feedback("BACKUP RESTORED. برای به‌روزرسانی گزارش‌ها صفحه را تازه‌سازی کن.");
    }catch(err){feedback("خطا در بازیابی: "+err.message);}finally{e.target.value="";}
  });
  async function sync(user){
    if(!user||syncing)return;syncing=true;ready=false;userId=user.id;
    try{
      const {data:row,error}=await db.from("kfox_workspace_data").select("workspace").eq("owner_id",user.id).maybeSingle();
      if(error)throw error;
      const cloud=row?.workspace||empty(),local=loadLocal();
      // Cloud takes precedence for existing IDs; local-only items are retained and then uploaded.
      for(const key of Object.keys(empty())){const map=new Map((cloud[key]||[]).map(x=>[x.id,x]));(local[key]||[]).forEach(x=>{if(!map.has(x.id))map.set(x.id,x);});data[key]=Array.from(map.values());}
      ready=true;await persist();renderAll();feedback("CLOUD WORKSPACE SYNCHRONIZED.");
    }catch(err){userId=null;ready=false;feedback("برای همگام‌سازی، ابتدا فایل SQL همراه پروژه را در Supabase اجرا کن. اطلاعات فعلی روی این دستگاه محفوظ است.");console.warn("KFOX workspace sync:",err.message);}
    finally{syncing=false;}
  }
  if(db){
    db.auth.getSession().then(({data:session})=>{if(session?.session)sync(session.session.user);});
    db.auth.onAuthStateChange((_event,session)=>{if(session?.user)sync(session.user);else{userId=null;ready=false;}});
  }
  renderAll();
})();