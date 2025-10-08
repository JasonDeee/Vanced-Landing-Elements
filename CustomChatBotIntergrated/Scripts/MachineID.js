/**
 * MachineID Generator for Vanced Customer Support Chatbot
 * Tạo ID duy nhất cho mỗi thiết bị/browser
 */

/**
 * Tạo browser fingerprint để generate MachineID
 * Bao gồm cả real data và honeypot fields để chống fake fingerprint
 * @returns {Object} - Browser fingerprint object
 */
function generateBrowserFingerprint() {
  // Real fingerprint data
  const realFingerprint = {
    userAgent: navigator.userAgent || "unknown",
    language: navigator.language || "unknown",
    platform: navigator.platform || "unknown",
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || "unknown",
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    deviceMemory: navigator.deviceMemory || "unknown",
    colorDepth: screen.colorDepth || 24,
    pixelDepth: screen.pixelDepth || 24,
  };

  // Advanced fingerprinting (nếu có thể)
  const advancedFingerprint = {
    // Canvas fingerprinting
    canvasFingerprint: getCanvasFingerprint(),
    // WebGL fingerprinting
    webglFingerprint: getWebGLFingerprint(),
    // Audio context fingerprinting
    audioFingerprint: getAudioFingerprint(),
    // Font detection
    availableFonts: getAvailableFonts(),
    // Plugin detection
    plugins: getPluginsList(),
  };

  const honeypotFields = {
    // Fake system info (nhưng consistent)
    systemMemory: generateConsistentFakeValue("mem", 4, 32), // GB
    cpuCores: generateConsistentFakeValue("cpu", 2, 16),
    gpuVendor: generateConsistentFakeValue("gpu", ["NVIDIA", "AMD", "Intel"]),
    batteryLevel: generateConsistentFakeValue("bat", 20, 100), // %
    networkType: generateConsistentFakeValue("net", [
      "wifi",
      "ethernet",
      "cellular",
    ]),

    // Fake browser extensions (consistent per browser)
    extensionCount: generateConsistentFakeValue("ext", 0, 15),
    adBlockerEnabled: generateConsistentFakeValue("adb", [true, false]),

    // Fake performance metrics
    renderingEngine: generateConsistentFakeValue("render", [
      "Blink",
      "Gecko",
      "WebKit",
    ]),
    jsEngine: generateConsistentFakeValue("js", [
      "V8",
      "SpiderMonkey",
      "JavaScriptCore",
    ]),

    // Fake security features
    secureContext: window.isSecureContext || false,
    cookieStore: typeof window.cookieStore !== "undefined",

    // Timestamp-based but predictable
    sessionStart: Math.floor(Date.now() / 3600000) * 3600000, // Rounded to hour
  };

  return {
    ...realFingerprint,
    ...advancedFingerprint,
    ...honeypotFields,
    // Checksum để verify integrity
    _checksum: generateFingerprintChecksum({
      ...realFingerprint,
      ...advancedFingerprint,
    }),
  };
}

/**
 * Simple hash function (SHA-256 alternative for browsers without crypto.subtle)
 * @param {string} str - String to hash
 * @returns {string} - Hashed string
 */
function simpleHash(str) {
  let hash = 0;
  if (str.length === 0) return hash.toString();

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive hex string
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Advanced hash using Web Crypto API (if available)
 * @param {string} str - String to hash
 * @returns {Promise<string>} - Hashed string
 */
async function cryptoHash(str) {
  if (!window.crypto || !window.crypto.subtle) {
    return simpleHash(str);
  }

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Return first 16 characters for shorter ID
    return hashHex.substring(0, 16);
  } catch (error) {
    console.warn("Crypto API failed, using simple hash:", error);
    return simpleHash(str);
  }
}

/**
 * Generate MachineID từ browser fingerprint
 * @returns {Promise<string>} - MachineID (16 characters)
 */
async function generateMachineID() {
  try {
    const fingerprint = generateBrowserFingerprint();
    const fingerprintString = JSON.stringify(fingerprint);

    console.log("Browser fingerprint:", fingerprint);

    const machineId = await cryptoHash(fingerprintString);

    console.log("Generated MachineID:", machineId);

    return machineId;
  } catch (error) {
    console.error("Error generating MachineID:", error);

    // Fallback: use timestamp + random
    const fallback =
      Date.now().toString(16) + Math.random().toString(16).substr(2, 8);
    return fallback.substring(0, 16);
  }
}

/**
 * Validate MachineID format
 * @param {string} machineId - MachineID to validate
 * @returns {boolean} - true if valid format
 */
function isValidMachineID(machineId) {
  if (!machineId || typeof machineId !== "string") return false;

  // Should be 16 characters, alphanumeric
  const regex = /^[a-f0-9]{16}$/i;
  return regex.test(machineId);
}

/**
 * Get or generate MachineID (with localStorage caching)
 * @returns {Promise<string>} - MachineID
 */
async function getOrCreateMachineID() {
  const STORAGE_KEY = "vanced_machine_id";

  try {
    // Try to get from localStorage first
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidMachineID(stored)) {
      console.log("Using cached MachineID:", stored);
      return stored;
    }

    // Generate new MachineID
    const newMachineId = await generateMachineID();

    // Store in localStorage
    localStorage.setItem(STORAGE_KEY, newMachineId);

    console.log("Generated and cached new MachineID:", newMachineId);

    return newMachineId;
  } catch (error) {
    console.error("Error in getOrCreateMachineID:", error);

    // Ultimate fallback
    const fallback = "fallback" + Date.now().toString(16).substr(-8);
    return fallback;
  }
}

/**
 * Clear cached MachineID (for testing/debugging)
 */
function clearMachineID() {
  const STORAGE_KEY = "vanced_machine_id";
  localStorage.removeItem(STORAGE_KEY);
  console.log("Cleared cached MachineID");
}

/**
 * Get MachineID info for debugging
 * @returns {Promise<Object>} - Debug info
 */
async function getMachineIDInfo() {
  const machineId = await getOrCreateMachineID();
  const fingerprint = generateBrowserFingerprint();

  return {
    machineId: machineId,
    fingerprint: fingerprint,
    isValid: isValidMachineID(machineId),
    cached: localStorage.getItem("vanced_machine_id") === machineId,
    timestamp: new Date().toISOString(),
  };
}

// ====== ADVANCED FINGERPRINTING HELPERS ======

/**
 * Generate consistent fake value based on real browser data
 * @param {string} key - Key for consistency
 * @param {number|Array} range - Range of values or array of options
 * @param {number} max - Max value (if range is number)
 * @returns {any} - Consistent fake value
 */
function generateConsistentFakeValue(key, range, max) {
  // Use real browser data to seed fake values (consistent per browser)
  const seed = simpleHash(navigator.userAgent + key + screen.width);
  const seedNum = parseInt(seed.substring(0, 8), 16);

  if (Array.isArray(range)) {
    return range[seedNum % range.length];
  } else {
    return range + (seedNum % (max - range + 1));
  }
}

/**
 * Canvas fingerprinting
 * @returns {string} - Canvas fingerprint
 */
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Draw some text and shapes
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillText("Vanced fingerprint test 🔒", 2, 2);

    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillRect(100, 5, 80, 20);

    return canvas.toDataURL().substring(0, 50); // First 50 chars
  } catch (e) {
    return "canvas_unavailable";
  }
}

/**
 * WebGL fingerprinting
 * @returns {string} - WebGL fingerprint
 */
function getWebGLFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    if (!gl) return "webgl_unavailable";

    const renderer = gl.getParameter(gl.RENDERER);
    const vendor = gl.getParameter(gl.VENDOR);

    return `${vendor}_${renderer}`.substring(0, 50);
  } catch (e) {
    return "webgl_error";
  }
}

/**
 * Audio context fingerprinting
 * @returns {string} - Audio fingerprint
 */
function getAudioFingerprint() {
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const analyser = audioContext.createAnalyser();

    oscillator.connect(analyser);
    oscillator.frequency.value = 1000;

    const fingerprint = `${audioContext.sampleRate}_${analyser.frequencyBinCount}`;

    // Clean up
    audioContext.close();

    return fingerprint;
  } catch (e) {
    return "audio_unavailable";
  }
}

/**
 * Detect available fonts
 * @returns {string} - Font fingerprint
 */
function getAvailableFonts() {
  const testFonts = [
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Courier New",
    "Verdana",
    "Georgia",
    "Palatino",
    "Garamond",
    "Bookman",
    "Comic Sans MS",
    "Trebuchet MS",
    "Arial Black",
    "Impact",
  ];

  const availableFonts = [];
  const testString = "mmmmmmmmmmlli";
  const testSize = "72px";

  // Create test element
  const testElement = document.createElement("span");
  testElement.style.fontSize = testSize;
  testElement.style.position = "absolute";
  testElement.style.left = "-9999px";
  testElement.innerHTML = testString;
  document.body.appendChild(testElement);

  // Test each font
  testFonts.forEach((font) => {
    testElement.style.fontFamily = font;
    const width = testElement.offsetWidth;
    const height = testElement.offsetHeight;

    if (width > 0 && height > 0) {
      availableFonts.push(font);
    }
  });

  document.body.removeChild(testElement);

  return availableFonts.join(",").substring(0, 100);
}

/**
 * Get plugins list
 * @returns {string} - Plugins fingerprint
 */
function getPluginsList() {
  try {
    const plugins = Array.from(navigator.plugins).map((p) => p.name);
    return plugins.join(",").substring(0, 100);
  } catch (e) {
    return "plugins_unavailable";
  }
}

/**
 * Generate checksum for fingerprint integrity
 * @param {Object} data - Data to checksum
 * @returns {string} - Checksum
 */
function generateFingerprintChecksum(data) {
  const dataString = JSON.stringify(data);
  return simpleHash(dataString).substring(0, 8);
}

/**
 * Verify fingerprint integrity
 * @param {Object} fingerprint - Fingerprint to verify
 * @returns {boolean} - True if valid
 */
function verifyFingerprintIntegrity(fingerprint) {
  if (!fingerprint._checksum) return false;

  const { _checksum, ...dataWithoutChecksum } = fingerprint;
  const expectedChecksum = generateFingerprintChecksum(dataWithoutChecksum);

  return _checksum === expectedChecksum;
}

// Export functions for use in other scripts
window.VancedMachineID = {
  generate: generateMachineID,
  getOrCreate: getOrCreateMachineID,
  validate: isValidMachineID,
  clear: clearMachineID,
  getInfo: getMachineIDInfo,
  generateFingerprint: generateBrowserFingerprint,
  verifyFingerprint: verifyFingerprintIntegrity,
};
