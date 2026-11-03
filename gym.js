(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const db = window.KFOX_SUPABASE;
  const bucket = "personal-archive";
  const uid = () => window.crypto?.randomUUID?.() || "gym-" + Date.now();
  const localDate = (date=new Date()) => [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  const fa = n => new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(Number(n)||0);
  const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateLabel = value => value ? new Intl.DateTimeFormat("fa-IR-u-ca-persian",{day:"numeric",month:"long",year:"numeric"}).format(new Date(value+"T12:00:00")) : "—";
  const getData = () => {
    const d = missionMeta("_gym");
    d.profile = d.profile || {};
    d.weeklyLogs = Array.isArray(d.weeklyLogs) ? d.weeklyLogs : [];
    d.nutrition = Array.isArray(d.nutrition) ? d.nutrition : [];
    d.photos = Array.isArray(d.photos) ? d.photos : [];
    d.targets = d.targets || {calories:2000,protein:100};
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
  function renderNutrition() {
    const d=getData(),target=d.targets,logs=d.nutrition.slice().sort((a,b)=>b.date.localeCompare(a.date));
    $("nutritionCalorieTarget").value=target.calories??2000;
    $("nutritionProteinTarget").value=target.protein??100;
    const today=localDate(),entry=logs.find(x=>x.date===today);
    $("nutritionDate").value=entry?.date||today;
    $("nutritionCalories").value=entry?.calories??"";
    $("nutritionProtein").value=entry?.protein??"";
    $("nutritionNote").value=entry?.note??"";
    const assess=x=>{
      const cal=Number(x.calories||0),pro=Number(x.protein||0),ct=Number(x.calorieTarget||target.calories||0),pt=Number(x.proteinTarget||target.protein||0);
      const calorieOk=ct>0&&cal>=ct*.9&&cal<=ct*1.1,proteinOk=pt>0&&pro>=pt;
      if(calorieOk&&proteinOk)return "هر دو هدف در محدوده ثبت‌شده قرار دارند.";
      if(ct>0&&cal<ct*.9)return "کالری کمتر از هدف ثبت شده؛ کم‌خوری را موفقیت تلقی نکن و به انرژی و حال عمومی توجه کن.";
      if(ct>0&&cal>ct*1.1)return "کالری بالاتر از بازه هدف ثبت شده؛ یک روز به‌تنهایی تعیین‌کننده روند نیست.";
      if(!proteinOk)return "پروتئین هنوز به هدف ثبت‌شده نرسیده است.";
      return "گزارش ثبت شد؛ روند چند روزه از یک روز مهم‌تر است.";
    };
    $("nutritionSummary").innerHTML=entry?'<div><b>'+fa(entry.calories)+' kcal</b><small>کالری امروز</small></div><div><b>'+fa(entry.protein)+' g</b><small>پروتئین امروز</small></div>':'<div><b>—</b><small>گزارش امروز ثبت نشده</small></div><div><b>'+fa(target.protein)+' g</b><small>هدف پروتئین</small></div>';
    if(entry)setFeedback("nutritionFeedback",assess(entry));else setFeedback("nutritionFeedback","گزارش امروز هنوز ثبت نشده است.");
    const trend=(days,label)=>{
      const from=new Date();from.setDate(from.getDate()-days+1);const start=localDate(from);
      const rows=logs.filter(x=>x.date>=start&&x.date<=today);
      const avgCal=rows.length?rows.reduce((s,x)=>s+Number(x.calories||0),0)/rows.length:0;
      const avgPro=rows.length?rows.reduce((s,x)=>s+Number(x.protein||0),0)/rows.length:0;
      const onTarget=rows.filter(x=>Number(x.calories)>=Number(x.calorieTarget||target.calories)*.9&&Number(x.calories)<=Number(x.calorieTarget||target.calories)*1.1&&Number(x.protein)>=Number(x.proteinTarget||target.protein)).length;
      const pct=rows.length?Math.round(onTarget/rows.length*100):0;
      return '<div class="nutrition-trend"><small>'+label+' · '+rows.length+' روز ثبت‌شده</small><b>'+fa(avgCal)+' kcal</b><small>میانگین کالری · '+fa(avgPro)+' گرم پروتئین</small><b>'+fa(pct)+'٪</b><small>روزهای منطبق با هر دو هدف</small></div>';
    };
    $("nutritionTrends").innerHTML=trend(7,"۷ روز اخیر")+trend(30,"۳۰ روز اخیر");
    $("nutritionHistory").innerHTML=logs.length?logs.slice(0,14).map(x=>'<article class="nutrition-entry"><strong>'+dateLabel(x.date)+' · '+fa(x.calories)+' kcal / '+fa(x.protein)+' g پروتئین</strong><p>'+esc(assess(x))+'</p>'+(x.note?'<p>'+esc(x.note)+'</p>':'')+'</article>').join(""):'<div class="empty-state">هنوز گزارش تغذیه‌ای ثبت نشده است.</div>';
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
    e.preventDefault();const d=getData(),date=$("gymWeekDate").value||localDate();
    const row={id:uid(),date,sessions:Number($("gymSessions").value),hours:Number($("gymHours").value),impact:Number($("gymImpact").value),strengthNote:$("gymStrengthNote").value.trim(),weight:$("gymWeeklyWeight").value===""?null:Number($("gymWeeklyWeight").value),bodyFat:$("gymWeeklyFat").value===""?null:Number($("gymWeeklyFat").value),positive:$("gymPositive").value.trim(),challenge:$("gymChallenge").value.trim()};
    const existing=d.weeklyLogs.findIndex(x=>x.date===date);if(existing>=0){row.id=d.weeklyLogs[existing].id;d.weeklyLogs[existing]=row;}else d.weeklyLogs.push(row);
    if(row.weight)d.profile.currentWeight=row.weight;if(row.bodyFat)d.profile.bodyFat=row.bodyFat;
    await save(d);e.target.reset();$("gymWeekDate").value=localDate();renderProfile();renderOverview();setFeedback("gymPhotoFeedback","گزارش هفتگی ذخیره شد.");
  });
  $("nutritionTargetsForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const d=getData();d.targets={calories:Number($("nutritionCalorieTarget").value),protein:Number($("nutritionProteinTarget").value)};
    await save(d);renderNutrition();setFeedback("nutritionFeedback","اهداف روزانه ذخیره شدند.");
  });
  $("nutritionLogForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const d=getData(),date=$("nutritionDate").value||localDate(),old=d.nutrition.find(x=>x.date===date);
    const row={id:old?.id||uid(),date,calories:Number($("nutritionCalories").value),protein:Number($("nutritionProtein").value),note:$("nutritionNote").value.trim(),calorieTarget:Number(d.targets.calories||0),proteinTarget:Number(d.targets.protein||0),updatedAt:new Date().toISOString()};
    const i=d.nutrition.findIndex(x=>x.date===date);if(i>=0)d.nutrition[i]=row;else d.nutrition.push(row);
    await save(d);renderNutrition();setFeedback("nutritionFeedback","گزارش روزانه ذخیره شد؛ ارزیابی زیر فرم به‌روز شد.");
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
  async function setUser(session){currentUser=session?.user||null;await renderPhotos();}
  if(db){db.auth.getSession().then(({data})=>setUser(data.session));db.auth.onAuthStateChange((_event,session)=>setUser(session));}
  const monday=weekStart(localDate());$("gymWeekDate").value=monday;$("nutritionDate").value=localDate();
  renderProfile();renderOverview();renderNutrition();renderPhotos();

  // Local reminders work only while the page remains open; server push is configured separately.
  let reminderTimer=null;
  async function notify(title,body){
    if(!("Notification" in window)||Notification.permission!=="granted")return;
    try{const reg=await navigator.serviceWorker?.ready;if(reg?.showNotification)await reg.showNotification(title,{body,icon:"./pwa-icon-192.png",badge:"./pwa-icon-192.png",tag:"kfox-nutrition-"+localDate(),renotify:true});else new Notification(title,{body});}catch(error){console.warn("K-FOX notification:",error);}
  }
  function scheduleNextReminder(){
    clearTimeout(reminderTimer);
    if(!("Notification" in window))return;
    const d=getData();if(!d.notificationsEnabled||Notification.permission!=="granted")return;
    const now=new Date(),targets=[{hour:19,minute:0,type:"log"},{hour:22,minute:0,type:"check"}];let next=null;
    for(const item of targets){const at=new Date(now);at.setHours(item.hour,item.minute,0,0);if(at<=now)at.setDate(at.getDate()+1);if(!next||at<next.at)next={at,type:item.type};}
    reminderTimer=setTimeout(async()=>{
      if(next.type==="log")await notify("K-FOX · گزارش تغذیه","وقت ثبت کالری و پروتئین امروز است.");
      else if(!getData().nutrition.some(x=>x.date===localDate()))await notify("K-FOX · پروتکل ناقص","لعنتی، گزارش تغذیه‌ات رو ثبت کن!");
      scheduleNextReminder();
    },Math.max(1000,next.at-now));
  }
  $("gymEnableNotifications")?.addEventListener("click",async()=>{
    if(!("Notification" in window)){setFeedback("gymNotificationStatus","این مرورگر از اعلان پشتیبانی نمی‌کند.",true);return;}
    const permission=await Notification.requestPermission();
    if(permission!=="granted"){setFeedback("gymNotificationStatus","اجازه اعلان داده نشد؛ از تنظیمات مرورگر می‌توانی بعداً فعالش کنی.",true);return;}
    const d=getData();d.notificationsEnabled=true;await save(d);setFeedback("gymNotificationStatus","اعلان‌ها فعال شدند. یادآورها تا وقتی سایت باز است اجرا می‌شوند؛ برای حالت بسته باید Push سمت سرور راه‌اندازی شود.");scheduleNextReminder();
  });
  if("Notification" in window&&getData().notificationsEnabled)scheduleNextReminder();
})();