import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
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
const cors={...corsHeaders,"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
async function sendDue(){
  const vapid=await getVapidConfig();
  webpush.setVapidDetails(VAPID_SUBJECT,vapid.publicKey,vapid.privateKey);
  const dueResult=await admin.from("kfox_notifications")
    .select("id,owner_id,title,body,module,scheduled_at,attempts")
    .eq("status","pending")
    .lte("scheduled_at",new Date().toISOString())
    .order("scheduled_at",{ascending:true})
    .limit(100);
  if(dueResult.error)throw dueResult.error;
  let checked=0,sent=0,expired=0,failed=0;
  for(const reminder of dueResult.data||[]){
    const {data:devices,error:deviceError}=await admin.from("kfox_gym_push_subscriptions")
      .select("id,subscription").eq("owner_id",reminder.owner_id).eq("enabled",true);
    if(deviceError)throw deviceError;
    if(!devices?.length)continue;
    checked++;
    let delivered=0,lastError="";
    for(const device of devices){
      try{
        await webpush.sendNotification(device.subscription,JSON.stringify({
          title:reminder.title,
          body:reminder.body||"یادآوری ثبت‌شده در K-FOX",
          tag:"kfox-"+reminder.module+"-"+reminder.id,url:"./"
        }));
        delivered++;
      }catch(error){
        const statusCode=(error as {statusCode?:number})?.statusCode;
        if(statusCode===404||statusCode===410){
          const {error:removeError}=await admin.from("kfox_gym_push_subscriptions").delete().eq("id",device.id);
          if(removeError)throw removeError;
          expired++;
        }else{lastError=(error as Error)?.message||"Push delivery failed";console.error("K-FOX scheduled push failed:",error);}
      }
    }
    if(delivered>0){
      const {error:updateError}=await admin.from("kfox_notifications").update({
        status:"sent",sent_at:new Date().toISOString(),attempts:Number(reminder.attempts||0)+1,last_error:null
      }).eq("id",reminder.id).eq("status","pending");
      if(updateError)throw updateError;
      sent++;
    }else{
      const attempts=Number(reminder.attempts||0)+1;
      const {error:updateError}=await admin.from("kfox_notifications").update({
        attempts,last_error:lastError||"No active device accepted the notification",
        status:attempts>=5?"failed":"pending"
      }).eq("id",reminder.id).eq("status","pending");
      if(updateError)throw updateError;
      failed++;
    }
  }
  return {ok:true,checked,sent,expired,failed};
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
    const schedulerToken=authorization.replace(/^Bearer\s+/i,"");
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
  if(body.action==="test"){
    try{
      const vapid=await getVapidConfig();
      webpush.setVapidDetails(VAPID_SUBJECT,vapid.publicKey,vapid.privateKey);
      const {data:subscriptions,error}=await admin.from("kfox_gym_push_subscriptions")
        .select("id,subscription").eq("owner_id",userData.user.id).eq("enabled",true);
      if(error)throw error;
      if(!subscriptions?.length)return json({error:"No active device subscription found. Enable notifications first."},409);
      let sent=0,expired=0,failed=0;
      for(const item of subscriptions){
        try{
          await webpush.sendNotification(item.subscription,JSON.stringify({
            title:"K-FOX · ارتباط برقرار است",
            body:"اعلان آزمایشی با موفقیت به این دستگاه ارسال شد.",
            tag:"kfox-push-test-"+Date.now(),url:"./"
          }));
          sent++;
        }catch(error){
          const statusCode=(error as {statusCode?:number})?.statusCode;
          if(statusCode===404||statusCode===410){
            await admin.from("kfox_gym_push_subscriptions").delete().eq("id",item.id);
            expired++;
          }else{failed++;console.error("K-FOX test push failed:",error);}
        }
      }
      return json({ok:sent>0,sent,expired,failed});
    }catch(error){
      console.error("K-FOX test notification failed:",error);
      return json({error:(error as Error).message||"Test notification failed"},500);
    }
  }
  return json({error:"Unknown action"},400);
});
