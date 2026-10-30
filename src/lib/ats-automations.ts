/**
 * Automatismos por gate · qué hace Careers solo cuando un candidato entra a
 * un gate de Kelly.
 *
 * Hoy está cableado solo lo que ya existía a medias:
 *  - Prefiltro pasado → Batería TS: se envía desde la ruta del prefiltro
 *    (src/lib/bateria/invitar.ts), no desde acá, porque necesita el origin
 *    del request para armar el enlace.
 *
 * El resto son TODO explícitos. Un case vacío avisa en el log en vez de
 * fallar: el movimiento del candidato nunca depende de un automatismo.
 * Slack y los informes HM los consume Samuel desde el evento; no van acá.
 */
import type { StageChangedEvent } from "@/lib/ats-events";

function todo(evt: StageChangedEvent, que: string) {
  console.log(JSON.stringify({
    severity: "INFO",
    message: "ats_automation_todo",
    gate: evt.gate,
    candidate_id: evt.candidate_id,
    todo: que,
  }));
}

export async function runGateAutomations(evt: StageChangedEvent): Promise<void> {
  switch (evt.gate) {
    case "bateria_ts":
      // Cableado: invitar.ts envía la batería y mueve a `pruebas`.
      return;
    case "assessment":
      return todo(evt, "Citar Assessment (Case global ± On-call) con el Calendly del owner_recruiter");
    case "entrevista_sel":
      return todo(evt, "Ofrecer slot de entrevista de selección + formulario de Ruth");
    case "terna":
      return todo(evt, "Notificar Terna al hiring_lead_email (Samuel arma el informe HM)");
    case "medicos_seguridad":
      return todo(evt, "Al cerrar médicos + seguridad, preparar paquete de oferta");
    case "onboarding":
      return todo(evt, "Aceptó oferta → onboarding: Leader + Host + handoff 6X");
    default:
      return;
  }
}
