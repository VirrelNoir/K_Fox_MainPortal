(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const db = window.KFOX_SUPABASE;
  const bucket = "personal-archive";
  const uid = () => window.crypto?.randomUUID?.() || "gym-" + Date.now();
  const localDate = (date=new Date()) => [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  const fa = n => new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(Number(n)||0);
  const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const jalaliParts = value => {
    const parts=new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn",{year:"numeric",month:"numeric",day:"numeric"}).formatToParts(new Date(value+"T12:00:00"));
    const get=type=>Number(parts.find(p=>p.type===type)?.value);
    return {year:get("year"),month:get("month"),day:get("day")};
  };
  const toJalali = value => { if(!value)return ""; const p=jalaliParts(value); return [p.year,String(p.month).padStart(2,"0"),String(p.day).padStart(2,"0")].join("/"); };
  const toGregorian = value => {
    const raw=String(value||"").trim().replace(/[۰-۹]/g,c=>"۰۱۲۳۴۵۶۷۸۹".indexOf(c)).replace(/[٠-٩]/g,c=>"٠١٢٣٤٥٦٧٨٩".indexOf(c)).replace(/[-.]/g,"/");
    const m=raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if(!m)return null;
    const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]); if(mo<1||mo>12||day<1||day>31)return null;
    const guess=new Date(y+621,mo+2,day,12);
    for(let offset=-16;offset<=16;offset++){const d=new Date(guess);d.setDate(d.getDate()+offset);const iso=localDate(d),p=jalaliParts(iso);if(p.year===y&&p.month===mo&&p.day===day)return iso;}
    return null;
  };
  const dateLabel = value => value ? new Intl.DateTimeFormat("fa-IR-u-ca-persian",{day:"numeric",month:"long",year:"numeric"}).format(new Date(value+"T12:00:00")) : "—";
  const getData = () => {
    const d = missionMeta("_gym");
    d.profile = d.profile || {};
    d.weeklyLogs = Array.isArray(d.weeklyLogs) ? d.weeklyLogs : [];
    d.photos = Array.isArray(d.photos) ? d.photos : [];
    return d;
  };
  const save = async d => { missionStates._gym=d; await saveMissionMeta(); };
  const setFeedback = (id,msg,bad=false) => {const el=$(id);if(el){el.textContent=msg;el.style.color=bad?"#d58a7e":"var(--green)";}};
  let currentUser = null;
  function weekStart(value) {
    const d = new Date((value||localDate())+"T12:00:00");
    d.setDate(d.getDate() - ((d.getDay()+6)%7));
    return localDate(d);
  }
  function renderProfile() {
    const d=getData(),p=d.profile,old=missionMeta("_weight");
    $("gymHeight").value=p.heightCm??"";
    $("gymStartWeight").value=p.startWeight??old.startWeight??"";
    $("gymCurrentWeight").value=p.currentWeight??(d.weeklyLogs.at(-1)?.weight??old.logs?.at(-1)?.weight??"");
    $("gymBodyFat").value=p.bodyFat??"";
  }
  function renderOverview() {
    const d=getData(),p=d.profile,logs=d.weeklyLogs,latest=logs.at(-1),week=weekStart(localDate());
    const thisWeek=logs.filter(x=>weekStart(x.date)===week);
    const sessions=thisWeek.reduce((s,x)=>s+Number(x.sessions||0),0),hours=thisWeek.reduce((s,x)=>s+Number(x.hours||0),0);
    const weight=Number(p.currentWeight||latest?.weight||0),start=Number(p.startWeight||0);
    const fat=p.bodyFat??latest?.bodyFat;
    const cards=[["وزن فعلی",weight?fa(weight)+" kg":"—","کیلوگرم"],["قد",p.heightCm?fa(p.heightCm)+" cm":"—","سانتی‌متر"],["چربی بدن",fat!==undefined&&fat!==null&&fat!==""?fa(fat)+"٪":"—","درصد"],["تمرین این هفته",fa(sessions)+" جلسه","مجموع "+fa(hours)+" ساعت"]];
    $("gymOverview").innerHTML=cards.map(x=>'<div class="gym-stat"><small>'+x[0]+'</small><strong>'+x[1]+'</strong><span>'+x[2]+'</span></div>').join("");
    const cutoff=localDate(new Date(Date.now()-30*86400000));
    const recent=logs.filter(x=>x.date>=cutoff&&x.weight!==null&&x.weight!==undefined).sort((a,b)=>a.date.localeCompare(b.date));
    const loss=recent.length>1?Number(recent[0].weight)-Number(recent.at(-1).weight):0;
    $("gymWeightSummary").innerHTML='<div><b>'+(loss?fa(loss)+" kg":"—")+'</b><small>تغییر وزن در ۳۰ روز اخیر</small></div><div><b>'+fa(sessions)+' / '+fa(hours)+'</b><small>جلسه / ساعت این هفته</small></div><div><b>'+(start&&weight?fa(start-weight)+" kg":"—")+'</b><small>تغییر از وزن شروع</small></div>';
    $("gymWeekCount").textContent=fa(logs.length)+" گزارش";
    $("gymWeekHistory").innerHTML=logs.length?logs.slice().reverse().map(x=>'<article class="workspace-item"><div class="workspace-item-main"><h3>'+dateLabel(x.date)+' · '+fa(x.sessions)+' جلسه / '+fa(x.hours)+' ساعت</h3><p>وزن: '+(x.weight?fa(x.weight)+" کیلوگرم":"ثبت‌نشده")+' · اثر تمرین: '+fa(x.impact||0)+'/5'+(x.strengthNote?" · "+esc(x.strengthNote):"")+'</p>'+(x.positive?'<p>مثبت: '+esc(x.positive)+'</p>':'')+(x.challenge?'<p>نیاز به اصلاح: '+esc(x.challenge)+'</p>':'')+'</div></article>').join(""):'<div class="empty-state">گزارش هفتگی هنوز ثبت نشده است.</div>';
    const chart=recent.slice(-8),max=chart.length?Math.max(...chart.map(x=>Number(x.weight||0))):0,min=chart.length?Math.min(...chart.map(x=>Number(x.weight||0))):0;
    $("gymWeightChart").innerHTML=chart.length?chart.map(x=>{const height=max===min?55:Math.max(8,35+(Number(x.weight)-min)/(max-min)*75);return '<div class="gym-chart-bar"><b>'+fa(x.weight)+'</b><i style="height:'+height+'px"></i><small>'+dateLabel(x.date)+'</small></div>';}).join(""):'<div class="empty-state">پس از ثبت وزن‌های هفتگی، نمودار روند نمایش داده می‌شود.</div>';
  }
  async function renderPhotos() {
    const el=$("gymPhotoGallery"),d=getData();if(!el)return;
    if(!d.photos.length){el.innerHTML='<div class="empty-state">هنوز تصویری ثبت نشده است.</div>';return;}
    if(!currentUser){el.innerHTML='<div class="empty-state">برای دیدن تصاویر خصوصی، از بخش آرشیو شخصی وارد حساب شو.</div>';return;}
    const rows=await Promise.all(d.photos.slice().reverse().map(async p=>{
      const signed=await db.storage.from(bucket).createSignedUrl(p.path,3600);
      return {p,url:signed.error?"":signed.data.signedUrl};
    }));
    el.innerHTML=rows.map(({p,url})=>'<article class="gym-photo-card">'+(url?'<img src="'+url+'" alt="تصویر پیشرفت هفتگی" loading="lazy">':'<div class="empty-state">تصویر در دسترس نیست</div>')+'<small>'+dateLabel(p.date)+' · '+esc(p.note||"ثبت پیشرفت")+'</small><button type="button" class="workspace-delete" data-gym-photo-delete="'+esc(p.id)+'">حذف تصویر</button></article>').join("");
  }
  $("gymProfileForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const d=getData();d.profile={heightCm:Number($("gymHeight").value)||null,startWeight:Number($("gymStartWeight").value)||null,currentWeight:Number($("gymCurrentWeight").value)||null,bodyFat:$("gymBodyFat").value===""?null:Number($("gymBodyFat").value)};
    await save(d);renderOverview();setFeedback("gymPhotoFeedback","مشخصات بدن ذخیره شد.");
  });
  $("gymWeeklyForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const d=getData(),date=toGregorian($("gymWeekDate").value)||""; if(!date){setFeedback("gymPhotoFeedback","تاریخ شمسی را به شکل ۱۴۰۵/۰۸/۱۳ وارد کن.",true);return;}
    const row={id:uid(),date,sessions:Number($("gymSessions").value),hours:Number($("gymHours").value),impact:Number($("gymImpact").value),strengthNote:$("gymStrengthNote").value.trim(),weight:$("gymWeeklyWeight").value===""?null:Number($("gymWeeklyWeight").value),bodyFat:$("gymWeeklyFat").value===""?null:Number($("gymWeeklyFat").value),positive:$("gymPositive").value.trim(),challenge:$("gymChallenge").value.trim()};
    const existing=d.weeklyLogs.findIndex(x=>x.date===date);if(existing>=0){row.id=d.weeklyLogs[existing].id;d.weeklyLogs[existing]=row;}else d.weeklyLogs.push(row);
    if(row.weight)d.profile.currentWeight=row.weight;if(row.bodyFat)d.profile.bodyFat=row.bodyFat;
    await save(d);e.target.reset();$("gymWeekDate").value=toJalali(localDate());renderProfile();renderOverview();setFeedback("gymPhotoFeedback","گزارش هفتگی ذخیره شد.");
  });
  $("gymPhotoForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const file=$("gymPhotoFile").files?.[0];if(!file)return;
    if(!currentUser){setFeedback("gymPhotoFeedback","برای بارگذاری تصویر، ابتدا در بخش آرشیو شخصی وارد حساب شو.",true);return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>12*1024*1024){setFeedback("gymPhotoFeedback","فقط JPG، PNG یا WEBP تا حجم ۱۲ مگابایت پذیرفته می‌شود.",true);return;}
    const d=getData(),path=currentUser.id+"/gym-progress/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    setFeedback("gymPhotoFeedback","در حال بارگذاری تصویر خصوصی...");
    const uploaded=await db.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});
    if(uploaded.error){setFeedback("gymPhotoFeedback","بارگذاری ناموفق بود: "+uploaded.error.message,true);return;}
    d.photos.push({id:uid(),path,date:localDate(),note:$("gymPhotoNote").value.trim()});
    await save(d);e.target.reset();await renderPhotos();setFeedback("gymPhotoFeedback","تصویر در آرشیو خصوصی ذخیره شد.");
  });
  $("gymPhotoGallery")?.addEventListener("click",async e=>{
    const button=e.target.closest("[data-gym-photo-delete]");if(!button||!currentUser)return;
    const d=getData(),photo=d.photos.find(x=>x.id===button.dataset.gymPhotoDelete);if(!photo)return;
    if(!confirm("این تصویر پیشرفت از فضای خصوصی حذف شود؟"))return;
    const removed=await db.storage.from(bucket).remove([photo.path]);if(removed.error){setFeedback("gymPhotoFeedback","حذف تصویر ناموفق بود: "+removed.error.message,true);return;}
    d.photos=d.photos.filter(x=>x.id!==photo.id);await save(d);renderPhotos();
  });
  async function setUser(session){currentUser=session?.user||null;if(currentUser&&typeof window.KFOX_SYNC_OPERATIONAL_DATA==="function"){try{await window.KFOX_SYNC_OPERATIONAL_DATA(currentUser.id);}catch(error){console.warn("K-FOX gym-triggered operational sync:",error);}}await renderPhotos();}
  if(db){db.auth.getSession().then(({data})=>setUser(data.session));db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>setUser(session).catch(error=>console.warn("KFOX gym auth:",error)),0);});}
  const monday=weekStart(localDate());$("gymWeekDate").value=toJalali(monday);
  renderProfile();renderOverview();renderPhotos();

  // Notifications are handled by gym-push.js through Supabase Web Push.
  const refreshGymPanels=()=>{
    renderProfile();
    renderOverview();
    renderPhotos().catch(error=>console.warn("KFOX gym refresh:",error));
  };
  window.KFOX_REFRESH_GYM=refreshGymPanels;
  // The cloud sync can finish before this separately loaded module registers
  // its listener. Check the ready flag as well as listening for future syncs.
  window.addEventListener("kfox:operational-data-synced",refreshGymPanels);
  if(window.KFOX_OPERATIONAL_DATA_READY) refreshGymPanels();
})();