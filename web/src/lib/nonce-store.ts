// Nonces must survive Next.js hot-module reloads in development.
// A plain `const nonces = new Map()` is reset on every HMR cycle — the nonce
// is stored in the old module instance and `consumeNonce` runs in the new one,
// so the lookup always misses.  Attaching to `globalThis` keeps one Map alive
// for the lifetime of the Node process regardless of how many times modules reload.
const g = globalThis as typeof globalThis & {
  __nonceStore?: Map<string, { nonce: string; expires: number }>;
};
if (!g.__nonceStore) g.__nonceStore = new Map();
const nonces = g.__nonceStore;

export function setNonce(address: string, nonce: string) {
  nonces.set(address.toLowerCase(), { nonce, expires: Date.now() + 5 * 60 * 1000 });
}

export function consumeNonce(address: string): string | null {
  const entry = nonces.get(address.toLowerCase());
  if (!entry || entry.expires < Date.now()) {
    nonces.delete(address.toLowerCase());
    return null;
  }
  nonces.delete(address.toLowerCase());
  return entry.nonce;
}
