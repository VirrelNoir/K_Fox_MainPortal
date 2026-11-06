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
  const validReminderLead=new Set(["0","5","15","30","60"]);
  function reminderTimestamp(date,time,lead){
    if(!date||!time)throw new Error("برای یادآوری، تاریخ و ساعت جلسه را مشخص کن.");
    if(!validReminderLead.has(String(lead)))throw new Error("بازه یادآوری معتبر نیست.");
    const startsAt=new Date(date+"T"+time+":00");
    if(Number.isNaN(startsAt.getTime()))throw new Error("تاریخ یا ساعت جلسه معتبر نیست.");
    const scheduledAt=new Date(startsAt.getTime()-Number(lead)*60000);
    if(scheduledAt.getTime()<=Date.now())throw new Error("زمان یادآوری گذشته است؛ تاریخ یا ساعت جلسه را اصلاح کن.");
    return scheduledAt.toISOString();
  }
  async function createWorkspaceReminder(module,title,body,date,time,lead){
    if(lead==="")return null;
    const scheduledAt=reminderTimestamp(date,time,lead);
    if(typeof window.KFOX_SCHEDULE_NOTIFICATION!=="function")throw new Error("مرکز اعلان هنوز بارگذاری نشده است.");
    const result=await window.KFOX_SCHEDULE_NOTIFICATION({module,title,body,scheduledAt});
    if(!result?.id)throw new Error("شناسه یادآوری از سرور دریافت نشد.");
    return result.id;
  }
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
    data.tasks.forEach(t=>{if(!t.status)t.status=t.done?"done":"pending";t.done=t.status==="done";});
    const order={pending:0,in_progress:1,blocked:2,done:3};
    const labels={pending:"در انتظار",in_progress:"در حال انجام",blocked:"نیازمند رسیدگی",done:"تکمیل‌شده"};
    const sorted=[...data.tasks].sort((x,y)=>(order[x.status]-order[y.status])||String(x.due||"9999").localeCompare(String(y.due||"9999")));
    const open=data.tasks.filter(x=>x.status!=="done").length;
    $("taskSummary").textContent=open+" باز / "+(data.tasks.length-open)+" تکمیل‌شده";
    el.innerHTML=sorted.length?sorted.map(t=>'<article class="workspace-item task-item '+(t.status==="done"?"is-done":t.status==="blocked"?"is-blocked":"")+'"><div class="workspace-item-main"><h3>'+esc(t.title)+'</h3><p>'+esc(t.project||"بدون دسته‌بندی")+' · '+(t.priority==="urgent"?"فوری":t.priority==="high"?"مهم":"عادی")+' · '+(t.due?jalaliDate(t.due)+(t.dueTime?" · "+t.dueTime:""):"بدون مهلت")+(t.notificationId?" · یادآوری ثبت‌شده":"")+'</p><small class="task-status-label">'+labels[t.status]+'</small></div><label class="task-status-control">وضعیت<select data-task-status="'+esc(t.id)+'"><option value="pending" '+(t.status==="pending"?"selected":"")+'>در انتظار</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>در حال انجام</option><option value="blocked" '+(t.status==="blocked"?"selected":"")+'>مشکل دارم</option><option value="done" '+(t.status==="done"?"selected":"")+'>تکمیل‌شده</option></select></label><button class="workspace-delete" data-task-delete="'+esc(t.id)+'">حذف</button></article>').join(""):'<div class="empty-state">هنوز وظیفه‌ای ثبت نشده است.</div>';
  }
    function renderDossiers(){
    const el=$("dossierList");if(!el)return;$("dossierSummary").textContent=data.dossiers.length+" FILES";
    el.innerHTML=data.dossiers.length?[...data.dossiers].reverse().map(d=>`<article class="dossier-card"><h3>${esc(d.title)}</h3><div class="workspace-meta">${esc(d.category)} • ${jalaliDate(d.created)}</div><p>${esc(d.notes||"بدون یادداشت")}</p><button class="workspace-delete" data-dossier-delete="${d.id}">DELETE FILE</button></article>`).join(""):'<div class="empty-state">NO DOSSIERS CREATED</div>';
    el.querySelectorAll("[data-dossier-delete]").forEach(b=>b.onclick=()=>{data.dossiers=data.dossiers.filter(x=>x.id!==b.dataset.dossierDelete);persist().then(renderAll);});
  }
  function renderEvents(){
    const el=$("eventList");if(!el)return;
    const sorted=[...data.events].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
    el.innerHTML=sorted.length?sorted.map(record=>{
      const detail=[record.note||"—",record.notificationId?"یادآوری فعال":""].filter(Boolean).join(" · ");
      const when=jalaliDate(record.date)+(record.time?" · "+record.time:"");
      return item(record.title,detail,when,`<button class="workspace-delete" data-event-delete="${esc(record.id)}">DELETE</button>`);
    }).join(""):'<div class="empty-state">NO EVENTS SCHEDULED</div>';
    el.querySelectorAll("[data-event-delete]").forEach(button=>button.onclick=async()=>{
      const record=data.events.find(item=>item.id===button.dataset.eventDelete);if(!record)return;
      try{if(record.notificationId)await window.KFOX_CANCEL_NOTIFICATION(record.notificationId);}
      catch(error){feedback("حذف یادآوری رویداد انجام نشد: "+(error?.message||"خطای ناشناخته"));return;}
      data.events=data.events.filter(item=>item.id!==record.id);await persist();renderAll();
    });
  }
  function renderTraining(){
    const el=$("trainingList");if(!el)return;
    const sorted=[...data.training].sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    $("trainingSummary").textContent=sorted.length+" SESSIONS";
    const missionNames=new Map(Array.from(document.querySelectorAll("#missionList .mission-card")).map(card=>[card.dataset.missionId,card.querySelector(".mission-info h3")?.textContent||""]));
    el.innerHTML=sorted.length?sorted.map(record=>{
      const mission=missionNames.get(record.missionId)||"بدون مأموریت";
      const minutes=Math.max(0,Number(record.minutes)||0),hours=Math.floor(minutes/60),mins=minutes%60;
      const duration=hours?new Intl.NumberFormat("fa-IR").format(hours)+" ساعت"+(mins?" و "+new Intl.NumberFormat("fa-IR").format(mins)+" دقیقه":""):new Intl.NumberFormat("fa-IR").format(mins)+" دقیقه";
      const meta=mission+" · "+jalaliDate(record.date)+(record.time?" · "+record.time:"")+(record.notificationId?" · یادآوری فعال":"");
      return item(record.topic,duration,meta,`<button class="workspace-delete" data-training-delete="${esc(record.id)}">حذف</button>`);
    }).join(""):'<div class="empty-state">هنوز جلسه‌ای ثبت نشده است.</div>';
    el.querySelectorAll("[data-training-delete]").forEach(button=>button.onclick=async()=>{
      const record=data.training.find(item=>item.id===button.dataset.trainingDelete);if(!record)return;
      try{if(record.notificationId)await window.KFOX_CANCEL_NOTIFICATION(record.notificationId);}
      catch(error){feedback("حذف یادآوری جلسه آموزش انجام نشد: "+(error?.message||"خطای ناشناخته"));return;}
      data.training=data.training.filter(item=>item.id!==record.id);await persist();renderAll();
    });
  }
  function renderWeeklyReview(){
    const message=$("weeklyReviewMessage"),stats=$("weeklyReviewStats"),foot=$("weeklyReviewFoot");
    if(!message||!stats||!foot)return;
    const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);
    const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day);
    const log=Array.isArray(JSON.parse(localStorage.getItem("kfox_missions")||"{}")._activityLog)?JSON.parse(localStorage.getItem("kfox_missions")||"{}")._activityLog:[];
    const week=log.filter(x=>{const d=new Date(x.at);return !Number.isNaN(d.getTime())&&d>=start&&d<=now;});
    const visits=week.filter(x=>x.kind==="visit"),actions=week.filter(x=>x.kind!=="visit");
    const days=new Set(week.map(x=>new Date(x.at).toLocaleDateString("en-CA"))).size;
    const doneMissions=week.filter(x=>/مأموریت|MISSION/i.test(x.title)&&/تکمیل/i.test(x.title)).length;
    const score=Math.min(100,week.length*5+days*8+Math.min(20,visits.length*2));
    let line="";
    if(!week.length)line="هلیا، این هفته کجا غیبت زدی؟ هنوز حتی یه فعالیت هم ثبت نکردی. پاشو یه غلطی بکن؛ قرار نبود فقط داشبورد رو خوشگل کنی!";
    else if(week.length<4)line="هلیا... این بود تمام توانت؟ یه تکونی به خودت بده. چندتا سر زدی، ولی هنوز خبری از ترکوندن نیست.";
    else if(score<45)line="خوبه، داری یه غلطایی می‌کنی؛ ولی هنوز جای کار داری. ادامه بده و وسط هفته غیب نشو.";
    else if(score<75)line="هلیا، بد نبود! این هفته از حالت مجسمه خارج شدی. داری پیشرفت می‌کنی؛ همین ریتم رو نگه دار.";
    else line="هلیااا، ترکوندی این هفته! بالاخره معلومه صاحب این مرکز فرماندهی بیداره. همین‌طوری ادامه بده.";
    if(days>=4&&actions.length>=8)line="هلیا، مردی این هفته! چند روز پشت سر هم فعال بودی و کار واقعی ثبت کردی. دمت گرم؛ همینو می‌خواستیم.";
    message.textContent=line;
    stats.innerHTML="";
    [["فعالیت ثبت‌شده",week.length],["روزهای فعال",days],["بازدید از بخش‌ها",visits.length],["کارهای ثبت‌شده",actions.length]].forEach(([label,value])=>{
      const card=document.createElement("div");card.className="weekly-review-stat";
      const strong=document.createElement("b");strong.textContent=value;
      const small=document.createElement("small");small.textContent=label;
      card.append(strong,small);stats.append(card);
    });
    foot.textContent="هفته از "+new Intl.DateTimeFormat("fa-IR-u-ca-persian",{day:"numeric",month:"long"}).format(start)+" شروع شده · امتیاز فعالیت: "+score+"/100";
  }
  window.KFOX_RENDER_WEEKLY_REVIEW=renderWeeklyReview;
  function renderDashboard(){
    renderWeeklyReview();
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
    ["taskDue","trainingDate","eventDate","centralReminderDate"].forEach(id=>{
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

  let selectedCalendarIso = "";
  function renderJalaliCalendar(){
    const grid=$("jalaliCalendarGrid"),title=$("jalaliCalendarTitle");if(!grid||!title)return;
    const first=monthStart(calendarCursor),current=jalaliParts(first),today=new Date();
    title.textContent=jalaliMonthName(first);
    const weekdays=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
    const eventsByDay=new Set([...data.events,...data.training].map(item=>item.date).filter(Boolean));
    grid.innerHTML=weekdays.map(x=>'<div class="jalali-calendar-weekday">'+x+'</div>').join("");
    const offset=(first.getDay()+1)%7;
    let d=new Date(first);d.setDate(first.getDate()-offset);
    for(let i=0;i<42;i++){
      const p=jalaliParts(d),iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
      const same=p.year===current.year&&p.month===current.month;
      const isToday=d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
      const cell=document.createElement("button");
      cell.type="button";
      cell.className="jalali-calendar-day"+(same?"":" outside")+(isToday?" today":"")+(eventsByDay.has(iso)?" has-event":"")+(selectedCalendarIso===iso?" selected":"");
      cell.textContent=new Intl.NumberFormat("fa-IR").format(p.day);
      cell.title=jalaliDate(iso)+(eventsByDay.has(iso)?" • رویداد یا جلسه آموزشی ثبت‌شده":"")+" • برای ثبت رویداد انتخاب کن";
      cell.setAttribute("aria-label",jalaliDate(iso)+"؛ انتخاب برای ثبت رویداد یا جلسه");
      cell.addEventListener("click",()=>{
        selectedCalendarIso=iso;
        const hidden=$("eventDate"),display=$("eventDateDisplay");
        if(hidden)hidden.value=iso;
        if(display)display.value=jalaliDate(iso);
        renderJalaliCalendar();
        const form=$("eventForm");
        form?.scrollIntoView({behavior:"smooth",block:"center"});
        $("eventTitle")?.focus({preventScroll:true});
      });
      grid.appendChild(cell);d.setDate(d.getDate()+1);
    }
  }
  $("jalaliPrev")?.addEventListener("click",()=>{calendarCursor=monthStart(calendarCursor);calendarCursor.setDate(calendarCursor.getDate()-1);renderJalaliCalendar();});
  $("jalaliNext")?.addEventListener("click",()=>{calendarCursor=monthStart(calendarCursor);calendarCursor.setDate(calendarCursor.getDate()+40);renderJalaliCalendar();});

  function renderAll(){renderTasks();renderDossiers();renderEvents();renderTraining();renderDashboard();renderJalaliCalendar();window.dispatchEvent(new CustomEvent("kfox:training-data-updated"));}
  $("taskList")?.addEventListener("change",async event=>{
    const select=event.target.closest("[data-task-status]");if(!select)return;
    const task=data.tasks.find(x=>x.id===select.dataset.taskStatus);if(!task)return;
    const nextStatus=select.value;
    if(nextStatus==="done"&&task.notificationId){
      try{await window.KFOX_CANCEL_NOTIFICATION(task.notificationId);task.notificationId=null;}
      catch(error){select.value=task.status;feedback("لغو یادآوری وظیفه انجام نشد: "+(error?.message||"خطای ناشناخته"));return;}
    }
    task.status=nextStatus;task.done=task.status==="done";task.updated=dateNow();await persist();renderAll();
  });
  $("taskList")?.addEventListener("click",async event=>{
    const button=event.target.closest("[data-task-delete]");if(!button)return;
    const task=data.tasks.find(x=>x.id===button.dataset.taskDelete);if(!task)return;
    if(task.notificationId){
      try{await window.KFOX_CANCEL_NOTIFICATION(task.notificationId);}
      catch(error){feedback("حذف یادآوری وظیفه انجام نشد: "+(error?.message||"خطای ناشناخته"));return;}
    }
    data.tasks=data.tasks.filter(x=>x.id!==task.id);await persist();renderAll();
  });

  $("taskForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const title=$("taskTitle").value.trim(),date=$("taskDue").value,time=$("taskDueTime").value,lead=$("taskReminderMinutes").value;
    const submit=e.target.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
    try{
      const notificationId=await createWorkspaceReminder("calendar","مهلت وظیفه: "+title,"یادآوری مهلت وظیفه در K-FOX",date,time,lead);
      data.tasks.push({id:uid(),title,project:$("taskProject").value.trim(),priority:$("taskPriority").value,due:date,dueTime:time,notificationId,status:"pending",done:false,created:dateNow(),updated:dateNow()});
      e.target.reset();await persist();renderAll();feedback(notificationId?"وظیفه و یادآوری آن ثبت شد.":"وظیفه ثبت شد.");
    }catch(error){feedback("ثبت وظیفه یا یادآوری انجام نشد: "+(error?.message||"خطای ناشناخته"));}
    finally{if(submit)submit.disabled=false;}
  });
  $("dossierForm")?.addEventListener("submit",e=>{e.preventDefault();data.dossiers.push({id:uid(),title:$("dossierTitle").value.trim(),category:$("dossierCategory").value,notes:$("dossierNotes").value.trim(),created:dateNow()});e.target.reset();persist().then(renderAll);});
  $("trainingForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const missionId=$("trainingMission").value,topic=$("trainingTopic").value.trim(),date=$("trainingDate").value,time=$("trainingTime").value,minutes=Number($("trainingDuration").value);
    if(!missionId){feedback("اول مأموریت مربوط به این مطالعه را انتخاب کن.");return;}
    let notificationId=null;
    try{notificationId=await createWorkspaceReminder("training","جلسه آموزشی: "+topic,minutes+" دقیقه · K-FOX Training",date,time,$("trainingReminderMinutes").value);}
    catch(error){feedback("یادآوری جلسه ثبت نشد: "+(error?.message||"خطای ناشناخته"));return;}
    data.training.push({id:uid(),missionId,topic,minutes,date,time,notificationId,created:dateNow()});
    e.target.reset();await persist();renderAll();feedback(notificationId?"جلسه آموزشی و یادآوری آن ثبت شد.":"جلسه آموزشی ثبت شد.");
  });
  $("eventForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const title=$("eventTitle").value.trim(),date=$("eventDate").value,time=$("eventTime").value,note=$("eventNote").value.trim();
    let notificationId=null;
    try{notificationId=await createWorkspaceReminder("calendar","رویداد تقویم: "+title,note||"یادآوری رویداد در K-FOX",date,time,$("eventReminderMinutes").value);}
    catch(error){feedback("یادآوری رویداد ثبت نشد: "+(error?.message||"خطای ناشناخته"));return;}
    data.events.push({id:uid(),title,date,time,note,notificationId,created:dateNow()});
    e.target.reset();await persist();renderAll();feedback(notificationId?"رویداد و یادآوری آن ثبت شد.":"رویداد ثبت شد.");
  });
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
    db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>{if(session?.user)sync(session.user).catch(err=>console.warn("KFOX workspace auth sync:",err));else{userId=null;ready=false;}},0);});
  }
  renderAll();
})();