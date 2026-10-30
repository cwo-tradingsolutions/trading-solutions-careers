/**
 * ElevenLabs is not a corporate tool. The voice interview stays off unless
 * someone turns the flag on AND the API key is present. Missing key wins:
 * a flag without a key still does nothing and never calls ElevenLabs.
 */
export const AI_INTERVIEW_OFF_NOTE = "Entrevista IA desactivada";

export const AI_INTERVIEW_UNAVAILABLE_ES =
  "La entrevista con IA no está disponible por ahora.";
export const AI_INTERVIEW_UNAVAILABLE_EN =
  "The AI interview is not available right now.";

type FlagEnv = {
  AI_INTERVIEW_ENABLED?: string | null;
  ELEVENLABS_API_KEY?: string | null;
};

export function aiInterviewEnabled(env?: FlagEnv): boolean {
  const source = env ?? {
    AI_INTERVIEW_ENABLED: process.env.AI_INTERVIEW_ENABLED,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  };
  const flag = String(source.AI_INTERVIEW_ENABLED ?? "").trim().toLowerCase();
  const turnedOn = flag === "1" || flag === "true" || flag === "yes" || flag === "on";
  if (!turnedOn) return false;
  return String(source.ELEVENLABS_API_KEY ?? "").trim().length > 0;
}
