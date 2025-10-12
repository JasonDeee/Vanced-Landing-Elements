/**
 * Vanced Customer Support - P2P Utilities
 * Shared utilities for P2P functionality
 */

// ====== CONSTANTS ======
const P2P_CONSTANTS = {
  CLIENT_TIMEOUT: 3 * 60 * 1000, // 3 minutes
  ADMIN_WARNING_TIME: 25 * 60 * 1000, // 25 minutes
  PEER_ID_PREFIX: "vanced_",
  ADMIN_ID_PREFIX: "admin_",
  CONNECTION_RETRY_DELAY: 1000, // 1 second
  MAX_RETRY_ATTEMPTS: 3,
};

// ====== PEER ID UTILITIES ======

/**
 * Generate custom PeerID for client
 * @param {string} machineId - Machine ID
 * @returns {string} - Custom PeerID
 */
function generateClientPeerID(machineId) {
  const timestamp = Date.now();
  return `${P2P_CONSTANTS.PEER_ID_PREFIX}${machineId}_${timestamp}`;
}

/**
 * Generate custom PeerID for admin
 * @param {string} adminNickname - Admin nickname
 * @returns {string} - Custom admin PeerID
 */
function generateAdminPeerID(adminNickname) {
  const timestamp = Date.now();
  const sanitizedNickname = adminNickname.replace(/[^a-zA-Z0-9]/g, "");
  return `${P2P_CONSTANTS.ADMIN_ID_PREFIX}${sanitizedNickname}_${timestamp}`;
}

/**
 * Parse PeerID to extract information
 * @param {string} peerID - PeerID to parse
 * @returns {Object} - Parsed information
 */
function parsePeerID(peerID) {
  const isClient = peerID.startsWith(P2P_CONSTANTS.PEER_ID_PREFIX);
  const isAdmin = peerID.startsWith(P2P_CONSTANTS.ADMIN_ID_PREFIX);

  if (isClient) {
    const parts = peerID.replace(P2P_CONSTANTS.PEER_ID_PREFIX, "").split("_");
    const timestamp = parts.pop();
    const machineId = parts.join("_");

    return {
      type: "client",
      machineId: machineId,
      timestamp: parseInt(timestamp),
      createdAt: new Date(parseInt(timestamp)),
    };
  }

  if (isAdmin) {
    const parts = peerID.replace(P2P_CONSTANTS.ADMIN_ID_PREFIX, "").split("_");
    const timestamp = parts.pop();
    const nickname = parts.join("_");

    return {
      type: "admin",
      nickname: nickname,
      timestamp: parseInt(timestamp),
      createdAt: new Date(parseInt(timestamp)),
    };
  }

  return {
    type: "unknown",
    original: peerID,
  };
}

// ====== P2P DATA STRUCTURES ======

/**
 * Create P2P request data structure
 * @param {string} clientPeerID - Client PeerID
 * @param {string} adminPeerID - Admin PeerID (optional)
 * @param {string} status - Connection status
 * @param {string} adminNickname - Admin nickname (optional)
 * @returns {Object} - P2P data structure
 */
function createP2PData(
  clientPeerID,
  adminPeerID = null,
  status = "waiting",
  adminNickname = null
) {
  return {
    clientPeerID: clientPeerID,
    adminPeerID: adminPeerID,
    status: status, // waiting|connected|closed|warn
    adminNickname: adminNickname,
    timestamp: new Date().toISOString(),
    connectionStartTime:
      status === "connected" ? new Date().toISOString() : null,
  };
}

/**
 * Create message data structure
 * @param {string} type - Message type
 * @param {string} message - Message content
 * @param {string} from - Sender (client|admin)
 * @param {Object} metadata - Additional metadata
 * @returns {Object} - Message data structure
 */
function createMessageData(type, message, from, metadata = {}) {
  return {
    type: type, // message|end_chat|system
    message: message,
    from: from,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
}

// ====== TIME UTILITIES ======

/**
 * Check if timestamp is older than specified minutes
 * @param {string} timestamp - ISO timestamp string
 * @param {number} minutes - Minutes to check
 * @returns {boolean} - True if older than specified minutes
 */
function isOlderThan(timestamp, minutes) {
  if (!timestamp) return true;

  const targetTime = new Date(timestamp);
  const now = new Date();
  const diffMs = now - targetTime;
  const diffMinutes = diffMs / (1000 * 60);

  return diffMinutes > minutes;
}

/**
 * Format time remaining for countdown
 * @param {number} seconds - Seconds remaining
 * @returns {string} - Formatted time string
 */
function formatTimeRemaining(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Get time ago string
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} - Time ago string
 */
function getTimeAgo(timestamp) {
  if (!timestamp) return "Unknown";

  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}
// ====== CONNECTION UTILITIES ======

/**
 * Retry connection with exponential backoff
 * @param {Function} connectionFn - Function that returns a Promise
 * @param {number} maxAttempts - Maximum retry attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Connection result
 */
async function retryConnection(
  connectionFn,
  maxAttempts = P2P_CONSTANTS.MAX_RETRY_ATTEMPTS,
  baseDelay = P2P_CONSTANTS.CONNECTION_RETRY_DELAY
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await connectionFn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw lastError;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Check if PeerJS is available
 * @returns {boolean} - True if PeerJS is loaded
 */
function isPeerJSAvailable() {
  return typeof Peer !== "undefined";
}

/**
 * Load PeerJS dynamically
 * @returns {Promise} - Promise that resolves when PeerJS is loaded
 */
function loadPeerJS() {
  return new Promise((resolve, reject) => {
    if (isPeerJSAvailable()) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/peerjs@1.5.0/dist/peerjs.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ====== VALIDATION UTILITIES ======

/**
 * Validate PeerID format
 * @param {string} peerID - PeerID to validate
 * @returns {boolean} - True if valid format
 */
function isValidPeerID(peerID) {
  if (!peerID || typeof peerID !== "string") return false;

  const clientPattern = new RegExp(
    `^${P2P_CONSTANTS.PEER_ID_PREFIX}[a-zA-Z0-9]+_\\d+$`
  );
  const adminPattern = new RegExp(
    `^${P2P_CONSTANTS.ADMIN_ID_PREFIX}[a-zA-Z0-9]+_\\d+$`
  );

  return clientPattern.test(peerID) || adminPattern.test(peerID);
}

/**
 * Validate P2P data structure
 * @param {Object} p2pData - P2P data to validate
 * @returns {Object} - Validation result
 */
function validateP2PData(p2pData) {
  const errors = [];

  if (!p2pData) {
    errors.push("P2P data is required");
    return { isValid: false, errors };
  }

  if (!p2pData.clientPeerID || !isValidPeerID(p2pData.clientPeerID)) {
    errors.push("Invalid client PeerID");
  }

  if (p2pData.adminPeerID && !isValidPeerID(p2pData.adminPeerID)) {
    errors.push("Invalid admin PeerID");
  }

  const validStatuses = ["waiting", "connected", "closed", "warn"];
  if (!p2pData.status || !validStatuses.includes(p2pData.status)) {
    errors.push("Invalid status");
  }

  if (!p2pData.timestamp) {
    errors.push("Timestamp is required");
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  };
}

// ====== UI UTILITIES ======

/**
 * Create loading spinner element
 * @returns {HTMLElement} - Loading spinner element
 */
function createLoadingSpinner() {
  const spinner = document.createElement("div");
  spinner.className = "p2p-loading-spinner";
  spinner.innerHTML = `
    <div class="spinner-border" role="status">
      <span class="sr-only">Loading...</span>
    </div>
  `;
  return spinner;
}

/**
 * Create status badge element
 * @param {string} status - Status value
 * @param {string} text - Display text
 * @returns {HTMLElement} - Status badge element
 */
function createStatusBadge(status, text) {
  const badge = document.createElement("span");
  badge.className = `p2p-status-badge p2p-status-${status}`;
  badge.textContent = text || status;
  return badge;
}

/**
 * Sanitize HTML content
 * @param {string} html - HTML content to sanitize
 * @returns {string} - Sanitized HTML
 */
function sanitizeHTML(html) {
  const div = document.createElement("div");
  div.textContent = html;
  return div.innerHTML;
}

// ====== ERROR HANDLING ======

/**
 * P2P Error class
 */
class P2PError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = "P2PError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Handle P2P errors gracefully
 * @param {Error} error - Error to handle
 * @param {string} context - Error context
 * @returns {Object} - Error handling result
 */
function handleP2PError(error, context = "Unknown") {
  console.error(`P2P Error in ${context}:`, error);

  let userMessage = "Đã xảy ra lỗi kết nối P2P";
  let shouldRetry = false;

  if (error.name === "P2PError") {
    userMessage = error.message;
    shouldRetry = error.code === "CONNECTION_FAILED";
  } else if (error.message.includes("network")) {
    userMessage = "Lỗi mạng. Vui lòng kiểm tra kết nối internet.";
    shouldRetry = true;
  } else if (error.message.includes("timeout")) {
    userMessage = "Kết nối bị timeout. Vui lòng thử lại.";
    shouldRetry = true;
  }

  return {
    userMessage,
    shouldRetry,
    originalError: error,
  };
}

// ====== EXPORT ======

// For browser usage
if (typeof window !== "undefined") {
  window.P2PUtils = {
    // Constants
    P2P_CONSTANTS,

    // PeerID utilities
    generateClientPeerID,
    generateAdminPeerID,
    parsePeerID,

    // Data structures
    createP2PData,
    createMessageData,

    // Time utilities
    isOlderThan,
    formatTimeRemaining,
    getTimeAgo,

    // Connection utilities
    retryConnection,
    isPeerJSAvailable,
    loadPeerJS,

    // Validation
    isValidPeerID,
    validateP2PData,

    // UI utilities
    createLoadingSpinner,
    createStatusBadge,
    sanitizeHTML,

    // Error handling
    P2PError,
    handleP2PError,
  };
}

// For Node.js usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    P2P_CONSTANTS,
    generateClientPeerID,
    generateAdminPeerID,
    parsePeerID,
    createP2PData,
    createMessageData,
    isOlderThan,
    formatTimeRemaining,
    getTimeAgo,
    retryConnection,
    isPeerJSAvailable,
    loadPeerJS,
    isValidPeerID,
    validateP2PData,
    createLoadingSpinner,
    createStatusBadge,
    sanitizeHTML,
    P2PError,
    handleP2PError,
  };
}
