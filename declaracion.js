(() => {
  "use strict";
  const get = id => document.getElementById(id);
  const area = get("transcriptText");
  const feedback = get("declarationFeedback");
  const preview = get("interimTranscript");
  const indicator = get("recognitionState");
  const startButton = get("recordStart");
  const stopButton = get("recordStop");
  const consent = get("declarationConsent");
  const runtime = () => window.SINIA_RUNTIME || null;
  const recognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const drafts = new Map(); // Solo memoria de la pestaña; nunca localStorage.
  let activeCase = null;
  window.SINIA_DECLARATION_CONTEXT = () => activeCase ? { ...activeCase } : null;
  let recognition = null;
  let selectedSpeaker = "MICA";
  let resumeOnSwitch = false;
  function setSpeaker(next){
    if(next===selectedSpeaker)return;
    selectedSpeaker=next;
    get("speakerMica").classList.toggle("speaker-active",next==="MICA");
    get("speakerCliente").classList.toggle("speaker-active",next==="CLIENTE");
    get("speakerMica").setAttribute("aria-pressed",String(next==="MICA"));
    get("speakerCliente").setAttribute("aria-pressed",String(next==="CLIENTE"));
    if(recognition){resumeOnSwitch=true;try{recognition.stop();}catch(_){resumeOnSwitch=false;}}
    else status("Seleccionado: "+next+". Iniciá la transcripción o continuá escribiendo.");
  }
  get("speakerMica").addEventListener("click",()=>setSpeaker("MICA"));
  get("speakerCliente").addEventListener("click",()=>setSpeaker("CLIENTE"));

  function status(message) {
    feedback.textContent = message;
  }
  function saveInMemory() {
    if (activeCase) drafts.set(activeCase.number, area.value);
  }
  function endRecording() {
    resumeOnSwitch=false;
    if (!recognition) return;
    const session = recognition;
    recognition = null;
    try { session.stop(); } catch (_) {}
    area.readOnly = false;
    startButton.disabled = !recognitionClass;
    stopButton.disabled = true;
    indicator.textContent = "Micrófono detenido";
    indicator.classList.remove("recording");
  }
  function showDeclarationsPanel() {
    document.querySelectorAll(".panel").forEach(panel => panel.classList.toggle("active", panel.id === "declaracion"));
    document.querySelectorAll("[data-tab]").forEach(button => button.classList.remove("active"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function loadDraftForCase(caseNumber) {
    const rt = runtime();
    if (!rt?.isReady() || rt.isDemo()) return;
    const client = rt.getClient();
    if(rt.isSandbox?.()){
      const {data,error}=await client.from("sinia_demo_declarations").select("transcript,updated_at").eq("claim_number",caseNumber).maybeSingle();
      if(!error&&data&&activeCase?.number===caseNumber&&!drafts.has(caseNumber)){
        area.value=data.transcript||"";status("Declaración de prueba recuperada desde Supabase.");
        window.dispatchEvent(new CustomEvent("sinia:declaration-loaded"));
      }
      return;
    }
    try {
      const { data: claim, error: claimError } = await client
        .from("sinia_claims").select("id").eq("claim_number", caseNumber).maybeSingle();
      if (claimError || !claim) return;
      const { data: draft, error } = await client
        .from("sinia_declarations").select("transcript,updated_at").eq("claim_id", claim.id).maybeSingle();
      if (error || !draft || activeCase?.number !== caseNumber || drafts.has(caseNumber)) return;
      area.value = draft.transcript || "";
      status("Borrador recuperado desde Supabase. Revisalo antes de seguir.");
      window.dispatchEvent(new CustomEvent("sinia:declaration-loaded"));
    } catch (_) {
      if (activeCase?.number === caseNumber) status("No se pudo consultar el borrador anterior. Podés transcribir o escribir manualmente.");
    }
  }
  function openDeclaration(button) {
    saveInMemory();
    endRecording();
    const card = button.closest(".case");
    const number = button.dataset.declaration || "";
    const customer = card?.querySelector("strong")?.textContent?.trim() || "Asegurado a confirmar";
    const description = card?.querySelector("p")?.textContent?.trim() || "";
    activeCase = { number, customer, description };
    get("declarationCase").textContent = number;
    get("declarationClient").textContent = customer + (description ? " · " + description : "");
    area.value = drafts.get(number) || "";
    area.readOnly = false;
    consent.checked = false;
    preview.textContent = "Las frases en proceso de reconocimiento se mostrarán aquí.";
    indicator.textContent = recognitionClass ? "Micrófono detenido" : "Reconocimiento de voz no disponible en este navegador";
    indicator.classList.remove("recording");
    startButton.disabled = !recognitionClass;
    stopButton.disabled = true;
    const rt = runtime();
    status(rt?.isDemo() || !rt?.isReady()
      ? "Modo demostración: podés dictar y corregir. El texto no se guarda en Supabase; copiá el borrador si querés conservarlo."
      : "El borrador se vinculará exclusivamente a este siniestro al presionar Guardar borrador.");
    showDeclarationsPanel();
    window.dispatchEvent(new CustomEvent('sinia:declaration-open', { detail: {number, customer, description} }));
    if (!drafts.has(number)) void loadDraftForCase(number);
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-declaration]");
    if (button) openDeclaration(button);
  });
  get("backToClaims").addEventListener("click", () => {
    saveInMemory();
    endRecording();
    document.querySelector('[data-tab="casos"]').click();
  });
  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      saveInMemory();
      endRecording();
    });
  });
  consent.addEventListener("change", () => { if (!consent.checked) endRecording(); });

  startButton.addEventListener("click", () => {
    if (!activeCase) return status("Seleccioná primero un siniestro.");
    if (!consent.checked) return status("Antes de grabar, confirmá que la persona declarante dio su consentimiento.");
    if (!recognitionClass) return status("Tu navegador no permite transcripción en vivo. Podés escribir manualmente.");
    if (recognition) return;
    const session = new recognitionClass();
    session.lang = "es-AR";
    session.continuous = true;
    session.interimResults = true;
    session.maxAlternatives = 1;
    const caseNumber = activeCase.number;
    const originalText = area.value.trim();
    const thisSpeaker=selectedSpeaker;
    recognition = session;
    area.readOnly = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    indicator.textContent = "Transcribiendo en vivo";
    indicator.classList.add("recording");
    preview.textContent = "Escuchando...";
    status("Reconociendo voz. Las frases confirmadas se agregarán al campo de declaración.");

    session.onresult = event => {
      if (recognition !== session || activeCase?.number !== caseNumber) return;
      const finalParts = [], interimParts = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i], text = result[0]?.transcript?.trim();
        if (!text) continue;
        (result.isFinal ? finalParts : interimParts).push(text);
      }
      area.value = [originalText, finalParts.length?thisSpeaker+": "+finalParts.join(" "):""].filter(Boolean).join(originalText ? "\n" : "");
      preview.textContent = interimParts.join(" ") || "Escuchando...";
      drafts.set(caseNumber, area.value);
    };
    session.onerror = event => {
      if (activeCase?.number === caseNumber)
        status(event.error === "not-allowed" ? "El micrófono no tiene permiso. Autorizalo en Chrome para continuar."
          : "El reconocimiento se interrumpió (" + event.error + "). Podés reintentarlo o escribir manualmente.");
    };
    session.onend = () => {
      if (recognition !== session) return;
      recognition = null;
      area.readOnly = false;
      startButton.disabled = false;
      stopButton.disabled = true;
      indicator.textContent = "Micrófono detenido";
      indicator.classList.remove("recording");
      if (activeCase?.number === caseNumber) preview.textContent = "Transcripción detenida. Podés corregir el texto y volver a iniciar.";
      if(resumeOnSwitch && activeCase?.number===caseNumber){resumeOnSwitch=false;startButton.click();}
    };
    try { session.start(); }
    catch (err) {
      recognition = null;
      area.readOnly = false;
      startButton.disabled = false;
      stopButton.disabled = true;
      indicator.textContent = "Micrófono detenido";
      indicator.classList.remove("recording");
      status("No se pudo activar el micrófono: " + (err.message || "error"));
    }
  });

  stopButton.addEventListener("click", endRecording);
  area.addEventListener("input", saveInMemory);

  get("copyDeclaration").addEventListener("click", async () => {
    const txt = area.value.trim();
    if (!txt) return status("Todavía no hay texto para copiar.");
    try { await navigator.clipboard.writeText(txt); status("Texto copiado al portapapeles."); }
    catch (_) { area.focus(); area.select(); status("Seleccioné el texto. Presioná Ctrl+C para copiarlo."); }
  });

  get("saveDeclaration").addEventListener("click", async () => {
    if (!activeCase) return status("Seleccioná un siniestro.");
    endRecording();
    const transcript = area.value.trim();
    if (!transcript) return status("La declaración está vacía. Dictá o escribí antes de guardar.");
    saveInMemory();
    const rt = runtime();
    if (!rt?.isReady() || rt.isDemo())
      return status("Modo demostración: el texto solo permanece en esta pestaña. Para guardarlo en Supabase necesitás un usuario real autorizado.");
    const client = rt.getClient();
    if(rt.isSandbox?.()){
      const button=get("saveDeclaration");button.disabled=true;
      status("Guardando declaración de prueba...");
      try{
       const {error}=await client.from("sinia_demo_declarations").upsert({claim_number:activeCase.number,transcript,status:"Pendiente revisión Mica",updated_at:new Date().toISOString()},{onConflict:"claim_number"});
       if(error)throw error;
       status("Declaración guardada en Supabase para "+activeCase.number+". Pendiente revisión Mica.");
      }catch(err){status("No se pudo guardar: "+(err.message||"error"));}
      finally{button.disabled=false;}
      return;
    }
    const button = get("saveDeclaration");
    button.disabled = true;
    status("Guardando borrador en Supabase...");
    try {
      const { data: userData, error: authError } = await client.auth.getUser();
      if (authError || !userData?.user) throw new Error("Iniciá sesión con un usuario autorizado.");
      const { data: member, error: memberError } = await client.from("sinia_members").select("user_id")
        .eq("user_id", userData.user.id).maybeSingle();
      if (memberError || !member) throw new Error("Este usuario no está autorizado para SINIA.");
      const { data: claim, error: claimError } = await client.from("sinia_claims")
        .select("id").eq("claim_number", activeCase.number).maybeSingle();
      if (claimError) throw claimError;
      if (!claim) throw new Error("Este es un caso de demostración que aún no está registrado en Supabase. Primero cargalo como siniestro.");
      const { error } = await client.from("sinia_declarations").upsert({
        claim_id: claim.id, transcript, status: "Pendiente revisión Mica",
        last_updated_by: userData.user.id, updated_at: new Date().toISOString()
      }, { onConflict: "claim_id" });
      if (error) throw error;
      status("Borrador guardado en Supabase para " + activeCase.number + ". Pendiente revisión Mica y del asegurado.");
    } catch (error) { status("No se pudo guardar: " + (error.message || "error desconocido")); }
    finally { button.disabled = false; }
  });
  window.addEventListener("beforeunload", endRecording);
})();
