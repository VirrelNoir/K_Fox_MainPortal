(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const db = window.KFOX_SUPABASE;
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const uid = () => window.crypto?.randomUUID?.() || "kf-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  const dateLabel = value => value ? new Intl.DateTimeFormat("fa-IR-u-ca-persian",{dateStyle:"medium"}).format(new Date(value)) : "بدون تاریخ";
  const save = async () => { try { await saveMissionMeta(); } catch (e) { console.error("K-FOX save:",e); } };
  const listMarkup = (records, fields, emptyText) => {
    if (!records.length) return '<div class="empty-state">'+escapeHTML(emptyText)+'</div>';
    return records.slice().reverse().map(record => {
      const body = fields.map(([label,key]) => record[key] ? '<p><b>'+escapeHTML(label)+' · </b>'+escapeHTML(record[key])+'</p>' : '').join("");
      return '<article class="intel-record"><h3>'+escapeHTML(record.title)+'</h3><small>'+escapeHTML(record.category || record.subject || "")+' · '+escapeHTML(dateLabel(record.createdAt))+'</small>'+body+'<div class="intel-record-actions"><button type="button" data-record-delete="'+escapeHTML(record.id)+'">DELETE</button></div></article>';
    }).join("");
  };

  // INTELLIGENCE CASE FILES AND DECISION ROOM
  const caseForm = $("intelCaseForm");
  if (caseForm) {
    const renderCases = () => {
      const cases = missionStates._intelCases || [];
      $("intelCaseList").innerHTML = listMarkup(cases,[["ادعا / پرسش","claim"],["شواهد موافق","for"],["شواهد مخالف","against"],["نتیجه‌گیری موقت","conclusion"]],"هنوز پرونده تحلیلی ثبت نشده است.");
    };
    const renderDecisions = () => {
      const decisions = missionStates._intelDecisions || [];
      $("intelDecisionList").innerHTML = listMarkup(decisions,[["گزینه‌ها و پیامدها","options"],["ریسک‌ها","risks"],["انتخاب فعلی و دلیل","choice"]],"هنوز تصمیمی ثبت نشده است.");
    };
    caseForm.addEventListener("submit", async event => {
      event.preventDefault();
      const records = missionStates._intelCases || [];
      records.push({id:uid(),title:$("intelTitle").value.trim(),category:$("intelCategory").value,claim:$("intelClaim").value.trim(),for:$("intelFor").value.trim(),against:$("intelAgainst").value.trim(),conclusion:$("intelConclusion").value.trim(),createdAt:new Date().toISOString()});
      missionStates._intelCases = records;
      await save(); caseForm.reset(); renderCases();
    });
    $("intelDecisionForm").addEventListener("submit", async event => {
      event.preventDefault();
      const records = missionStates._intelDecisions || [];
      records.push({id:uid(),title:$("decisionTitle").value.trim(),options:$("decisionOptions").value.trim(),risks:$("decisionRisks").value.trim(),choice:$("decisionChoice").value.trim(),createdAt:new Date().toISOString()});
      missionStates._intelDecisions = records;
      await save(); event.target.reset(); renderDecisions();
    });
    document.addEventListener("click", async event => {
      const button = event.target.closest("[data-record-delete]");
      if (!button) return;
      const id = button.dataset.recordDelete;
      if ((missionStates._intelCases || []).some(x => x.id === id)) missionStates._intelCases = missionStates._intelCases.filter(x => x.id !== id);
      else missionStates._intelDecisions = (missionStates._intelDecisions || []).filter(x => x.id !== id);
      await save(); renderCases(); renderDecisions();
    });
    const challenges = [
      "دو توضیح برای یک اتفاق داری؛ چه شواهدی می‌تواند یکی را رد کند؟ قبل از انتخاب، چه داده‌ای کم داری؟",
      "اگر تصمیمی فقط در کوتاه‌مدت سودمند باشد اما در بلندمدت هزینه بسازد، چگونه آن را ارزیابی می‌کنی؟",
      "یک نفر با اطمینان زیاد ادعایی مطرح می‌کند. چه تفاوتی میان اعتمادبه‌نفس او و اعتبار شواهدش وجود دارد؟",
      "اگر دو گزینه هر دو ریسک دارند، کدام ریسک قابل‌کنترل‌تر است و چه چیزی این را مشخص می‌کند؟",
      "کدام بخش از باورت ممکن است تحت تأثیر سوگیری تأییدی باشد؟ چه شاهد مخالفی را جدی می‌گیری؟"
    ];
    $("intelNewChallenge").addEventListener("click", () => {
      const next = challenges[Math.floor(Math.random()*challenges.length)];
      $("intelChallengeText").textContent = next;
    });
    renderCases(); renderDecisions();
  }

  // DENTAL ACADEMIC PERFORMANCE
  const dentalForm = $("dentalStudyForm");
  if (dentalForm) {
    const getDental = () => missionStates._dental || {logs:[],exams:[]};
    const renderDental = () => {
      const data = getDental(), logs = data.logs || [], exams = data.exams || [];
      const minutes = logs.reduce((sum,item)=>sum+Number(item.minutes||0),0);
      const quizzes = logs.filter(item=>item.quiz !== null && item.quiz !== undefined && item.quiz !== "").map(item=>Number(item.quiz));
      $("dentalLogCount").textContent = new Intl.NumberFormat("fa-IR").format(logs.length);
      $("dentalStudyHours").textContent = new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(minutes/60);
      $("dentalAverageQuiz").textContent = quizzes.length ? Math.round(quizzes.reduce((a,b)=>a+b,0)/quizzes.length)+"٪" : "—";
      $("dentalReviewCount").textContent = new Intl.NumberFormat("fa-IR").format(logs.filter(x=>x.review).length);
      const subjects = ["anatomy","physiology","cell","dental-anatomy","english","other"];
      const names = {anatomy:"آناتومی",physiology:"فیزیولوژی",cell:"زیست‌شناسی سلولی","dental-anatomy":"آناتومی دندان",english:"اصطلاحات انگلیسی",other:"سایر"};
      $("dentalSubjectPerformance").innerHTML = subjects.map(subject => {
        const rows = logs.filter(x=>x.subject===subject);
        if (!rows.length) return "";
        const avg = Math.round(rows.reduce((sum,x)=>sum+Number(x.mastery||0),0)/rows.length/5*100);
        return '<div class="dental-subject-row"><strong>'+names[subject]+'</strong><div class="dental-subject-track"><span style="width:'+avg+'%"></span></div><span>'+avg+'٪</span></div>';
      }).join("") || '<div class="empty-state">با ثبت اولین جلسه، عملکرد هر درس اینجا نمایش داده می‌شود.</div>';
      $("dentalStudyHistory").innerHTML = logs.length ? logs.slice().reverse().map(item =>
        '<article class="workspace-item"><div class="workspace-item-main"><h3>'+escapeHTML(item.topic)+'</h3><p>'+escapeHTML(names[item.subject]||item.subject)+' · '+escapeHTML(String(item.minutes))+' دقیقه · تسلط '+escapeHTML(String(item.mastery))+'/5 · اطمینان '+escapeHTML(String(item.confidence))+'/5'+(item.quiz!==null&&item.quiz!==""?' · آزمون '+escapeHTML(String(item.quiz))+'٪':'')+(item.review?' · نیازمند مرور':'')+'</p><div class="workspace-meta">'+escapeHTML(dateLabel(item.createdAt))+'</div></div><button type="button" class="workspace-delete" data-dental-log-delete="'+escapeHTML(item.id)+'">DELETE</button></article>'
      ).join("") : '<div class="empty-state">هنوز جلسه‌ای ثبت نشده است.</div>';
      $("dentalExamHistory").innerHTML = exams.length ? exams.slice().reverse().map(item =>
        '<article class="workspace-item"><div class="workspace-item-main"><h3>'+escapeHTML(item.title)+' · '+escapeHTML(item.score)+'٪</h3><p>'+escapeHTML(item.subject)+'</p><p>'+escapeHTML(item.errors||"بدون نکته ثبت‌شده")+'</p><div class="workspace-meta">'+escapeHTML(dateLabel(item.createdAt))+'</div></div><button type="button" class="workspace-delete" data-dental-exam-delete="'+escapeHTML(item.id)+'">DELETE</button></article>'
      ).join("") : '<div class="empty-state">هنوز نتیجه آزمونی ثبت نشده است.</div>';
    };
    dentalForm.addEventListener("submit", async event => {
      event.preventDefault();
      const data = getDental(); data.logs = data.logs || [];
      const quizValue = $("dentalQuiz").value;
      data.logs.push({id:uid(),subject:$("dentalSubject").value,topic:$("dentalTopic").value.trim(),minutes:Number($("dentalMinutes").value),mastery:Number($("dentalMastery").value),quiz:quizValue===""?null:Number(quizValue),confidence:Number($("dentalConfidence").value),review:$("dentalNeedsReview").checked,createdAt:new Date().toISOString()});
      missionStates._dental = data; await save(); dentalForm.reset(); $("dentalFeedback").textContent="گزارش مطالعه ذخیره شد."; renderDental();
    });
    $("dentalExamForm").addEventListener("submit", async event => {
      event.preventDefault();
      const data = getDental(); data.exams = data.exams || [];
      data.exams.push({id:uid(),title:$("dentalExamTitle").value.trim(),subject:$("dentalExamSubject").value.trim(),score:Number($("dentalExamScore").value),errors:$("dentalExamErrors").value.trim(),createdAt:new Date().toISOString()});
      missionStates._dental = data; await save(); event.target.reset(); $("dentalFeedback").textContent="نتیجه آزمون ثبت شد."; renderDental();
    });
    document.addEventListener("click", async event => {
      const log = event.target.closest("[data-dental-log-delete]");
      const exam = event.target.closest("[data-dental-exam-delete]");
      if (!log && !exam) return;
      const data = getDental();
      if (log) data.logs = (data.logs||[]).filter(x=>x.id!==log.dataset.dentalLogDelete);
      if (exam) data.exams = (data.exams||[]).filter(x=>x.id!==exam.dataset.dentalExamDelete);
      missionStates._dental = data; await save(); renderDental();
    });
    renderDental();
  }

  // CENTRAL PRIVATE PDF LIBRARY. Uses the existing personal-archive bucket and account.
  const pdfForm = $("pdfUploadForm");
  if (pdfForm && db) {
    const bucket = "personal-archive";
    let user = null, files = [], signedCache = new Map();
    const say = (message,bad=false) => { $("pdfFeedback").textContent=message; $("pdfFeedback").style.color=bad?"#d58a7e":"var(--green)"; };
    const metadata = () => missionStates._pdfLibrary || {};
    const categoryNames = {dentistry:"دندان‌پزشکی",anatomy:"آناتومی و فیزیولوژی",science:"علوم پایه",analysis:"تحلیل و پژوهش",other:"سایر"};
    const safeName = name => String(name||"document.pdf").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120) || "document.pdf";
    async function loadPdfFiles() {
      if (!user) { files=[]; renderPdfFiles(); return; }
      const result = await db.storage.from(bucket).list(user.id+"/pdf-library",{limit:100,sortBy:{column:"created_at",order:"desc"}});
      if (result.error) { say("خطا در دریافت کتابخانه: "+result.error.message,true); return; }
      files = (result.data||[]).filter(file=>file.name && file.name.toLowerCase().endsWith(".pdf"));
      renderPdfFiles();
      say("کتابخانه ابری همگام شد · "+files.length+" فایل");
    }
    function renderPdfFiles() {
      const list=$("pdfLibraryList"); if(!list)return;
      const meta=metadata(), query=($("pdfSearch").value||"").trim().toLowerCase(), filter=$("pdfFilter").value;
      const rows=files.map(file=>{
        const path=user.id+"/pdf-library/"+file.name;
        const info=meta[path]||{title:file.name,category:"other",subject:""};
        return {file,path,info};
      }).filter(row=>(filter==="all"||row.info.category===filter) && [row.info.title,row.info.subject,row.file.name].join(" ").toLowerCase().includes(query));
      $("pdfCount").textContent=files.length+" PDF FILES";
      if(!rows.length){list.innerHTML='<div class="empty-state">'+(user?"فایلی مطابق جست‌وجو پیدا نشد.":"برای دیدن کتابخانه وارد حساب شخصی شو.")+'</div>';return;}
      list.innerHTML=rows.map(row=>'<article class="pdf-item"><div><strong>'+escapeHTML(row.info.title||row.file.name)+'</strong><small>'+escapeHTML(categoryNames[row.info.category]||"سایر")+' · '+escapeHTML(row.info.subject||"بدون مبحث مرتبط")+' · '+escapeHTML(row.file.name)+'</small></div><div class="pdf-item-actions"><button type="button" data-pdf-open="'+escapeHTML(row.path)+'">READ</button><button type="button" data-pdf-delete="'+escapeHTML(row.path)+'" class="danger">DELETE</button></div></article>').join("");
    }
    async function openPdf(path) {
      const panel=$("pdfViewerPanel"), info=metadata()[path]||{title:path.split("/").pop()};
      try {
        let url=signedCache.get(path);
        if(!url){const result=await db.storage.from(bucket).createSignedUrl(path,3600);if(result.error)throw result.error;url=result.data.signedUrl;signedCache.set(path,url);}
        $("pdfViewerTitle").textContent=info.title||path.split("/").pop();
        $("pdfFrame").src=url+"#toolbar=1&navpanes=0";
        $("pdfOpenExternal").href=url; $("pdfDownload").href=url; $("pdfDownload").setAttribute("download",path.split("/").pop());
        panel.hidden=false; panel.scrollIntoView({behavior:"smooth",block:"start"});
      } catch(error) { say("بازکردن PDF ممکن نشد: "+error.message,true); }
    }
    pdfForm.addEventListener("submit",async event=>{
      event.preventDefault();
      if(!user){say("برای بارگذاری، ابتدا در بخش آرشیو شخصی وارد حساب شو.",true);return;}
      const file=$("pdfFile").files?.[0];
      if(!file)return;
      if(file.size>50*1024*1024){say("حجم فایل بیشتر از ۵۰ مگابایت است.",true);return;}
      if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){say("فقط فایل PDF پذیرفته می‌شود.",true);return;}
      const path=user.id+"/pdf-library/"+Date.now()+"-"+safeName(file.name);
      say("در حال بارگذاری فایل...");
      const upload=await db.storage.from(bucket).upload(path,file,{upsert:false,contentType:"application/pdf"});
      if(upload.error){say("بارگذاری انجام نشد: "+upload.error.message,true);return;}
      missionStates._pdfLibrary=missionStates._pdfLibrary||{};
      missionStates._pdfLibrary[path]={title:$("pdfTitle").value.trim(),category:$("pdfCategory").value,subject:$("pdfSubject").value.trim(),createdAt:new Date().toISOString()};
      await save(); pdfForm.reset(); await loadPdfFiles(); say("فایل با موفقیت به کتابخانه خصوصی اضافه شد.");
    });
    $("pdfSearch").addEventListener("input",renderPdfFiles);
    $("pdfFilter").addEventListener("change",renderPdfFiles);
    $("pdfCloseViewer").addEventListener("click",()=>{$("pdfFrame").src="about:blank";$("pdfViewerPanel").hidden=true;});
    $("pdfLibraryList").addEventListener("click",async event=>{
      const open=event.target.closest("[data-pdf-open]"), del=event.target.closest("[data-pdf-delete]");
      if(open){await openPdf(open.dataset.pdfOpen);return;}
      if(del){
        const path=del.dataset.pdfDelete;
        if(!confirm("این فایل PDF از کتابخانه خصوصی حذف شود؟"))return;
        const result=await db.storage.from(bucket).remove([path]);
        if(result.error){say("حذف فایل انجام نشد: "+result.error.message,true);return;}
        delete missionStates._pdfLibrary?.[path]; signedCache.delete(path); await save(); await loadPdfFiles(); say("فایل حذف شد.");
      }
    });
    async function setUser(session) {
      user=session?.user||null;
      if(user) await loadPdfFiles();
      else {files=[];signedCache.clear();$("pdfViewerPanel").hidden=true;renderPdfFiles();}
    }
    db.auth.getSession().then(({data})=>setUser(data.session));
    db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>setUser(session).catch(error=>console.warn("KFOX PDF library auth:",error)),0);});
    renderPdfFiles();
  } else if (pdfForm) {
    $("pdfLibraryList").innerHTML='<div class="empty-state">اتصال فضای ابری در دسترس نیست.</div>';
  }

  // Keep the five-level mission progress visible and explain it in each expandable status drawer.
  document.querySelectorAll(".mission-analysis-drawer").forEach(drawer => {
    const squares=drawer.querySelectorAll(".mission-level-square");
    const label=drawer.querySelector("summary");
    if(label && squares.length) label.title="برای ثبت سطح پیشرفت، یکی از پنج مربع را انتخاب کن.";
  });
})();