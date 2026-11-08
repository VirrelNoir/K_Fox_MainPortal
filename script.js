const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// One upload pipeline for every private file in K-FOX.
window.KFOX_UPLOAD_FILE = async function({db,bucket,path,file,contentType,onProgress}) {
  if (!db?.auth) throw new Error("اتصال Supabase آماده نیست.");
  const sessionResult = await db.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const accessToken = sessionResult.data?.session?.access_token;
  if (!accessToken) throw new Error("نشست ورود منقضی شده است؛ دوباره وارد حساب شو.");

  const tusClient = await (async function ensureTusClient() {
    if (window.tus?.Upload) return window.tus;
    const sources = [
      "https://cdn.jsdelivr.net/npm/tus-js-client@4.3.1/dist/tus.min.js",
      "https://unpkg.com/tus-js-client@4.3.1/dist/tus.min.js"
    ];
    for (const src of sources) {
      await new Promise(resolve => {
        const script = document.createElement("script");
        script.src = src; script.async = true;
        script.onload = resolve; script.onerror = resolve;
        document.head.appendChild(script);
      });
      if (window.tus?.Upload) return window.tus;
    }
    throw new Error("کتابخانه آپلود امن بارگذاری نشد. اتصال اینترنت را بررسی و دوباره تلاش کن.");
  })();

  const folder = String(path).split("/").slice(0,-1).join("/");
  const identity = [bucket,folder,file.name,file.size,file.lastModified,file.type].join("|");
  const pathKey = "kfox-upload-path:" + encodeURIComponent(identity);
  let actualPath = path;
  try {
    const pendingPath = localStorage.getItem(pathKey);
    if (pendingPath) actualPath = pendingPath;
    else localStorage.setItem(pathKey, path);
  } catch (_) {}

  const fingerprint = "kfox-tus-v1:" + [bucket,actualPath,file.name,file.size,file.lastModified].join("|");
  return new Promise((resolve,reject) => {
    let settled = false;
    const fail = error => { if (!settled) { settled=true; reject(error instanceof Error ? error : new Error(String(error))); } };
    const upload = new tusClient.Upload(file, {
      endpoint: "https://mbpqalbhdcikvruyadte.storage.supabase.co/storage/v1/upload/resumable",
      retryDelays: [0,3000,5000,10000,20000],
      headers: {
        authorization: "Bearer " + accessToken,
        ...(db.supabaseKey ? {apikey:db.supabaseKey} : {})
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: () => Promise.resolve(fingerprint),
      metadata: {
        bucketName: bucket, objectName: actualPath,
        contentType: contentType || file.type || "application/octet-stream",
        cacheControl: "3600"
      },
      chunkSize: 6 * 1024 * 1024,
      onError: fail,
      onProgress: (sent,total) => {
        if (typeof onProgress === "function") onProgress(total ? Math.min(100,Math.floor(sent/total*100)) : 0,sent,total);
      },
      onSuccess: () => {
        if (settled) return;
        settled=true;
        try { localStorage.removeItem(pathKey); } catch (_) {}
        resolve({data:{path:actualPath,fullPath:bucket+"/"+actualPath,url:upload.url},error:null});
      }
    });
    upload.findPreviousUploads().then(previous => {
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(fail);
  });
};

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

  function formatMembershipDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric", month: "long", day: "numeric"
    }).format(date);
  }

  function renderProfile(profile = {}, avatarUrl = "") {
    const card = $id("profileCard");
    if (!card) return;
    card.hidden = !user;
    if (!user) return;
    const name = (profile.name || "").trim();
    $id("profileCardName").textContent = name || "پروفایل تکمیل نشده";
    $id("profileCardJob").textContent = (profile.job || "").trim() || "شغل ثبت نشده";
    $id("profileCardAge").textContent = profile.age ? profile.age + " سال" : "—";
    $id("profileCardJoined").textContent = formatMembershipDate(user.created_at);
    $id("profileCardBio").textContent = (profile.bio || "").trim() || "هنوز بیویی ثبت نشده است.";
    const avatar = $id("profileCardAvatar");
    const fallback = $id("profileCardAvatarFallback");
    if (avatarUrl) {
      avatar.src = avatarUrl;
      avatar.hidden = false;
      fallback.hidden = true;
    } else {
      avatar.removeAttribute("src");
      avatar.hidden = true;
      fallback.hidden = false;
      fallback.textContent = name ? name.slice(0, 2).toUpperCase() : "KF";
    }
  }

  async function loadProfile() {
    if (!user) {
      renderProfile();
      return;
    }
    const profile = user.user_metadata?.kfox_profile || {};
    $id("profileName").value = profile.name || "";
    $id("profileAge").value = profile.age || "";
    $id("profileJob").value = profile.job || "";
    $id("profileBio").value = profile.bio || "";
    let avatarUrl = "";
    if (profile.avatar_path) {
      const result = await db.storage.from(bucket).createSignedUrl(profile.avatar_path, 3600);
      if (!result.error) avatarUrl = result.data.signedUrl;
    }
    renderProfile(profile, avatarUrl);
  }

  const profileForm = $id("archiveProfileForm");
  if (profileForm) profileForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!user) return;
    const submit = profileForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    message("archiveProfileFeedback", "در حال ذخیره پروفایل...");
    let uploadedPath = "";
    try {
      const current = user.user_metadata?.kfox_profile || {};
      let avatarPath = current.avatar_path || null;
      const file = $id("profileAvatarFile").files?.[0];
      if (file) {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) throw new Error("فرمت عکس باید JPG، PNG یا WEBP باشد.");
        if (file.size > 5 * 1024 * 1024) throw new Error("حجم عکس نباید بیشتر از ۵ مگابایت باشد.");
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = user.id + "/profile/" + Date.now() + "-avatar." + extension;
        const upload = await window.KFOX_UPLOAD_FILE({db,bucket,path:uploadedPath,file,contentType:file.type,
          onProgress:percent=>message("archiveProfileFeedback","بارگذاری عکس پروفایل: "+percent+"٪")});
        uploadedPath = upload.data.path;
        avatarPath = uploadedPath;
      }
      const profile = {
        name: $id("profileName").value.trim(),
        age: $id("profileAge").value ? String(Number($id("profileAge").value)) : "",
        job: $id("profileJob").value.trim(),
        bio: $id("profileBio").value.trim(),
        avatar_path: avatarPath
      };
      const result = await db.auth.updateUser({
        data: { ...(user.user_metadata || {}), kfox_profile: profile }
      });
      if (result.error) throw result.error;
      user = result.data?.user || { ...user, user_metadata: { ...(user.user_metadata || {}), kfox_profile: profile } };
      $id("profileAvatarFile").value = "";
      await loadProfile();
      message("archiveProfileFeedback", "پروفایل با موفقیت ذخیره شد.");
    } catch (error) {
      if (uploadedPath) await db.storage.from(bucket).remove([uploadedPath]).catch(() => {});
      message("archiveProfileFeedback", error?.message || "ذخیره پروفایل انجام نشد.", true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  async function loadFiles() {
    const list=$id("archiveFileList");
    list.replaceChildren();
    if(!user){list.textContent="برای دیدن فایل‌ها وارد حساب شو.";return;}

    // Read both the legacy archive folder and the new user-scoped folder.
    // Existing PDFs were uploaded under personal-archive/ and must remain visible.
    const folders = ["personal-archive", user.id+"/archive"];
    const results = await Promise.all(folders.map(async folder => {
      let result = await db.storage.from(bucket).list(folder,{limit:100,sortBy:{column:"created_at",order:"desc"}});
      if (!result.error && !(result.data||[]).length) {
        const retry = await db.storage.from(bucket).list(folder+"/",{limit:100,sortBy:{column:"created_at",order:"desc"}});
        if (retry.error || (retry.data||[]).length) result = retry;
      }
      return result;
    }));
    const failed = results.find(result=>result.error);
    if(failed){message("archiveFileFeedback",failed.error.message,true);return;}

    const files = results.flatMap((result,index)=>
      (result.data||[]).filter(file=>file.name).map(file=>({
        ...file,
        path:folders[index]+"/"+file.name
      }))
    );
    if(!files.length){list.textContent="NO FILES FOUND";return;}

    files.forEach(async file=>{
      const path=file.path;
      const row=document.createElement("div"); row.className="archive-file-item";
      if(/\\.(jpg|jpeg|png|webp)$/i.test(file.name)){
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
    let path=user.id+"/archive/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    message("archiveFileFeedback","UPLOADING...");
    try {
      const result=await window.KFOX_UPLOAD_FILE({db,bucket,path,file,contentType:file.type,
        onProgress:percent=>message("archiveFileFeedback","بارگذاری فایل: "+percent+"٪")});
      path=result.data.path;
      input.value=""; message("archiveFileFeedback","FILE ARCHIVED."); await loadFiles();
    } catch(error) {
      message("archiveFileFeedback","بارگذاری ناموفق بود: "+(error?.message||"خطای ناشناخته"),true);
    }
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
      void loadProfile().catch(error => message("archiveProfileFeedback", error?.message || "خطا در بارگذاری پروفایل.", true));
      void refresh().catch(error => message("archiveFileFeedback", error?.message || "خطا در بارگذاری آرشیو.", true));
      if (typeof window.KFOX_SYNC_OPERATIONAL_DATA === "function") {
        Promise.resolve(window.KFOX_SYNC_OPERATIONAL_DATA(user.id))
          .catch(error => console.warn("K-FOX operational sync:", error));
      }
    }else if(!user && previousId){
      window.KFOX_DISCONNECT_OPERATIONAL_DATA();
      $id("archiveFileList").replaceChildren();
      $id("archiveQuoteList").replaceChildren();
      $id("archiveProfileForm").reset();
      $id("profileCard").hidden = true;
      $id("profileCardAvatar").removeAttribute("src");
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


// K-FOX home-only throne backdrop switch. Persist preference on this browser.
(function(){
  const preferenceKey="kfox-queen-backdrop-enabled";
  let enabled=false;
  try { enabled=localStorage.getItem(preferenceKey)==="true"; } catch (_) {}
  function applyBackdrop(value){
    enabled=Boolean(value);
    try { localStorage.setItem(preferenceKey,String(enabled)); } catch (_) {}
    document.body.classList.toggle("queen-bg-on",enabled);
    const button=document.getElementById("kfoxNeonToggle");
    if(button){
      button.classList.toggle("is-on",enabled);
      button.setAttribute("aria-pressed",String(enabled));
      button.title=enabled?"خاموش کردن پس‌زمینه ملکه":"نمایش پس‌زمینه ملکه";
      const label=button.querySelector(".neon-toggle-label");
      if(label)label.textContent=enabled?"THRONE ON":"THRONE OFF";
    }
  }
  function updateControl(pageId){
    const button=document.getElementById("kfoxNeonToggle");
    if(button)button.hidden=pageId!=="overview";
    // Keep the toggle state while visiting other drawers; the backdrop is scoped to #overview.
  }
  window.KFOX_SET_QUEEN_BACKDROP=applyBackdrop;
  window.KFOX_UPDATE_BACKDROP_CONTROL=updateControl;
  const button=document.getElementById("kfoxNeonToggle");
  if(button)button.addEventListener("click",()=>applyBackdrop(!enabled));
  updateControl(document.querySelector(".page.active")?.id||"overview");
  applyBackdrop(enabled); // Restore the saved state on page load.
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
  window.KFOX_UPDATE_BACKDROP_CONTROL?.(pageId);
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
window.KFOX_SAVE_MISSION_META=saveMissionMeta;
window.KFOX_SAVE_STUDY_MEDAL=async medal=>{missionStates._studyMedal=medal;await saveMissionMeta();};
function renderMissions(){
 const list=$("#missionList");if(!list)return;list.replaceChildren();
 const focusSelect=$("#missionFocusSelect"),selected=missionStates._focusMission||"";
 focusSelect.replaceChildren(new Option("بدون اولویت انتخاب‌شده",""));missions.forEach(m=>focusSelect.add(new Option(m.title,m.id)));focusSelect.value=selected;
  const focused=missions.find(m=>m.id===selected);$("#missionFocusDisplay").textContent=focused?focused.title:"هنوز مأموریت اصلی انتخاب نشده است.";
 $("#missionFocusDisplay").classList.toggle("is-selected",!!focused);
 const trainingSelect=$("#trainingMission");
 if(trainingSelect){const previous=trainingSelect.value;trainingSelect.replaceChildren(new Option("انتخاب مأموریت",""));missions.forEach(m=>trainingSelect.add(new Option(m.title,m.id)));trainingSelect.value=missions.some(m=>m.id===previous)?previous:"";}
 let trainingData={};try{trainingData=JSON.parse(localStorage.getItem("kfox_workspace_v2")||"{}");}catch{}
 const studyMinutes=new Map();(Array.isArray(trainingData.training)?trainingData.training:[]).forEach(record=>{if(record?.missionId)studyMinutes.set(record.missionId,(studyMinutes.get(record.missionId)||0)+Math.max(0,Number(record.minutes)||0));});
 const studyFormat=minutes=>{const hours=Math.floor(minutes/60),mins=minutes%60;return hours?new Intl.NumberFormat("fa-IR").format(hours)+(mins?" ساعت و "+new Intl.NumberFormat("fa-IR").format(mins)+" دقیقه":" ساعت"):new Intl.NumberFormat("fa-IR").format(mins)+" دقیقه";};
 missions.forEach(m=>{
  const status=typeof missionStates[m.id]==="string"?missionStates[m.id]:"pending",level=Number((missionStates._missionLevels||{})[m.id]||0),statusClass=status==="done"?"status-done":status==="progress"?"status-progress":"status-pending",card=document.createElement("article");card.className="mission-card "+statusClass+(selected===m.id?" mission-card-focused":"");card.dataset.missionId=m.id;
  const id=document.createElement("div");id.className="mission-id";id.textContent=m.id;
  const info=document.createElement("div");info.className="mission-info";const title=document.createElement("h3");title.textContent=m.title;const desc=document.createElement("p");desc.textContent=m.desc;const study=document.createElement("small");study.className="mission-study-time";study.textContent="مطالعه ثبت‌شده: "+studyFormat(studyMinutes.get(m.id)||0);info.append(title,desc,study);
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
window.addEventListener("kfox:training-data-updated",renderMissions);

// Legacy weight values remain readable by gym.js for backward compatibility.
function renderWeight() {}

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
  window.KFOX_OPERATIONAL_DATA_READY = false;
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
      // Keep device-only rows, but let the cloud copy win when the same record exists.
      [...(Array.isArray(localRows) ? localRows : []), ...(Array.isArray(cloudRows) ? cloudRows : [])]
        .forEach(row => { if (row && (row[key] || row.id)) rows.set(row[key] || row.id, row); });
      return Array.from(rows.values());
    };
    // Cloud is authoritative for profile fields. A stale, partially initialized
    // local profile must not blank out height or weight restored from the account.
    missionStates._gym = {
      ...localGym,
      ...remoteGym,
      profile: { ...(localGym.profile || {}), ...(remoteGym.profile || {}) },
      targets: { ...(localGym.targets || {}), ...(remoteGym.targets || {}) },
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
    const renderErrors = [];
    const safeRender = (label, fn) => {
      try { fn(); }
      catch (error) {
        renderErrors.push(label);
        console.error("K-FOX render failed (" + label + "):", error);
      }
    };
    safeRender("missions", renderMissions);
    safeRender("reports", renderReports);
    safeRender("weight", renderWeight);
    safeRender("skills", renderSkills);
    safeRender("finance", renderAssets);
    // Always notify separately loaded modules, even if one panel has a UI error.
    operationalCloudReady = true;
    window.KFOX_OPERATIONAL_DATA_READY = true;
    window.dispatchEvent(new CustomEvent("kfox:operational-data-synced"));
    await persistOperationalData();
    const syncMessage = renderErrors.length
      ? "داده‌های ابری دریافت شدند؛ خطای نمایش در بخش: " + renderErrors.join("، ")
      : "همگام‌سازی اطلاعات حساب کامل شد.";
    ["journalFeedback", "archiveAuthFeedback"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = syncMessage;
    });
    console.info("K-FOX operational data synchronized.", { renderErrors });
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
  window.KFOX_OPERATIONAL_DATA_READY = false;
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

  const medalsToggle=document.getElementById("medalsToggle"),medalsPanel=document.getElementById("medalsPanel");
  medalsToggle?.addEventListener("click",()=>{const open=medalsPanel.hidden;medalsPanel.hidden=!open;medalsToggle.setAttribute("aria-expanded",String(open));medalsToggle.firstChild.textContent=open?"بستن مدال‌ها ":"نمایش مدال‌ها ";});

// RANDOM QUOTES: built-in quotes only. Personal archive quotes stay private in the archive.
const builtInQuotes = [
  {text:"You have power over your mind, not outside events. Realize this, and you will find strength.",author:"Marcus Aurelius",category:"Stoicism"},
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
(() => {
  const button=$("#randomQuoteButton"), quote=$("#randomQuoteText"), meta=$("#randomQuoteMeta");
  if(!button||!quote||!meta)return;
  let previousIndex=-1;
  function showRandomQuote(){
    if(builtInQuotes.length===0)return;
    let index=Math.floor(Math.random()*builtInQuotes.length);
    if(builtInQuotes.length>1&&index===previousIndex)index=(index+1+Math.floor(Math.random()*(builtInQuotes.length-1)))%builtInQuotes.length;
    previousIndex=index;
    const item=builtInQuotes[index];
    quote.textContent="“"+item.text+"”";
    meta.textContent="— "+item.author+" / "+item.category;
  }
  button.addEventListener("click",showRandomQuote);
  showRandomQuote();
})();

// PUNISHMENT ROOM: deliberately blunt, randomized discipline prompts.
(() => {
  const button=document.getElementById("punishmentButton"),quote=document.getElementById("punishmentText"),meta=document.getElementById("punishmentMeta");
  if(!button||!quote||!meta)return;
  const lines=[
    "بلند شو کونی. برنامه‌هات با نگاه کردن بهشون اجرا نمی‌شن.",
    "این حجم از بهانه‌تراشی رو اگر خرج کار می‌کردی، الان نصف راه رو رفته بودی.",
    "گوه‌کاری امروزت رو گردن کمبود انگیزه ننداز. کار رو شروع کن، انگیزه بعداً می‌رسه.",
    "قرار نیست کسی بیاد نجاتت بده. مسئولیت زندگی خودته، جمعش کن.",
    "بس کن نقش قربانیِ برنامه شلوغ رو بازی کردن. اولویت‌هات رو مشخص کن و انجامشون بده.",
    "کونی، پنج دقیقه غر زدن کافیه. یک صفحه بخون، یک کار تموم کن.",
    "تو خسته از تلاش نیستی؛ داری از شروع کردن فرار می‌کنی. فرقش رو بفهم.",
    "اگر هر روز فقط قول بدی، آخر ماه فقط یک مشت قول داری. خروجی بساز.",
    "گوشی رو بذار کنار. دنیا بدون اسکرول تو هم می‌چرخه.",
    "هیچ‌کس به نیت خوبت مدال نمی‌ده. نتیجه ثبت کن، نه خیال‌بافی.",
    "امروز رو هم با تعلل نسوزون. بلند شو و اون کار لعنتی رو تموم کن.",
    "بهانه‌هات رو قاب کن؛ چون ظاهراً بیشتر از دستاوردات بهشون رسیدگی می‌کنی.",
    "از خودت انتظار معجزه نداشته باش؛ فقط کار کوچیکی رو که هی عقب می‌ندازی انجام بده.",
    "این همه نقشه برای چی وقتی حتی قدم اول رو برنمی‌داری؟ شروع کن، نابغه.",
    "وقتت نامحدود نیست. مثل آدمی رفتار کن که اینو فهمیده."
  ];
  let previous=-1;
  button.addEventListener("click",()=>{let index=Math.floor(Math.random()*lines.length);if(lines.length>1&&index===previous)index=(index+1+Math.floor(Math.random()*(lines.length-1)))%lines.length;previous=index;quote.textContent="«"+lines[index]+"»";meta.textContent="DISCIPLINARY DIRECTIVE // "+String(index+1).padStart(2,"0");});
})();

// MUSIC VAULT: cloud-only private Supabase storage, synced across signed-in devices
(() => {
  const db=window.KFOX_SUPABASE, $id=id=>document.getElementById(id);
  const form=$id("musicUploadForm"); if(!form||!db)return;
  const bucket="kfox-music-vault", audio=$id("musicAudioPlayer");
  let user=null, tracks=[], activeTrack=null, activeObjectUrl=null, repeatMode="off", shuffleOn=false, shuffleRemaining=[];
  const dock=$id("musicDock"), dockToggle=$id("musicDockToggle"), dockSeek=$id("musicDockSeek");
  let dockVisible=localStorage.getItem("kfox-music-dock")!=="off";
  const say=(s,bad=false)=>{const el=$id("musicFeedback");el.textContent=s;el.style.color=bad?"#d58a7e":"var(--green)";};
  const repeatButton=$id("musicRepeatMode"), shuffleButton=$id("musicShuffle");
  const formatTime=value=>{if(!Number.isFinite(value)||value<0)return "0:00";const n=Math.floor(value);return Math.floor(n/60)+":"+String(n%60).padStart(2,"0");};
  function renderDock(){
    if(!dock)return;
    dock.hidden=!dockVisible;
    if(dockToggle){
      dockToggle.classList.toggle("is-on",dockVisible);
      dockToggle.setAttribute("aria-pressed",String(dockVisible));
      dockToggle.title=dockVisible?"مخفی کردن پخش‌کننده موسیقی":"نمایش پخش‌کننده موسیقی";
      const label=dockToggle.querySelector(".neon-toggle-label");
      if(label)label.textContent=dockVisible?"PLAYER ON":"PLAYER OFF";
    }
    $id("musicDockTitle").textContent=activeTrack?(activeTrack.title||"UNTITLED TRACK"):"NO TRACK SELECTED";
    $id("musicDockArtist").textContent=activeTrack?"K-FOX PRIVATE MUSIC VAULT":"برای پخش، آهنگ را از خزانه موسیقی انتخاب کن";
    $id("musicDockPlay").textContent=audio.paused?"▶":"Ⅱ";
    $id("musicDockPlay").setAttribute("aria-label",audio.paused?"پخش":"توقف موقت");
    ["musicDockPlay","musicDockPrev","musicDockNext","musicDockSeek"].forEach(id=>{const control=$id(id);if(control)control.disabled=!activeTrack;});
    const cover=$id("musicDockCover"),source=$id("musicNowCover");
    if(activeTrack&&source&&!source.hidden&&source.src){cover.src=source.src;cover.hidden=false;}else{cover.hidden=true;cover.removeAttribute("src");}
    syncDockProgress();
  }
  function syncDockProgress(){
    if(!dockSeek)return;
    const duration=audio.duration||0,current=audio.currentTime||0;
    dockSeek.value=duration?String(Math.round(current/duration*1000)):"0";
    $id("musicDockCurrent").textContent=formatTime(current);
    $id("musicDockDuration").textContent=formatTime(duration);
  }
  function stopDockPlayback(){
    audio.pause();audio.removeAttribute("src");audio.load();activeTrack=null;
    const cover=$id("musicNowCover");cover.hidden=true;cover.removeAttribute("src");
    $id("musicNowTitle").textContent="NO TRACK SELECTED";
    $id("musicNowArtist").textContent="PRIVATE CLOUD PLAYER";
    showLyrics(null);renderDock();
  }
  if(dockToggle)dockToggle.addEventListener("click",()=>{
    dockVisible=!dockVisible;localStorage.setItem("kfox-music-dock",dockVisible?"on":"off");renderDock();
  });
  $id("musicDockTerminal")?.addEventListener("click",()=>{
    document.querySelector('.nav-link[data-page="terminal"]')?.click();
    $id("musicUploadForm")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $id("musicDockPlay")?.addEventListener("click",()=>{
    if(!activeTrack)return;
    if(audio.paused)audio.play().catch(e=>say("پخش آهنگ ممکن نشد: "+e.message,true));else audio.pause();
  });
  $id("musicDockPrev")?.addEventListener("click",previousTrack);
  $id("musicDockNext")?.addEventListener("click",nextTrack);
  $id("musicDockStop")?.addEventListener("click",stopDockPlayback);
  dockSeek?.addEventListener("input",()=>{
    if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=(Number(dockSeek.value)/1000)*audio.duration;
  });
  audio.addEventListener("play",renderDock);
  audio.addEventListener("pause",renderDock);
  audio.addEventListener("timeupdate",syncDockProgress);
  audio.addEventListener("loadedmetadata",syncDockProgress);
  audio.addEventListener("durationchange",syncDockProgress);
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
  function previousTrack(){
    if(!activeTrack)return;
    const index=tracks.findIndex(t=>t.id===activeTrack.id);
    if(index>0)selectTrack(tracks[index-1],true);
    else if(repeatMode==="all"&&tracks.length>1)selectTrack(tracks[tracks.length-1],true);
    else {audio.currentTime=0;audio.play().catch(()=>{});}
  }
  audio.addEventListener("ended",()=>{if(repeatMode!=="one")nextTrack();});
  syncPlaybackControls();
  renderDock();
  async function signed(path){
    const r=await db.storage.from(bucket).createSignedUrl(path,3600);
    if(r.error)throw r.error;return r.data.signedUrl;
  }
  let musicLoadVersion=0, musicRenderVersion=0;
  async function load(){
    const version=++musicLoadVersion, requestedUserId=user?.id||null;
    if(!requestedUserId){tracks=[];render();return;}
    const r=await db.from("kfox_music_tracks").select("*").order("created_at",{ascending:false});
    if(version!==musicLoadVersion || user?.id!==requestedUserId)return;
    if(r.error){say("اتصال به آرشیو ابری برقرار نشد: "+r.error.message,true);return;}
    // A database row is rendered once even if duplicate IDs arrive from a stale request.
    tracks=Array.from(new Map((r.data||[]).map(track=>[track.id,track])).values());
    render();
    say("CLOUD LIBRARY SYNCED · "+tracks.length+"/50 TRACKS");
  }
  async function editTrack(track){
    const nextTitle=prompt("نام آهنگ:",track.title||"");
    if(nextTitle===null)return;
    if(!nextTitle.trim()){say("نام آهنگ نمی‌تواند خالی باشد.",true);return;}
    const nextLyrics=prompt("متن آهنگ / Lyrics:",track.lyrics||"");
    if(nextLyrics===null)return;
    const result=await db.from("kfox_music_tracks")
      .update({title:nextTitle.trim(),lyrics:nextLyrics.trim()||null})
      .eq("id",track.id).eq("owner_id",user.id);
    if(result.error){say("ذخیره ویرایش انجام نشد: "+result.error.message,true);return;}
    const updated={...track,title:nextTitle.trim(),lyrics:nextLyrics.trim()||null};
    tracks=tracks.map(item=>item.id===track.id?updated:item);
    if(activeTrack?.id===track.id){activeTrack=updated;$id("musicNowTitle").textContent=updated.title;showLyrics(updated);renderDock();}
    render();
    say("نام و متن آهنگ ذخیره شد.");
  }
  async function render(){
    const list=$id("musicTrackList"),version=++musicRenderVersion;
    if(!tracks.length){list.replaceChildren();list.textContent=user?"NO TRACKS IN CLOUD VAULT":"برای مشاهده‌ی آرشیو موسیقی وارد حساب شو.";return;}
    const fragment=document.createDocumentFragment();
    for(const t of tracks){
      const row=document.createElement("div");row.className="music-track";
      const img=document.createElement("img");img.alt="کاور";
      if(t.cover_path){try{img.src=await signed(t.cover_path);}catch{}}
      if(version!==musicRenderVersion)return;
      const main=document.createElement("div");main.className="music-track-main";
      const title=document.createElement("strong");title.textContent=t.title;
      const meta=document.createElement("small");meta.textContent=t.lyrics?"LYRICS ATTACHED · CLOUD":"PRIVATE CLOUD AUDIO";
      main.append(title,meta);
      const play=document.createElement("button");play.type="button";play.className="archive-action";play.textContent="PLAY";
      play.onclick=()=>selectTrack(t);
      const edit=document.createElement("button");edit.type="button";edit.className="archive-action";edit.textContent="EDIT";
      edit.setAttribute("aria-label","ویرایش نام و متن آهنگ "+t.title);
      edit.onclick=()=>editTrack(t);
      const del=document.createElement("button");del.type="button";del.className="archive-action danger";del.textContent="DELETE";
      del.onclick=async()=>{if(!confirm("این آهنگ و فایل‌هایش از آرشیو ابری حذف شوند؟"))return;
        const removed=await db.storage.from(bucket).remove([t.audio_path,...(t.cover_path?[t.cover_path]:[])]);
        if(removed.error){say(removed.error.message,true);return;}
        const x=await db.from("kfox_music_tracks").delete().eq("id",t.id).eq("owner_id",user.id);
        if(x.error){say(x.error.message,true);return;}
        if(activeTrack?.id===t.id)stopDockPlayback();
        await load();say("TRACK DELETED FROM CLOUD VAULT.");
      };
      row.append(img,main,play,edit,del);fragment.append(row);
    }
    if(version===musicRenderVersion)list.replaceChildren(fragment);
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
      renderDock();
      window.KFOX_LOG_ACTIVITY?.("music","پخش آهنگ: "+t.title);
      await audio.play();
    }catch(e){say("پخش آنلاین آهنگ ممکن نشد: "+e.message,true);}
  }
  $id("musicCopyLyrics").onclick=()=>{if(activeTrack?.lyrics)navigator.clipboard.writeText(activeTrack.lyrics).then(()=>say("LYRICS COPIED."),()=>say("کپی متن در این مرورگر مجاز نیست.",true));};
  form.addEventListener("submit",async e=>{
    e.preventDefault();if(!user){say("برای افزودن آهنگ ابتدا از آرشیو شخصی وارد حساب شو.",true);return;}
    if(tracks.length>=50){say("ظرفیت آرشیو ۵۰ آهنگ است. ابتدا یک آهنگ حذف کن.",true);return;}
    const file=$id("musicAudio").files[0],cover=$id("musicCover").files[0];
    if(!file||(!file.type.includes("mpeg")&&!/\.mp3$/i.test(file.name))){say("فقط فایل MP3 مجاز است.",true);return;}
    if(file.size>50*1024*1024){say("حجم هر آهنگ باید کمتر از ۵۰ مگابایت باشد.",true);return;}
    if(cover&&(!["image/jpeg","image/png","image/webp"].includes(cover.type)||cover.size>8*1024*1024)){say("کاور باید JPG، PNG یا WEBP و حداکثر ۸ مگابایت باشد.",true);return;}
    const id=crypto.randomUUID(),base=user.id+"/music/"+id;
    say("UPLOADING TO PRIVATE CLOUD...");
    let audioPath=base+".mp3",coverPath=cover?base+"-cover."+cover.name.split(".").pop().toLowerCase():null;
    try {
      const up=await window.KFOX_UPLOAD_FILE({db,bucket,path:audioPath,file,contentType:"audio/mpeg",
        onProgress:percent=>say("بارگذاری آهنگ: "+percent+"٪")});
      audioPath=up.data.path;
      if(coverPath){
        const cp=await window.KFOX_UPLOAD_FILE({db,bucket,path:coverPath,file:cover,contentType:cover.type,
          onProgress:percent=>say("بارگذاری کاور: "+percent+"٪")});
        coverPath=cp.data.path;
      }
    } catch(error) {
      if(audioPath) await db.storage.from(bucket).remove([audioPath]).catch(()=>{});
      if(coverPath) await db.storage.from(bucket).remove([coverPath]).catch(()=>{});
      say(error?.message||"بارگذاری آهنگ ناموفق بود.",true);return;
    }
    const saved=await db.from("kfox_music_tracks").insert({id,owner_id:user.id,title:$id("musicTitle").value.trim(),audio_path:audioPath,cover_path:coverPath,lyrics:$id("musicLyrics").value.trim()||null});
    if(saved.error){await db.storage.from(bucket).remove([audioPath,...(coverPath?[coverPath]:[])]);say(saved.error.message,true);return;}
    form.reset();await load();say("TRACK SAVED TO YOUR PRIVATE CLOUD VAULT.");
  });
  audio.addEventListener("error",()=>say("پخش آنلاین ناموفق بود؛ اتصال اینترنت را بررسی کن.",true));
  db.auth.getSession().then(({data})=>{user=data.session?.user||null;if(user)load();else say("برای دسترسی به آرشیو ابری از آرشیو شخصی وارد حساب شو.");});
  db.auth.onAuthStateChange((_event,session)=>{window.setTimeout(()=>{user=session?.user||null;if(user)load().catch(error=>say(error.message,true));else{tracks=[];render();stopDockPlayback();}},0);});
})();

// INITIAL GREETING
console.log("K-FOX OS initialized. Welcome, operative.");




// KFOX PDF LIBRARY + PRIVATE STUDY ANNOTATIONS
(() => {
  const db=window.KFOX_SUPABASE;
  const form=document.getElementById("pdfUploadForm");
  if(!form || !db) return;
  const $id=id=>document.getElementById(id);
  const bucket="personal-archive";
  let user=null, documents=[], activeDoc=null, pdfDocument=null, pageNumber=1, zoom=1;
  let draft={bookmarks:[],highlights:[],notes:[]}, renderTask=null, loadingTask=null, pageObserver=null, renderedPages=new Set();
  const feedback=(text,bad=false)=>{const el=$id("pdfFeedback");if(el){el.textContent=text;el.style.color=bad?"#d58a7e":"var(--green)";}};
  const cleanTitle=name=>name.replace(/^\d+-/,"").replace(/\.pdf$/i,"").replace(/[_-]+/g," ").trim();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const storageKey=doc=>"kfox-pdf-study-v1:"+user.id+":"+doc.path;
  const pageLabel=()=>{const el=$id("pdfPageLabel");if(el)el.textContent="از "+(pdfDocument?.numPages||1);};

  const normalizePdfSearch=value=>String(value||"")
    .normalize("NFKD")
    .replace(/[\u0640\u064B-\u065F\u0670]/g,"")
    .replace(/[يى]/g,"ی").replace(/ك/g,"ک")
    .toLocaleLowerCase("fa")
    .replace(/[\s_\-./\\]+/g," ")
    .trim();
  function render(){
    const list=$id("pdfLibraryList"); if(!list)return;
    try{
      const query=normalizePdfSearch($id("pdfSearch")?.value||"");
      const terms=query.split(" ").filter(Boolean);
      const category=$id("pdfFilter")?.value||"all";
      const visible=documents.filter(doc=>{
        let decodedName=String(doc.fileName||"");
        try{decodedName=decodeURIComponent(decodedName);}catch{}
        const searchable=normalizePdfSearch([doc.title||"",doc.subject||"",doc.fileName||"",decodedName].join(" "));
        return (category==="all"||doc.category===category)&&terms.every(term=>searchable.includes(term));
      });
      const fragment=document.createDocumentFragment();
      if(!user){
        const message=document.createElement("p");message.textContent="برای مشاهده کتابخانه PDF وارد حساب شو.";fragment.append(message);
      }else if(!visible.length){
        const message=document.createElement("p");message.textContent=documents.length?"موردی با این فیلتر پیدا نشد.":"کتابخانه خالی است.";fragment.append(message);
      }else{
        visible.forEach(doc=>{
          const row=document.createElement("article");row.className="pdf-item";
          const info=document.createElement("div"),title=document.createElement("strong"),meta=document.createElement("small");
          title.textContent=doc.title||doc.fileName||"بدون نام";meta.textContent=[doc.subject,doc.category,doc.legacy?"فایل آرشیو قبلی":""].filter(Boolean).join(" · ");
          info.append(title,meta);
          const actions=document.createElement("div");actions.className="pdf-item-actions";
          const open=document.createElement("button");open.type="button";open.textContent="OPEN";
          open.addEventListener("click",()=>openDocument(doc));actions.append(open);
          if(!doc.legacy){
            const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="DELETE";
            del.addEventListener("click",async()=>{
              if(!confirm("این فایل PDF حذف شود؟"))return;
              const removed=await db.storage.from(bucket).remove([doc.path]);
              if(removed.error){feedback(removed.error.message,true);return;}
              const deleted=await db.from("kfox_pdf_library").delete().eq("id",doc.id).eq("owner_id",user.id);
              if(deleted.error){feedback(deleted.error.message,true);return;}
              await load();feedback("فایل حذف شد.");
            });
            actions.append(del);
          }
          row.append(info,actions);fragment.append(row);
        });
      }
      list.replaceChildren(fragment);
      const count=$id("pdfCount");if(count)count.textContent=visible.length+" PDF FILES";
    }catch(error){
      console.error("PDF library search/render failed:",error);
      feedback("خطا در جست‌وجو؛ فهرست قبلی حفظ شد. "+(error?.message||""),true);
    }
  }

  async function load(){
    if(!user){documents=[];render();return;}
    feedback("در حال همگام‌سازی کتابخانه...");
    const listFolder=async path=>{
      let result=await db.storage.from(bucket).list(path,{limit:100,sortBy:{column:"created_at",order:"desc"}});
      if(!result.error&&!(result.data||[]).length){
        const retry=await db.storage.from(bucket).list(path+"/",{limit:100,sortBy:{column:"created_at",order:"desc"}});
        if(retry.error||(retry.data||[]).length)result=retry;
      }
      return result;
    };
    const [legacy,newFiles,archiveFiles,metadata]=await Promise.all([
      listFolder("personal-archive"),listFolder(user.id+"/pdf-library"),listFolder(user.id+"/archive"),
      db.from("kfox_pdf_library").select("*").eq("owner_id",user.id).order("created_at",{ascending:false})
    ]);
    const error=[legacy,newFiles,archiveFiles,metadata].find(x=>x.error);
    if(error){feedback(error.error.message,true);return;}
    const metaByPath=new Map((metadata.data||[]).map(x=>[x.file_path,x]));
    const oldDocs=(legacy.data||[]).filter(x=>x.name&&/\.pdf$/i.test(x.name)).map(x=>({
      id:null,path:"personal-archive/"+x.name,fileName:x.name,title:cleanTitle(x.name),category:"other",subject:"",legacy:true
    }));
    const freshDocs=(newFiles.data||[]).filter(x=>x.name&&/\.pdf$/i.test(x.name)).map(x=>{
      const path=user.id+"/pdf-library/"+x.name,meta=metaByPath.get(path);
      return {id:meta?.id||null,path,fileName:x.name,title:meta?.title||cleanTitle(x.name),
        category:meta?.category||"other",subject:meta?.subject||"",legacy:false};
    });
    // Show PDFs uploaded through Personal Archive in the PDF Library's Archive category.
    // They remain in their original storage path and are not duplicated or re-uploaded.
    const archivedDocs=(archiveFiles.data||[]).filter(x=>x.name&&/\.pdf$/i.test(x.name)).map(x=>({
      id:null,path:user.id+"/archive/"+x.name,fileName:x.name,title:cleanTitle(x.name),
      category:"archive",subject:"",legacy:true
    }));
    documents=[...freshDocs,...archivedDocs,...oldDocs];render();
    feedback(documents.length+" فایل PDF همگام‌سازی شد (آرشیو شخصی: "+archivedDocs.length+").");
  }

  function getSaved(doc){
    try{
      const raw=localStorage.getItem(storageKey(doc));
      if(!raw)return {bookmarks:[],highlights:[],notes:[]};
      const data=JSON.parse(raw);
      return {bookmarks:Array.isArray(data.bookmarks)?data.bookmarks:[],highlights:Array.isArray(data.highlights)?data.highlights:[],notes:Array.isArray(data.notes)?data.notes:[]};
    }catch{return {bookmarks:[],highlights:[],notes:[]};}
  }

  async function openDocument(doc){
    feedback("در حال باز کردن PDF...");
    let passwordWasCancelled=false;
    try{
      const signed=await db.storage.from(bucket).createSignedUrl(doc.path,3600);
      if(signed.error)throw signed.error;
      const url=signed.data.signedUrl;
      activeDoc=doc;draft=getSaved(doc);pageNumber=1;zoom=1;renderedPages=new Set();
      $id("pdfViewerTitle").textContent=doc.title;
      $id("pdfOpenExternal").href=url;$id("pdfDownload").href=url;$id("pdfDownload").download=doc.fileName;
      $id("pdfViewerPanel").hidden=false;
      $id("pdfSavePrompt").hidden=true;
      $id("pdfReaderPages").replaceChildren();
      // PDF.js 6.5.438 includes newer font-conversion fixes for embedded CID fonts.
      // Keep the API and module worker pinned to the exact same release.
      if(!window.pdfjsLib){
        window.pdfjsLib=await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/pdf.mjs");
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/pdf.worker.min.mjs";
      loadingTask=window.pdfjsLib.getDocument({
        url,
        cMapUrl:"https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/cmaps/",
        cMapPacked:true,
        standardFontDataUrl:"https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/standard_fonts/",
        useSystemFonts:true,
        fontExtraProperties:true
      });
      loadingTask.onPassword=(updatePassword,reason)=>{
        const message=reason===window.pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
          ?"رمز PDF اشتباه است. دوباره واردش کن:"
          :"این فایل PDF رمز دارد. رمز را وارد کن:";
        const password=window.prompt(message);
        if(password===null){passwordWasCancelled=true;loadingTask.destroy();return;}
        updatePassword(password);
      };
      pdfDocument=await loadingTask.promise;
      renderStudyLists();
      $id("pdfContentsList").replaceChildren();
      $id("pdfContentsList").textContent="در حال استخراج سرفصل‌ها...";
      await renderPage();
      await buildPdfContents();
      $id("pdfViewerPanel").scrollIntoView({behavior:"smooth",block:"start"});
      feedback("جزوه آماده مطالعه است. هایلایت‌ها و بوکمارک‌ها تا زمان انتخاب ذخیره، موقت می‌مانند.");
    }catch(error){
      feedback(passwordWasCancelled?"ورود رمز لغو شد.":"باز کردن PDF ناموفق بود: "+(error?.message||"خطای ناشناخته"),true);
    }
  }

  async function buildPdfContents(){
    const list=$id("pdfContentsList");if(!list||!pdfDocument)return;
    list.replaceChildren();
    const entries=[];
    for(let n=1;n<=pdfDocument.numPages;n++){
      const page=await pdfDocument.getPage(n);
      const content=await page.getTextContent();
      const lines=new Map();
      (content.items||[]).forEach(item=>{
        if(!item.str||!item.str.trim()||!item.transform)return;
        const y=Math.round(item.transform[5]/2)*2;
        if(!lines.has(y))lines.set(y,{parts:[],sizes:[],fonts:[]});
        const line=lines.get(y);line.parts.push(item.str);line.sizes.push(Math.abs(item.transform[3]||0));line.fonts.push(String(item.fontName||""));
      });
      const pageLines=[...lines.values()].map(line=>({
        text:line.parts.join(" ").replace(/\\s+/g," ").trim(),
        size:line.sizes.length?line.sizes.reduce((a,b)=>a+b,0)/line.sizes.length:0,
        bold:line.fonts.some(font=>/bold|semibold|black|heavy/i.test(font))
      })).filter(line=>line.text.length>=3&&line.text.length<=105);
      const sizes=pageLines.map(line=>line.size).filter(size=>size>0).sort((a,b)=>a-b);
      const median=sizes.length?sizes[Math.floor(sizes.length/2)]:0;
      const headings=pageLines.filter(line=>
        line.bold||(median>0&&line.size>=median*1.2&&line.text.length<=90)||
        (/^[A-Z0-9\\s:.,()/-]{4,70}$/.test(line.text)&&/[A-Z]/.test(line.text))
      );
      // Always add a reliable page destination, even when PDF.js cannot
      // identify Persian headings or the document has no extractable text.
      entries.push({page:n,title:"رفتن به صفحه "+n});
      headings.slice(0,8).forEach(line=>{
        const title=line.text.replace(/[\u200e\u200f\u202a-\u202e]/g,"").trim();
        if(title&&title!=="صفحه "+n)entries.push({page:n,title:"سرفصل: "+title});
      });
    }
    if(!entries.length){
      for(let n=1;n<=pdfDocument.numPages;n++)entries.push({page:n,title:"صفحه "+n});
    }
    entries.forEach(entry=>{
      const button=document.createElement("button");button.type="button";button.className="pdf-content-jump";
      button.textContent="صفحه "+entry.page+" · "+entry.title;button.title=entry.title;
      button.addEventListener("click",()=>goToPage(entry.page));
      list.append(button);
    });
    if(!entries.length)list.textContent="سرفصلی در این فایل پیدا نشد.";
  }

  async function renderPage(){
    if(!pdfDocument)return;
    if(pageObserver){pageObserver.disconnect();pageObserver=null;}
    const root=$id("pdfReaderPages");
    // Reset the reader's own scroll position whenever a document is opened or rerendered.
    root.scrollTop=0;
    root.replaceChildren();renderedPages=new Set();
    const width=Math.max(280,root.clientWidth-28);
    const first=await pdfDocument.getPage(1),base=first.getViewport({scale:1});
    const scale=Math.max(.55,Math.min(2.2,(width/base.width)*zoom));
    for(let n=1;n<=pdfDocument.numPages;n++){
      const holder=document.createElement("section");holder.className="pdf-continuous-page";holder.dataset.page=String(n);
      const badge=document.createElement("div");badge.className="pdf-page-number-badge";badge.textContent="PAGE "+n;
      const shell=document.createElement("div");shell.className="pdf-page-shell";
      shell.style.width=(base.width*scale)+"px";shell.style.height=(base.height*scale)+"px";
      const canvas=document.createElement("canvas");
      canvas.style.width=(base.width*scale)+"px";canvas.style.height=(base.height*scale)+"px";
      const textLayer=document.createElement("div");textLayer.className="textLayer";
      textLayer.style.width=(base.width*scale)+"px";textLayer.style.height=(base.height*scale)+"px";
      shell.append(canvas,textLayer);holder.append(badge,shell);root.append(holder);
    }
    pageObserver=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const holder=entry.target;pageObserver.unobserve(holder);
          renderContinuousPage(Number(holder.dataset.page),holder,scale).catch(e=>feedback("نمایش صفحه ناموفق بود: "+e.message,true));
        }
      });
    },{root,rootMargin:"900px 0px 900px 0px"});
    root.querySelectorAll(".pdf-continuous-page").forEach(holder=>pageObserver.observe(holder));
    // Re-apply after the new page placeholders have been laid out.
    root.scrollTo({top:0,left:0,behavior:"instant"});
    pageNumber=1;pageLabel();
    const firstPageInput=$id("pdfPageInput");
    if(firstPageInput)firstPageInput.value="1";
    root.onscroll=()=>{
      const center=root.getBoundingClientRect().top+root.clientHeight/2;
      let nearest=1,distance=Infinity;
      root.querySelectorAll(".pdf-continuous-page").forEach(holder=>{
        const rect=holder.getBoundingClientRect(),d=Math.abs((rect.top+rect.bottom)/2-center);
        if(d<distance){distance=d;nearest=Number(holder.dataset.page);}
      });
      pageNumber=nearest;pageLabel();
    };
    pageNumber=1;pageLabel();$id("pdfPageInput").max=String(pdfDocument.numPages);$id("pdfPageInput").value="1";
  }

  async function renderContinuousPage(n,holder,scale){
    if(!pdfDocument||renderedPages.has(n))return;
    renderedPages.add(n);
    const page=await pdfDocument.getPage(n),viewport=page.getViewport({scale});
    const shell=holder.querySelector(".pdf-page-shell"),canvas=shell.querySelector("canvas"),context=canvas.getContext("2d");
    shell.style.width=viewport.width+"px";shell.style.height=viewport.height+"px";
    const ratio=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
    const textLayer=shell.querySelector(".textLayer");
    const task=page.render({canvasContext:context,viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:null});
    await task.promise;
    const textContent=await page.getTextContent();
    await window.pdfjsLib.renderTextLayer({textContent,container:textLayer,viewport,textDivs:[]}).promise;
    (draft.highlights||[]).filter(h=>h.page===n).sort((a,b)=>b.start-a.start).forEach(h=>applyHighlightRange(textLayer,h.start,h.end));
    (draft.notes||[]).filter(note=>note.page===n).sort((a,b)=>b.start-a.start).forEach(note=>applyNoteRange(textLayer,note));
  }
  function offsetAt(root,node,offset){
    const range=document.createRange();range.selectNodeContents(root);
    try{range.setEnd(node,offset);}catch{return 0;}
    return range.toString().length;
  }
  function boundaryAt(root,target){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node,remaining=target,last=null;
    while((node=walker.nextNode())){
      last=node;
      if(remaining<=node.nodeValue.length)return {node,offset:remaining};
      remaining-=node.nodeValue.length;
    }
    return last?{node:last,offset:last.nodeValue.length}:null;
  }
  function applyHighlightRange(root,start,end){
    if(!root||end<=start)return;
    const a=boundaryAt(root,start),b=boundaryAt(root,end);
    if(!a||!b)return;
    try{
      const range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);
      const mark=document.createElement("mark");mark.className="pdf-highlight-mark";
      mark.appendChild(range.extractContents());range.insertNode(mark);
    }catch{}
  }

  function applyNoteRange(root,item){
    if(!root||item.end<=item.start)return;
    const a=boundaryAt(root,item.start),b=boundaryAt(root,item.end);if(!a||!b)return;
    try{
      const range=document.createRange();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);
      const mark=document.createElement("mark");mark.className="pdf-note-anchor";mark.dataset.noteId=item.id;
      mark.title="برای دیدن نوت کلیک کن";
      mark.appendChild(range.extractContents());range.insertNode(mark);
    }catch{}
  }

  function renderStudyLists(){
    const bookmarks=$id("pdfBookmarkList"),highlights=$id("pdfHighlightList"),notes=$id("pdfNoteList");
    bookmarks.replaceChildren();highlights.replaceChildren();notes.replaceChildren();
    if(!draft.bookmarks.length)bookmarks.textContent="هنوز بوکمارکی ثبت نشده.";
    draft.bookmarks.slice().sort((a,b)=>a.page-b.page).forEach((item,index)=>{
      const row=document.createElement("div");row.className="pdf-study-entry";
      const go=document.createElement("button");go.type="button";go.className="pdf-study-jump";
      go.textContent="صفحه "+item.page+(item.note?" · "+item.note:"");
      go.addEventListener("click",()=>goToPage(item.page));
      const del=document.createElement("button");del.type="button";del.className="pdf-study-delete";del.textContent="×";del.setAttribute("aria-label","حذف بوکمارک");
      del.addEventListener("click",()=>{draft.bookmarks.splice(index,1);renderStudyLists();});
      row.append(go,del);bookmarks.append(row);
    });
    if(!draft.highlights.length)highlights.textContent="هنوز متنی هایلایت نشده.";
    draft.highlights.forEach((item,index)=>{
      const row=document.createElement("div");row.className="pdf-study-entry";
      const go=document.createElement("button");go.type="button";go.className="pdf-study-jump";
      go.textContent="صفحه "+item.page+" · "+item.text.slice(0,72)+(item.text.length>72?"…":"");
      go.addEventListener("click",async()=>{await goToPage(item.page);});
      const del=document.createElement("button");del.type="button";del.className="pdf-study-delete";del.textContent="×";del.setAttribute("aria-label","حذف هایلایت");
      del.addEventListener("click",async()=>{draft.highlights.splice(index,1);renderStudyLists();await renderPage();});
      row.append(go,del);highlights.append(row);
    });
    if(!draft.notes.length)notes.textContent="هنوز یادداشتی ثبت نشده.";
    draft.notes.forEach((item,index)=>{
      const row=document.createElement("div");row.className="pdf-study-entry pdf-note-entry";
      const go=document.createElement("button");go.type="button";go.className="pdf-study-jump";
      go.innerHTML='<span class="pdf-note-gem" aria-hidden="true">✦</span> صفحه '+item.page+' · '+escapeHtml(item.text.slice(0,66))+(item.text.length>66?"…":"");
      go.title=item.note;
      go.addEventListener("click",async()=>{await goToPage(item.page);alert(item.note);});
      const del=document.createElement("button");del.type="button";del.className="pdf-study-delete";del.textContent="×";del.setAttribute("aria-label","حذف نوت");
      del.addEventListener("click",async()=>{draft.notes.splice(index,1);renderStudyLists();await renderPage();});
      row.append(go,del);notes.append(row);
    });
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
  async function goToPage(target){
    if(!pdfDocument||!Number.isInteger(target)||target<1||target>pdfDocument.numPages)return;
    const root=$id("pdfReaderPages");
    const holder=root?.querySelector('.pdf-continuous-page[data-page="'+target+'"]');
    if(!root||!holder){feedback("صفحه موردنظر هنوز آماده نشده است.",true);return;}
    pageNumber=target;pageLabel();
    const input=$id("pdfPageInput");if(input)input.value=String(target);
    if(!renderedPages.has(target)){
      const base=(await pdfDocument.getPage(1)).getViewport({scale:1});
      const scale=Math.max(.55,Math.min(2.2,(Math.max(280,root.clientWidth-28)/base.width)*zoom));
      await renderContinuousPage(target,holder,scale);
    }
    // Calculate the destination relative to the scroll container's own viewport.
    const rootRect=root.getBoundingClientRect(),holderRect=holder.getBoundingClientRect();
    const destination=root.scrollTop+holderRect.top-rootRect.top-root.clientTop-8;
    root.scrollTo({top:Math.max(0,destination),behavior:"auto"});
    requestAnimationFrame(()=>{pageNumber=target;pageLabel();});
  }

  function submitPdfPageInput(){
    const input=$id("pdfPageInput");if(!input)return;
    const raw=input.value.trim(),target=Number(raw);
    if(!raw||!Number.isInteger(target)||!pdfDocument||target<1||target>pdfDocument.numPages){
      input.value=String(pageNumber);feedback("شماره صفحه معتبر نیست.",true);return;
    }
    goToPage(target);
  }
  $id("pdfPageInput")?.addEventListener("change",submitPdfPageInput);
  $id("pdfPageInput")?.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();submitPdfPageInput();event.currentTarget.blur();}
  });
  $id("pdfPrevPage")?.addEventListener("click",()=>goToPage(Math.max(1,pageNumber-1)));
  $id("pdfNextPage")?.addEventListener("click",()=>goToPage(Math.min(pdfDocument?.numPages||1,pageNumber+1)));
  $id("pdfZoomIn")?.addEventListener("click",async()=>{zoom=Math.min(2.5,zoom+0.15);await renderPage();});
  $id("pdfZoomOut")?.addEventListener("click",async()=>{zoom=Math.max(.65,zoom-.15);await renderPage();});

  $id("pdfReaderPages")?.addEventListener("click",event=>{
    const marker=event.target.closest(".pdf-note-anchor");if(!marker)return;
    const note=(draft.notes||[]).find(item=>item.id===marker.dataset.noteId);
    if(note)alert(note.note);
  });

  $id("pdfHighlightBtn")?.addEventListener("click",()=>{
    const selection=window.getSelection();
    if(!selection||selection.isCollapsed||!selection.rangeCount){feedback("اول جمله یا بخشی از متن را با ماوس انتخاب کن.",true);return;}
    const range=selection.getRangeAt(0),root=$id("pdfReaderPages").querySelector(".pdf-continuous-page[data-page='"+pageNumber+"'] .textLayer");
    if(!root||!root.contains(range.commonAncestorContainer)){feedback("برای هایلایت، متن داخل صفحه PDF را انتخاب کن.",true);return;}
    const start=offsetAt(root,range.startContainer,range.startOffset),end=offsetAt(root,range.endContainer,range.endOffset);
    const text=selection.toString().trim();
    if(!text||end<=start){feedback("متن انتخاب‌شده قابل ثبت نیست.",true);return;}
    const entry={page:pageNumber,start,end,text};
    draft.highlights.push(entry);applyHighlightRange(root,start,end);selection.removeAllRanges();
    renderStudyLists();feedback("هایلایت اضافه شد؛ هنگام بستن می‌توانی ذخیره‌اش کنی.");
  });

  // Keep the browser text selection when the toolbar button receives the click.
  $id("pdfNoteBtn")?.addEventListener("mousedown",event=>event.preventDefault());
  $id("pdfHighlightBtn")?.addEventListener("mousedown",event=>event.preventDefault());
  $id("pdfReaderPages")?.addEventListener("click",event=>{
    const anchor=event.target.closest?.(".pdf-note-anchor");
    if(!anchor)return;
    const item=(draft.notes||[]).find(note=>note.id===anchor.dataset.noteId);
    if(item)alert(item.note);
  });

  $id("pdfNoteBtn")?.addEventListener("click",()=>{
    const selection=window.getSelection();
    if(!selection||selection.isCollapsed||!selection.rangeCount){feedback("اول جمله‌ای را که می‌خواهی کنارش نوت بگذاری انتخاب کن.",true);return;}
    const range=selection.getRangeAt(0),root=$id("pdfReaderPages").querySelector(".pdf-continuous-page[data-page='"+pageNumber+"'] .textLayer");
    if(!root||!root.contains(range.commonAncestorContainer)){feedback("متن انتخاب‌شده باید داخل صفحه PDF باشد.",true);return;}
    const start=offsetAt(root,range.startContainer,range.startOffset),end=offsetAt(root,range.endContainer,range.endOffset),text=selection.toString().trim();
    if(!text||end<=start){feedback("متن انتخاب‌شده قابل ثبت نیست.",true);return;}
    const note=prompt("نوت مربوط به این جمله را بنویس:","");
    if(note===null||!note.trim())return;
    const item={id:"note-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),page:pageNumber,start,end,text,note:note.trim()};
    draft.notes.push(item);applyNoteRange(root,item);selection.removeAllRanges();renderStudyLists();
    feedback("نوت به جمله وصل شد. نشان الماسی کنار متن پیداست.");
  });

  $id("pdfBookmarkBtn")?.addEventListener("click",()=>{
    if(!pdfDocument)return;
    const note=prompt("یادداشت کوتاه برای این بوکمارک (اختیاری):","");
    if(note===null)return;
    draft.bookmarks.push({page:pageNumber,note:note.trim(),createdAt:Date.now()});
    renderStudyLists();feedback("بوکمارک صفحه "+pageNumber+" اضافه شد.");
  });

  function requestClose(){$id("pdfSavePrompt").hidden=false;}
  function finishClose(){
    if(renderTask){try{renderTask.cancel();}catch{}renderTask=null;}
    if(loadingTask){try{loadingTask.destroy();}catch{}loadingTask=null;}
    pdfDocument=null;activeDoc=null;
    setPdfFocus(false);
    $id("pdfSavePrompt").hidden=true;$id("pdfViewerPanel").hidden=true;
    $id("pdfReaderPages").replaceChildren();$id("pdfBookmarkList").replaceChildren();$id("pdfHighlightList").replaceChildren();$id("pdfNoteList").replaceChildren();
  }
  const focusToggle=$id("pdfFocusToggle");
  function setPdfFocus(enabled){
    const panel=$id("pdfViewerPanel");if(!panel)return;
    panel.classList.toggle("pdf-focus-mode",enabled);
    focusToggle?.setAttribute("aria-pressed",String(enabled));
    if(focusToggle)focusToggle.textContent=enabled?"✕ خروج از تمرکز":"⛶ حالت تمرکز";
  }
  focusToggle?.addEventListener("click",()=>setPdfFocus(!$id("pdfViewerPanel").classList.contains("pdf-focus-mode")));
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&$id("pdfViewerPanel")?.classList.contains("pdf-focus-mode"))setPdfFocus(false);
  });
  $id("pdfCloseViewer")?.addEventListener("click",requestClose);
  $id("pdfContinueReading")?.addEventListener("click",()=>$id("pdfSavePrompt").hidden=true);
  $id("pdfDiscardAndClose")?.addEventListener("click",finishClose);
  $id("pdfSaveAndClose")?.addEventListener("click",()=>{
    if(!activeDoc)return finishClose();
    try{
      localStorage.setItem(storageKey(activeDoc),JSON.stringify({version:1,bookmarks:draft.bookmarks,highlights:draft.highlights,notes:draft.notes,savedAt:new Date().toISOString()}));
      feedback("بوکمارک‌ها و هایلایت‌ها روی همین دستگاه ذخیره شدند.");
      finishClose();
    }catch(error){feedback("ذخیره یادداشت‌ها ممکن نشد: "+error.message,true);}
  });

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!user){feedback("ابتدا وارد حساب شو.",true);return;}
    const input=$id("pdfFile"),file=input.files?.[0];if(!file)return;
    if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){feedback("فقط فایل PDF مجاز است.",true);return;}
    if(file.size>50*1024*1024){feedback("حجم فایل بیشتر از ۵۰ مگابایت است.",true);return;}
    const id=crypto.randomUUID(),safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    let path=user.id+"/pdf-library/"+id+"-"+safeName;
    feedback("در حال بارگذاری در فضای ابری...");
    let uploaded;
    try{
      uploaded=await window.KFOX_UPLOAD_FILE({db,bucket,path,file,contentType:"application/pdf",onProgress:percent=>feedback("بارگذاری PDF: "+percent+"٪")});
      path=uploaded.data.path;
    }catch(error){feedback("بارگذاری PDF ناموفق بود: "+(error?.message||"خطای ناشناخته"),true);return;}
    const saved=await db.from("kfox_pdf_library").insert({owner_id:user.id,title:$id("pdfTitle").value.trim(),category:$id("pdfCategory").value,subject:$id("pdfSubject").value.trim()||null,file_path:path});
    if(saved.error){await db.storage.from(bucket).remove([path]);feedback(saved.error.message,true);return;}
    form.reset();await load();feedback("PDF با موفقیت به کتابخانه خصوصی اضافه شد.");
  });

  $id("pdfSearch")?.addEventListener("input",render);
  $id("pdfFilter")?.addEventListener("change",render);
  db.auth.getSession().then(({data,error})=>{
    if(error){feedback(error.message,true);return;}
    user=data?.session?.user||null;load().catch(e=>feedback(e.message,true));
  });
  db.auth.onAuthStateChange((_event,session)=>{
    window.setTimeout(()=>{
      user=session?.user||null;
      if(!user&&activeDoc)finishClose();
      load().catch(e=>feedback(e.message,true));
    },0);
  });
})();