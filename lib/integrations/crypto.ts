import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"

function getKey() {
  const rawKey = process.env.INTEGRATIONS_ENCRYPTION_KEY
  if (!rawKey) {
    throw new Error("Falta INTEGRATIONS_ENCRYPTION_KEY para cifrar tokens de integraciones")
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) {
    return Buffer.from(rawKey, "hex")
  }

  try {
    const decoded = Buffer.from(rawKey, "base64")
    if (decoded.length === 32) return decoded
  } catch {
    // Fall back to deterministic hash below.
  }

  return createHash("sha256").update(rawKey).digest()
}

export function encryptJson(value: unknown) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const plaintext = JSON.stringify(value)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    key_version: "v1",
  }
}

export function decryptJson<T>(encrypted: { ciphertext: string; iv: string; tag: string }) {
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(encrypted.iv, "base64"))
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")

  return JSON.parse(plaintext) as T
}
