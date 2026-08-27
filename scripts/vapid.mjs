import { createECDH } from "node:crypto";

/**
 * Genera un par de claves VAPID (ECDSA P-256) sin depender de paquetes
 * externos, para que la configuración inicial funcione incluso antes de
 * haber ejecutado `npm install`.
 *
 * El formato es el que espera web-push: clave pública en punto sin comprimir
 * (65 bytes) y privada de 32 bytes exactos, ambas en base64url.
 */
export function generateVapidKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();

  const publicKey = ecdh.getPublicKey();
  const privateKey = ecdh.getPrivateKey();

  if (publicKey.length !== 65) {
    throw new Error(`Clave pública inesperada: ${publicKey.length} bytes`);
  }

  // El escalar privado puede salir con menos de 32 bytes cuando empieza por
  // ceros; web-push exige 32 exactos, así que se rellena por la izquierda.
  const padded = Buffer.alloc(32);
  privateKey.copy(padded, 32 - privateKey.length);

  return {
    publicKey: publicKey.toString("base64url"),
    privateKey: padded.toString("base64url"),
  };
}
