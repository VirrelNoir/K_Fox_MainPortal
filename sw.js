const CACHE_NAME="kfox-shell-v90-finance-money-photos";
const APP_FILES=["./","./index.html","./style.css?v=finance-money-photos-1","./script.js?v=restore-throne-state-on-load-2","./workspace.js?v=all-workspace-delete-tombstones-2","./advanced.js","./gym.js?v=universal-tus-uploads-1","./gym-push.js?v=rude-random-motivation-1","./settings.js?v=compact-display-settings-1","./assets/queen-throne.png","./assets/fonts/mj-casablanca.woff2","./favicon.svg","./manifest.webmanifest","./pwa-icon.svg","./pwa-icon-192.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  // Do not claim or reload already-open tabs during activation. Existing pages
  // may be submitting an authentication request; the new worker controls the
  // next navigation instead of interrupting that request.
  const activeClients=await self.clients.matchAll({type:"window",includeUncontrolled:false});
  if(activeClients.length===0){
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)));
  }
})()));
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    try{
      const response=await fetch(new Request(event.request,{cache:"no-store"}));
      if(response&&response.ok&&response.type!=="opaque"){
        await cache.put(event.request,response.clone()).catch(()=>{});
      }
      return response;
    }catch(error){
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached)return cached;
      if(event.request.mode==="navigate"){
        const appShell=await caches.match("./index.html");
        if(appShell)return appShell;
      }
      return Response.error();
    }
  })());
});
self.addEventListener("push",event=>{
  let data={title:"K-FOX",body:"اعلان جدید"};
  try{if(event.data)data={...data,...event.data.json()};}catch{if(event.data)data.body=event.data.text();}
  const scopeUrl=new URL(self.registration.scope);
  let target=scopeUrl.href;
  try{
    const requested=new URL(data.url||scopeUrl.href,scopeUrl);
    if(requested.origin===scopeUrl.origin&&requested.pathname.startsWith(scopeUrl.pathname))target=requested.href;
  }catch{}
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,icon:new URL("pwa-icon-192.png",scopeUrl).href,badge:new URL("pwa-icon-192.png",scopeUrl).href,
    tag:data.tag||"kfox-reminder",renotify:false,data:{url:target}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const scopeUrl=new URL(self.registration.scope);
  let target=scopeUrl.href;
  try{
    const requested=new URL(event.notification.data?.url||scopeUrl.href,scopeUrl);
    if(requested.origin===scopeUrl.origin&&requested.pathname.startsWith(scopeUrl.pathname))target=requested.href;
  }catch{}
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>{
      const url=new URL(client.url);
      return url.origin===scopeUrl.origin&&url.pathname.startsWith(scopeUrl.pathname);
    });
    if(existing){existing.navigate(target);return existing.focus();}
    return clients.openWindow(target);
  }));
});
