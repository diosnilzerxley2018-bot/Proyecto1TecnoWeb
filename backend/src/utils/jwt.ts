import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface PayloadToken {
  idUsuario: number;
  nombreUsuario: string;
  idRol: number;
}

/** Genera el token de sesión (RNF-SEG-06). */
export function firmarToken(payload: PayloadToken): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

/** Verifica y decodifica el token. Lanza si es inválido o expiró. */
export function verificarToken(token: string): PayloadToken {
  return jwt.verify(token, env.jwtSecret) as PayloadToken;
}
