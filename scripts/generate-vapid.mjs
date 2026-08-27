import { generateVapidKeys } from "./vapid.mjs";

const keys = generateVapidKeys();

console.log("Añade estas líneas a tu .env:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:tu@email.com`);
