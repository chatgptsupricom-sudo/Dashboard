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

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  // Configuración de Socket.io con CORS permitido
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Hacemos que la instancia sea global para acceder desde las rutas de API
  global.io = io;

  io.on("connection", (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    socket.on("join_user_room", (userId) => {
      const room = `user_${userId}`;
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
  });
});
