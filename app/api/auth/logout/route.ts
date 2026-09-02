import { NextResponse } from "next/server";

// No existia ningun endpoint que borrara la cookie httpOnly de sesion desde
// el servidor: el logout del cliente solo limpiaba el estado de Zustand (y,
// antes de este cambio, una cookie no-httpOnly duplicada) — la cookie real
// que middleware.ts y los guards de API verifican seguia viva. "Cerrar
// sesion" no invalidaba nada del lado del servidor.
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
