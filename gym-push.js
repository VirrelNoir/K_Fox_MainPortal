(() => {
  "use strict";
  const db=window.KFOX_SUPABASE;
  const $=id=>document.getElementById(id);
  let enableButton=$("kfoxEnableNotifications");
  const status=$("kfoxNotificationStatus");
  const testButton=$("kfoxTestNotification");
  const reminderForm=$("centralReminderForm");
  const reminderList=$("centralReminderList");
  const reminderStatus=$("centralReminderStatus");
  const moduleLabels={personal:"شخصی",calendar:"تقویم",training:"آموزش",finance:"خزانه مالی",dentistry:"دندان‌پزشکی",gym:"باشگاه",nutrition:"تغذیه قدیمی"};
  const allowedModules=new Set(["personal","calendar","training","finance","dentistry","gym","nutrition"]);
  const say=(message,bad=false)=>{if(status){status.textContent=message;status.style.color=bad?"#d58a7e":"var(--green)";}};
  const setReminderStatus=(message,bad=false)=>{if(reminderStatus){reminderStatus.textContent=message;reminderStatus.style.color=bad?"#d58a7e":"var(--green)";}};
  const timezone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";
  const localReminderTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?String(value||""):new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(d);};

  if(!db){
    say("اتصال به Supabase برقرار نیست؛ اعلان‌ها در دسترس نیستند.",true);
    if(enableButton)enableButton.disabled=true;
    if(testButton)testButton.disabled=true;
    return;
  }

  async function currentUser(){
    const {data,error}=await db.auth.getSession();
    if(error)throw error;
    if(!data?.session?.user)throw new Error("برای ثبت یادآوری ابتدا وارد حساب K-FOX شو.");
    return data.session.user;
  }

  async function renderReminders(user){
    if(!reminderList)return;
    if(!user){reminderList.innerHTML='<div class="empty-state">برای دیدن یادآوری‌های ابری وارد حساب شو.</div>';return;}
    const {data,error}=await db.from("kfox_notifications")
      .select("id,module,title,body,scheduled_at,status,attempts")
      .eq("owner_id",user.id).order("created_at",{ascending:false}).limit(60);
    if(error){reminderList.textContent="دریافت یادآوری‌ها ناموفق بود: "+error.message;return;}
    if(!data?.length){reminderList.innerHTML='<div class="empty-state">هنوز یادآوری‌ای ثبت نشده است.</div>';return;}
    reminderList.replaceChildren();
    data.forEach(item=>{
      const row=document.createElement("article");row.className="workspace-item";
      const main=document.createElement("div");main.className="workspace-item-main";
      const title=document.createElement("h3");title.textContent=item.title;
      const detail=document.createElement("p");detail.textContent=(moduleLabels[item.module]||item.module)+" · "+localReminderTime(item.scheduled_at);
      const body=document.createElement("p");body.textContent=item.body||"بدون توضیح";
      const state=document.createElement("small");state.className="task-status-label";
      state.textContent=item.status==="sent"?"ارسال‌شده":item.status==="failed"?"ناموفق پس از چند تلاش":item.status==="cancelled"?"لغوشده":"در انتظار ارسال";
      main.append(title,detail,body,state);row.append(main);
      if(item.status==="pending"||item.status==="failed"){
        const del=document.createElement("button");del.type="button";del.className="workspace-delete";
        del.textContent="لغو یادآوری";del.dataset.reminderDelete=item.id;row.append(del);
      }
      reminderList.append(row);
    });
  }

  window.KFOX_SCHEDULE_NOTIFICATION=async({module,title,body="",scheduledAt})=>{
    const user=await currentUser();
    if(!allowedModules.has(module))throw new Error("دسته‌بندی یادآوری معتبر نیست.");
    const cleanTitle=String(title||"").trim(),cleanBody=String(body||"").trim();
    const at=new Date(scheduledAt);
    if(!cleanTitle||cleanTitle.length>140)throw new Error("عنوان یادآوری باید بین ۱ تا ۱۴۰ نویسه باشد.");
    if(cleanBody.length>500)throw new Error("توضیح یادآوری بیشتر از ۵۰۰ نویسه است.");
    if(Number.isNaN(at.getTime())||at.getTime()<=Date.now())throw new Error("زمان یادآوری باید در آینده باشد.");
    const {data,error}=await db.from("kfox_notifications").insert({
      owner_id:user.id,module,title:cleanTitle,body:cleanBody,
      scheduled_at:at.toISOString(),timezone:timezone()
    }).select("id").single();
    if(error)throw error;
    if(!data?.id)throw new Error("شناسه یادآوری از پایگاه داده دریافت نشد.");
    renderReminders(user).catch(error=>setReminderStatus("یادآوری ثبت شد، اما فهرست آن تازه‌سازی نشد: "+(error?.message||""),true));
    return {id:data.id};
  };

  window.KFOX_CANCEL_NOTIFICATION=async(id)=>{
    if(!id)return;
    const user=await currentUser();
    const {error}=await db.from("kfox_notifications").delete().eq("id",id).eq("owner_id",user.id);
    if(error)throw error;
    renderReminders(user).catch(error=>setReminderStatus("یادآوری لغو شد، اما فهرست تازه‌سازی نشد: "+(error?.message||""),true));
  };

  reminderForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    const submit=reminderForm.querySelector('button[type="submit"]');
    if(submit)submit.disabled=true;
    try{
      await window.KFOX_SCHEDULE_NOTIFICATION({
        module:$("centralReminderModule").value,
        title:$("centralReminderTitle").value.trim(),
        body:$("centralReminderBody").value.trim(),
        scheduledAt:$("centralReminderAt").value
      });
      reminderForm.reset();
      setReminderStatus("یادآوری در حساب ذخیره شد. برای دریافت اعلان، Push این دستگاه را هم فعال کن.");
    }catch(error){setReminderStatus("ثبت یادآوری انجام نشد: "+(error?.message||"خطای ناشناخته"),true);}
    finally{if(submit)submit.disabled=false;}
  });

  reminderList?.addEventListener("click",async event=>{
    const button=event.target.closest("[data-reminder-delete]");if(!button)return;
    button.disabled=true;
    try{await window.KFOX_CANCEL_NOTIFICATION(button.dataset.reminderDelete);setReminderStatus("یادآوری لغو شد.");}
    catch(error){setReminderStatus("لغو یادآوری انجام نشد: "+(error?.message||"خطای ناشناخته"),true);button.disabled=false;}
  });

  const decodeKey=value=>{
    const pad="=".repeat((4-value.length%4)%4);
    const raw=atob((value+pad).replace(/-/g,"+").replace(/_/g,"/"));
    return Uint8Array.from(raw,char=>char.charCodeAt(0));
  };

  async function syncExistingSubscription(){
    if(!("serviceWorker" in navigator)||!("Notification" in window)||Notification.permission!=="granted")return false;
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(!subscription)return false;
    const saved=await db.functions.invoke("gym-reminders",{body:{
      action:"subscribe",subscription:subscription.toJSON(),timezone:timezone()
    }});
    if(saved.error)throw new Error(saved.error.message||"همگام‌سازی اشتراک Push ناموفق بود.");
    return true;
  }

  async function registerPush(){
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
      say("این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند.",true);return;
    }
    try{await currentUser();}catch(error){say(error.message,true);return;}
    if(Notification.permission==="denied"){say("اجازه اعلان برای سایت مسدود است؛ از تنظیمات سایت در مرورگر آن را فعال کن.",true);return;}
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted"){say("اجازه اعلان داده نشد. از تنظیمات مرورگر می‌توانی بعداً فعالش کنی.",true);return;}
    enableButton.disabled=true;enableButton.textContent="CONNECTING PUSH...";
    try{
      const keyResult=await db.functions.invoke("gym-reminders",{body:{action:"public_key"}});
      if(keyResult.error)throw new Error(keyResult.error.message||"دریافت کلید Push ناموفق بود.");
      const publicKey=keyResult.data?.publicKey;
      if(!publicKey)throw new Error("کلید عمومی Push در Supabase تنظیم نشده است.");
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
      const saved=await db.functions.invoke("gym-reminders",{body:{
        action:"subscribe",subscription:subscription.toJSON(),timezone:timezone()
      }});
      if(saved.error)throw new Error(saved.error.message||"ذخیره اشتراک اعلان ناموفق بود.");
      say("اعلان‌های پس‌زمینه K-FOX روی این دستگاه فعال شدند.");
      enableButton.textContent="PUSH NOTIFICATIONS ACTIVE";
      if(testButton)testButton.disabled=false;
    }catch(error){
      say("فعال‌سازی اعلان ناموفق بود: "+(error?.message||String(error)),true);
      enableButton.textContent="ENABLE BACKGROUND NOTIFICATIONS";
    }finally{enableButton.disabled=false;}
  }

  async function sendTest(){
    if(!testButton)return;
    testButton.disabled=true;testButton.textContent="SENDING TEST...";
    try{
      const result=await db.functions.invoke("gym-reminders",{body:{action:"test"}});
      if(result.error)throw new Error(result.error.message||"ارسال اعلان آزمایشی ناموفق بود.");
      if(!result.data?.sent)throw new Error(result.data?.error||"هیچ دستگاه فعالی برای دریافت اعلان پیدا نشد.");
      say("اعلان آزمایشی ارسال شد.");
      testButton.textContent="TEST SENT";
    }catch(error){say("تست اعلان ناموفق بود: "+(error?.message||String(error)),true);testButton.textContent="TEST PUSH";}
    finally{testButton.disabled=false;}
  }

  if(enableButton){
    const replacement=enableButton.cloneNode(true);
    replacement.textContent="ENABLE BACKGROUND NOTIFICATIONS";
    enableButton.replaceWith(replacement);enableButton=replacement;
    replacement.addEventListener("click",registerPush);
  }
  testButton?.addEventListener("click",sendTest);

  async function boot(){
    const {data,error}=await db.auth.getSession();
    if(error)throw error;
    const user=data?.session?.user||null;
    await renderReminders(user);
    if(!user){say("برای فعال‌سازی اعلان‌های ابری، ابتدا وارد حساب شخصی شو.");return;}
    if(!("serviceWorker" in navigator)||!("Notification" in window)){say("این مرورگر از Push پشتیبانی نمی‌کند.",true);return;}
    const synced=await syncExistingSubscription();
    if(synced){
      say("اشتراک Push این دستگاه با حساب فعلی همگام شد. یادآوری‌ها طبق زمان ثبت‌شده ارسال می‌شوند.");
      if(enableButton)enableButton.textContent="PUSH NOTIFICATIONS ACTIVE";
      if(testButton)testButton.disabled=false;
    }else{
      if(enableButton)enableButton.textContent="ENABLE BACKGROUND NOTIFICATIONS";
      if(testButton)testButton.disabled=true;
      say("برای دریافت یادآوری‌های تقویم و آموزش، Push این دستگاه را فعال کن.");
    }
  }

  db.auth.onAuthStateChange((_event,session)=>{
    window.setTimeout(()=>{
      const user=session?.user||null;
      renderReminders(user).catch(error=>setReminderStatus("دریافت یادآوری‌ها ناموفق بود: "+(error?.message||"خطای ناشناخته"),true));
      if(!user){
        say("برای اعلان پس‌زمینه باید وارد حساب شوی.");
        if(testButton)testButton.disabled=true;
        if(enableButton)enableButton.textContent="ENABLE BACKGROUND NOTIFICATIONS";
      }else{
        syncExistingSubscription().then(active=>{
          if(active){
            say("اشتراک Push با حساب فعلی همگام شد.");
            if(enableButton)enableButton.textContent="PUSH NOTIFICATIONS ACTIVE";
            if(testButton)testButton.disabled=false;
          }else{
            if(enableButton)enableButton.textContent="ENABLE BACKGROUND NOTIFICATIONS";
            if(testButton)testButton.disabled=true;
            say("حساب متصل است؛ برای دریافت یادآوری‌ها Push را فعال کن.");
          }
        }).catch(error=>say("همگام‌سازی اشتراک Push ناموفق بود: "+(error?.message||""),true));
      }
    },0);
  });
  boot().catch(error=>{console.warn("K-FOX notification setup:",error);say("همگام‌سازی اعلان‌ها هنوز آماده نیست: "+(error?.message||""),true);});
})();
