(() => {
  "use strict";
  const db = window.KFOX_SUPABASE;
  const $ = id => document.getElementById(id);
  const KEY = "kfox_workspace_v2";
  const empty = () => ({tasks:[],dossiers:[],events:[],training:[],dentistryClasses:[],dentistryTasks:[],dentistryNotes:[]});
  let data = loadLocal(), userId = null, ready = false, syncing = false;
  let editingTaskId=null,editingEventId=null;
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
  function enhanceTimeInput(input){
    if(!input||input.dataset.kfoxTimeEnhanced==="true")return;
    input.dataset.kfoxTimeEnhanced="true";
    const required=input.required;
    input.required=false;
    input.classList.add("kfox-time-native");
    const wrap=document.createElement("div");wrap.className="kfox-time-picker";wrap.dir="ltr";
    const hour=document.createElement("input");hour.type="number";hour.min="1";hour.max="12";hour.step="1";hour.inputMode="numeric";hour.placeholder="HH";hour.setAttribute("aria-label","ساعت");
    const colon=document.createElement("span");colon.textContent=":";
    const minute=document.createElement("input");minute.type="number";minute.min="0";minute.max="59";minute.step="1";minute.inputMode="numeric";minute.placeholder="MM";minute.setAttribute("aria-label","دقیقه");
    const period=document.createElement("select");period.setAttribute("aria-label","قبل‌ازظهر یا بعدازظهر");
    period.add(new Option("AM","AM"));period.add(new Option("PM","PM"));
    hour.required=required;minute.required=required;
    wrap.append(hour,colon,minute,period);input.insertAdjacentElement("afterend",wrap);
    const sync=()=>{
      const h=Number(hour.value),m=Number(minute.value);
      const partial=!!hour.value!==!!minute.value;
      hour.setCustomValidity(partial&&!hour.value?"ساعت را هم وارد کن.":(hour.value&&(h<1||h>12)?"ساعت باید بین ۱ تا ۱۲ باشد.":""));
      minute.setCustomValidity(partial&&!minute.value?"دقیقه را هم وارد کن.":(minute.value&&(m<0||m>59)?"دقیقه باید بین ۰۰ تا ۵۹ باشد.":""));
      if(!hour.value&&!minute.value){input.value="";return;}
      if(!hour.value||!minute.value||h<1||h>12||m<0||m>59){input.value="";return;}
      const h24=(h%12)+(period.value==="PM"?12:0);
      input.value=String(h24).padStart(2,"0")+":"+String(m).padStart(2,"0");
      input.dispatchEvent(new Event("change",{bubbles:true}));
    };
    const read=()=>{
      if(!input.value){hour.value="";minute.value="";period.value="AM";return;}
      const [h,m]=input.value.split(":").map(Number);
      hour.value=String(h%12||12);minute.value=String(m).padStart(2,"0");period.value=h>=12?"PM":"AM";
      hour.setCustomValidity("");minute.setCustomValidity("");
    };
    [hour,minute,period].forEach(control=>control.addEventListener("input",sync));
    period.addEventListener("change",sync);
    input.addEventListener("change",read);
    input.form?.addEventListener("reset",()=>window.setTimeout(read,0));
    read();
  }
  function enhanceTimeInputs(root=document){root.querySelectorAll('input[type="time"]').forEach(enhanceTimeInput);}
  function setTimeInputValue(id,value){const input=$(id);if(!input)return;input.value=value||"";input.dispatchEvent(new Event("change",{bubbles:true}));}
  enhanceTimeInputs();
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
    el.innerHTML=sorted.length?sorted.map(t=>'<article id="task-record-'+esc(t.id)+'" class="workspace-item task-item '+(t.status==="done"?"is-done":t.status==="blocked"?"is-blocked":"")+'"><div class="workspace-item-main"><h3>'+esc(t.title)+'</h3><p>'+esc(t.project||"بدون دسته‌بندی")+' · '+(t.priority==="urgent"?"فوری":t.priority==="high"?"مهم":"عادی")+' · '+(t.due?jalaliDate(t.due)+(t.dueTime?" · "+t.dueTime:""):"بدون مهلت")+(t.notificationId?" · یادآوری ثبت‌شده":"")+'</p><small class="task-status-label">'+labels[t.status]+'</small></div><label class="task-status-control">وضعیت<select data-task-status="'+esc(t.id)+'"><option value="pending" '+(t.status==="pending"?"selected":"")+'>در انتظار</option><option value="in_progress" '+(t.status==="in_progress"?"selected":"")+'>در حال انجام</option><option value="blocked" '+(t.status==="blocked"?"selected":"")+'>مشکل دارم</option><option value="done" '+(t.status==="done"?"selected":"")+'>تکمیل‌شده</option></select></label><button type="button" class="archive-action" data-task-edit="'+esc(t.id)+'">ویرایش</button><button class="workspace-delete" data-task-delete="'+esc(t.id)+'">حذف</button></article>').join(""):'<div class="empty-state">هنوز وظیفه‌ای ثبت نشده است.</div>';
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
      return item(record.title,detail,when,`<button type="button" class="archive-action" data-event-edit="${esc(record.id)}">ویرایش</button><button class="workspace-delete" data-event-delete="${esc(record.id)}">حذف</button>`);
    }).join(""):'<div class="empty-state">NO EVENTS SCHEDULED</div>';
    el.querySelectorAll(".workspace-item").forEach((row,index)=>{row.id="event-record-"+sorted[index].id;row.classList.add("calendar-event-detail");});
    el.querySelectorAll("[data-event-edit]").forEach(button=>button.onclick=()=>beginEventEdit(button.dataset.eventEdit));
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
    ["calendarEntryDate","trainingDate","dentistryEntryDate"].forEach(id=>{
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
  const localIso=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
  function dayEntries(iso){
    return [
      ...data.events.filter(x=>x.date===iso).map(x=>({kind:"event",id:x.id,title:x.title,detail:(x.note||"رویداد")+(x.notificationId?" · یادآوری فعال":""),target:"event-record-"+x.id})),
      ...data.tasks.filter(x=>x.due===iso).map(x=>({kind:"task",id:x.id,title:x.title,detail:"وظیفه · "+(x.project||"بدون دسته‌بندی")+(x.notificationId?" · یادآوری فعال":""),target:"task-record-"+x.id}))
    ];
  }
  function renderSelectedDay(){
    const panel=$("calendarDayDetails"),list=$("calendarDayItems"),heading=$("calendarDayTitle");
    if(!panel||!list||!heading)return;
    if(!selectedCalendarIso){panel.hidden=true;return;}
    const entries=dayEntries(selectedCalendarIso);
    heading.textContent=jalaliDate(selectedCalendarIso);
    panel.hidden=false;
    syncCalendarEntryFields();
    list.innerHTML=entries.length?entries.map(x=>'<button type="button" class="calendar-day-entry '+x.kind+'" data-calendar-target="'+esc(x.target)+'"><b>'+esc(x.title)+'</b><small>'+esc(x.detail)+'</small></button>').join(""):'<div class="empty-state">برای این روز هنوز وظیفه یا رویدادی ثبت نشده است.</div>';
    list.querySelectorAll("[data-calendar-target]").forEach(button=>button.addEventListener("click",()=>{
      const target=document.getElementById(button.dataset.calendarTarget);
      target?.scrollIntoView({behavior:"smooth",block:"center"});
      target?.classList.add("calendar-item-focus");
      window.setTimeout(()=>target?.classList.remove("calendar-item-focus"),1800);
    }));
  }
  function renderJalaliCalendar(){
    const grid=$("jalaliCalendarGrid"),title=$("jalaliCalendarTitle");if(!grid||!title)return;
    const first=monthStart(calendarCursor),current=jalaliParts(first),today=new Date();
    title.textContent=jalaliMonthName(first);
    const weekdays=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
    const eventDays=new Set(data.events.map(item=>item.date).filter(Boolean));
    const purpleDays=new Set([...data.tasks.map(x=>x.due),...data.events.filter(x=>x.notificationId).map(x=>x.date)].filter(Boolean));
    grid.innerHTML=weekdays.map(x=>'<div class="jalali-calendar-weekday">'+x+'</div>').join("");
    const offset=(first.getDay()+1)%7;
    let d=new Date(first);d.setDate(first.getDate()-offset);
    for(let i=0;i<42;i++){
      const p=jalaliParts(d),iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
      const same=p.year===current.year&&p.month===current.month;
      const isToday=d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
      const cell=document.createElement("button");
      cell.type="button";
      cell.className="jalali-calendar-day"+(same?"":" outside")+(isToday?" today":"")+(eventDays.has(iso)?" has-event":"")+(purpleDays.has(iso)?" has-reminder":"")+(selectedCalendarIso===iso?" selected":"");
      cell.textContent=new Intl.NumberFormat("fa-IR").format(p.day);
      cell.title=jalaliDate(iso)+(eventDays.has(iso)?" • رویداد ثبت‌شده":"")+(purpleDays.has(iso)?" • اعلان یا وظیفه":"");
      cell.setAttribute("aria-label",jalaliDate(iso)+"؛ نمایش موارد ثبت‌شده");
      cell.addEventListener("click",()=>{
        selectedCalendarIso=iso;
        const hidden=$("calendarEntryDate"),display=$("calendarEntryDateDisplay");
        if(hidden)hidden.value=iso;
        if(display)display.value=jalaliDate(iso);
        renderJalaliCalendar();renderSelectedDay();
        $("calendarDayDetails")?.scrollIntoView({behavior:"smooth",block:"center"});
      });
      grid.appendChild(cell);d.setDate(d.getDate()+1);
    }
    renderSelectedDay();
  }
  $("jalaliPrev")?.addEventListener("click",()=>{calendarCursor=monthStart(calendarCursor);calendarCursor.setDate(calendarCursor.getDate()-1);renderJalaliCalendar();});
  $("jalaliNext")?.addEventListener("click",()=>{calendarCursor=monthStart(calendarCursor);calendarCursor.setDate(calendarCursor.getDate()+40);renderJalaliCalendar();});
  window.addEventListener("kfox:notifications-updated",()=>{renderJalaliCalendar();renderSelectedDay();});


  // Independent Dentistry Academy 2 workspace.
  const dentalWeekdays=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"];
  const dentalTypeLabels={task:"وظیفه",exam:"امتحان",article:"مقاله",presentation:"ارائه"};
  let dentistryCursor=new Date();dentistryCursor.setHours(12,0,0,0);
  let dentistrySelectedIso="",dentistryEditingId=null;
  let dentistryClassFormDay="";
  function renderDentistryClasses(){
    const root=$("dentistryClassRows");if(!root)return;
    // Ignore the old empty weekday placeholders and keep real saved classes.
    data.dentistryClasses=data.dentistryClasses.filter(row=>String(row.course||"").trim());
    data.dentistryClasses.forEach(row=>{if(!row.teacher)row.teacher=row.room||"";});
    root.innerHTML=dentalWeekdays.map(day=>{
      const rows=data.dentistryClasses.filter(row=>row.day===day).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));
      const list=rows.length?rows.map(row=>'<div class="dentistry-class-row"><time>'+esc(row.time||"—")+'</time><div><strong>'+esc(row.course)+'</strong><small>'+esc(row.teacher||"بدون نام استاد")+'</small></div><button type="button" class="workspace-delete" data-class-delete="'+esc(row.id)+'" aria-label="حذف کلاس">×</button></div>').join(""):'<div class="dentistry-class-empty">هنوز کلاسی برای این روز ثبت نشده.</div>';
      const form= dentistryClassFormDay===day ? '<form class="dentistry-class-form" data-class-form="'+esc(day)+'"><label>ساعت کلاس<input name="time" type="time" required></label><label>نام کلاس<input name="course" maxlength="100" placeholder="مثلاً آناتومی" required></label><label>نام معلم / استاد<input name="teacher" maxlength="100" placeholder="نام استاد" required></label><div class="dentistry-class-form-actions"><button class="primary-btn" type="submit">ذخیره کلاس</button><button class="archive-action" type="button" data-class-cancel>انصراف</button></div></form>' : "";
      return '<section class="dentistry-weekday"><div class="dentistry-weekday-head"><h3>'+day+'</h3><button type="button" class="archive-action" data-class-add="'+day+'">＋ افزودن کلاس</button></div><div class="dentistry-class-list">'+list+'</div>'+form+'</section>';
    }).join("");
    enhanceTimeInputs(root);
    root.querySelectorAll("[data-class-add]").forEach(button=>button.addEventListener("click",()=>{dentistryClassFormDay=button.dataset.classAdd;renderDentistryClasses();root.querySelector("[data-class-form] input")?.focus();}));
    root.querySelectorAll("[data-class-cancel]").forEach(button=>button.addEventListener("click",()=>{dentistryClassFormDay="";renderDentistryClasses();}));
    root.querySelectorAll("[data-class-form]").forEach(form=>form.addEventListener("submit",async event=>{
      event.preventDefault();const values=new FormData(form),course=String(values.get("course")||"").trim(),time=String(values.get("time")||""),teacher=String(values.get("teacher")||"").trim();
      if(!course||!time||!teacher)return;
      data.dentistryClasses.push({id:uid(),day:form.dataset.classForm,course,time,teacher});
      dentistryClassFormDay="";await persist();renderDentistryClasses();
      $("dentistryClassFeedback").textContent="کلاس ثبت و بر اساس ساعت مرتب شد.";
    }));
    root.querySelectorAll("[data-class-delete]").forEach(button=>button.addEventListener("click",async()=>{data.dentistryClasses=data.dentistryClasses.filter(row=>row.id!==button.dataset.classDelete);await persist();renderDentistryClasses();}));
  }
  function renderDentistrySelectedDay(){
    const panel=$("dentistryDayDetails"),list=$("dentistryDayItems"),heading=$("dentistryDayTitle");if(!panel||!list||!heading)return;
    if(!dentistrySelectedIso){panel.hidden=true;return;}panel.hidden=false;heading.textContent=jalaliDate(dentistrySelectedIso);
    const entries=data.dentistryTasks.filter(x=>x.date===dentistrySelectedIso);
    list.innerHTML=entries.length?entries.map(x=>'<div class="calendar-day-entry '+esc(x.type)+'"><b>'+esc(x.title)+'</b><small>'+esc(dentalTypeLabels[x.type]||"وظیفه")+(x.time?" · "+esc(x.time):"")+(x.done?" · تکمیل‌شده":"")+'</small></div>').join(""):'<div class="empty-state">برای این روز هنوز مورد تحصیلی ثبت نشده است.</div>';
  }
  function renderDentistryCalendar(){
    const grid=$("dentistryCalendarGrid"),title=$("dentistryCalendarTitle");if(!grid||!title)return;
    const first=monthStart(dentistryCursor),current=jalaliParts(first),today=new Date();title.textContent=jalaliMonthName(first);
    const weekdays=["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"],marked=new Set(data.dentistryTasks.map(x=>x.date).filter(Boolean));
    grid.innerHTML=weekdays.map(x=>'<div class="jalali-calendar-weekday">'+x+'</div>').join("");
    const offset=(first.getDay()+1)%7;let d=new Date(first);d.setDate(first.getDate()-offset);
    for(let i=0;i<42;i++){const p=jalaliParts(d),iso=isoFromDate(d),same=p.year===current.year&&p.month===current.month,todayMatch=d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
      const cell=document.createElement("button");cell.type="button";cell.className="jalali-calendar-day"+(same?"":" outside")+(todayMatch?" today":"")+(marked.has(iso)?" has-event":"")+(dentistrySelectedIso===iso?" selected":"");cell.textContent=new Intl.NumberFormat("fa-IR").format(p.day);cell.title=jalaliDate(iso);
      cell.addEventListener("click",()=>{dentistrySelectedIso=iso;$("dentistryEntryDate").value=iso;$("dentistryEntryDateDisplay").value=jalaliDate(iso);renderDentistryCalendar();renderDentistrySelectedDay();$("dentistryDayDetails").scrollIntoView({behavior:"smooth",block:"center"});});
      grid.appendChild(cell);d.setDate(d.getDate()+1);}
    renderDentistrySelectedDay();
  }
  $("dentistryCalendarPrev")?.addEventListener("click",()=>{dentistryCursor=monthStart(dentistryCursor);dentistryCursor.setDate(dentistryCursor.getDate()-1);renderDentistryCalendar();});
  $("dentistryCalendarNext")?.addEventListener("click",()=>{dentistryCursor=monthStart(dentistryCursor);dentistryCursor.setDate(dentistryCursor.getDate()+40);renderDentistryCalendar();});
  function renderDentistryTasks(){
    const el=$("dentistryTaskList");if(!el)return;const sorted=[...data.dentistryTasks].sort((a,b)=>(a.date||"").localeCompare(b.date||""));$("dentistryTaskSummary").textContent=sorted.length+" مورد";
    el.innerHTML=sorted.length?sorted.map(x=>'<article class="workspace-item dentistry-academic-item '+(x.done?"is-done":"")+'" id="dentistry-record-'+esc(x.id)+'"><div class="workspace-item-main"><h3>'+esc(x.title)+'</h3><p>'+esc(dentalTypeLabels[x.type]||"وظیفه")+' · '+esc(jalaliDate(x.date))+(x.time?" · "+esc(x.time):"")+(x.notificationId?" · یادآوری فعال":"")+'</p><small class="task-status-label">'+(x.done?"تکمیل‌شده":"در انتظار")+'</small><p>'+esc(x.note||"")+'</p></div><button type="button" class="archive-action" data-dental-edit="'+esc(x.id)+'">ویرایش</button><button type="button" class="archive-action" data-dental-done="'+esc(x.id)+'">'+(x.done?"بازگردانی":"تکمیل")+'</button><button type="button" class="workspace-delete" data-dental-delete="'+esc(x.id)+'">حذف</button></article>').join(""):'<div class="empty-state">هنوز وظیفه، امتحان، مقاله یا ارائه‌ای ثبت نشده است.</div>';
    el.querySelectorAll("[data-dental-edit]").forEach(b=>b.onclick=()=>beginDentistryEdit(b.dataset.dentalEdit));
    el.querySelectorAll("[data-dental-done]").forEach(b=>b.onclick=async()=>{const row=data.dentistryTasks.find(x=>x.id===b.dataset.dentalDone);if(!row)return;row.done=!row.done;await persist();renderDentistry();});
    el.querySelectorAll("[data-dental-delete]").forEach(b=>b.onclick=async()=>{const row=data.dentistryTasks.find(x=>x.id===b.dataset.dentalDelete);if(!row)return;try{if(row.notificationId)await window.KFOX_CANCEL_NOTIFICATION(row.notificationId);}catch(error){feedback("لغو یادآوری ناموفق بود: "+error.message);return;}data.dentistryTasks=data.dentistryTasks.filter(x=>x.id!==row.id);await persist();renderDentistry();});
  }
  function beginDentistryEdit(id){
    const row=data.dentistryTasks.find(x=>x.id===id);if(!row)return;dentistryEditingId=id;
    $("dentistryEntryType").value=row.type;$("dentistryEntryTitle").value=row.title;$("dentistryEntryDate").value=row.date;$("dentistryEntryDateDisplay").value=jalaliDate(row.date);setTimeInputValue("dentistryEntryTime",row.time||"");$("dentistryEntryNote").value=row.note||"";$("dentistryEntryReminder").value=inferReminderLead(row.notificationId,row.date,row.time);
    const form=$("dentistryEntryForm"),submit=form.querySelector('[type="submit"]');submit.textContent="ذخیره تغییرات";
    let cancel=form.querySelector("[data-edit-cancel]");if(!cancel){cancel=document.createElement("button");cancel.type="button";cancel.className="archive-action";cancel.dataset.editCancel="";submit.after(cancel);}
    cancel.textContent="انصراف";cancel.onclick=()=>{dentistryEditingId=null;form.reset();submit.textContent="ثبت در تقویم تحصیلی";cancel.remove();};$("dentistryDayDetails").scrollIntoView({behavior:"smooth",block:"center"});
  }
  $("dentistryEntryForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const type=$("dentistryEntryType").value,title=$("dentistryEntryTitle").value.trim(),date=$("dentistryEntryDate").value,time=$("dentistryEntryTime").value,lead=$("dentistryEntryReminder").value,note=$("dentistryEntryNote").value.trim();
    if(!date){feedback("یک روز از تقویم تحصیلی انتخاب کن.");return;}const submit=e.target.querySelector('[type="submit"]');submit.disabled=true;
    try{let row=dentistryEditingId?data.dentistryTasks.find(x=>x.id===dentistryEditingId):null;if(dentistryEditingId&&!row)throw new Error("مورد برای ویرایش پیدا نشد.");
      const notificationId=row?await syncWorkspaceReminder(row.notificationId,"دانشکده: "+title,note||dentalTypeLabels[type],date,time,lead):await createWorkspaceReminder("calendar","دانشکده: "+title,note||dentalTypeLabels[type],date,time,lead);
      if(row)Object.assign(row,{type,title,date,time,note,notificationId,updated:dateNow()});else data.dentistryTasks.push({id:uid(),type,title,date,time,note,notificationId,done:false,created:dateNow()});
      dentistryEditingId=null;e.target.reset();submit.textContent="ثبت در تقویم تحصیلی";e.target.querySelector("[data-edit-cancel]")?.remove();dentistrySelectedIso=date;await persist();renderDentistry();feedback(lead?"مورد تحصیلی و یادآوری ثبت شد.":"مورد تحصیلی بدون اعلان ثبت شد.");$("dentistryEntryDate").value=date;$("dentistryEntryDateDisplay").value=jalaliDate(date);
    }catch(error){feedback("ثبت مورد تحصیلی انجام نشد: "+(error?.message||"خطای ناشناخته"));}finally{submit.disabled=false;}
  });
  function renderDentistryNotes(){const el=$("dentistryQuickNotes");if(!el)return;if(document.activeElement!==el)el.value=data.dentistryNotes[0]?.text||"";}
  $("dentistryQuickNotes")?.addEventListener("input",()=>{data.dentistryNotes=[{id:"notes",text:$("dentistryQuickNotes").value}];$("dentistryNotesFeedback").textContent="در حال ذخیره...";clearTimeout(window.__kfoxDentistryNotesTimer);window.__kfoxDentistryNotesTimer=setTimeout(async()=>{await persist();$("dentistryNotesFeedback").textContent="یادداشت‌ها ذخیره شدند.";},500);});
  function renderDentistry(){renderDentistryClasses();renderDentistryCalendar();renderDentistryTasks();renderDentistryNotes();}
  function renderAll(){renderTasks();renderDossiers();renderEvents();renderTraining();renderDashboard();renderJalaliCalendar();renderDentistry();window.dispatchEvent(new CustomEvent("kfox:training-data-updated"));}
  function finishWorkspaceEdit(formId,defaultLabel){
    const form=$(formId);if(!form)return;
    form.reset();if(formId==="calendarEntryForm")syncCalendarEntryFields();const submit=form.querySelector('button[type="submit"]');if(submit)submit.textContent=defaultLabel;
    form.querySelector("[data-edit-cancel]")?.remove();
  }
  function addWorkspaceCancel(formId,defaultLabel,onCancel){
    const form=$(formId);if(!form)return;
    const submit=form.querySelector('button[type="submit"]');if(submit)submit.textContent="ذخیره تغییرات";
    let cancel=form.querySelector("[data-edit-cancel]");
    if(!cancel){cancel=document.createElement("button");cancel.type="button";cancel.className="archive-action";cancel.dataset.editCancel="";submit?.after(cancel);}
    cancel.textContent="انصراف از ویرایش";cancel.onclick=()=>{onCancel();finishWorkspaceEdit(formId,defaultLabel);};
  }
  function inferReminderLead(id,date,time){
    const reminder=(window.KFOX_NOTIFICATION_CACHE||[]).find(x=>x.id===id);
    if(!reminder||!date||!time)return "";
    const delta=(new Date(date+"T"+time+":00").getTime()-new Date(reminder.scheduled_at).getTime())/60000;
    const match=[0,5,15,30,60].find(x=>Math.abs(x-delta)<1);
    return match===undefined?"":String(match);
  }
  async function syncWorkspaceReminder(id,title,body,date,time,lead){
    if(!lead){if(id)await window.KFOX_CANCEL_NOTIFICATION(id);return null;}
    const scheduledAt=reminderTimestamp(date,time,lead);
    if(id&&typeof window.KFOX_UPDATE_NOTIFICATION==="function"){
      await window.KFOX_UPDATE_NOTIFICATION(id,{module:"calendar",title,body,scheduledAt});return id;
    }
    return await createWorkspaceReminder("calendar",title,body,date,time,lead);
  }
  function syncCalendarEntryFields(){
    const type=$("calendarEntryType")?.value||"task";
    document.querySelectorAll("[data-calendar-task-field]").forEach(el=>el.hidden=type!=="task");
    document.querySelectorAll("[data-calendar-event-field]").forEach(el=>el.hidden=type!=="event");
  }
  $("calendarEntryType")?.addEventListener("change",syncCalendarEntryFields);
  function beginTaskEdit(id){
    const task=data.tasks.find(x=>x.id===id);if(!task)return;editingTaskId=id;editingEventId=null;
    $("calendarEntryType").value="task";$("calendarEntryTitle").value=task.title;$("calendarEntryProject").value=task.project||"";$("calendarEntryPriority").value=task.priority||"normal";
    $("calendarEntryDate").value=task.due||"";$("calendarEntryDateDisplay").value=task.due?jalaliDate(task.due):"";
    setTimeInputValue("calendarEntryTime",task.dueTime||"");$("calendarEntryReminder").value=inferReminderLead(task.notificationId,task.due,task.dueTime);$("calendarEntryNote").value="";
    syncCalendarEntryFields();addWorkspaceCancel("calendarEntryForm","ثبت در تقویم",()=>{editingTaskId=null;});
    $("calendarDayDetails").hidden=false;$("calendarDayDetails").scrollIntoView({behavior:"smooth",block:"center"});$("calendarEntryTitle").focus({preventScroll:true});
  }
  function beginEventEdit(id){
    const record=data.events.find(x=>x.id===id);if(!record)return;editingEventId=id;editingTaskId=null;
    $("calendarEntryType").value="event";$("calendarEntryTitle").value=record.title;$("calendarEntryProject").value="";$("calendarEntryPriority").value="normal";
    $("calendarEntryDate").value=record.date||"";$("calendarEntryDateDisplay").value=record.date?jalaliDate(record.date):"";
    setTimeInputValue("calendarEntryTime",record.time||"");$("calendarEntryNote").value=record.note||"";
    $("calendarEntryReminder").value=inferReminderLead(record.notificationId,record.date,record.time);
    syncCalendarEntryFields();addWorkspaceCancel("calendarEntryForm","ثبت در تقویم",()=>{editingEventId=null;});
    $("calendarDayDetails").hidden=false;$("calendarDayDetails").scrollIntoView({behavior:"smooth",block:"center"});$("calendarEntryTitle").focus({preventScroll:true});
  }
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
    const edit=event.target.closest("[data-task-edit]");if(edit){beginTaskEdit(edit.dataset.taskEdit);return;}
    const button=event.target.closest("[data-task-delete]");if(!button)return;
    const task=data.tasks.find(x=>x.id===button.dataset.taskDelete);if(!task)return;
    if(task.notificationId){
      try{await window.KFOX_CANCEL_NOTIFICATION(task.notificationId);}
      catch(error){feedback("حذف یادآوری وظیفه انجام نشد: "+(error?.message||"خطای ناشناخته"));return;}
    }
    data.tasks=data.tasks.filter(x=>x.id!==task.id);await persist();renderAll();
  });

  $("calendarEntryForm")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const type=$("calendarEntryType").value,title=$("calendarEntryTitle").value.trim(),date=$("calendarEntryDate").value,time=$("calendarEntryTime").value,lead=$("calendarEntryReminder").value;
    const submit=e.target.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
    try{
      if(!date)throw new Error("اول یک روز از تقویم انتخاب کن.");
      if(type==="task"){
        if(editingTaskId){
          const task=data.tasks.find(x=>x.id===editingTaskId);if(!task)throw new Error("وظیفه برای ویرایش پیدا نشد.");
          const notificationId=await syncWorkspaceReminder(task.notificationId,"مهلت وظیفه: "+title,"یادآوری مهلت وظیفه در K-FOX",date,time,lead);
          Object.assign(task,{title,project:$("calendarEntryProject").value.trim(),priority:$("calendarEntryPriority").value,due:date,dueTime:time,notificationId,updated:dateNow()});editingTaskId=null;
        }else{
          const notificationId=await createWorkspaceReminder("calendar","مهلت وظیفه: "+title,"یادآوری مهلت وظیفه در K-FOX",date,time,lead);
          data.tasks.push({id:uid(),title,project:$("calendarEntryProject").value.trim(),priority:$("calendarEntryPriority").value,due:date,dueTime:time,notificationId,status:"pending",done:false,created:dateNow(),updated:dateNow()});
        }
      }else{
        const note=$("calendarEntryNote").value.trim();
        if(editingEventId){
          const record=data.events.find(x=>x.id===editingEventId);if(!record)throw new Error("رویداد برای ویرایش پیدا نشد.");
          const notificationId=await syncWorkspaceReminder(record.notificationId,"رویداد تقویم: "+title,note||"یادآوری رویداد در K-FOX",date,time,lead);
          Object.assign(record,{title,date,time,note,notificationId,updated:dateNow()});editingEventId=null;
        }else{
          const notificationId=await createWorkspaceReminder("calendar","رویداد تقویم: "+title,note||"یادآوری رویداد در K-FOX",date,time,lead);
          data.events.push({id:uid(),title,date,time,note,notificationId,created:dateNow()});
        }
      }
      finishWorkspaceEdit("calendarEntryForm","ثبت در تقویم");e.target.reset();selectedCalendarIso=date;
      await persist();renderAll();feedback(lead?"مورد تقویم همراه با یادآوری ذخیره شد.":"مورد تقویم بدون اعلان ذخیره شد.");
      $("calendarEntryDate").value=date;$("calendarEntryDateDisplay").value=jalaliDate(date);renderSelectedDay();
    }catch(error){feedback("ذخیره در تقویم انجام نشد: "+(error?.message||"خطای ناشناخته"));}
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