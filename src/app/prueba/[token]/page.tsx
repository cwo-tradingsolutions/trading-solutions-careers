"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { INVALID_LINK_EN, INVALID_LINK_ES } from "@/lib/candidate-invalid-link";
import { CANDIDATE_MAIL } from "@/lib/candidate-public-error";

const TS_BLACK = "#0A0A0A";
const TS_BLUE = "#2C64ED";
const TS_GREEN = "#1A7D3E";
const TS_GRAY = "#6B7280";
const TS_BORDER = "#E5E7EB";
const TS_BG = "#FAFAFA";

const SNAPSHOT_EVERY_MS = 45_000;
const AUTO_ADVANCE_MS = 220;

type Phase = "loading" | "error" | "habeas" | "intro" | "blockIntro" | "test" | "sending" | "done";

type Opt = { key: string; text?: string; svg?: string; alt?: string };
type CItem = {
  code: string;
  block: string;
  type: "likert" | "tetrad" | "mc" | "figure" | "situational";
  stem?: string;
  scale?: 5 | 7;
  prompt?: string;
  matrixSvg?: string;
  options?: Opt[];
  statements?: { key: string; text: string }[];
};
type CBlock = { key: string; label: string; intro: string; timedSeconds: number | null; items: CItem[] };

/**
 * ── Idioma de la pantalla ─────────────────────────────────────────────────
 *
 * El texto de los ítems, las etiquetas y las introducciones de cada bloque ya
 * llegan traducidos desde /api/bateria/session (ver src/lib/bateria/i18n.ts).
 * Lo que vive acá es el TEXTO DE LA PANTALLA: consentimiento, instrucciones,
 * botones, cronómetro, avisos de cámara y errores. Antes estaba incrustado en
 * el JSX, así que un candidato en China veía la prueba en inglés dentro de una
 * interfaz en español.
 *
 * El español queda idéntico carácter por carácter: esto es una adición, no una
 * reescritura. Lo que cambia es que el mismo texto ahora sale del diccionario.
 *
 * `**así**` marca negrilla; rich() lo convierte en <b> al renderizar, para que
 * el diccionario siga siendo texto plano y no JSX.
 * `{n}`, `{total}` son los valores que se interpolan; los reemplaza fmt().
 */
type Lang = "es" | "en";

type Dict = {
  // estados y errores
  loading: string;
  errorTitle: string;
  errorHelp: string;
  errOpen: string;
  errNetwork: string;
  errInvalidLink: string;
  errAlreadyTaken: string;
  errConsentSave: string;
  errConsentNetwork: string;
  // consentimiento
  consentTitle: string;
  consentIntro: string;
  consentBullets: string[];
  nameLabel: string;
  namePlaceholder: string;
  consentDataCheck: string;
  consentCamCheck: string;
  consentButton: string;
  camBlocked: string;
  // presentación
  introFallbackTitle: string;
  introP1: string;
  introP2: string;
  introP3: string;
  introP4: string;
  introButton: string;
  // bloques
  blockQuestions: string;
  blockButton: string;
  // fallo de guardado
  saveFailTitle: string;
  saveFailAlready: string;
  saveFailGeneric: string;
  saveFailNetwork: string;
  saveFailHelp: string;
  // cierre
  sendingTitle: string;
  sendingBody: string;
  doneTitle: string;
  doneBody: string;
  // prueba
  camOn: string;
  camOff: string;
  scaleAria: string;
  anchorDisagree: string;
  anchorAgree: string;
  likert5: string[];
  tetradMost: string;
  tetradLeast: string;
  questionCounter: string;
  autoAdvance: string;
  finishButton: string;
  nextButton: string;
  autosave: string;
};

const T: Record<Lang, Dict> = {
  es: {
    loading: "Cargando…",
    errorTitle: "No pudimos abrir la prueba",
    errorHelp: `Escríbenos a ${CANDIDATE_MAIL} y te ayudamos.`,
    errOpen: "No pudimos abrir la prueba.",
    errNetwork: `No pudimos conectar. Escríbenos a ${CANDIDATE_MAIL} si el enlace no abre.`,
    errInvalidLink: INVALID_LINK_ES,
    errAlreadyTaken: "Esta prueba ya fue presentada",
    errConsentSave: "No pudimos registrar tu autorización. Escríbenos y te enviamos un enlace nuevo.",
    errConsentNetwork: `No pudimos registrar tu autorización. Escríbenos a ${CANDIDATE_MAIL}.`,

    consentTitle: "Autorización de tratamiento de datos personales",
    consentIntro:
      "Trading Solutions S.A.S. tratará los datos que usted suministre en esta prueba con la única finalidad de evaluar su candidatura al cargo al que aplicó. Se recogen sus respuestas, los tiempos de respuesta y las capturas de cámara durante la sesión.",
    consentBullets: [
      "Los resultados se conservan **dos años** y luego se eliminan.",
      "No se comparten con terceros distintos al equipo de selección.",
      "Sus derechos como titular y los canales para ejercerlos están descritos en la **Política de Tratamiento de Datos Personales** de Trading Solutions S.A.S., publicada en nuestro sitio de empleo.",
      "La presentación **remota exige cámara activa** durante toda la sesión. Si prefiere no habilitarla, puede presentar la prueba de forma **presencial** en nuestras instalaciones: responda el correo con el que recibió este enlace y le agendamos.",
    ],
    nameLabel: "Nombre completo",
    namePlaceholder: "Como aparece en su documento",
    consentDataCheck: "**Autorizo** el tratamiento de mis datos en los términos descritos.",
    consentCamCheck:
      "**Autorizo la captura de imagen** durante la sesión y entiendo que es condición de la modalidad remota.",
    consentButton: "Acepto y continúo",
    camBlocked:
      "El navegador bloqueó la cámara. Habilite el permiso y vuelva a intentar, o escríbanos para presentar la prueba de forma presencial.",

    introFallbackTitle: "Prueba de selección",
    introP1:
      "La prueba tiene **cinco partes** y {total} preguntas en total. Toma alrededor de **90 minutos**. Solo la cuarta parte está cronometrada; las otras cuatro no tienen tiempo.",
    introP2:
      "En las partes de afirmaciones no hay respuestas correctas ni incorrectas: responda con lo primero que le parezca, pensarlo mucho no mejora el resultado. En la parte cronometrada sí hay una respuesta correcta.",
    introP3:
      "Sus respuestas se guardan a medida que avanza. Si se le cierra el navegador, vuelva a abrir este mismo enlace y continúa exactamente donde quedó.",
    introP4:
      "Al terminar no verá un resultado en pantalla: el informe lo revisa el equipo de selección y nos comunicamos con usted por correo.",
    introButton: "Comenzar",

    blockQuestions: "{n} preguntas",
    blockButton: "Continuar",

    saveFailTitle: "Sus respuestas no se están guardando",
    saveFailAlready: "Este enlace ya fue presentado. Sus respuestas no se están guardando.",
    saveFailGeneric: "No pudimos guardar su respuesta. No siga: sus respuestas no se están registrando.",
    saveFailNetwork: "Se perdió la conexión y su última respuesta no se guardó. Revise su internet antes de continuar.",
    saveFailHelp:
      "Por favor **no continúe**. Responda el correo con el que recibió este enlace y le enviamos uno nuevo. Nada de lo que responda a partir de aquí quedaría registrado.",

    sendingTitle: "Enviando sus respuestas…",
    sendingBody: "No cierre esta ventana.",
    doneTitle: "Listo, recibimos su prueba",
    doneBody:
      "Gracias por el tiempo que dedicó. El equipo de selección revisa los resultados y se comunica con usted por correo. Ya puede cerrar esta ventana.",

    camOn: "● cámara activa",
    camOff: "● sin cámara",
    scaleAria: "Opción {n} de 7",
    anchorDisagree: "En desacuerdo",
    anchorAgree: "De acuerdo",
    likert5: ["Muy en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Muy de acuerdo"],
    tetradMost: "Más",
    tetradLeast: "Menos",
    questionCounter: "Pregunta {n} de {total}",
    autoAdvance: "Avanza sola al responder",
    finishButton: "Terminar y enviar",
    nextButton: "Siguiente",
    autosave: "Sus respuestas se guardan automáticamente.",
  },

  /**
   * El consentimiento en inglés NO es la traducción del habeas data colombiano.
   * El candidato está en China y la ley que lo cubre es la PIPL: lo que exige es
   * decir quién trata la información, para qué, cuánto tiempo se guarda, que sale
   * del país, y pedir un consentimiento aparte para la imagen. Citar la Ley 1581
   * acá sería citarle una ley que no lo protege.
   */
  en: {
    loading: "Loading…",
    errorTitle: "We couldn't open the assessment",
    errorHelp: `Write to us at ${CANDIDATE_MAIL} and we'll help.`,
    errOpen: "We couldn't open the assessment.",
    errNetwork: `We couldn't connect. Write to us at ${CANDIDATE_MAIL} if this link doesn't open.`,
    errInvalidLink: INVALID_LINK_EN,
    errAlreadyTaken: "This assessment has already been taken",
    errConsentSave: "We couldn't record your consent. Write to us and we'll send you a new link.",
    errConsentNetwork: `We couldn't record your consent. Write to us at ${CANDIDATE_MAIL}.`,

    consentTitle: "Consent to the processing of your personal information",
    consentIntro:
      "Trading Solutions S.A.S. processes the answers you give in this assessment, your response times and the camera captures taken during the session, for the sole purpose of evaluating your application for the position you applied to.",
    consentBullets: [
      "The results are kept for **two years** and are then deleted.",
      "They are not shared with anyone outside the selection team.",
      "Trading Solutions S.A.S. is established outside China, so your information is **transferred to and stored outside China**, where the selection team reviews it.",
      "The remote format **requires an active camera** throughout the session. If you prefer not to enable it, you can take the assessment **on site** at our offices: reply to the email that sent you this link and we will arrange it.",
      "You may **withdraw your consent** at any time by replying to that same email.",
    ],
    nameLabel: "Full name",
    namePlaceholder: "As it appears on your ID",
    consentDataCheck: "**I consent** to the processing of my personal information as described above.",
    consentCamCheck:
      "**I consent to the capture of my image** during the session and understand that it is required for the remote format.",
    consentButton: "I consent and continue",
    camBlocked:
      "Your browser blocked the camera. Allow the permission and try again, or write to us to take the assessment on site.",

    introFallbackTitle: "Selection assessment",
    introP1:
      "The assessment has **five parts** and {total} questions in total. It takes around **90 minutes**. Only the fourth part is timed; the other four have no time limit.",
    introP2:
      "In the statement parts there are no right or wrong answers: answer with your first reaction, thinking it over does not improve the result. The timed part does have a correct answer.",
    introP3:
      "Your answers are saved as you go. If your browser closes, open this same link again and you continue exactly where you left off.",
    introP4:
      "You will not see a result on screen when you finish: the selection team reviews the report and we contact you by email.",
    introButton: "Start",

    blockQuestions: "{n} questions",
    blockButton: "Continue",

    saveFailTitle: "Your answers are not being saved",
    saveFailAlready: "This link has already been used. Your answers are not being saved.",
    saveFailGeneric: "We could not save your answer. Do not continue: your answers are not being recorded.",
    saveFailNetwork: "The connection was lost and your last answer was not saved. Check your internet before continuing.",
    saveFailHelp:
      "Please **do not continue**. Reply to the email that sent you this link and we will send you a new one. Nothing you answer from here on would be recorded.",

    sendingTitle: "Sending your answers…",
    sendingBody: "Do not close this window.",
    doneTitle: "Done, we received your assessment",
    doneBody:
      "Thank you for the time you gave us. The selection team reviews the results and will contact you by email. You can close this window now.",

    camOn: "● camera on",
    camOff: "● no camera",
    scaleAria: "Option {n} of 7",
    anchorDisagree: "Disagree",
    anchorAgree: "Agree",
    likert5: ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"],
    tetradMost: "Most",
    tetradLeast: "Least",
    questionCounter: "Question {n} of {total}",
    autoAdvance: "Moves on by itself when you answer",
    finishButton: "Finish and submit",
    nextButton: "Next",
    autosave: "Your answers are saved automatically.",
  },
};

/** Reemplaza {n}, {total} … por su valor. */
function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Convierte **esto** en <b>esto</b>. El texto visible no cambia. */
function rich(text: string): React.ReactNode[] {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>));
}

/**
 * Los endpoints responden en español. Para el candidato en inglés se traduce
 * lo que se sabe traducir; el español sigue mostrando exactamente lo que
 * mostraba antes, incluido el mensaje crudo del backend.
 */
function apiError(j: any, lang: Lang): string {
  const t = T[lang];
  const raw = String(j?.error ?? "");
  if (j?.status === "completed" || raw === "Esta prueba ya fue presentada") return t.errAlreadyTaken;
  return t.errInvalidLink;
}

/** Los cinco puntos de la escala Likert. Las etiquetas salen del diccionario. */
const L5 = [1, 2, 3, 4, 5];

/** Escala de 7 puntos en círculos graduados: el tamaño y el color indican la intensidad. */
const L7 = [
  { v: 1, size: 44, tone: "no" },
  { v: 2, size: 36, tone: "no" },
  { v: 3, size: 28, tone: "no" },
  { v: 4, size: 24, tone: "mid" },
  { v: 5, size: 28, tone: "si" },
  { v: 6, size: 36, tone: "si" },
  { v: 7, size: 44, tone: "si" },
];

function mmss(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function PruebaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;

  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [session, setSession] = useState<any>(null);
  const [blocks, setBlocks] = useState<CBlock[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  // El idioma lo decide la sesión (candidato de China → inglés). Si no viene,
  // español: es el caso de toda la operación en Colombia.
  const [lang, setLang] = useState<Lang>("es");

  const [bi, setBi] = useState(0);
  const [ii, setIi] = useState(0);
  const [left, setLeft] = useState<number | null>(null);

  const [okData, setOkData] = useState(false);
  const [okCam, setOkCam] = useState(false);
  const [name, setName] = useState("");
  const [camState, setCamState] = useState<"off" | "on" | "denied">("off");
  const [fallaGuardado, setFallaGuardado] = useState<string | null>(null);

  const t = T[lang];

  const shownAt = useRef<number>(Date.now());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blockRef = useRef<string>("A");
  const advTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logEvent = useCallback(
    (kind: string, detail?: string, item_code?: string) => {
      if (!token) return;
      fetch("/api/bateria/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind, detail, item_code }),
        keepalive: true,
      }).catch(() => {});
    },
    [token]
  );

  // ── Carga y reanudación ───────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const r = await fetch(`/api/bateria/session/${token}`);
        const j = await r.json();
        if (!r.ok) {
          // Un enlace inválido o ya presentado no trae idioma: queda el de por
          // defecto, salvo que el endpoint alguna vez lo mande.
          const le: Lang = j?.lang === "en" ? "en" : "es";
          setLang(le);
          setErrorMsg(apiError(j, le));
          setPhase("error");
          return;
        }
        setSession(j.session);
        setLang(j.session?.lang === "en" ? "en" : "es");
        setBlocks(j.blocks);
        setAnswers(j.existing || {});
        setName(j.session.candidate_name || "");
        // Reanudar en el primer ítem sin responder
        const done = j.existing || {};
        let rb = 0, ri = 0, found = false;
        for (let b = 0; b < j.blocks.length && !found; b++) {
          for (let i = 0; i < j.blocks[b].items.length; i++) {
            if (!done[j.blocks[b].items[i].code]) { rb = b; ri = i; found = true; break; }
          }
        }
        setBi(rb);
        setIi(ri);
        setPhase(j.session.consent_data_at ? "intro" : "habeas");
      } catch {
        setErrorMsg(T[lang].errNetwork);
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Proctoring ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "test" && phase !== "blockIntro") return;
    const onBlur = () => logEvent("tab_blur", document.hidden ? "pestaña oculta" : "ventana sin foco");
    const onFocus = () => logEvent("tab_focus");
    const onPaste = (e: ClipboardEvent) => logEvent("paste", `${(e.clipboardData?.getData("text") || "").length} caracteres`);
    const onCopy = () => logEvent("copy");
    const onCtx = (e: MouseEvent) => { e.preventDefault(); logEvent("contextmenu"); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const combo = (e.ctrlKey || e.metaKey) && ["c", "v", "p", "s", "f", "u"].includes(k);
      if (combo || e.key === "PrintScreen") logEvent("shortcut", e.key === "PrintScreen" ? "PrintScreen" : `${e.metaKey ? "Cmd" : "Ctrl"}+${k}`);
    };
    document.addEventListener("visibilitychange", onBlur);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("visibilitychange", onBlur);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("keydown", onKey);
    };
  }, [phase, logEvent]);

  // ── Cámara ────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamState("on");
      logEvent("cam_ok");
      return true;
    } catch {
      setCamState("denied");
      logEvent("cam_denied");
      return false;
    }
  }, [logEvent]);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) {
      logEvent('cam_lost', `captura omitida · video ${v ? `readyState ${v.readyState}` : 'no montado'}`);
      return;
    }
    const c = document.createElement("canvas");
    c.width = 320; c.height = 240;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    fetch("/api/bateria/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, image: c.toDataURL("image/jpeg", 0.6), block: blockRef.current }),
    }).catch(() => {});
  }, [token, logEvent]);

  useEffect(() => {
    if ((phase !== "test" && phase !== "blockIntro") || camState !== "on") return;
    const primera = setTimeout(capture, 2500);
    const id = setInterval(() => {
      const track = streamRef.current?.getVideoTracks()?.[0];
      if (!track || track.readyState !== "live") { logEvent("cam_lost"); setCamState("denied"); return; }
      capture();
    }, SNAPSHOT_EVERY_MS);
    return () => { clearTimeout(primera); clearInterval(id); };
  }, [phase, camState, capture, logEvent]);

  // El elemento <video> solo existe en la fase de prueba, pero el permiso de
  // cámara se pide antes (en el habeas data). El stream quedaba sin adjuntar y
  // capture() salía siempre por readyState < 2: cámara autorizada, cero fotos.
  // Al montarse el elemento se le vuelve a adjuntar el stream que ya se tenía.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !streamRef.current || v.srcObject) return;
    v.srcObject = streamRef.current;
    v.play().catch(() => {});
  }, [phase]);

  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => () => { if (advTimer.current) clearTimeout(advTimer.current); }, []);

  // ── Cronómetro ────────────────────────────────────────────
  const block = blocks[bi];
  useEffect(() => {
    if (phase !== "test" || !block) return;
    blockRef.current = block.key;
    setLeft(block.timedSeconds);
  }, [phase, bi, block]);

  useEffect(() => {
    if (phase !== "test" || left == null) return;
    if (left <= 0) { nextBlock(); return; }
    const id = setTimeout(() => setLeft((l) => (l == null ? l : l - 1)), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase]);

  // ── Guardado ──────────────────────────────────────────────
  const saveAnswer = useCallback(
    (code: string, answer: any) => {
      setAnswers((a) => ({ ...a, [code]: answer }));
      fetch("/api/bateria/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, item_code: code, answer, latency_ms: Date.now() - shownAt.current }),
        keepalive: true,
      })
        .then(async (r) => {
          if (r.ok) return;
          // Un fallo al guardar NO se puede tragar: es exactamente como alguien
          // termina las 172 preguntas y no queda ninguna registrada.
          const j = await r.json().catch(() => ({}));
          // El `detalle` del backend viene en español: al candidato en inglés se
          // le muestra el mensaje equivalente del diccionario.
          setFallaGuardado(
            (lang === "es" ? j?.detalle : null) ||
              (r.status === 409
                ? T[lang].saveFailAlready
                : T[lang].saveFailGeneric)
          );
        })
        .catch(() => {
          setFallaGuardado(T[lang].saveFailNetwork);
        });
    },
    [token, lang]
  );

  function goTo(nb: number, ni: number) {
    setBi(nb); setIi(ni);
    shownAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }

  function nextBlock() {
    logEvent("block_end", block?.key);
    if (bi + 1 < blocks.length) { goTo(bi + 1, 0); setPhase("blockIntro"); }
    else finish();
  }

  function next() {
    if (!block) return;
    if (ii + 1 < block.items.length) goTo(bi, ii + 1);
    else nextBlock();
  }

  /** Autoavance: en 60 afirmaciones seguidas, un botón por ítem es 60 clics de más. */
  function answerAndAdvance(code: string, answer: any, advance: boolean) {
    saveAnswer(code, answer);
    if (!advance) return;
    if (advTimer.current) clearTimeout(advTimer.current);
    advTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
  }

  async function finish() {
    setPhase("sending");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await fetch("/api/bateria/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
    } catch {}
    setPhase("done");
  }

  async function acceptConsent() {
    const camOk = okCam ? await startCamera() : false;
    try {
      const r = await fetch("/api/bateria/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // El idioma va en el cuerpo: el backend guarda la versión del texto que
        // el candidato acaba de leer (habeas data o PIPL), no la del servidor.
        body: JSON.stringify({ token, camera: okCam && camOk, name, lang }),
      });
      const j = await r.json().catch(() => ({}));
      // Si la autorizacion no queda registrada, la prueba NO empieza: sin ese
      // registro no hay evidencia de habeas data y las capturas se rechazan.
      if (!r.ok || j?.error) {
        setErrorMsg((lang === "es" ? j?.detalle : null) || t.errConsentSave);
        setPhase("error");
        return;
      }
    } catch {
      setErrorMsg(t.errConsentNetwork);
      setPhase("error");
      return;
    }
    setPhase("intro");
  }

  // ── Estilos ───────────────────────────────────────────────
  const shell: React.CSSProperties = {
    minHeight: "100vh", background: TS_BG, color: TS_BLACK,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "30px 20px 90px",
  };
  const card: React.CSSProperties = {
    maxWidth: 720, margin: "0 auto", background: "#fff",
    border: `1px solid ${TS_BORDER}`, borderRadius: 10, padding: "28px 28px 32px",
  };
  const h1: React.CSSProperties = { fontSize: 22, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" };
  const sub: React.CSSProperties = { color: TS_GRAY, fontSize: 14, margin: "0 0 22px", lineHeight: 1.65 };
  const btn: React.CSSProperties = {
    background: TS_BLACK, color: "#fff", border: "none", borderRadius: 7,
    padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  };

  if (phase === "loading") {
    return <div style={shell}><div style={card}><p style={{ color: TS_GRAY, margin: 0 }}>{t.loading}</p></div></div>;
  }

  if (phase === "error") {
    return (
      <div style={shell}><div style={card}>
        <h1 style={h1}>{t.errorTitle}</h1>
        <p style={sub}>{errorMsg}</p>
        <p style={{ ...sub, marginBottom: 0 }}>{t.errorHelp}</p>
      </div></div>
    );
  }

  if (phase === "habeas") {
    const listo = okData && okCam && name.trim().length >= 3;
    return (
      <div style={shell}><div style={card}>
        <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: TS_BLUE, fontWeight: 700, margin: "0 0 10px" }}>Trading Solutions</p>
        <h1 style={h1}>{t.consentTitle}</h1>
        <p style={sub}>{t.consentIntro}</p>
        <ul style={{ ...sub, paddingLeft: 18, marginBottom: 22 }}>
          {t.consentBullets.map((b, i) => (
            <li key={i} style={i === t.consentBullets.length - 1 ? undefined : { marginBottom: 7 }}>{rich(b)}</li>
          ))}
        </ul>
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>{t.nameLabel}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder}
            style={{ width: "100%", padding: "11px 12px", border: `1px solid ${TS_BORDER}`, borderRadius: 7, fontSize: 14 }} />
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={okData} onChange={(e) => setOkData(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{rich(t.consentDataCheck)}</span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 20, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={okCam} onChange={(e) => setOkCam(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{rich(t.consentCamCheck)}</span>
        </label>
        <button style={{ ...btn, opacity: listo ? 1 : 0.4, cursor: listo ? "pointer" : "not-allowed" }} disabled={!listo} onClick={acceptConsent}>
          {t.consentButton}
        </button>
        {camState === "denied" && (
          <p style={{ color: "#B45309", fontSize: 13, marginTop: 14 }}>
            {t.camBlocked}
          </p>
        )}
      </div></div>
    );
  }

  if (phase === "intro") {
    const total = blocks.reduce((n, b) => n + b.items.length, 0);
    return (
      <div style={shell}><div style={card}>
        <h1 style={h1}>{session?.vacancy_title || t.introFallbackTitle}</h1>
        <p style={sub}>{rich(fmt(t.introP1, { total }))}</p>
        <p style={sub}>{rich(t.introP2)}</p>
        <p style={sub}>{rich(t.introP3)}</p>
        <p style={{ ...sub, marginBottom: 24 }}>{rich(t.introP4)}</p>
        <button style={btn} onClick={async () => {
          if (camState !== "on") await startCamera();
          shownAt.current = Date.now();
          setPhase("test");
          logEvent("block_start", blocks[bi]?.key);
        }}>{t.introButton}</button>
      </div></div>
    );
  }

  if (phase === "blockIntro" && block) {
    return (
      <div style={shell}><div style={card}>
        <p style={{ fontSize: 11, letterSpacing: "0.11em", textTransform: "uppercase", color: TS_BLUE, fontWeight: 700, margin: "0 0 10px" }}>{block.label}</p>
        <h1 style={h1}>{fmt(t.blockQuestions, { n: block.items.length })}</h1>
        <p style={{ ...sub, marginBottom: 24 }}>{block.intro}</p>
        <button style={btn} onClick={() => { shownAt.current = Date.now(); setPhase("test"); logEvent("block_start", block.key); }}>{t.blockButton}</button>
      </div></div>
    );
  }

  if (fallaGuardado && phase === "test") {
    return (
      <div style={shell}><div style={{ ...card, borderColor: "#F3D6D2", background: "#FDF6F5" }}>
        <h1 style={h1}>{t.saveFailTitle}</h1>
        <p style={sub}>{fallaGuardado}</p>
        <p style={{ ...sub, marginBottom: 0 }}>
          {rich(t.saveFailHelp)}
        </p>
      </div></div>
    );
  }

  if (phase === "sending" || phase === "done") {
    return (
      <div style={shell}><div style={card}>
        <h1 style={h1}>{phase === "sending" ? t.sendingTitle : t.doneTitle}</h1>
        <p style={{ ...sub, marginBottom: 0 }}>
          {phase === "sending" ? t.sendingBody : t.doneBody}
        </p>
      </div></div>
    );
  }

  // ── phase === "test" ──────────────────────────────────────
  const item = block?.items[ii];
  if (!block || !item) return null;
  const a = answers[item.code];
  const totalItems = blocks.reduce((n, b) => n + b.items.length, 0);
  const doneItems = blocks.slice(0, bi).reduce((n, b) => n + b.items.length, 0) + ii;
  const answered =
    item.type === "tetrad" ? !!a?.most && !!a?.least && a.most !== a.least
      : item.type === "likert" ? !!a?.value
      : !!a?.choice;
  const autoAdvance = item.type === "likert" || item.type === "tetrad";

  return (
    <div style={shell}>
      <video ref={videoRef} muted playsInline style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />

      <div style={{ maxWidth: 720, margin: "0 auto 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: TS_GRAY, fontWeight: 700 }}>{block.label}</span>
        <div style={{ flex: 1, minWidth: 120, height: 4, background: TS_BORDER, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${(doneItems / totalItems) * 100}%`, height: "100%", background: TS_BLUE, transition: "width .2s" }} />
        </div>
        {left != null && (
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 600, color: left < 120 ? "#C41818" : TS_GRAY }}>{mmss(left)}</span>
        )}
        <span style={{ fontSize: 11, color: camState === "on" ? TS_GREEN : "#B45309", fontWeight: 600 }}>
          {camState === "on" ? t.camOn : t.camOff}
        </span>
      </div>

      <div style={card}>
        {item.type === "likert" && item.scale === 7 ? (
          <>
            <p style={{ fontSize: 19, lineHeight: 1.5, margin: "6px 0 32px", fontWeight: 500, textAlign: "center" }}>{item.stem}</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "nowrap" }}>
              <span style={{ fontSize: 12, color: TS_GRAY, fontWeight: 600, whiteSpace: "nowrap" }}>{t.anchorDisagree}</span>
              {L7.map((o) => {
                const on = a?.value === o.v;
                const color = o.tone === "si" ? TS_GREEN : o.tone === "no" ? "#8B5CF6" : TS_GRAY;
                return (
                  <button key={o.v} aria-label={fmt(t.scaleAria, { n: o.v })} onClick={() => answerAndAdvance(item.code, { value: o.v }, true)}
                    style={{
                      width: o.size, height: o.size, borderRadius: "50%", cursor: "pointer", flex: "0 0 auto",
                      border: `2px solid ${on ? color : TS_BORDER}`, background: on ? color : "#fff", padding: 0,
                      transition: "background .12s, border-color .12s",
                    }} />
                );
              })}
              <span style={{ fontSize: 12, color: TS_GRAY, fontWeight: 600, whiteSpace: "nowrap" }}>{t.anchorAgree}</span>
            </div>
          </>
        ) : item.type === "likert" ? (
          <>
            <p style={{ fontSize: 16.5, lineHeight: 1.6, margin: "0 0 20px" }}>{item.stem}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {L5.map((v, idx) => {
                const on = a?.value === v;
                return (
                  <button key={v} onClick={() => answerAndAdvance(item.code, { value: v }, true)}
                    style={{
                      flex: "1 1 120px", padding: "13px 8px", fontSize: 12.5, borderRadius: 7, cursor: "pointer",
                      border: `1px solid ${on ? TS_BLUE : TS_BORDER}`, background: on ? "#EEF3FE" : "#fff",
                      color: on ? TS_BLUE : TS_BLACK, fontWeight: on ? 700 : 400,
                    }}>{t.likert5[idx]}</button>
                );
              })}
            </div>
          </>
        ) : item.type === "tetrad" ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>{item.prompt}</p>
            <div style={{ border: `1px solid ${TS_BORDER}`, borderRadius: 7, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 62px 62px", background: "#F5F5F5", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: TS_GRAY }}>
                <div style={{ padding: "9px 12px" }}>&nbsp;</div>
                <div style={{ padding: "9px 6px", textAlign: "center", borderLeft: `1px solid ${TS_BORDER}` }}>{t.tetradMost}</div>
                <div style={{ padding: "9px 6px", textAlign: "center", borderLeft: `1px solid ${TS_BORDER}` }}>{t.tetradLeast}</div>
              </div>
              {item.statements?.map((s) => (
                <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr 62px 62px", borderTop: `1px solid ${TS_BORDER}`, alignItems: "center" }}>
                  <div style={{ padding: "13px 12px", fontSize: 14.5, lineHeight: 1.4 }}>{s.text}</div>
                  <div style={{ textAlign: "center", borderLeft: `1px solid ${TS_BORDER}`, padding: "13px 0" }}>
                    <input type="radio" name={`${item.code}-most`} checked={a?.most === s.key}
                      onChange={() => {
                        const nx = { ...(a || {}), most: s.key, least: a?.least === s.key ? undefined : a?.least };
                        answerAndAdvance(item.code, nx, !!nx.least);
                      }} />
                  </div>
                  <div style={{ textAlign: "center", borderLeft: `1px solid ${TS_BORDER}`, padding: "13px 0" }}>
                    <input type="radio" name={`${item.code}-least`} checked={a?.least === s.key}
                      onChange={() => {
                        const nx = { ...(a || {}), least: s.key, most: a?.most === s.key ? undefined : a?.most };
                        answerAndAdvance(item.code, nx, !!nx.most);
                      }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 16px", whiteSpace: "pre-line" }}>{item.stem}</p>
            {item.matrixSvg ? (
              <div style={{ maxWidth: 330, margin: "0 0 22px", color: TS_BLACK }} dangerouslySetInnerHTML={{ __html: item.matrixSvg }} />
            ) : null}
            {item.type === "figure" ? (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                {item.options?.map((o) => {
                  const on = a?.choice === o.key;
                  return (
                    <button key={o.key} onClick={() => saveAnswer(item.code, { choice: o.key })} aria-label={o.alt}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 12,
                        borderRadius: 8, cursor: "pointer", color: TS_BLACK,
                        border: `1px solid ${on ? TS_BLUE : TS_BORDER}`, background: on ? "#EEF3FE" : "#fff",
                      }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: on ? TS_BLUE : TS_GRAY }}>{o.key}</span>
                      <span style={{ width: 70, height: 70, display: "block" }} dangerouslySetInnerHTML={{ __html: o.svg || "" }} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {item.options?.map((o) => {
                  const on = a?.choice === o.key;
                  return (
                    <button key={o.key} onClick={() => saveAnswer(item.code, { choice: o.key })}
                      style={{
                        display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left", padding: "13px 15px",
                        borderRadius: 8, cursor: "pointer", fontSize: 14.5, lineHeight: 1.5, color: TS_BLACK,
                        border: `1px solid ${on ? TS_BLUE : TS_BORDER}`, background: on ? "#EEF3FE" : "#fff",
                      }}>
                      <span style={{ fontWeight: 700, color: on ? TS_BLUE : TS_GRAY, minWidth: 14 }}>{o.key}</span>
                      <span>{o.text}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 26, paddingTop: 20, borderTop: `1px solid ${TS_BORDER}` }}>
          <span style={{ fontSize: 12.5, color: TS_GRAY }}>{fmt(t.questionCounter, { n: ii + 1, total: block.items.length })}</span>
          {autoAdvance ? (
            <span style={{ fontSize: 12.5, color: TS_GRAY }}>{t.autoAdvance}</span>
          ) : (
            <button style={{ ...btn, opacity: answered ? 1 : 0.4, cursor: answered ? "pointer" : "not-allowed" }} disabled={!answered} onClick={next}>
              {ii + 1 === block.items.length && bi + 1 === blocks.length ? t.finishButton : t.nextButton}
            </button>
          )}
        </div>
      </div>

      <p style={{ maxWidth: 720, margin: "16px auto 0", fontSize: 12, color: TS_GRAY, textAlign: "center" }}>
        {t.autosave}
      </p>
    </div>
  );
}
