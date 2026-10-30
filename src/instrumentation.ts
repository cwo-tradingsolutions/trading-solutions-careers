export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { logSessionSecretFailure } = await import("./lib/hr-admin-secrets");
  const problem = logSessionSecretFailure();
  if (!problem) return;
  if (process.env.K_SERVICE || process.env.VERCEL_ENV === "production") {
    throw new Error(problem);
  }
}
