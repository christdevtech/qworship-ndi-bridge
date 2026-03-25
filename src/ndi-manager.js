'use strict';

/**
 * NdiManager — lightweight wrapper around the `grandiose` NDI sender.
 *
 * grandiose is a native Node addon that binds to the NDI SDK C library.
 * The DLL (Processing.NDI.Lib.x64.dll) must be present either:
 *   - In the same directory as the .exe (packaged builds via extraFiles)
 *   - Or on the system PATH (dev: install NDI Tools from ndi.video)
 */

// Precompute Gamma 2.2 LUT for Color Correction
const gammaLUT = new Uint8Array(256);
const invGamma = 1 / 2.2;
for (let i = 0; i < 256; i++) {
  gammaLUT[i] = Math.round(Math.pow(i / 255, invGamma) * 255);
}

let grandiose;
let grandioseError = null;

try {
  grandiose = require('@stagetimerio/grandiose');
  console.log('[NdiManager] grandiose module loaded successfully');
} catch (e) {
  console.error(
    '[NdiManager] CRITICAL: grandiose native module could not be loaded.\n' +
    'Make sure the NDI Runtime is installed.\n' +
    'Download from: https://www.ndi.tv/tools/\n' +
    'Error:', e.message
  );
  grandioseError = {
    message: 'NDI Runtime not found',
    details: e.message,
    solution: 'Download and install NDI Tools from https://www.ndi.tv/tools/'
  };
  grandiose = null;
}

class NdiSender {
  constructor(index, name, width, height) {
    this._index     = index;
    this._name      = name;
    this._width     = width;
    this._height    = height;
    this._sender    = null;
    this._frameCount = 0;
    this._lastFpsCheck = Date.now();
    this._fps       = 0;
    this._bytesSent = 0;
    this._lastBitCheck = Date.now();
    this._bitrateMbps  = 0;

    this._init();
  }

  async _init() {
    if (!grandiose) return;
    try {
      const senderObj = await grandiose.send({
        name: this._name,
        clockVideo: true,
        clockAudio: false,
      });
      this._sender = senderObj;
      console.log(`[NdiSender ${this._index}] NDI sender "${this._name}" initialised`);
    } catch (e) {
      console.error(`[NdiSender ${this._index}] Failed to create NDI sender:`, e.message);
    }
  }

  sendFrame(bgraBuffer, width, height) {
    if (!this._sender) return;

    // CRITICAL: Prevent native C++ segfault by ensuring buffer matches dimensions
    const expectedBytes = width * height * 4;
    if (bgraBuffer.byteLength !== expectedBytes) {
      if (this._frameCount % 60 === 0) {
        console.error(`[NdiSender ${this._index}] DROP FRAME: Buffer size mismatch! Expected ${expectedBytes} for ${width}x${height}, got ${bgraBuffer.byteLength}.`);
      }
      return;
    }

    // Apply exact Gamma Correction 2.2 LUT to BGRA bytes sequentially
    for (let i = 0; i < expectedBytes; i += 4) {
      bgraBuffer[i]     = gammaLUT[bgraBuffer[i]];       // Blue
      bgraBuffer[i + 1] = gammaLUT[bgraBuffer[i + 1]]; // Green
      bgraBuffer[i + 2] = gammaLUT[bgraBuffer[i + 2]]; // Red
    }

    // Count every paint event regardless of NDI outcome
    this._frameCount++;
    this._bytesSent += bgraBuffer.byteLength;

    const now = Date.now();
    if (now - this._lastFpsCheck >= 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._lastFpsCheck = now;
    }
    if (now - this._lastBitCheck >= 1000) {
      this._bitrateMbps = parseFloat(
        ((this._bytesSent * 8) / 1_000_000).toFixed(1)
      );
      this._bytesSent = 0;
      this._lastBitCheck = now;
    }

    try {
      // Send frame and handle promise properly
      const videoPromise = this._sender.video({
        xres: width,
        yres: height,
        frameRateN: 60000,
        frameRateD: 1001,
        pictureAspectRatio: width / height,
        frameFormatType: grandiose.FORMAT_TYPE_PROGRESSIVE,
        fourCC: 1095911234, // BGRA constant from index.d.ts
        lineStrideBytes: width * 4,
        data: bgraBuffer,
      });

      // IMPORTANT: Handle promise rejection properly
      if (videoPromise && typeof videoPromise.catch === 'function') {
        videoPromise.catch(err => {
          // Log frame errors only once per second to avoid spam
          if (now - (this._lastErrorLog || 0) >= 1000) {
            console.warn(`[NdiSender ${this._index}] Frame send error:`, err.message);
            this._lastErrorLog = now;
          }
        });
      }
    } catch (e) {
      // Catch synchronous errors
      console.error(`[NdiSender ${this._index}] sendFrame sync error:`, e.message);
    }
  }

  get fps() { return this._fps; }
  get bitrateMbps() { return this._bitrateMbps; }

  destroy() {
    if (this._sender) {
      try { this._sender.destroy(); } catch (_) {}
      this._sender = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------
class NdiManager {
  constructor() {
    this._senders = [null, null];
  }

  createSender(index, name, width, height) {
    if (this._senders[index]) this._senders[index].destroy();
    const s = new NdiSender(index, name, width, height);
    this._senders[index] = s;
    return s;
  }

  getFpsStats() {
    return this._senders.map(s => (s ? s.fps : 0));
  }

  getBitrateStats() {
    return this._senders.map(s => (s ? s.bitrateMbps : 0));
  }

  destroy() {
    this._senders.forEach(s => s && s.destroy());
    this._senders = [null, null];
  }
}

module.exports = NdiManager;
module.exports.getGrandioseError = () => grandioseError;
