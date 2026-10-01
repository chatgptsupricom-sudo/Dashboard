"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = typeof window !== "undefined"
      ? (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host
      : "";
    socket = io(url, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function connectSocket(userId: number) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  s.emit("join_user_room", userId);
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
