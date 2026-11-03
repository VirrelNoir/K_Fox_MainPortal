(() => {
  "use strict";
  const db=window.KFOX_SUPABASE;
  const $=id=>document.getElementById(id);
  let button=$("gymEnableNotifications");
  const status=$("gymNotificationStatus");
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
    }catch(error){
      say("فعال‌سازی اعلان ناموفق بود: "+(error.message||String(error)),true);
      button.textContent="ENABLE BACKGROUND NOTIFICATIONS";
    }finally{button.disabled=false;}
  }
  const replacement=button.cloneNode(true);
  replacement.textContent="ENABLE BACKGROUND NOTIFICATIONS";
  button.replaceWith(replacement);
  button=replacement;
  replacement.addEventListener("click",registerPush);
  async function boot(){
    const {data}=await db.auth.getSession();
    if(data?.session?.user){
      await syncNutrition(data.session.user);
      const registration=await navigator.serviceWorker?.ready;
      if(registration&&("Notification" in window)&&Notification.permission==="granted"&&await registration.pushManager.getSubscription()){
        say("اشتراک اعلان این دستگاه فعال است. زمان‌بندی از سرور انجام می‌شود.");
        replacement.textContent="PUSH NOTIFICATIONS ACTIVE";
      }else say("برای دریافت یادآوری ساعت ۱۹ و پیگیری ساعت ۲۲، اعلان پس‌زمینه را فعال کن.");
    }else say("برای فعال‌سازی اعلان‌های ابری، ابتدا وارد حساب شخصی شو.");
  }
  db.auth.onAuthStateChange((_event,session)=>{if(session?.user)setTimeout(()=>syncNutrition(session.user).catch(error=>console.warn(error)),0);else say("برای اعلان پس‌زمینه باید وارد حساب شوی.");});
  boot().catch(error=>{console.warn("K-FOX GYM push setup:",error);say("همگام‌سازی اعلان‌ها هنوز آماده نیست.",true);});
})();
