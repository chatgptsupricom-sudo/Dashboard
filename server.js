// const { createServer } = require("http");
// const { Server } = require("socket.io");
// const next = require("next");

// const dev = process.env.NODE_ENV !== "production";
// const app = next({ dev });
// const handle = app.getRequestHandler();

// app.prepare().then(() => {
//   const httpServer = createServer((req, res) => handle(req, res));

//   // Configuración de Socket.io con CORS permitido para desarrollo local
//   const io = new Server(httpServer, {
//     cors: {
//       origin: [
//         "https://dashboard-test-dashboard.larlxe.easypanel.host",
//         "https://panel.supricom.com.ve",
//       ],
//       methods: ["GET", "POST"],
//       credentials: true,
//     },
//   });

//   // Hacemos que la instancia sea global para acceder desde las rutas de API
//   global.io = io;

//   io.on("connection", (socket) => {
//     console.log(`Cliente conectado: ${socket.id}`);

//     // Manejo de desconexión
//     socket.on("disconnect", () => {
//       console.log(`Cliente desconectado: ${socket.id}`);
//     });
//   });

//   // Escuchamos en el puerto 3000
//   const PORT = process.env.PORT || 3000;
//   httpServer.listen(PORT, (err) => {
//     if (err) throw err;
//     console.log(`> Servidor listo en http://localhost:${PORT}`);
//   });
// });
const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Mismo origen que la pagina que abre el socket, para cualquier deploy de
// EasyPanel (el subdominio de prueba cambia con cada branch/entorno, asi
// que no se puede dejar una lista fija de nombres) mas la produccion real y
// localhost. Antes esto era `origin: true` (cualquier sitio), que con
// `credentials: true` dejaba que una pagina externa abriera el socket
// usando la cookie de sesion de quien la visitara y recibiera sus eventos.
function origenPermitido(origin, callback) {
  if (!origin) return callback(null, true);
  try {
    const host = new URL(origin).hostname;
    const ok =
      host === "localhost" ||
      host.endsWith(".easypanel.host") ||
      host.endsWith(".supricom.com.ve");
    callback(null, ok);
  } catch {
    callback(null, false);
  }
}

// El "quien sos" de cada socket se resuelve UNA vez, aca, verificando el
// JWT de la cookie de sesion (la misma que ya manda el navegador en el
// handshake por ser mismo origen) — nunca del valor que el cliente decida
// mandar por `join_user_room`. Antes cualquiera podia unirse a la sala de
// notificaciones de otro usuario adivinando su id numerico.
function usuarioDelSocket(socket) {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const crudo = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("token="));
    if (!crudo) return null;
    const token = decodeURIComponent(crudo.slice("token=".length));
    const secret = (process.env.JWT_SECRET || "").trim();
    if (!secret) return null;
    const payload = jwt.verify(token, secret);
    return payload.sub || null;
  } catch {
    return null;
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    cors: {
      origin: origenPermitido,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Hacemos que la instancia sea global para acceder desde las rutas de API
  global.io = io;

  io.on("connection", (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);
    socket.data.userId = usuarioDelSocket(socket);

    socket.on("join_user_room", () => {
      if (!socket.data.userId) return;
      const room = `user_${socket.data.userId}`;
      socket.join(room);
      console.log(`Socket ${socket.id} unido a sala ${room}`);
    });

    // Manejo de desconexión
    socket.on("disconnect", () => {
      console.log(`Cliente desconectado: ${socket.id}`);
    });
  });

  const PORT = process.env.PORT || 3000;

  // ==========================================
  // CONFIGURACIÓN DE STOPLIGHT REPORTS (CRON)
  // ==========================================

  // Se ejecuta Miércoles (3) y Viernes (5) a las 20:00 (8:00 PM)
  cron.schedule(
    "0 20 * * 3,5",
    async () => {
      console.log(
        `[${new Date().toISOString()}] Ejecutando cron de KPIs (Miércoles/Viernes 8 PM)...`,
      );

      try {
        const response = await fetch(
          `http://localhost:${PORT}/api/cron/calculate-kpis`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
          },
        );

        const data = await response.json();

        if (response.ok) {
          console.log("KPIs actualizados exitosamente:", data);
          // Opcional: Emitir evento por socket para refrescar el panel en tiempo real
          if (global.io) {
            global.io.emit("kpis_updated", {
              message: "Nuevos KPIs calculados",
            });
          }
        } else {
          console.error("Fallo al actualizar KPIs:", data);
        }
      } catch (error) {
        console.error(
          "Error de red al intentar ejecutar el cron:",
          error.message,
        );
      }
    },
    {
      scheduled: true,
      timezone: "America/Caracas",
    },
  );

  // ==========================================
  // ALERTA DE EQUIPOS PENDIENTES DE DESPACHO (CRON) - issue #37
  // ==========================================

  // Todos los dias habiles a las 10:00. Diario alcanza: el umbral se mide en
  // dias, revisarlo mas seguido solo repetiria el mismo aviso. Y de lunes a
  // viernes porque el almacen no despacha el fin de semana, asi que avisar
  // sabado y domingo seria ruido que ademas ensena a ignorar la alerta.
  cron.schedule(
    "0 10 * * 1-5",
    async () => {
      console.log(
        `[${new Date().toISOString()}] Revisando ingresos pendientes de despacho...`,
      );

      try {
        const response = await fetch(
          `http://localhost:${PORT}/api/cron/check-ingresos-pendientes`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
          },
        );

        const data = await response.json();

        if (response.ok) {
          console.log("Revision de pendientes lista:", data);
        } else {
          console.error("Fallo la revision de pendientes:", data);
        }
      } catch (error) {
        console.error(
          "Error de red al revisar ingresos pendientes:",
          error.message,
        );
      }
    },
    {
      scheduled: true,
      timezone: "America/Caracas",
    },
  );

  // ==========================================
  // CIERRE AUTOMATICO DEL REPORTE DE VENTAS TRIMESTRAL (Panama)
  // ==========================================

  // Dia 5 de enero/abril/julio/octubre a las 06:00: genera el reporte del
  // trimestre que acaba de cerrar, lo guarda y (si hay webhook) lo manda a n8n.
  // El dia 5 da margen para que entren facturas rezagadas antes de congelar.
  cron.schedule(
    "0 6 5 1,4,7,10 *",
    async () => {
      console.log(
        `[${new Date().toISOString()}] Generando cierre del reporte trimestral...`,
      );
      try {
        const response = await fetch(
          `http://localhost:${PORT}/api/cron/reporte-trimestral`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
          },
        );
        const data = await response.json();
        if (response.ok) {
          console.log("Cierre trimestral listo:", JSON.stringify(data));
        } else {
          console.error("Fallo el cierre trimestral:", data);
        }
      } catch (error) {
        console.error("Error de red en el cierre trimestral:", error.message);
      }
    },
    {
      scheduled: true,
      timezone: "America/Caracas",
    },
  );

  // ==========================================
  // INICIO DEL SERVIDOR
  // ==========================================
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Servidor listo en http://localhost:${PORT}`);
    console.log(
      `> Cron programado: Miércoles y Viernes a las 8:00 PM (America/Caracas)`,
    );
    console.log(
      `> Cron programado: alerta de pendientes de despacho, L-V 10:00 AM (America/Caracas)`,
    );
    console.log(
      `> Cron programado: cierre del reporte trimestral, dia 5 de ene/abr/jul/oct 06:00 (America/Caracas)`,
    );
  });
});
