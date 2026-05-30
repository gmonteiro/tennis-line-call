/**
 * Generate simple beep placeholder sounds using Web Audio API concepts.
 * These are minimal valid MP3-like files so the app doesn't crash.
 *
 * For production, replace with real voice recordings or use generate-sounds.py.
 *
 * Run: node scripts/generate-placeholder-sounds.js
 */

const fs = require("fs");
const path = require("path");

// Minimal valid MP3 frame (silence) - just enough to not crash AudioContext.decodeAudioData
// This is a valid MPEG audio frame header + minimal data
const SILENT_MP3 = Buffer.from([
  // ID3v2 header
  0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  // MPEG frame header (MPEG1, Layer3, 128kbps, 44100Hz, stereo)
  0xFF, 0xFB, 0x90, 0x00,
  // Padding with zeros for the frame
  ...new Array(417).fill(0x00),
]);

const soundsDir = path.join(__dirname, "..", "public", "sounds");
fs.mkdirSync(soundsDir, { recursive: true });

fs.writeFileSync(path.join(soundsDir, "out.mp3"), SILENT_MP3);
fs.writeFileSync(path.join(soundsDir, "fault.mp3"), SILENT_MP3);

console.log("Placeholder sounds created in public/sounds/");
console.log("Replace with real audio files for production.");
