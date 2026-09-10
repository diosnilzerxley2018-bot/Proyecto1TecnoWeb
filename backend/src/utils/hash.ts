import bcrypt from 'bcrypt';
import { env } from '../config/env.js';

/** Cifra una contraseña con salt (RNF-SEG-02). */
export function hashearContrasena(textoPlano: string): Promise<string> {
  return bcrypt.hash(textoPlano, env.bcryptRounds);
}

/** Compara una contraseña en texto plano contra su hash almacenado. */
export function verificarContrasena(textoPlano: string, hash: string): Promise<boolean> {
  return bcrypt.compare(textoPlano, hash);
}
