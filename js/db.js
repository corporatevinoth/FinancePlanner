/**
 * db.js - IndexedDB Local Persistence Engine
 * Handles offline-first, client-side relational storage for Assets, Monthly Snapshots, and Settings.
 */

const DB_NAME = 'FinancePlannerDB';
const DB_VERSION = 2;

class Database {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  // Open database connection
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Assets Store
        if (!db.objectStoreNames.contains('assets')) {
          const assetStore = db.createObjectStore('assets', { keyPath: 'id' });
          assetStore.createIndex('category', 'category', { unique: false });
          assetStore.createIndex('name', 'name', { unique: false });
        }

        // Monthly Snapshots Store
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'month' });
          snapshotStore.createIndex('date', 'date', { unique: false });
        }

        // Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Gold Predictions Store (Permanent Ledger)
        if (!db.objectStoreNames.contains('gold_predictions')) {
          const goldStore = db.createObjectStore('gold_predictions', { keyPath: 'prediction_id' });
          goldStore.createIndex('timestamp', 'timestamp', { unique: false });
          goldStore.createIndex('horizon', 'prediction_horizon', { unique: false });
          goldStore.createIndex('status', 'status', { unique: false });
        }

        // Gold News / Events Store (Clustered Events)
        if (!db.objectStoreNames.contains('gold_events')) {
          const eventStore = db.createObjectStore('gold_events', { keyPath: 'event_id' });
          eventStore.createIndex('timestamp', 'timestamp', { unique: false });
          eventStore.createIndex('category', 'category', { unique: false });
          eventStore.createIndex('severity', 'severity', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB connection error:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  // Generic helper for transaction operations
  async getStore(storeName, mode = 'readonly') {
    const db = await this.init();
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // ==================== ASSETS API ====================
  async getAllAssets() {
    const store = await this.getStore('assets', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAssetById(id) {
    const store = await this.getStore('assets', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveAsset(asset) {
    if (!asset.id) {
      asset.id = 'ast_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    asset.updatedAt = new Date().toISOString();

    const store = await this.getStore('assets', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(asset);
      request.onsuccess = () => resolve(asset);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteAsset(id) {
    const store = await this.getStore('assets', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== SNAPSHOTS API ====================
  async getAllSnapshots() {
    const store = await this.getStore('snapshots', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        // Sort chronologically ascending by month (e.g. 2024-01 -> 2026-09)
        const sorted = (request.result || []).sort((a, b) => a.month.localeCompare(b.month));
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getSnapshotByMonth(month) {
    const store = await this.getStore('snapshots', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(month);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSnapshot(snapshot) {
    const store = await this.getStore('snapshots', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(snapshot);
      request.onsuccess = () => resolve(snapshot);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSnapshot(month) {
    const store = await this.getStore('snapshots', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(month);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== SETTINGS API ====================
  async getSetting(key, defaultValue = null) {
    const store = await this.getStore('settings', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        if (request.result && request.result.value !== undefined) {
          resolve(request.result.value);
        } else {
          resolve(defaultValue);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async setSetting(key, value) {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== BACKUP & RESTORE ====================
  async exportFullData() {
    const assets = await this.getAllAssets();
    const snapshots = await this.getAllSnapshots();
    
    // Get all settings
    const settingsStore = await this.getStore('settings', 'readonly');
    const settings = await new Promise((resolve) => {
      const req = settingsStore.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      assets,
      snapshots,
      settings
    };
  }

  async importFullData(data, overwrite = false) {
    if (!data || !data.assets || !data.snapshots) {
      throw new Error('Invalid backup file format.');
    }

    if (overwrite) {
      await this.clearAll();
    }

    // Import assets
    for (const asset of data.assets) {
      await this.saveAsset(asset);
    }

    // Import snapshots
    for (const snapshot of data.snapshots) {
      await this.saveSnapshot(snapshot);
    }

    // Import settings
    if (data.settings && Array.isArray(data.settings)) {
      for (const s of data.settings) {
        if (s.key) await this.setSetting(s.key, s.value);
      }
    }

    return true;
  }

  // ==================== GOLD PREDICTIONS API ====================
  async getAllGoldPredictions() {
    const store = await this.getStore('gold_predictions', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const list = (request.result || []).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getGoldPredictionById(id) {
    const store = await this.getStore('gold_predictions', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveGoldPrediction(prediction) {
    if (!prediction.prediction_id) {
      prediction.prediction_id = 'pred_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    if (!prediction.timestamp) {
      prediction.timestamp = new Date().toISOString();
    }
    const store = await this.getStore('gold_predictions', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(prediction);
      request.onsuccess = () => resolve(prediction);
      request.onerror = () => reject(request.error);
    });
  }

  async updateGoldPredictionActual(predictionId, actualPrice, evaluatedAt = new Date().toISOString()) {
    const record = await this.getGoldPredictionById(predictionId);
    if (!record) return null;
    record.actual_price = actualPrice;
    record.evaluated_at = evaluatedAt;
    record.absolute_error = Math.abs(actualPrice - record.predicted_price);
    record.percentage_error = Number(((record.absolute_error / actualPrice) * 100).toFixed(2));
    const predictedDir = record.predicted_price >= record.gold_price_at_prediction ? 'UP' : 'DOWN';
    const actualDir = actualPrice >= record.gold_price_at_prediction ? 'UP' : 'DOWN';
    record.directional_hit = predictedDir === actualDir;
    record.within_interval = actualPrice >= record.lower_bound && actualPrice <= record.upper_bound;
    record.status = 'EVALUATED';
    return await this.saveGoldPrediction(record);
  }

  async deleteGoldPrediction(id) {
    const store = await this.getStore('gold_predictions', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== GOLD EVENTS API ====================
  async getAllGoldEvents() {
    const store = await this.getStore('gold_events', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const list = (request.result || []).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveGoldEvent(event) {
    if (!event.event_id) {
      event.event_id = 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }
    const store = await this.getStore('gold_events', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(event);
      request.onsuccess = () => resolve(event);
      request.onerror = () => reject(request.error);
    });
  }

  async clearAll() {
    const db = await this.init();
    const stores = ['assets', 'snapshots', 'settings', 'gold_predictions', 'gold_events'].filter(name => db.objectStoreNames.contains(name));
    for (const name of stores) {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      await new Promise((res) => { tx.oncomplete = res; });
    }
    return true;
  }
}

export const DB = new Database();
