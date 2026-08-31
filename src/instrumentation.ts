export async function register() {
  // El runtime "edge" (usado por el middleware) también dispara este hook;
  // el programador necesita better-sqlite3 y solo tiene sentido en Node.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_INTERNAL_SCHEDULER === "1") {
    console.log("[programador] desactivado por DISABLE_INTERNAL_SCHEDULER=1.");
    return;
  }
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
