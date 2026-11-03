import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_SUBJECT=Deno.env.get("VAPID_SUBJECT")||"mailto:admin@example.com";
async function getVapidConfig(){
  const {data,error}=await admin.rpc("kfox_get_vapid_config");
  if(error)throw new Error("Unable to load secure push configuration: "+error.message);
  const publicKey=data?.publicKey||"";
  const privateKey=data?.privateKey||"";
  if(!publicKey||!privateKey)throw new Error("VAPID keys are not configured in Supabase Vault.");
  return {publicKey,privateKey};
}
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const localParts=(timezone:string,date=new Date())=>{
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  return {date:get("year")+"-"+get("month")+"-"+get("day"),hour:Number(get("hour")),minute:Number(get("minute"))};
};
async function sendDue(){
  const vapid=await getVapidConfig();
  webpush.setVapidDetails(VAPID_SUBJECT,vapid.publicKey,vapid.privateKey);
  const {data:subscriptions,error}=await admin.from("kfox_gym_push_subscriptions").select("*").eq("enabled",true);
  if(error)throw error;
  let sent=0,expired=0,checked=0;
  for(const item of subscriptions||[]){
    let now;
    try{now=localParts(item.timezone||"UTC");}catch{now=localParts("UTC");}
    const isSeven=now.hour===19&&now.minute<=4&&item.last_19_sent_on!==now.date;
    const isTen=now.hour===22&&now.minute<=4&&item.last_22_sent_on!==now.date;
    if(!isSeven&&!isTen)continue;
    checked++;
    let shouldSend=isSeven;
    let title="K-FOX · گزارش تغذیه";
    let body="وقت ثبت کالری و پروتئین امروز است.";
    if(isTen){
      const {data:log,error:logError}=await admin.from("kfox_gym_nutrition").select("log_date").eq("owner_id",item.owner_id).eq("log_date",now.date).maybeSingle();
      if(logError)throw logError;
      shouldSend=!log;
      title="K-FOX · پروتکل ناقص";
      body="لعنتی، گزارش تغذیه‌ات رو ثبت کن!";
      if(log){
        await admin.from("kfox_gym_push_subscriptions").update({last_22_sent_on:now.date,updated_at:new Date().toISOString()}).eq("id",item.id);
        continue;
      }
    }
    if(!shouldSend)continue;
    try{
      await webpush.sendNotification(item.subscription,JSON.stringify({title,body,tag:"kfox-gym-"+(isSeven?"19":"22")+"-"+now.date,url:"./"}));
      const patch=isSeven?{last_19_sent_on:now.date,updated_at:new Date().toISOString()}:{last_22_sent_on:now.date,updated_at:new Date().toISOString()};
      const {error:updateError}=await admin.from("kfox_gym_push_subscriptions").update(patch).eq("id",item.id);
      if(updateError)throw updateError;
      sent++;
    }catch(error){
      const statusCode=(error as {statusCode?:number})?.statusCode;
      if(statusCode===404||statusCode===410){
        await admin.from("kfox_gym_push_subscriptions").delete().eq("id",item.id);
        expired++;
      }else console.error("K-FOX push delivery failed:",error);
    }
  }
  return {ok:true,checked,sent,expired};
}
Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const authorization=request.headers.get("Authorization")||"";
  let body:any={};
  try{body=await request.json();}catch{return json({error:"Invalid JSON"},400);}
  if(body.action==="send_due"){
    // The Edge gateway has already verified the JWT because verify_jwt=true.
    // Check its signed role claim instead of comparing token strings: this remains
    // valid when Supabase rotates or changes the service-role key representation.
    const schedulerToken=authorization.replace(/^Bearer\\s+/i,"");
    let schedulerClaims:any={};
    try{const payload=schedulerToken.split(".")[1];const base64=payload.replace(/-/g,"+").replace(/_/g,"/");schedulerClaims=JSON.parse(atob(base64+"=".repeat((4-base64.length%4)%4)));}catch{}
    if(schedulerClaims.role!=="service_role")return json({error:"Unauthorized scheduler"},401);
    try{return json(await sendDue());}catch(error){console.error(error);return json({error:(error as Error).message||"Scheduler failed"},500);}
  }
  const token=authorization.replace(/^Bearer\s+/i,"");
  if(!token)return json({error:"Authentication required"},401);
  const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser(token);
  if(userError||!userData.user)return json({error:"Invalid session"},401);
  if(body.action==="public_key"){
    try{const vapid=await getVapidConfig();return json({publicKey:vapid.publicKey});}
    catch(error){console.error("K-FOX VAPID config unavailable:",error);return json({error:"Push keys are not configured"},503);}
  }
  if(body.action==="subscribe"){
    const subscription=body.subscription;
    if(!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth)return json({error:"Invalid push subscription"},400);
    let timezone=String(body.timezone||"UTC").slice(0,80);
    try{new Intl.DateTimeFormat("en-US",{timeZone:timezone});}catch{timezone="UTC";}
    const {error}=await admin.from("kfox_gym_push_subscriptions").upsert({
      owner_id:userData.user.id,endpoint:subscription.endpoint,subscription,timezone,enabled:true,updated_at:new Date().toISOString()
    },{onConflict:"endpoint"});
    if(error)return json({error:error.message},500);
    return json({ok:true});
  }
  return json({error:"Unknown action"},400);
});
