/**
 * The AI interview is off unless AI_INTERVIEW_ENABLED is 1, true, yes, or on.
 * A string argument checks only that flag, so existing callers stay valid.
 * An env object (or no argument) also requires ELEVENLABS_API_KEY.
 */
export const AI_INTERVIEW_OFF_NOTE = "Entrevista IA desactivada";

export const AI_INTERVIEW_UNAVAILABLE_ES =
  "La entrevista con IA no está disponible por ahora.";
export const AI_INTERVIEW_UNAVAILABLE_EN =
  "The AI interview is not available right now.";

type AiInterviewEnv = {
  AI_INTERVIEW_ENABLED?: string | null;
  ELEVENLABS_API_KEY?: string | null;
};

function flagOn(flag: string | null | undefined): boolean {
  const value = (flag ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function aiInterviewEnabled(flagOrEnv?: string | null | AiInterviewEnv): boolean {
  if (flagOrEnv && typeof flagOrEnv === "object") {
    return flagOn(flagOrEnv.AI_INTERVIEW_ENABLED) && Boolean((flagOrEnv.ELEVENLABS_API_KEY ?? "").trim());
  }
  if (typeof flagOrEnv === "string" || flagOrEnv === null) {
    return flagOn(flagOrEnv);
  }
  return flagOn(process.env.AI_INTERVIEW_ENABLED) && Boolean((process.env.ELEVENLABS_API_KEY ?? "").trim());
}
