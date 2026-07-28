// Nota: Como estamos en el servidor, esto es un poco distinto.
// Si usas el server.js custom que creamos, puedes hacer:
export const emitActivityUpdate = () => {
  // Si el cliente está en el mismo servidor, esto disparará el evento
  fetch("http://localhost:3000/api/trigger-socket");
};
