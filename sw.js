const CACHE_NAME="kfox-shell-v46-pdf-library";
const APP_FILES=["./","./index.html","./style.css","./script.js?v=private-archive-46","./workspace.js","./advanced.js","./gym.js?v=operational-sync-fix-41","./gym-push.js","./favicon.svg","./manifest.webmanifest","./pwa-icon.svg","./pwa-icon-192.png","./kfox-character-panels.png"];
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
  event.waitUntil(self.registration.showNotification(data.title,{
    body:data.body,icon:"./pwa-icon-192.png",badge:"./pwa-icon-192.png",
    tag:data.tag||"kfox-gym-reminder",renotify:false,data:{url:data.url||"./"}
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){existing.navigate(target);return existing.focus();}
    return clients.openWindow(target);
  }));
});
