'use strict';

/**
 * Minimal JSON settings store — replaces electron-store.
 * Reads/writes a JSON file in app.getPath('userData').
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

class SimpleStore {
  constructor(defaults = {}) {
    this._defaults = defaults;
    this._path = path.join(app.getPath('userData'), 'settings.json');
    this._data = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._path, 'utf8');
      return { ...this._defaults, ...JSON.parse(raw) };
    } catch {
      return { ...this._defaults };
    }
  }

  _save() {
    try {
      fs.writeFileSync(this._path, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (e) {
      console.error('[SimpleStore] Failed to save:', e.message);
    }
  }

  get(key) {
    return key ? this._data[key] : this._data;
  }

  set(key, value) {
    this._data[key] = value;
    this._save();
  }
}

module.exports = SimpleStore;
