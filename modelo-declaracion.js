(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const uploadButton = $("uploadDeclarationModel"), generateButton = $("generateDeclarationFile");
  const fileInput = $("declarationModelFile"), modelStatus = $("declarationModelStatus");
  const review = $("modelReview"), reviewed = $("modelReviewed");
  let model = null, detected = [], format = "";
  const maxTemplateSize = 8 * 1024 * 1024;
  const missing = "A confirmar";
  const safeName = value => (value || "SINIA").replace(/[^a-z0-9_-]/gi, "_").slice(0,60);
  const val = id => ($(id)?.value || "").trim();
  const normalize = name => String(name||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s.\-]+/g,"_");
  const aliases = {
    cliente:"cliente", asegurado:"cliente", nombre:"cliente", nombre_asegurado:"cliente",
    nombre_y_apellido:"cliente", nombre_apellido:"cliente",
    siniestro:"siniestro", numero_siniestro:"siniestro", nro_siniestro:"siniestro",
    id_siniestro:"siniestro", n_siniestro:"siniestro",
    fecha:"fecha", fecha_hecho:"fecha", fecha_siniestro:"fecha",
    hora:"hora", hora_hecho:"hora",
    lugar:"lugar", domicilio:"lugar", direccion:"lugar", ubicacion:"lugar", lugar_hecho:"lugar",
    aseguradora:"aseguradora", compania:"aseguradora", nombre_aseguradora:"aseguradora",
    poliza:"poliza", numero_poliza:"poliza", nro_poliza:"poliza",
    relato:"relato", declaracion:"relato", transcripcion:"relato", descripcion:"relato",
    relato_hechos:"relato", hechos:"relato",
    estado:"estado", fecha_actual:"fecha_actual", firma:"firma"
  };
  function note(text){ modelStatus.textContent = text; }
  function current(){
    return window.SINIA_DECLARATION_CONTEXT?.() || null;
  }
  function getCase(){
    const ctx=current();
    return ctx && (window.SINIA_DEMO_CLAIMS || []).find(c=>c.claim_number===ctx.number) || {};
  }
  function detect(transcript) {
    const date=transcript.match(/\b(?:el\s+)?(?:d[ií]a\s+)?(\d{1,2}\s+de\s+[a-záéíóúñ]+(?:\s+(?:de|del)\s+\d{4})?|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})\b/i);
    const time=transcript.match(/\b(?:a\s+las|alrededor\s+de\s+las)\s+(\d{1,2}(?:[:.]\d{2})?)\s*(?:horas?|hs\.?)?\b/i);
    const location=transcript.match(/\b(en\s+(?:(?:la|el)\s+)?(?:calle|avenida|av\.?|ruta|boulevard)\s+.{3,145}?)(?=\s+a\s+las\s+\d{1,2}|\s+alrededor\s+de\s+las\s+\d{1,2}|[.,;\n]|$)/i);
    return {fecha: date?.[1]||"",hora:time?.[1]?time[1]+" hs":"",lugar:location?.[1]||""};
  }
  function onlyClientSpeech(raw){
    const lines=String(raw||"").split(/\n/);
    if(!lines.some(l=>/^\s*(?:MICA|CLIENTE)\s*:/i.test(l)))return raw;
    return lines.filter(l=>/^\s*CLIENTE\s*:/i.test(l)).map(l=>l.replace(/^\s*CLIENTE\s*:\s*/i,"").trim()).filter(Boolean).join("\n");
  }
  function populate(force=false){
    const ctx=current(), transcript=val("transcriptText");
    if(!ctx) return;
    const claim=getCase(), extracted=detect(transcript);
    const pairs=[
      ["reviewCliente",ctx.customer||claim.client_name],
      ["reviewSiniestro",ctx.number],["reviewFecha",extracted.fecha||claim.incident_date],
      ["reviewHora",extracted.hora],["reviewLugar",extracted.lugar||claim.incident_location],
      ["reviewAseguradora",claim.insurer],["reviewPoliza",claim.policy_number],
      ["reviewRelato",onlyClientSpeech(transcript)]
    ];
    for(const [id,value] of pairs){const field=$(id);if(force || !field.value)field.value=value||"";}
    reviewed.checked=false;
  }
  function fields(){
    const object={
      cliente:val("reviewCliente")||missing,
      siniestro:val("reviewSiniestro")||missing,
      fecha:val("reviewFecha")||missing,
      hora:val("reviewHora")||missing,
      lugar:val("reviewLugar")||missing,
      aseguradora:val("reviewAseguradora")||missing,
      poliza:val("reviewPoliza")||missing,
      relato:val("reviewRelato")||missing,
      estado:"Borrador — pendiente revisión Mica y asegurado",
      fecha_actual:new Date().toLocaleDateString("es-AR"),
      firma:"Pendiente de firma del asegurado"
    };
    return object;
  }
  function tags(zip){
    const all = new Set();
    for(const [filename,info] of Object.entries(zip.files)){
      if(!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(filename)) continue;
      const xml=info.asText();
      const text=xml.replace(/<[^>]*>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
      for(const m of text.matchAll(/\{\s*([a-z_][a-z0-9_.-]*)\s*\}/gi))all.add(m[1]);
    }
    return [...all];
  }
  async function validateModel(file){
    if(file.size>maxTemplateSize)throw Error("El modelo supera 8 MB.");
    if(!/\.(docx|pdf)$/i.test(file.name)) throw Error("Elegí un archivo Word .docx o PDF .pdf.");
    if(/\.docx$/i.test(file.name)){
      if(!window.PizZip || !window.docxtemplater)throw Error("No se pudo cargar el motor Word. Recargá la página e intentá nuevamente.");
      const zip=new window.PizZip(await file.arrayBuffer());
      const t=tags(zip);
      if(!t.length)throw Error("El Word no tiene campos {cliente}, {relato}, etc. Agregalos en la plantilla para conservar el diseño.");
      const unknown=t.filter(t=>!aliases[normalize(t)]);
      if(unknown.length)throw Error("Hay campos que SINIA todavía no reconoce: "+unknown.join(", ")+". Adaptá el modelo antes de generar.");
      return {format:"docx",detected:t};
    }
    if(!window.PDFLib)throw Error("No se pudo cargar el motor PDF. Recargá la página.");
    const pdf=await window.PDFLib.PDFDocument.load(await file.arrayBuffer());
    const available=pdf.getForm().getFields().filter(f=>f instanceof window.PDFLib.PDFTextField).map(f=>f.getName());
    const supported=available.filter(name=>aliases[normalize(name)]);
    if(!supported.length)throw Error("Este PDF no tiene campos rellenables compatibles. Convertí el modelo a Word .docx con {cliente}, {relato}, etc., o creá campos de formulario PDF.");
    return {format:"pdf",detected:supported};
  }
  uploadButton.addEventListener("click",()=>fileInput.click());
  fileInput.addEventListener("change", async()=>{
    const file=fileInput.files?.[0];if(!file)return;
    model=null;review.hidden=true;detected=[];format="";
    note("Revisando el modelo "+file.name+"...");
    try {
      const result=await validateModel(file);
      model=file;format=result.format;detected=result.detected;
      note("Modelo cargado: "+file.name+" · "+(format==="docx"?"Word":"PDF rellenable")+" · Campos: "+detected.join(", "));
      review.hidden=false;populate(true);
    }catch(e){note("No se pudo cargar: "+(e.message||"archivo no compatible"));fileInput.value="";}
  });
  $("refreshDeclarationFields").addEventListener("click",()=>populate(true));
  window.addEventListener("sinia:declaration-open",()=>{
    for(const el of review.querySelectorAll("input:not([type=checkbox]),textarea"))el.value="";
    reviewed.checked=false;
    if(model){review.hidden=false;populate(true);note("Modelo cargado: "+model.name+". Revisá los datos de este siniestro antes de generar.");}
  });
  window.addEventListener("sinia:declaration-loaded",()=>{
    if(model&&!reviewed.checked)populate(true);
  });
  function offerDownload(blob,name){
    const u=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),30000);
  }
  async function makeDocx(file,data){
    const zip=new window.PizZip(await file.arrayBuffer());
    const detectedTags=tags(zip);
    const doc=new window.docxtemplater(zip,{paragraphLoop:true,linebreaks:true});
    const replacements={};
    for(const tag of detectedTags)replacements[tag]=data[aliases[normalize(tag)]]??missing;
    doc.render(replacements);
    return new Blob([doc.toBlob()],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  }
  async function makePdf(file,data){
    const pdf=await window.PDFLib.PDFDocument.load(await file.arrayBuffer());
    const all=pdf.getForm().getFields();
    let count=0;
    for(const field of all){
      if(!(field instanceof window.PDFLib.PDFTextField))continue;
      const kind=aliases[normalize(field.getName())];if(!kind)continue;
      if(kind==="relato")field.enableMultiline();
      field.setText(String(data[kind]??missing));
      count++;
    }
    if(!count)throw Error("No se encontraron campos editables compatibles en el PDF.");
    const bytes=await pdf.save();
    return new Blob([bytes],{type:"application/pdf"});
  }
  async function storeSandbox(blob,filename,claimNumber){
    const rt=window.SINIA_RUNTIME;
    if(!rt?.isSandbox?.())return "Archivo generado en el equipo. No se guardó en la base porque no es una sesión de pruebas autenticada.";
    const client=rt.getClient();
    if(blob.size>1024*1024)return "Archivo generado en el equipo; pesa más de 1 MB y no se guardó en Supabase.";
    const known=(window.SINIA_DEMO_CLAIMS||[]).some(c=>c.claim_number===claimNumber);
    if(!known)return "Archivo generado; primero registrá este caso de prueba para asociarlo en Supabase.";
    const path=claimNumber+"/"+crypto.randomUUID()+"-"+safeName(filename);
    const up=await client.storage.from("sinia-demo-files").upload(path,blob,{upsert:false,contentType:blob.type});
    if(up.error)throw up.error;
    const saved=await client.from("sinia_demo_documents").insert({claim_number:claimNumber,title:filename,category:"Declaración generada",storage_path:path});
    if(saved.error){
      await client.storage.from("sinia-demo-files").remove([path]);
      throw saved.error;
    }
    return "Archivo generado y guardado en Supabase para "+claimNumber+". Pendiente revisión Mica.";
  }
  generateButton.addEventListener("click",async()=>{
    const ctx=current();
    if(!ctx)return note("Seleccioná primero una tarjeta de siniestro.");
    if(!model)return note("Primero cargá un modelo Word o PDF con campos compatibles.");
    if(review.hidden)return note("Revisá los datos propuestos antes de generar.");
    if(!reviewed.checked)return note("Marcá la confirmación de revisión de los datos antes de generar.");
    if(!val("reviewRelato"))return note("El relato no puede estar vacío.");
    const data=fields();
    generateButton.disabled=true;
    note("Generando archivo a partir del modelo...");
    try {
      const blob=format==="docx"?await makeDocx(model,data):await makePdf(model,data);
      const filename="SINIA_"+safeName(ctx.number)+"_declaracion_BORRADOR."+(format==="docx"?"docx":"pdf");
      offerDownload(blob,filename);
      try{const saved=await storeSandbox(blob,filename,ctx.number);note(saved);}
      catch(e){note("Archivo descargado, pero no se pudo guardar en Supabase: "+(e.message||"error"));}
    }catch(e){
      note("No se pudo completar el modelo: "+(e.message||"error de formato")+". Revisá los campos del archivo.");
    }finally{generateButton.disabled=false;}
  });
})();
