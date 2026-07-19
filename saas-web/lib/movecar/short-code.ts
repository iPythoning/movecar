/**
 * Generate a URL-friendly short code for a MoveCar tag.
 *
 * Alphabet avoids confusable characters (0/O, 1/l, I). 8 characters gives
 * ~56^8 ≈ 9.7 trillion possible codes, collision probability is negligible
 * until billions of tags exist — we still retry on the unique index.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'

export function generateShortCode(length = 8): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return out
}

export const SHORT_CODE_LENGTH = 8
export const SHORT_CODE_MAX_RETRIES = 5
