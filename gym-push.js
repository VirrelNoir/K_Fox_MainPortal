(() => {
  "use strict";
  const db=window.KFOX_SUPABASE;
  const $=id=>document.getElementById(id);
  let button=$("gymEnableNotifications");
  const status=$("gymNotificationStatus");
  const testButton=$("gymTestNotification");
  if(!db||!button||!status)return;
  const say=(message,bad=false)=>{status.textContent=message;status.style.color=bad?"#d58a7e":"var(--green)";};
  const localDate=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
  const decodeKey=value=>{const pad="=".repeat((4-value.length%4)%4);const raw=atob((value+pad).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
  const readGym=()=>{try{return JSON.parse(localStorage.getItem("kfox_missions")||"{}")._gym||{};}catch{return {};}};
  const writeGym=gym=>{try{const all=JSON.parse(localStorage.getItem("kfox_missions")||"{}");all._gym=gym;localStorage.setItem("kfox_missions",JSON.stringify(all));if(typeof missionStates!=="undefined")missionStates._gym=gym;}catch(error){console.warn("K-FOX GYM local cache:",error);}};
  async function syncNutrition(userOverride){
    let user=userOverride;
    if(!user){const {data:sessionData,error:sessionError}=await db.auth.getSession();user=sessionError?null:sessionData?.session?.user;}
    if(!user)return;
    const gym=readGym(),logs=Array.isArray(gym.nutrition)?gym.nutrition:[];
    const pulled=await db.from("kfox_gym_nutrition").select("log_date,calories,protein,updated_at").eq("owner_id",user.id).order("log_date",{ascending:false});
    if(pulled.error){say("دریافت گزارش‌های ابری تغذیه انجام نشد: "+pulled.error.message,true);return;}
    const remote=new Map((pulled.data||[]).map(row=>[row.log_date,row]));
    const pending=logs.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date||"")).filter(x=>{
      const cloud=remote.get(x.date);return !cloud||(x.updatedAt&&new Date(x.updatedAt)>new Date(cloud.updated_at));
    }).map(x=>({owner_id:user.id,log_date:x.date,calories:Number(x.calories)||0,protein:Number(x.protein)||0,updated_at:x.updatedAt||new Date().toISOString()}));
    if(pending.length){
      const pushed=await db.from("kfox_gym_nutrition").upsert(pending,{onConflict:"owner_id,log_date"});
      if(pushed.error){say("ذخیره ابری تغذیه انجام نشد: "+pushed.error.message,true);return;}
      pending.forEach(row=>remote.set(row.log_date,row));
    }
    const byDate=new Map(logs.map(x=>[x.date,x]));
    remote.forEach(row=>{
      const previous=byDate.get(row.log_date)||{};
      byDate.set(row.log_date,{...previous,date:row.log_date,calories:Number(row.calories),protein:Number(row.protein),updatedAt:row.updated_at||previous.updatedAt});
    });
    gym.nutrition=Array.from(byDate.values()).sort((a,b)=>a.date.localeCompare(b.date));
    writeGym(gym);
    window.KFOX_REFRESH_GYM?.();
  }
  window.KFOX_SYNC_GYM_NUTRITION=async row=>{
    const {data:sessionData}=await db.auth.getSession(),user=sessionData?.session?.user;
    if(!user)return;
    const result=await db.from("kfox_gym_nutrition").upsert({
      owner_id:user.id,log_date:row.date,calories:Number(row.calories)||0,protein:Number(row.protein)||0,updated_at:row.updatedAt||new Date().toISOString()
    },{onConflict:"owner_id,log_date"});
    if(result.error)say("گزارش روی این دستگاه ذخیره شد، اما همگام‌سازی ابری ناموفق بود: "+result.error.message,true);
  };
  async function registerPush(){
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
      say("این مرورگر از اعلان پس‌زمینه پشتیبانی نمی‌کند. سایت را در Chrome نصب/باز کن.",true);return;
    }
    const {data:sessionData,error:sessionError}=await db.auth.getSession();
    if(sessionError||!sessionData?.session?.user){say("برای فعال‌سازی اعلان بین دستگاه‌ها، ابتدا از بخش آرشیو شخصی وارد حساب شو.",true);return;}
    if(Notification.permission==="denied"){say("اجازه اعلان برای سایت مسدود است؛ از تنظیمات سایت در مرورگر آن را فعال کن.",true);return;}
    const permission=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(permission!=="granted"){say("اجازه اعلان داده نشد. از تنظیمات مرورگر می‌توانی بعداً فعالش کنی.",true);return;}
    button.disabled=true;button.textContent="CONNECTING PUSH...";
    try{
      const keyResult=await db.functions.invoke("gym-reminders",{body:{action:"public_key"}});
      if(keyResult.error)throw new Error(keyResult.error.message||"تابع اعلان در Supabase هنوز نصب نشده است.");
      const publicKey=keyResult.data?.publicKey;
      if(!publicKey)throw new Error("کلید عمومی اعلان در Supabase تنظیم نشده است.");
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
      const saved=await db.functions.invoke("gym-reminders",{body:{
        action:"subscribe",subscription:subscription.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"
      }});
      if(saved.error)throw new Error(saved.error.message||"ذخیره اشتراک اعلان ناموفق بود.");
      const gym=readGym();gym.notificationsEnabled=true;writeGym(gym);
      say("اعلان‌های پس‌زمینه K-FOX فعال شدند. ساعت ۱۹ یادآوری و ساعت ۲۲ بررسی گزارش انجام می‌شود.");
      button.textContent="PUSH NOTIFICATIONS ACTIVE";
      if(testButton)testButton.disabled=false;
    }catch(error){
      say("فعال‌سازی اعلان ناموفق بود: "+(error.message||String(error)),true);
      button.textContent="ENABLE BACKGROUND NOTIFICATIONS";
    }finally{button.disabled=false;}
  }
  async function sendTest(){
    if(!testButton)return;
    testButton.disabled=true;testButton.textContent="SENDING TEST...";
    try{
      const result=await db.functions.invoke("gym-reminders",{body:{action:"test"}});
      if(result.error)throw new Error(result.error.message||"ارسال اعلان آزمایشی ناموفق بود.");
      if(!result.data?.sent)throw new Error(result.data?.error||"هیچ دستگاه فعالی برای دریافت اعلان پیدا نشد.");
      say("اعلان آزمایشی ارسال شد. اگر روی گوشی نمایش داده شد، مسیر Push تأیید شده است.");
      testButton.textContent="TEST SENT";
    }catch(error){say("تست اعلان ناموفق بود: "+(error.message||String(error)),true);testButton.textContent="TEST PUSH";}
    finally{testButton.disabled=false;}
  }
  testButton?.addEventListener("click",sendTest);
  const replacement=button.cloneNode(true);
  replacement.textContent="ENABLE BACKGROUND NOTIFICATIONS";
  button.replaceWith(replacement);
  button=replacement;
  replacement.addEventListener("click",registerPush);
  const reminderForm=$("centralReminderForm");
  const reminderList=$("centralReminderList");
  const reminderStatus=$("centralReminderStatus");
  const moduleLabels={personal:"شخصی",calendar:"تقویم",finance:"خزانه مالی",dentistry:"دندان‌پزشکی",gym:"باشگاه",nutrition:"تغذیه"};
  const setReminderStatus=(message,bad=false)=>{if(reminderStatus){reminderStatus.textContent=message;reminderStatus.style.color=bad?"#d58a7e":"var(--green)";}};
  const localReminderTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat("fa-IR",{dateStyle:"medium",timeStyle:"short"}).format(d);};
  async function renderReminders(user){
    if(!reminderList)return;
    if(!user){reminderList.innerHTML='<div class="empty-state">برای دیدن یادآوری‌های ابری وارد حساب شو.</div>';return;}
    const {data,error}=await db.from("kfox_notifications").select("id,module,title,body,scheduled_at,status,attempts").eq("owner_id",user.id).order("created_at",{ascending:false}).limit(60);
    if(error){reminderList.textContent="دریافت یادآوری‌ها ناموفق بود: "+error.message;return;}
    if(!data?.length){reminderList.innerHTML='<div class="empty-state">هنوز یادآوری‌ای ثبت نشده است.</div>';return;}
    reminderList.replaceChildren();
    data.forEach(item=>{
      const row=document.createElement("article");row.className="workspace-item";
      const main=document.createElement("div");main.className="workspace-item-main";
      const title=document.createElement("h3");title.textContent=item.title;
      const detail=document.createElement("p");detail.textContent=(moduleLabels[item.module]||item.module)+" · "+localReminderTime(item.scheduled_at);
      const status=document.createElement("small");status.className="task-status-label";status.textContent=item.status==="sent"?"ارسال‌شده":item.status==="failed"?"ناموفق پس از چند تلاش":item.status==="cancelled"?"لغوشده":"در انتظار ارسال";
      const body=document.createElement("p");body.textContent=item.body||"بدون توضیح";
      main.append(title,detail,body,status);row.append(main);
      if(item.status==="pending"||item.status==="failed"){
        const del=document.createElement("button");del.type="button";del.className="workspace-delete";del.textContent="لغو یادآوری";del.dataset.reminderDelete=item.id;row.append(del);
      }
      reminderList.append(row);
    });
  }
  reminderForm?.addEventListener("submit",async event=>{
    event.preventDefault();
    const {data:sessionData,error:sessionError}=await db.auth.getSession(),user=sessionData?.session?.user;
    if(sessionError||!user){setReminderStatus("ابتدا وارد حساب K-FOX شو.",true);return;}
    const localValue=$("centralReminderAt").value;
    const scheduledAt=new Date(localValue);
    if(!localValue||Number.isNaN(scheduledAt.getTime())||scheduledAt.getTime()<=Date.now()){setReminderStatus("زمان یادآوری باید در آینده باشد.",true);return;}
    const payload={owner_id:user.id,module:$("centralReminderModule").value,title:$("centralReminderTitle").value.trim(),body:$("centralReminderBody").value.trim(),scheduled_at:scheduledAt.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"};
    const result=await db.from("kfox_notifications").insert(payload);
    if(result.error){setReminderStatus("ثبت یادآوری انجام نشد: "+result.error.message,true);return;}
    reminderForm.reset();setReminderStatus("یادآوری در فضای ابری ثبت شد و در زمان تعیین‌شده ارسال می‌شود.");
    await renderReminders(user);
  });
  reminderList?.addEventListener("click",async event=>{
    const button=event.target.closest("[data-reminder-delete]");if(!button)return;
    const {data:sessionData}=await db.auth.getSession(),user=sessionData?.session?.user;if(!user)return;
    button.disabled=true;
    const result=await db.from("kfox_notifications").delete().eq("id",button.dataset.reminderDelete).eq("owner_id",user.id).in("status",["pending","failed"]);
    if(result.error){setReminderStatus("لغو یادآوری انجام نشد: "+result.error.message,true);button.disabled=false;return;}
    await renderReminders(user);setReminderStatus("یادآوری لغو شد.");
  });
  async function boot(){
    const {data}=await db.auth.getSession();
    if(data?.session?.user){
      await renderReminders(data.session.user);
      await syncNutrition(data.session.user);
      const registration=await navigator.serviceWorker?.ready;
      if(registration&&("Notification" in window)&&Notification.permission==="granted"&&await registration.pushManager.getSubscription()){
        say("اشتراک اعلان این دستگاه فعال است. زمان‌بندی از سرور انجام می‌شود.");
        replacement.textContent="PUSH NOTIFICATIONS ACTIVE";
        if(testButton)testButton.disabled=false;
      }else say("برای دریافت یادآوری ساعت ۱۹ و پیگیری ساعت ۲۲، اعلان پس‌زمینه را فعال کن.");
    }else {renderReminders(null);say("برای فعال‌سازی اعلان‌های ابری، ابتدا وارد حساب شخصی شو.");}
  }
  db.auth.onAuthStateChange((_event,session)=>{if(session?.user)setTimeout(()=>{renderReminders(session.user).catch(error=>console.warn(error));syncNutrition(session.user).catch(error=>console.warn(error));},0);else{renderReminders(null);say("برای اعلان پس‌زمینه باید وارد حساب شوی.");}});
  boot().catch(error=>{console.warn("K-FOX GYM push setup:",error);say("همگام‌سازی اعلان‌ها هنوز آماده نیست.",true);});
})();
