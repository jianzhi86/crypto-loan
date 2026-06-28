const nonces = new Map<string, { nonce: string; expires: number }>();

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
