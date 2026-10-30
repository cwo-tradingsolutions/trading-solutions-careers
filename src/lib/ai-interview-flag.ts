/**
 * The AI interview is off unless AI_INTERVIEW_ENABLED is 1, true, yes, or on.
 * GCP stays off until that flag is set. A present ElevenLabs key is not enough.
 */
export function aiInterviewEnabled(flag?: string | null): boolean {
  const value = (flag ?? process.env.AI_INTERVIEW_ENABLED ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}
