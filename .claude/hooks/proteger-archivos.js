// PreToolUse (Edit|Write): bloquea ediciones a archivos que Claude no debe tocar.
//  - package-lock.json: duplicado del lock de pnpm, se ignora (ver CLAUDE.md).
//  - .env*: secretos (JWT_SECRET, ODOO_API_KEY, CRON_SECRET...).
// Exit 2 = bloquear; el mensaje de stderr vuelve a Claude.
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let ruta = "";
  try {
    ruta = JSON.parse(input).tool_input?.file_path || "";
  } catch {
    process.exit(0);
  }
  const nombre = ruta.split(/[\\/]/).pop() || "";
  if (nombre === "package-lock.json") {
    console.error("Bloqueado: package-lock.json no se edita (el proyecto usa pnpm-lock.yaml).");
    process.exit(2);
  }
  if (/^\.env(\.|$)/.test(nombre)) {
    console.error(`Bloqueado: ${nombre} contiene secretos; edítalo a mano.`);
    process.exit(2);
  }
  process.exit(0);
});
