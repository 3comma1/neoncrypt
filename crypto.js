/* Reine Verschlüsselungslogik – läuft ausschließlich lokal via Web Crypto API.
   Format NC1:  "NC1:" + base64url( salt(16) | iv(12) | ciphertext+tag )
   Schlüsselableitung: PBKDF2-SHA-256, 310.000 Runden, 16 Byte Salt, AES-256-GCM. */
(function (root) {
  'use strict';

  const ITERATIONS = 310000;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const TAG_BYTES = 16;
  const PREFIX = 'NC1:';
  const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: keine Verwechslung von I/L/O/U
  const CHUNK = 0x8000;

  const utf8Encoder = new TextEncoder();
  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
  const aad = utf8Encoder.encode('NC1|v1|AES-256-GCM|PBKDF2-SHA-256|310000');

  function getCrypto() {
    const candidate = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!candidate || !candidate.subtle || !candidate.getRandomValues) {
      throw new Error('Web Crypto nicht verfügbar – bitte über https:// oder localhost öffnen.');
    }
    return candidate;
  }

  function assertSecret(secret) {
    if (secret == null || !String(secret).length) {
      throw new Error('Bitte zuerst einen Schlüssel eingeben oder erzeugen.');
    }
  }

  /* Kopierte Nachrichten dürfen Zeilenumbrüche und unsichtbare Zeichen enthalten. */
  function compact(text) {
    return String(text == null ? '' : text).replace(/[\s\u200b-\u200d\ufeff]/g, '');
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(text) {
    const clean = compact(text);
    if (!clean || !/^[A-Za-z0-9_-]+$/.test(clean)) throw new Error('Ungültige Zeichen in der Nachricht.');
    const standard = clean.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
    let binary;
    try {
      binary = atob(padded);
    } catch (error) {
      throw new Error('Nachricht ist beschädigt.');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function base32Encode(bytes) {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of bytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += BASE32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
    return out;
  }

  /* 32 Zufallsbytes -> gut lesbarer, teilbarer Schlüssel (256 Bit Entropie). */
  function generateSecret() {
    const bytes = getCrypto().getRandomValues(new Uint8Array(32));
    const groups = base32Encode(bytes).match(/.{1,13}/g) || [];
    return 'NC-' + groups.join('-');
  }

  function parseToken(token) {
    const clean = compact(token);
    const match = /^NC1:([A-Za-z0-9_-]+)$/i.exec(clean);
    if (!match) {
      throw new Error('Keine NC1-Nachricht erkannt. Erwartet wird ein Text, der mit NC1: beginnt.');
    }
    const blob = base64UrlToBytes(match[1]);
    if (blob.length < SALT_BYTES + IV_BYTES + TAG_BYTES) {
      throw new Error('Nachricht ist unvollständig oder beschädigt.');
    }
    return {
      salt: blob.slice(0, SALT_BYTES),
      iv: blob.slice(SALT_BYTES, SALT_BYTES + IV_BYTES),
      ciphertext: blob.slice(SALT_BYTES + IV_BYTES)
    };
  }

  function looksLikeCiphertext(text) {
    return /^NC1:[A-Za-z0-9_-]+$/i.test(compact(text));
  }

  async function deriveKey(secret, salt) {
    const webcrypto = getCrypto();
    const material = await webcrypto.subtle.importKey(
      'raw', utf8Encoder.encode(String(secret)), 'PBKDF2', false, ['deriveKey']
    );
    return webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(secret, plaintext) {
    assertSecret(secret);
    const webcrypto = getCrypto();
    const random = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES + IV_BYTES));
    const salt = random.slice(0, SALT_BYTES);
    const iv = random.slice(SALT_BYTES);
    const key = await deriveKey(secret, salt);
    const encrypted = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: aad, tagLength: 128 },
      key,
      utf8Encoder.encode(String(plaintext == null ? '' : plaintext))
    );

    const blob = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    blob.set(salt, 0);
    blob.set(iv, SALT_BYTES);
    blob.set(new Uint8Array(encrypted), SALT_BYTES + IV_BYTES);
    return PREFIX + bytesToBase64Url(blob);
  }

  async function decrypt(secret, token) {
    assertSecret(secret);
    const parsed = parseToken(token);
    const webcrypto = getCrypto();
    const key = await deriveKey(secret, parsed.salt);
    let decrypted;
    try {
      decrypted = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: parsed.iv, additionalData: aad, tagLength: 128 },
        key,
        parsed.ciphertext
      );
    } catch (error) {
      throw new Error('Entschlüsselung fehlgeschlagen – falscher Schlüssel oder veränderte Nachricht.');
    }
    try {
      return utf8Decoder.decode(decrypted);
    } catch (error) {
      throw new Error('Entschlüsselung fehlgeschlagen – kein lesbarer Text.');
    }
  }

  const api = {
    encrypt,
    decrypt,
    generateSecret,
    looksLikeCiphertext,
    parseToken,
    ITERATIONS,
    PREFIX
  };
  root.NeonCrypt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
