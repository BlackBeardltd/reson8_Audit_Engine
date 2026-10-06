const input=document.querySelector("#audioFile"),dropzone=document.querySelector("#dropzone"),filePanel=document.querySelector("#filePanel"),fileName=document.querySelector("#fileName"),fileDetails=document.querySelector("#fileDetails"),removeFile=document.querySelector("#removeFile"),submit=document.querySelector("#submitAudit"),actionMessage=document.querySelector("#actionMessage"),preflightState=document.querySelector("#preflightState"),resultPanel=document.querySelector("#resultPanel"),jobId=document.querySelector("#jobId"),serverHash=document.querySelector("#serverHash");
const auditStatus=document.querySelector("#auditStatus"),resultMessage=document.querySelector("#resultMessage"),reportActions=document.querySelector("#reportActions"),sampleReportLink=document.querySelector("#sampleReportLink"),fullReportLink=document.querySelector("#fullReportLink");
const masterTab=document.querySelector("#masterTab"),dspTab=document.querySelector("#dspTab"),masterSource=document.querySelector("#masterSource"),dspSource=document.querySelector("#dspSource"),catalogUrl=document.querySelector("#catalogUrl"),detectCatalog=document.querySelector("#detectCatalog"),catalogPlatform=document.querySelector("#catalogPlatform"),catalogPreview=document.querySelector("#catalogPreview"),catalogState=document.querySelector("#catalogState"),catalogCheck=document.querySelector("#catalogCheck");
const authStatus=document.querySelector("#authStatus"),authForm=document.querySelector("#authForm"),authEmail=document.querySelector("#authEmail"),authPassword=document.querySelector("#authPassword"),authSubmit=document.querySelector("#authSubmit"),authSignOut=document.querySelector("#authSignOut");
const checks={type:document.querySelector("#checkType"),size:document.querySelector("#checkSize"),hash:document.querySelector("#checkHash")};
const SESSION_KEY="reson8_audit_supabase_session";
const MAX_BYTES=50*1024*1024,AUDIO_EXTENSIONS=new Set(["mp3","wav","flac","aac","ogg","m4a"]);
let selectedFile=null,digest=null,mode="master",catalogReady=false,pollTimer=null,currentSession=null,supabaseConfig=null,currentAuditPayload=null;

function setCheck(el,state,value){el.classList.remove("ok","bad");if(state)el.classList.add(state);el.querySelector("b").textContent=value;}
function extensionOf(name){return name.includes(".")?name.split(".").pop().toLowerCase():"";}
function formatBytes(bytes){if(bytes<1024)return bytes+" B";if(bytes<1024*1024)return(bytes/1024).toFixed(1)+" KB";return(bytes/(1024*1024)).toFixed(2)+" MB";}
async function sha256(file){const buffer=await file.arrayBuffer(),hash=await crypto.subtle.digest("SHA-256",buffer);return[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");}

function persistSession(session){
  currentSession=session;
  if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  renderAuthState();
  renderReportAccess();
}
function loadStoredSession(){
  try{return JSON.parse(localStorage.getItem(SESSION_KEY)||"null");}catch{return null;}
}
function sessionExpired(session){
  return !session?.access_token||!session?.refresh_token||typeof session.expires_at!=="number"||session.expires_at<=Math.floor(Date.now()/1000)+60;
}
async function authRequest(path,body){
  if(!supabaseConfig)throw new Error("Browser authentication is not configured.");
  const response=await fetch(supabaseConfig.supabaseUrl+"/auth/v1/"+path,{
    method:"POST",
    headers:{"Content-Type":"application/json",apikey:supabaseConfig.supabasePublishableKey},
    body:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error_description||payload.msg||payload.message||"Authentication failed.");
  return payload;
}
async function refreshSession(){
  if(!currentSession?.refresh_token)return null;
  try{
    const payload=await authRequest("token?grant_type=refresh_token",{refresh_token:currentSession.refresh_token});
    const session={...payload,expires_at:Math.floor(Date.now()/1000)+(payload.expires_in||3600)};
    persistSession(session);
    return session;
  }catch{
    persistSession(null);
    return null;
  }
}
async function bootstrapAuth(){
  authStatus.textContent="AUTHENTICATION INITIALIZING…";
  try{
    const response=await fetch("/v1/auth/config",{cache:"no-store"});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.message||"Browser authentication is not configured.");
    supabaseConfig=payload;
    currentSession=loadStoredSession();
    if(currentSession&&sessionExpired(currentSession))await refreshSession();
    renderAuthState();
  }catch(error){
    authStatus.textContent=error instanceof Error?error.message:"Authentication unavailable.";
    authForm.classList.remove("hidden");
    authSignOut.classList.add("hidden");
  }
}
function renderAuthState(){
  const user=currentSession?.user;
  if(user){
    authStatus.textContent="SIGNED IN · "+(user.email||"OWNER");
    authForm.classList.add("hidden");
    authSignOut.classList.remove("hidden");
    authSignOut.textContent="Sign out";
  }else{
    authStatus.textContent="OWNER AUTHENTICATION REQUIRED FOR FULL REPORT";
    authForm.classList.remove("hidden");
    authSignOut.classList.add("hidden");
  }
  updateSubmit();
}
function renderReportAccess(){
  if(!currentAuditPayload?.full?.available)return;
  if(currentSession?.access_token){
    fullReportLink.href="/v1/audits/"+encodeURIComponent(currentAuditPayload.jobId)+"/reports/full";
    fullReportLink.classList.remove("hidden");
    resultMessage.textContent="Audit complete. Your sample and authenticated full report are ready.";
  }else{
    fullReportLink.classList.add("hidden");
    resultMessage.textContent="Audit complete. The sample report is ready. Sign in before starting an audit to receive owner-authorized full access.";
  }
}
async function getAccessToken(){
  if(!currentSession)return null;
  if(sessionExpired(currentSession)){
    const refreshed=await refreshSession();
    return refreshed?.access_token||null;
  }
  return currentSession.access_token;
}
async function authHeaders(extra={}){
  const token=await getAccessToken();
  return token?{...extra,Authorization:"Bearer "+token}:{...extra};
}

function updateSubmit(){
  submit.disabled=mode==="master"?!selectedFile||!digest:!catalogReady;
}
function setMode(next){
  mode=next;masterTab.classList.toggle("active",mode==="master");dspTab.classList.toggle("active",mode==="dsp");masterSource.classList.toggle("hidden",mode!=="master");dspSource.classList.toggle("hidden",mode!=="dsp");
  actionMessage.textContent=mode==="master"?"Select a valid master. Sign in first if you want the owner-authorized full report.":"Paste a supported DSP/catalog link. Sign in first if you want the owner-authorized full report.";
  updateSubmit();
}
async function inspect(file){
  selectedFile=file;digest=null;resultPanel.classList.add("hidden");filePanel.classList.remove("hidden");fileName.textContent=file.name;fileDetails.textContent=formatBytes(file.size)+" · "+(file.type||"audio")+" · "+extensionOf(file.name).toUpperCase();
  const validType=AUDIO_EXTENSIONS.has(extensionOf(file.name)),validSize=file.size>0&&file.size<=MAX_BYTES;
  setCheck(checks.type,validType?"ok":"bad",validType?"PASS":"INVALID");setCheck(checks.size,validSize?"ok":"bad",validSize?"PASS":"OVER LIMIT");
  if(validType&&validSize){preflightState.textContent="Computing integrity…";try{digest=await sha256(file);setCheck(checks.hash,"ok",digest.slice(0,12)+"…");preflightState.textContent="Ready for secure intake";actionMessage.textContent=currentSession?"Ready. Authenticated audit will receive owner-authorized full access.":"Ready. Sign in before submitting to receive owner-authorized full access.";}catch{setCheck(checks.hash,"bad","FAILED");preflightState.textContent="Integrity check failed";actionMessage.textContent="Could not calculate the local integrity hash.";}}
  else{setCheck(checks.hash,"","—");preflightState.textContent="Fix the source file";actionMessage.textContent="Choose a supported audio file under 50 MB.";}
  updateSubmit();
}
function clearFile(){selectedFile=null;digest=null;input.value="";filePanel.classList.add("hidden");preflightState.textContent="Waiting for source";setCheck(checks.type,"","—");setCheck(checks.size,"","—");setCheck(checks.hash,"","—");updateSubmit();}
async function previewCatalog(){
  const url=catalogUrl.value.trim();catalogReady=false;catalogPreview.classList.add("hidden");catalogPreview.textContent="";catalogState.textContent="Validating…";catalogPlatform.textContent="Detecting platform…";
  if(!url){catalogState.textContent="Waiting for URL";catalogPlatform.textContent="Platform not detected";setCheck(catalogCheck,"","—");updateSubmit();return;}
  try{
    const u=new URL(url);if(u.protocol!=="https:")throw new Error("Use an HTTPS URL");const host=u.hostname.toLowerCase();let platform="Unknown";
    if(host.includes("spotify"))platform="Spotify";else if(host.includes("apple.com")||host.includes("itunes.apple"))platform="Apple Music";else if(host.includes("youtube")||host==="youtu.be")platform="YouTube / YouTube Music";else if(host.includes("deezer"))platform="Deezer";else if(host.includes("tidal"))platform="Tidal";else throw new Error("Unsupported DSP or catalog host");
    catalogPlatform.textContent=platform;setCheck(catalogCheck,"ok","PASS");catalogState.textContent="URL accepted";catalogReady=true;
    catalogPreview.textContent="Catalog evidence will be collected server-side. Where the provider exposes a public audio preview, AudD will be used as an additional recognition evidence source.";catalogPreview.classList.remove("hidden");
    actionMessage.textContent=currentSession?"Ready. Authenticated catalog audit will receive owner-authorized full access.":"Ready. Sign in before submitting to receive owner-authorized full access.";
  }catch(e){catalogState.textContent="Invalid source";catalogPlatform.textContent="Unsupported or malformed URL";setCheck(catalogCheck,"bad","INVALID");actionMessage.textContent=e instanceof Error?e.message:"Invalid catalog URL";}
  updateSubmit();
}
function stopPolling(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}}
function applyAuditPayload(payload){
  currentAuditPayload=payload;
  auditStatus.textContent=(payload.status||"unknown").toUpperCase();
  auditStatus.className=payload.status==="failed"?"failed":payload.status==="completed"?"completed":"queued";
  if(payload.status==="completed"&&payload.sample?.available){
    sampleReportLink.href="/v1/audits/"+encodeURIComponent(payload.jobId)+"/reports/sample";
    reportActions.classList.remove("hidden");
    renderReportAccess();
  }
}
async function pollAudit(job){
  stopPolling();const started=Date.now(),maxWait=10*60*1000;
  async function check(){
    try{
      const response=await fetch("/v1/audits/"+encodeURIComponent(job));const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||"Could not read audit status");
      applyAuditPayload(payload);
      if(payload.status==="completed"&&payload.sample?.available)return;
      if(payload.status==="failed"){resultMessage.textContent="Audit failed: "+(payload.errorMessage||"processing error");return;}
      if(Date.now()-started>=maxWait){resultMessage.textContent="Audit is still processing. Keep this page open and check the job again shortly.";return;}
      pollTimer=setTimeout(check,2500);
    }catch(e){
      if(Date.now()-started>=maxWait){resultMessage.textContent=e instanceof Error?e.message:"Could not read audit status";return;}
      pollTimer=setTimeout(check,3000);
    }
  }
  check();
}
async function submitAudit(){
  submit.disabled=true;submit.querySelector("span").textContent="Submitting…";
  try{
    const headers=mode==="master"?await authHeaders({"Content-Type":selectedFile.type||"application/octet-stream","X-Audio-Filename":selectedFile.name}):await authHeaders({"Content-Type":"application/json"});
    const response=mode==="master"
      ?await fetch("/v1/audits",{method:"POST",headers,body:selectedFile})
      :await fetch("/v1/audits/catalog",{method:"POST",headers,body:JSON.stringify({url:catalogUrl.value.trim()})});
    const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||"Audit intake failed");
    jobId.textContent=payload.jobId||"—";serverHash.textContent=payload.sha256||"—";resultPanel.classList.remove("hidden");reportActions.classList.add("hidden");fullReportLink.classList.add("hidden");auditStatus.textContent="QUEUED";auditStatus.className="queued";
    resultMessage.textContent=mode==="master"?"Accepted. Processing has started; the report will appear here automatically.":"Accepted. Catalog collection is processing; the report will appear here automatically.";
    submit.querySelector("span").textContent="Audit processing";pollAudit(payload.jobId);
  }catch(e){actionMessage.textContent=e instanceof Error?e.message:"Audit intake failed.";submit.disabled=false;submit.querySelector("span").textContent="Start A&R audit";}
}
async function signIn(event){
  event.preventDefault();authSubmit.disabled=true;authSubmit.textContent="Signing in…";
  try{
    const payload=await authRequest("token?grant_type=password",{email:authEmail.value.trim(),password:authPassword.value});
    persistSession({...payload,expires_at:Math.floor(Date.now()/1000)+(payload.expires_in||3600)});
    authPassword.value="";
    actionMessage.textContent="Authenticated. New audits will be owner-bound and eligible for the full report.";
  }catch(error){authStatus.textContent=error instanceof Error?error.message:"Authentication failed.";}
  finally{authSubmit.disabled=false;authSubmit.textContent="Sign in";}
}
function signOut(){persistSession(null);actionMessage.textContent="Signed out. New audits will remain eligible for the public sample report only.";}
masterTab.addEventListener("click",()=>setMode("master"));dspTab.addEventListener("click",()=>setMode("dsp"));input.addEventListener("change",()=>input.files?.[0]&&inspect(input.files[0]));removeFile.addEventListener("click",clearFile);detectCatalog.addEventListener("click",previewCatalog);catalogUrl.addEventListener("input",()=>{catalogReady=false;setCheck(catalogCheck,"","—");});catalogUrl.addEventListener("blur",previewCatalog);submit.addEventListener("click",submitAudit);authForm.addEventListener("submit",signIn);authSignOut.addEventListener("click",signOut);
fullReportLink.addEventListener("click",async e=>{
  e.preventDefault();
  const token=await getAccessToken();if(!token){actionMessage.textContent="Sign in is required for the full report.";return;}
  const response=await fetch(fullReportLink.href,{headers:{Authorization:"Bearer "+token}});
  if(response.status===401){persistSession(null);actionMessage.textContent="Your session expired. Sign in again to download the full report.";return;}
  if(!response.ok){actionMessage.textContent="Full report access failed.";return;}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(fullReportLink.href.split("/").pop()||"audit-full")+".pdf";a.click();URL.revokeObjectURL(url);
});
["dragenter","dragover"].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.add("dragover");}));
["dragleave","drop"].forEach(type=>dropzone.addEventListener(type,e=>{e.preventDefault();dropzone.classList.remove("dragover");}));
dropzone.addEventListener("drop",e=>{const f=e.dataTransfer?.files?.[0];if(f)inspect(f);});
setMode("master");bootstrapAuth();
