import jwt from "jsonwebtoken";
import type { JWTPayload } from "./types";

const JWT_SECRET =
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=";
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || "7d";

export function generateToken(
  payload: Omit<JWTPayload, "iat" | "exp">,
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
  });
}

// Cambiamos el tipo a 'string | undefined' para manejar el caso nulo
export function verifyToken(token: string | undefined): JWTPayload | null {
  // 1. Validamos que el token exista y sea un string antes de procesar
  if (!token || typeof token !== "string") {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    // Aquí puedes registrar el error si lo necesitas
    return null;
  }
}

export function decodeToken(token: string | undefined): JWTPayload | null {
  if (!token || typeof token !== "string") return null;

  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
