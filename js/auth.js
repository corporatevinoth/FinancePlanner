/**
 * auth.js - Bank-Grade Local Vault Security
 * Uses Web Crypto API (PBKDF2 + AES-256-GCM)
 * Zero third-party dependency, runs 100% locally in browser.
 */

const AUTH_STORAGE_KEY = 'fp_vault_meta';
const SESSION_UNLOCK_KEY = 'fp_vault_unlocked';

export const AuthService = {
  // Check if user has already configured a Master PIN
  isPinConfigured() {
    const meta = localStorage.getItem(AUTH_STORAGE_KEY);
    return !!meta;
  },

  // Check if vault is currently unlocked in this browser session
  isUnlocked() {
    // If no PIN is configured yet, app is in setup/guest state
    if (!this.isPinConfigured()) return false;
    return sessionStorage.getItem(SESSION_UNLOCK_KEY) === 'true';
  },

  // Set session unlocked
  setSessionUnlocked(unlocked = true) {
    if (unlocked) {
      sessionStorage.setItem(SESSION_UNLOCK_KEY, 'true');
    } else {
      sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    }
  },

  // Convert array buffer to base64
  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },

  // Convert base64 to Uint8Array
  base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  // Derive AES-256-GCM key from PIN + Salt using PBKDF2
  async deriveKey(pin, saltBuffer) {
    const encoder = new TextEncoder();
    const pinKeyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256'
      },
      pinKeyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  // Setup a new Master PIN (stores salt and verification token)
  async setupMasterPin(pin) {
    if (!pin || pin.length < 4) {
      throw new Error('PIN must be at least 4 digits/characters.');
    }

    // Generate random 16-byte salt
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await this.deriveKey(pin, salt);

    // Encrypt a known verification canary string: "VAULT_AUTHORIZED"
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const canary = new TextEncoder().encode('VAULT_AUTHORIZED');
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      canary
    );

    const vaultMeta = {
      salt: this.bufferToBase64(salt),
      iv: this.bufferToBase64(iv),
      canary: this.bufferToBase64(ciphertext),
      createdAt: new Date().toISOString()
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(vaultMeta));
    this.setSessionUnlocked(true);
    return true;
  },

  // Verify PIN against stored canary
  async verifyPin(pin) {
    const metaStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!metaStr) return false;

    try {
      const meta = JSON.parse(metaStr);
      const salt = this.base64ToBuffer(meta.salt);
      const iv = this.base64ToBuffer(meta.iv);
      const canaryCipher = this.base64ToBuffer(meta.canary);

      const key = await this.deriveKey(pin, salt);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        canaryCipher
      );

      const text = new TextDecoder().decode(decrypted);
      if (text === 'VAULT_AUTHORIZED') {
        this.setSessionUnlocked(true);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('PIN verification failed:', err);
      return false;
    }
  },

  removePin() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.setSessionUnlocked(true);
    return true;
  },

  // Encrypt arbitrary data with user's PIN
  async encryptData(plainTextOrObj, pin) {
    const dataStr = typeof plainTextOrObj === 'string' ? plainTextOrObj : JSON.stringify(plainTextOrObj);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(pin, salt);

    const encodedData = new TextEncoder().encode(dataStr);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    return {
      salt: this.bufferToBase64(salt),
      iv: this.bufferToBase64(iv),
      payload: this.bufferToBase64(ciphertext)
    };
  },

  // Decrypt data with user's PIN
  async decryptData(encryptedEnvelope, pin) {
    const salt = this.base64ToBuffer(encryptedEnvelope.salt);
    const iv = this.base64ToBuffer(encryptedEnvelope.iv);
    const payload = this.base64ToBuffer(encryptedEnvelope.payload);

    const key = await this.deriveKey(pin, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      payload
    );

    const jsonStr = new TextDecoder().decode(decrypted);
    return JSON.parse(jsonStr);
  },

  // Lock vault now
  lock() {
    this.setSessionUnlocked(false);
  }
};
