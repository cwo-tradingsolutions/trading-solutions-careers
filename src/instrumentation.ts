export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logStartupSecretFailure, shouldExitOnStartupFailure } = await import("./lib/hr-admin-secrets");
  const problem = logStartupSecretFailure();
  if (!problem || !shouldExitOnStartupFailure()) return;
  // Next 14.2 keeps the process listening if register() throws. Exit so the
  // TCP port never stays up for a bad candidate-facing host. Never at build time.
  process.exit(1);
}
