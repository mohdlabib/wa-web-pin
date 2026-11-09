// Shared PIN helpers (loaded by content script and options page).
const WAPIN = {
  ITERATIONS: 200000,
  MAX_ATTEMPTS: 5,
  COOLDOWN_MS: 30000,

  toHex(buf) {
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  fromHex(hex) {
    return new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  },

  async derive(pin, saltHex) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: WAPIN.fromHex(saltHex), iterations: WAPIN.ITERATIONS },
      key,
      256
    );
    return WAPIN.toHex(bits);
  },

  async hashPin(pin) {
    const salt = WAPIN.toHex(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, hash: await WAPIN.derive(pin, salt) };
  },

  async verify(pin, record) {
    if (!record || !record.salt || !record.hash) return false;
    const hash = await WAPIN.derive(pin, record.salt);
    // Constant-time compare.
    let diff = hash.length ^ record.hash.length;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ record.hash.charCodeAt(i);
    return diff === 0;
  },

  isValidPin(pin) {
    return /^\d{4,12}$/.test(pin);
  },
};
