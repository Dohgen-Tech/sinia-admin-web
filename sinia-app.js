(()=>{"use strict";
const cfg=window.SINIA_CONFIG||{};const ready=!!(cfg.supabaseUrl&&cfg.supabasePublishableKey&&window.supabase);
const client=ready?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
let demoSession=false;
let userRole=null;
window.SINIA_RUNTIME={getClient:()=>client,isDemo:()=>demoSession,isReady:()=>ready,isSandbox:()=>userRole==="demo",getRole:()=>userRole};
const overlay=document.createElement("div");overlay.id="authGate";overlay.style.cssText="position:fixed;inset:0;background:#092b3ae8;display:grid;place-items:center;z-index:99;padding:20px";
overlay.innerHTML='<div style="background:#fff;max-width:420px;width:100%;border-radius:18px;padding:28px;box-shadow:0 24px 60px #0004"><h1 style="margin:0 0 4px">◈ SINIA</h1><p style="color:#68808b">Acceso al panel administrativo</p><form id="loginSINIA"><label for="uSINIA">Usuario</label><input id="uSINIA" autocomplete="username" required placeholder="'+(ready?'Correo electrónico o 123456 (demo)':'Usuario de demostración')+'"><label for="pSINIA" style="margin-top:14px">Contraseña</label><input id="pSINIA" type="password" autocomplete="current-password" required><button style="width:100%;margin-top:20px" type="submit">Ingresar</button><p id="authError" role="alert" style="color:#9d3737;font-size:13px"></p><p style="font-size:12px;color:#7c8790">'+(ready?'Para probar la interfaz: 123456 / 123456 (sin acceso a los datos). Para guardar datos es necesario un usuario autorizado en Supabase.':'MODO DEMOSTRACIÓN: 123456 / 123456. No guarda datos reales.')+'</p></form></div>';
document.body.appendChild(overlay);
const badge=document.createElement("div");badge.className="notice";badge.textContent=ready?'SINIA conectado a Supabase: acceso autenticado y almacenamiento restringido a usuarios habilitados.':'SINIA en modo demostración. La web es pública, el usuario 123456 no protege información real. Subidas y guardado en Supabase desactivados.';document.querySelector(".hero").after(badge);
if(ready){const submit=document.querySelector("#siniaForm button[type=submit]");if(submit)submit.textContent="Guardar siniestro en Supabase";}
const login=document.getElementById("loginSINIA");
const signUpButton=document.createElement("button");signUpButton.type="button";signUpButton.className="secondary";signUpButton.style.cssText="width:100%;margin-top:10px";signUpButton.textContent="Crear usuario de pruebas en Supabase";
login.querySelector("button[type=submit]").after(signUpButton);
const accessInfo=document.createElement("p");accessInfo.style.cssText="font-size:12px;color:#546d78";
accessInfo.textContent="Para GUARDAR datos, registrate con tu correo y una contraseña segura (12 caracteres como mínimo). El acceso 123456/123456 sirve solo para mirar.";
signUpButton.after(accessInfo);
signUpButton.addEventListener("click",async()=>{
 const email=document.getElementById("uSINIA").value.trim(),password=document.getElementById("pSINIA").value,err=document.getElementById("authError");
 if(!ready)return void(err.textContent="Supabase no está conectado.");
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return void(err.textContent="Para registrarte, escribí tu correo electrónico en Usuario.");
 if(password.length<12)return void(err.textContent="Usá una contraseña segura de al menos 12 caracteres.");
 signUpButton.disabled=true;err.textContent="Registrando usuario de prueba...";
 try{const res=await client.auth.signUp({email,password});if(res.error)throw res.error;err.textContent=res.data.session?"Usuario creado. Ingresá con tu correo para guardar datos.":"Cuenta creada. Revisá tu correo y confirmá el registro; después volvé e ingresá.";if(res.data.session){const m=await client.from("sinia_members").select("role").maybeSingle();if(m.data?.role==="demo"){demoSession=false;userRole="demo";enter();}}}
 catch(e){err.textContent="No se pudo crear el acceso: "+(e.message||"error");}
 finally{signUpButton.disabled=false;}
});
function enter(){
 overlay.style.display="none";
 badge.textContent=userRole==="demo"?"SINIA SANDBOX: guardado en Supabase SOLO para casos ficticios. No ingreses clientes reales.":demoSession?"Vista pública de demostración. No se guardarán datos.":"SINIA autenticado: datos privados protegidos.";
 const b=document.createElement("button");b.className="secondary";b.textContent="Cerrar sesión";b.style.marginLeft="12px";document.querySelector(".hero").appendChild(b);
 b.addEventListener("click",async()=>{if(client)await client.auth.signOut();location.reload();});
 const submit=document.querySelector("#siniaForm button[type=submit]");if(submit)submit.textContent=userRole==="demo"?"Guardar siniestro de prueba":demoSession?"Copiar solicitud para ChatGPT":"Guardar siniestro en Supabase";
 if(ready&&!demoSession)loadData();
 window.dispatchEvent(new CustomEvent("sinia:session",{detail:{demo:demoSession,authenticated:ready&&!demoSession,role:userRole}}));
}
login.addEventListener("submit",async e=>{
 e.preventDefault();
 const u=document.getElementById("uSINIA").value.trim(),p=document.getElementById("pSINIA").value,err=document.getElementById("authError");err.textContent="";
 if((u==="123456"||u==="123406")&&p==="123456"){demoSession=true;userRole=null;enter();return;}
 if(!ready){err.textContent="No está conectada la base de datos.";return;}
 const {error}=await client.auth.signInWithPassword({email:u,password:p});
 if(error){err.textContent="No se pudo iniciar sesión. Comprobá el correo y la contraseña.";return;}
 const {data, error:memberError}=await client.from("sinia_members").select("role").maybeSingle();
 if(memberError||!data){await client.auth.signOut();err.textContent="Cuenta sin acceso autorizado.";return;}
 demoSession=false;userRole=data.role;enter();
});
if(ready)client.auth.getSession().then(async({data})=>{
 if(!data.session)return;
 const m=await client.from("sinia_members").select("role").maybeSingle();
 if(m.data?.role){demoSession=false;userRole=m.data.role;enter();}
});
const extras=document.createElement("div");extras.className="formgrid";extras.style.marginTop="14px";extras.innerHTML='<div><label for="insurerSINIA">Compañía aseguradora</label><input id="insurerSINIA" placeholder="Nombre de la compañía"></div><div><label for="policySINIA">Número de póliza</label><input id="policySINIA" placeholder="Póliza"></div><div><label for="dateSINIA">Fecha del siniestro</label><input id="dateSINIA" type="date"></div><div><label for="placeSINIA">Lugar del hecho</label><input id="placeSINIA" placeholder="Dirección"></div><div class="wide"><label for="descSINIA">Descripción del siniestro</label><textarea id="descSINIA" placeholder="Relato y hechos conocidos"></textarea></div><div><label for="liabilitySINIA">Responsabilidad preliminar</label><select id="liabilitySINIA"><option>A determinar</option><option>Sí probable</option><option>No probable</option><option>Parcial</option></select></div><div><label for="coverageSINIA">Cobertura preliminar</label><select id="coverageSINIA"><option>A determinar</option><option>Sí probable</option><option>No probable</option><option>Parcial</option></select></div><div class="wide"><label for="reasonSINIA">Fundamentos y cláusulas</label><textarea id="reasonSINIA" placeholder="Sin inventar cláusulas ni conclusiones"></textarea></div>';
document.querySelector("#siniaForm .formgrid").appendChild(extras);
const uploadPanel=document.createElement("div");uploadPanel.className="notice";uploadPanel.innerHTML='<h2>Archivo del siniestro</h2><label for="driveLinkSINIA">Enlace a documento de Drive (alternativa sin subida)</label><input id="driveLinkSINIA" type="url" placeholder="https://drive.google.com/..."><label for="fileCategorySINIA">Tipo de documento</label><select id="fileCategorySINIA"><option>Prueba documental</option><option>Condiciones generales</option><option>Condiciones particulares</option><option>Endoso</option><option>Declaración</option><option>Informe</option></select><button type="button" id="saveDocumentSINIA" class="secondary" style="margin-top:10px">Guardar documento en SINIA</button><div id="uploadStatus" role="status" style="margin-top:8px"></div>';document.querySelector("#siniaForm").appendChild(uploadPanel);
const val=id=>document.getElementById(id)?.value.trim()||"";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function loadData(){
 if(userRole==="demo"){
   const [c,d]=await Promise.all([client.from("sinia_demo_claims").select("*").order("claim_number").limit(100),client.from("sinia_demo_documents").select("id,claim_number,title,category,drive_url,storage_path").order("created_at",{ascending:false}).limit(80)]);
   if(c.error||d.error){document.querySelector("#caseCards").textContent="Error leyendo las pruebas. Verificá acceso y permisos.";return;}
   const claims=c.data||[],docs=d.data||[];
   document.querySelector("#caseCards").innerHTML=claims.map(x=>'<div class="case"><span class="id">'+esc(x.claim_number)+'</span><strong>'+esc(x.client_name)+'</strong><p class="muted">'+esc(x.description)+'</p><span class="status">'+esc(x.status)+'</span><div class="actions"><button type="button" class="secondary" data-edit-claim="'+esc(x.claim_number)+'">Editar</button><button type="button" data-declaration="'+esc(x.claim_number)+'">Tomar declaración</button></div></div>').join("")||'<p>Aún no hay siniestros de prueba.</p>';
   document.querySelector("#clientCards").innerHTML=claims.map(x=>'<div class="case"><span class="id">'+esc(x.client_number||"Sin número")+'</span><strong>'+esc(x.client_name)+'</strong><p class="muted">'+esc(x.insurer)+'</p></div>').join("");
   let panel=document.getElementById("demoDocumentsList");
   if(!panel){panel=document.createElement("div");panel.id="demoDocumentsList";document.querySelector("#documentos .card").appendChild(panel);}
   panel.innerHTML="<h2>Documentación de pruebas guardada</h2>"+(docs.length?docs.map(x=>'<div class="case" style="margin:10px 0"><strong>'+esc(x.title)+'</strong><p class="muted">'+esc(x.claim_number)+' · '+esc(x.category)+'</p><button type="button" class="secondary" data-demo-document="'+esc(x.id)+'">Abrir archivo</button></div>').join(""):'<p class="muted">No hay documentos cargados.</p>');
   window.SINIA_DEMO_CLAIMS=claims;
   window.SINIA_DEMO_DOCS=docs;
   return;
 }
 const [claims,customers]=await Promise.all([client.from("sinia_claims").select("id,claim_number,description,status,client_id").order("created_at",{ascending:false}).limit(50),client.from("sinia_clients").select("id,full_name,client_number").order("created_at",{ascending:false}).limit(50)]);
 if(claims.error||customers.error)return;
 const names=new Map((customers.data||[]).map(x=>[x.id,x.full_name]));
 document.querySelector("#caseCards").innerHTML=(claims.data||[]).map(x=>'<div class="case"><span class="id">'+esc(x.claim_number)+'</span><strong>'+esc(names.get(x.client_id)||"Cliente")+'</strong><p class="muted">'+esc(x.description)+'</p><span class="status">'+esc(x.status)+'</span><div class="actions"><button type="button" data-declaration="'+esc(x.claim_number)+'">Tomar declaración</button></div></div>').join("")||'<p class="muted">Sin siniestros registrados.</p>';
 document.querySelector("#clientCards").innerHTML=(customers.data||[]).map(x=>'<div class="case"><span class="id">'+esc(x.client_number)+'</span><strong>'+esc(x.full_name)+'</strong></div>').join("")||'<p class="muted">Sin clientes.</p>';
}
document.addEventListener("click",e=>{
 const edit=e.target.closest("button[data-edit-claim]");
 if(edit&&userRole==="demo"){
  const c=(window.SINIA_DEMO_CLAIMS||[]).find(x=>x.claim_number===edit.dataset.editClaim);if(!c)return;
  const fields={id:c.claim_number,cliente:c.client_name,num:c.client_number,ramo:c.branch,insurerSINIA:c.insurer,policySINIA:c.policy_number,dateSINIA:c.incident_date,placeSINIA:c.incident_location,descSINIA:c.description,liabilitySINIA:c.liability,coverageSINIA:c.coverage,reasonSINIA:c.reasoning};
  Object.entries(fields).forEach(([id,value])=>{const input=document.getElementById(id);if(input)input.value=value||""});
  document.querySelector('[data-tab="nuevo"]').click();
 }
 const open=e.target.closest("button[data-demo-document]");
 if(open&&userRole==="demo"){
   const d=(window.SINIA_DEMO_DOCS||[]).find(x=>x.id===open.dataset.demoDocument);
   if(!d)return;
   if(d.drive_url){window.open(d.drive_url,"_blank","noopener");return;}
   client.storage.from("sinia-demo-files").createSignedUrl(d.storage_path,90).then(({data,error})=>{if(error)alert("No se pudo abrir el archivo.");else window.open(data.signedUrl,"_blank","noopener");});
 }
});
document.querySelector("#siniaForm").addEventListener("submit",async e=>{if(!ready||demoSession){if(demoSession){e.preventDefault();e.stopImmediatePropagation();document.querySelector("#message").textContent="Modo demostración: no se guardan datos. Para guardar en Supabase ingresá con usuario real autorizado."; }return;}e.preventDefault();e.stopImmediatePropagation();const status=document.querySelector("#message");
if(userRole==="demo"){
  const claim_number=val("id").toUpperCase(),client_name=val("cliente");
  if(!/^[A-Z0-9-]{3,32}$/.test(claim_number)||client_name.length<2){status.textContent="Ingresá número de siniestro y nombre del cliente.";return;}
  const data={claim_number,client_name,client_number:val("num"),insurer:val("insurerSINIA"),policy_number:val("policySINIA"),branch:val("ramo"),incident_date:val("dateSINIA")||null,incident_location:val("placeSINIA"),description:val("descSINIA")||val("nota"),liability:val("liabilitySINIA"),coverage:val("coverageSINIA"),reasoning:val("reasonSINIA"),status:"Pendiente revisión Mica",updated_at:new Date().toISOString()};
  if((window.SINIA_DEMO_CLAIMS||[]).length>=40&&!(window.SINIA_DEMO_CLAIMS||[]).some(x=>x.claim_number===claim_number)){status.textContent="Máximo 40 siniestros de demostración.";return;}
  status.textContent="Guardando siniestro de prueba...";
  const {error}=await client.from("sinia_demo_claims").upsert(data,{onConflict:"claim_number"});
  status.textContent=error?"No se pudo guardar: "+error.message:"Siniestro guardado en Supabase (solo pruebas). Pendiente revisión Mica.";
  if(!error)await loadData();
  return;
}
const claimNo=val("id"),name=val("cliente");if(!claimNo||!name){status.textContent="Completá número de siniestro y cliente.";return;}status.textContent="Guardando en Supabase...";try{const member=await client.from("sinia_members").select("user_id").limit(1);if(!member.data?.length)throw Error("Sin permisos SINIA");let customer=await client.from("sinia_clients").select("id").eq("full_name",name).limit(1);if(customer.error)throw customer.error;let clientId=customer.data?.[0]?.id;if(!clientId){const saved=await client.from("sinia_clients").insert({full_name:name,client_number:val("num")||null}).select("id").single();if(saved.error)throw saved.error;clientId=saved.data.id;}let insurerId=null,policyId=null;const insurerName=val("insurerSINIA"),policyNumber=val("policySINIA");if(insurerName){let ir=await client.from("sinia_insurers").select("id").eq("name",insurerName).limit(1);if(ir.error)throw ir.error;insurerId=ir.data?.[0]?.id;if(!insurerId){ir=await client.from("sinia_insurers").insert({name:insurerName}).select("id").single();if(ir.error)throw ir.error;insurerId=ir.data.id;}}if(policyNumber){let pr=await client.from("sinia_policies").select("id").eq("client_id",clientId).eq("policy_number",policyNumber).limit(1);if(pr.error)throw pr.error;policyId=pr.data?.[0]?.id;if(!policyId){pr=await client.from("sinia_policies").insert({client_id:clientId,insurer_id:insurerId,policy_number:policyNumber,branch:val("ramo")||"A determinar"}).select("id").single();if(pr.error)throw pr.error;policyId=pr.data.id;}}const payload={claim_number:claimNo,client_id:clientId,policy_id:policyId,incident_date:val("dateSINIA")||null,incident_location:val("placeSINIA")||null,description:val("descSINIA")||val("nota"),status:"Pendiente revisión Mica",liability:val("liabilitySINIA"),coverage:val("coverageSINIA"),coverage_reasons:val("reasonSINIA")};const saved=await client.from("sinia_claims").upsert(payload,{onConflict:"claim_number"}).select("id").single();if(saved.error)throw saved.error;status.textContent="Siniestro guardado en Supabase. Pendiente revisión Mica.";await loadData();}catch(e){status.textContent="No se pudo guardar: "+(e.message||"error");}},true);
document.getElementById("saveDocumentSINIA").addEventListener("click",async()=>{const out=document.getElementById("uploadStatus");if(!ready||demoSession){out.textContent="Modo demostración: documentos no guardados.";return;}const url=val("driveLinkSINIA");const selected=document.getElementById("adjuntos").files[0]||document.getElementById("docFile").files[0];if(!url&&!selected){out.textContent="Seleccioná un archivo o pegá un link de Drive.";return;}out.textContent="Guardando...";try{let path=null;if(selected){path=crypto.randomUUID()+"/"+selected.name.replace(/[^a-zA-Z0-9._-]/g,"_");const up=await client.storage.from("sinia-private").upload(path,selected,{upsert:false});if(up.error)throw up.error;}const row={title:selected?.name||"Documento de Drive",category:val("fileCategorySINIA"),storage_path:path,drive_url:url||null};const saved=await client.from("sinia_documents").insert(row);if(saved.error)throw saved.error;out.textContent="Documento registrado correctamente.";}catch(e){out.textContent="Error: "+(e.message||"No se pudo guardar");}});
})();
