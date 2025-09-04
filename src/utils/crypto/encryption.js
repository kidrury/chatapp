'use strict';


/**
 * PRODUCTION-GRADE SERVER-SIDE ENCRYPTION (CommonJS)
 * - AES-256-GCM for message encryption (confidentiality + integrity/auth)
 * - HKDF-SHA256 to derive a per-conversation DEK from a single master key
 * - Canonical AAD (Associated Authenticated Data) binds context to ciphertext
 *
 * This design:
 *   - Never stores plaintext in RabbitMQ or Couchbase
 *   - Derives deterministic per-conversation keys (no DB needed for keys)
 *   - Supports rotation via CRYPTO_MASTER_KID and algorithm/version tags
 */

const crypto = require('crypto');

// ---- Constants (algorithm choices & versions) --------------------------------

// Authenticated symmetric cipher (industry standard)
const CIPHER = 'aes-256-gcm';

// 12 bytes is the NIST-recommended IV length for GCM
const IV_LENGTH = 12;

// HKDF config: derive a 32-byte (256-bit) Data Encryption Key (DEK)
const HKDF_DIGEST = 'sha256';
const DEK_LENGTH = 32;

// Version tags for future migrations / rotations
const ENVELOPE_VERSION = 1; // bump if you change format/derivation
const KDF_INFO_PREFIX = 'chat:conversation:dek:v1'; // kdf "info" label

// ---- Errors ------------------------------------------------------------------

class CryptoConfigError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'CryptoConfigError';
  }
}

// ---- Env / master key handling ----------------------------------------------

/**
 * Reads and validates the base64 master key from env.
 * - CRYPTO_MASTER_KEY must decode to exactly 32 bytes.
 * - CRYPTO_MASTER_KID (string) tags which master key version was used.
 */
function getMasterKeyMaterial() {
  const b64 = process.env.CRYPTO_MASTER_KEY;
  const kid = process.env.CRYPTO_MASTER_KID || '1';

  if (!b64) {
    throw new CryptoConfigError('CRYPTO_MASTER_KEY is missing. Generate one with `openssl rand -base64 32` and set it in env.');
  }

  let ikm;
  try {
    ikm = Buffer.from(b64, 'base64');
  } catch {
    throw new CryptoConfigError('CRYPTO_MASTER_KEY is not valid base64.');
  }

  if (ikm.length !== 32) {
    throw new CryptoConfigError(`CRYPTO_MASTER_KEY must decode to 32 bytes (got ${ikm.length}).`);
  }

  return { ikm, kid: String(kid) };
}

// ---- Small helpers -----------------------------------------------------------

/**
 * Stable, canonical JSON stringify:
 * - Sorts object keys so AAD serialization is deterministic
 * - Ensures decryption succeeds as long as input fields are identical
 */
function canonicalJSONStringify(obj) {
  const keys = Object.keys(obj).sort();
  const ordered = {};
  for (const k of keys) ordered[k] = obj[k];
  return JSON.stringify(ordered);
}

/**
 * Salt for HKDF derived from a conversation id:
 * - HKDF remains secure with predictable/non-secret salt, but we hash to fixed length.
 * - Using an id-tied salt gives each conversation a distinct key space.
 */
function saltFromConversationId(conversationId) {
  return crypto.createHash('sha256').update(`salt:${conversationId}`).digest();
}

/**
 * Derive a per-conversation DEK using HKDF(master, salt=convHash, info=label|kid|conv).
 * Returns a 32-byte Buffer.
 */
function deriveConversationDEK(conversationId, masterIkm, masterKid) {
  const salt = saltFromConversationId(conversationId);
  const info = Buffer.from(`${KDF_INFO_PREFIX}|kid=${masterKid}|conv=${conversationId}`, 'utf8');
  // hkdfSync(digest, ikm, salt, info, keylen)
  return crypto.hkdfSync(HKDF_DIGEST, masterIkm, salt, info, DEK_LENGTH);
}

/**
 * Build AAD (Associated Authenticated Data) as canonical JSON.
 * We DO NOT encrypt AAD; GCM authenticates it. If AAD changes, decryption fails.
 * Typical fields: conversationId, senderId, createdAt, messageType, etc.
 */
function buildAAD(aadMeta) {
  const json = canonicalJSONStringify(aadMeta);
  return Buffer.from(json, 'utf8');
}

// ---- Core API ----------------------------------------------------------------

/**
 * Encrypt plaintext with per-conversation DEK using AES-256-GCM.
 *
 * @param {string} conversationId - stable id of the chat/conversation/room
 * @param {string|Buffer} plaintext - message content to encrypt (UTF-8 if string)
 * @param {object} aadMeta - metadata bound to ciphertext via AAD (e.g., {conversationId, senderId, createdAt})
 * @returns {object} envelope - safe to store/ship; NEVER includes plaintext
 */
function encryptMessage(conversationId, plaintext, aadMeta) {
  if (!conversationId) throw new Error('encryptMessage: conversationId is required');
  if (!aadMeta || typeof aadMeta !== 'object') throw new Error('encryptMessage: aadMeta object is required');

  const { ikm, kid } = getMasterKeyMaterial();           // load & validate master key
  const dek = deriveConversationDEK(conversationId, ikm, kid); // derive per-conversation key
  const iv = crypto.randomBytes(IV_LENGTH);              // unique IV per message (never reuse with same key!)
  const aad = buildAAD(aadMeta);                         // deterministic AAD buffer

  const cipher = crypto.createCipheriv(CIPHER, dek, iv, { authTagLength: 16 });
  cipher.setAAD(aad, { plaintextLength: Buffer.isBuffer(plaintext) ? plaintext.length : Buffer.byteLength(plaintext, 'utf8') });

  const first = cipher.update(plaintext, Buffer.isBuffer(plaintext) ? undefined : 'utf8'); // returns Buffer
  const last = cipher.final();                          // finalize encryption
  const authTag = cipher.getAuthTag();                  // 16-byte GCM tag

  const ciphertext = Buffer.concat([first, last]);

  // Envelope is what we publish/store (no secrets here)
  return {
    v: ENVELOPE_VERSION,           // envelope format version
    alg: CIPHER,                   // algorithm tag for debugging/forensics
    kid,                           // which master key version derived this DEK
    iv: iv.toString('base64'),     // GCM IV (public)
    tag: authTag.toString('base64'), // GCM auth tag (public, integrity)
    ct: ciphertext.toString('base64') // ciphertext (public, unreadable)
    // NOTE: we DO NOT include AAD here; store AAD fields themselves alongside this object.
  };
}

/**
 * Decrypt envelope back to plaintext using the same AAD metadata.
 *
 * @param {string} conversationId
 * @param {object} envelope - object returned by encryptMessage()
 * @param {object} aadMeta - EXACT same AAD fields/values used at encryption
 * @returns {string} plaintext (UTF-8)
 */
function decryptMessage(conversationId, envelope, aadMeta) {
  if (!conversationId) throw new Error('decryptMessage: conversationId is required');
  if (!envelope || typeof envelope !== 'object') throw new Error('decryptMessage: envelope object is required');
  if (!aadMeta || typeof aadMeta !== 'object') throw new Error('decryptMessage: aadMeta object is required');

  const { iv, tag, ct, alg, v } = envelope;

  if (alg !== CIPHER) throw new Error(`decryptMessage: unexpected alg ${alg}`);
  if (v !== ENVELOPE_VERSION) throw new Error(`decryptMessage: unsupported envelope version ${v}`);

  const { ikm, kid } = getMasterKeyMaterial();
  // Use the envelope's kid to select master key if/when you support multiple active keys.
  // Here we only have one, but we keep the field for future rotation logic.
  const dek = deriveConversationDEK(conversationId, ikm, kid);

  const ivBuf = Buffer.from(iv, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const ctBuf = Buffer.from(ct, 'base64');
  const aad = buildAAD(aadMeta);

  const decipher = crypto.createDecipheriv(CIPHER, dek, ivBuf, { authTagLength: 16 });
  decipher.setAAD(aad, { plaintextLength: ctBuf.length }); // length hint helps some runtimes
  decipher.setAuthTag(tagBuf);

  const first = decipher.update(ctBuf);
  const last = decipher.final();
  const plaintextBuf = Buffer.concat([first, last]);

  return plaintextBuf.toString('utf8');
}

module.exports = {
  encryptMessage,
  decryptMessage
};