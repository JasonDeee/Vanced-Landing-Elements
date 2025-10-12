/**
 * Vanced Customer Support - Client P2P Logic
 * Handles P2P connection establishment and chat functionality
 */

// ====== DEBUG CONFIGURATION ======
const P2P_DEBUG_ACTIVE = true;

/**
 * Debug logging function for P2P
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function p2pDebugLog(message, data = null) {
  if (!P2P_DEBUG_ACTIVE) return;

  const timestamp = new Date().toISOString();
  const logMessage = `[P2P-CLIENT-DEBUG ${timestamp}] ${message}`;

  if (data !== null) {
    console.log(`${logMessage}`, data);
  } else {
    console.log(logMessage);
  }
}

// ====== P2P CLIENT CLASS ======
class VancedP2PClient {
  constructor(machineId, workersEndpoint) {
    this.machineId = machineId;
    this.workersEndpoint = workersEndpoint;
    this.peer = null;
    this.connection = null;
    this.isConnected = false;
    this.countdownTimer = null;
    this.currentPeerID = null;

    // UI elements
    this.chatContainer = null;
    this.waitingUI = null;
    this.p2pChatUI = null;

    p2pDebugLog("P2P Client initialized", { machineId, workersEndpoint });
  }

  /**
   * Initialize P2P connection request
   */
  async requestHumanSupport() {
    try {
      p2pDebugLog("Starting human support request");

      // Generate custom PeerID
      this.currentPeerID = `vanced_${this.machineId}_${Date.now()}`;
      p2pDebugLog("Generated PeerID", this.currentPeerID);

      // Initialize PeerJS
      this.peer = new Peer(this.currentPeerID);

      // Setup peer event handlers
      this.setupPeerHandlers();

      return this.currentPeerID;
    } catch (error) {
      p2pDebugLog("Error requesting human support", error);
      throw error;
    }
  }

  /**
   * Setup PeerJS event handlers
   */
  setupPeerHandlers() {
    this.peer.on("open", (id) => {
      p2pDebugLog("Peer connection opened", id);
      this.onPeerOpen(id);
    });

    this.peer.on("connection", (conn) => {
      p2pDebugLog("Admin connected", conn.peer);
      this.onAdminConnected(conn);
    });

    this.peer.on("error", (error) => {
      p2pDebugLog("Peer error", error);
      this.onPeerError(error);
    });

    this.peer.on("close", () => {
      p2pDebugLog("Peer connection closed");
      this.onPeerClosed();
    });
  }

  /**
   * Handle peer open event
   */
  async onPeerOpen(peerID) {
    try {
      // Send P2P request to Workers → Spreadsheet
      await this.sendP2PRequestToWorkers(peerID);

      // Show waiting UI
      this.showWaitingUI();

      // Start 3-minute countdown
      this.startCountdown();
    } catch (error) {
      p2pDebugLog("Error in onPeerOpen", error);
      this.showErrorMessage("Lỗi khởi tạo kết nối P2P");
    }
  }

  /**
   * Send P2P request to Workers
   */
  async sendP2PRequestToWorkers(peerID) {
    try {
      const p2pData = {
        clientPeerID: peerID,
        adminPeerID: null,
        status: "waiting",
        adminNickname: null,
        timestamp: new Date().toISOString(),
        connectionStartTime: null,
      };

      const response = await fetch(this.workersEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "requestP2PSupport",
          machineId: this.machineId,
          p2pData: p2pData,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      p2pDebugLog("P2P request response", data);

      if (data.status !== "success") {
        throw new Error(data.message || "P2P request failed");
      }
    } catch (error) {
      p2pDebugLog("Error sending P2P request", error);
      throw error;
    }
  }
  /**
   * Handle admin connection
   */
  onAdminConnected(conn) {
    this.connection = conn;
    this.isConnected = true;

    // Stop countdown
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    // Setup connection handlers
    this.setupConnectionHandlers(conn);

    // Show P2P chat UI
    this.showP2PChatUI();

    // Show success message
    this.showSuccessMessage("✅ Đã kết nối với tư vấn viên!");
  }

  /**
   * Setup connection event handlers
   */
  setupConnectionHandlers(conn) {
    conn.on("data", (data) => {
      p2pDebugLog("Received data from admin", data);
      this.handleAdminMessage(data);
    });

    conn.on("close", () => {
      p2pDebugLog("Connection closed by admin");
      this.onConnectionClosed();
    });

    conn.on("error", (error) => {
      p2pDebugLog("Connection error", error);
      this.showErrorMessage("Lỗi kết nối P2P");
    });
  }

  /**
   * Handle admin message
   */
  handleAdminMessage(data) {
    if (data.type === "message") {
      this.displayMessage(data.message, "admin", data.adminNickname);
    } else if (data.type === "end_chat") {
      this.onChatEnded();
    }
  }

  /**
   * Send message to admin
   */
  sendMessage(message) {
    if (!this.connection || !this.isConnected) {
      p2pDebugLog("Cannot send message - not connected");
      return false;
    }

    const messageData = {
      type: "message",
      message: message,
      timestamp: new Date().toISOString(),
      from: "client",
      machineId: this.machineId,
    };

    this.connection.send(messageData);
    p2pDebugLog("Sent message to admin", messageData);

    // Display message locally
    this.displayMessage(message, "user");

    return true;
  }

  /**
   * Start 3-minute countdown
   */
  startCountdown() {
    let timeLeft = 180; // 3 minutes

    this.countdownTimer = setInterval(() => {
      timeLeft--;
      this.updateCountdown(timeLeft);

      if (timeLeft <= 0) {
        clearInterval(this.countdownTimer);
        this.handleTimeout();
      }
    }, 1000);
  }

  /**
   * Handle connection timeout
   */
  handleTimeout() {
    if (!this.isConnected) {
      p2pDebugLog("Connection timeout - no admin connected");

      // Destroy peer
      if (this.peer) {
        this.peer.destroy();
      }

      // Show timeout message
      this.showTimeoutMessage();
    }
  }

  /**
   * End chat session
   */
  endChat() {
    if (this.connection) {
      // Notify admin
      this.connection.send({
        type: "end_chat",
        timestamp: new Date().toISOString(),
        from: "client",
      });

      this.connection.close();
    }

    if (this.peer) {
      this.peer.destroy();
    }

    // Clear timers
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    // Reset state
    this.isConnected = false;
    this.connection = null;
    this.peer = null;

    // Hide P2P UI
    this.hideP2PUI();

    p2pDebugLog("Chat ended by client");
  }
  // ====== UI METHODS ======

  /**
   * Show waiting UI
   */
  showWaitingUI() {
    // Hide human support request UI
    const humanSupportElements = document.querySelectorAll(
      ".OpusPC_RequestForRealAssist_Message"
    );
    humanSupportElements.forEach((el) => (el.style.display = "none"));

    // Create waiting UI
    this.waitingUI = document.createElement("div");
    this.waitingUI.className = "p2p-waiting-ui";
    this.waitingUI.innerHTML = `
      <div class="p2p-waiting-content">
        <h3>⏳ Đang chờ tư vấn viên...</h3>
        <p>Thời gian chờ: <span id="p2p-countdown">180</span> giây</p>
        <p><strong>ID kết nối:</strong> <span class="peer-id">${this.currentPeerID}</span></p>
        <div class="p2p-loading-spinner"></div>
        <button onclick="vancedP2PClient.cancelWaiting()" class="p2p-cancel-btn">
          Hủy chờ
        </button>
      </div>
    `;

    // Add to chat container
    this.chatContainer = document.getElementById("Vx_chatMessages");
    if (this.chatContainer) {
      this.chatContainer.appendChild(this.waitingUI);
      this.chatContainer.scrollTop = this.chatlHeight;
    }
  }

  /**
   * Show P2P chat UI
   */
  showP2PChatUI() {
    // Hide waiting UI
    if (this.waitingUI) {
      this.waitingUI.style.display = "none";
    }

    // Create P2P chat UI
    this.p2pChatUI = document.createElement("div");
    this.p2pChatUI.className = "p2p-chat-ui";
    this.p2pChatUI.innerHTML = `
      <div class="p2p-chat-header">
        <h3>💬 Chat với tư vấn viên</h3>
        <button onclick="vancedP2PClient.endChat()" class="p2p-end-btn">
          Kết thúc
        </button>
      </div>
      <div class="p2p-chat-messages" id="p2p-chat-messages"></div>
      <div class="p2p-chat-input">
        <input type="text" id="p2p-message-input" placeholder="Nhập tin nhắn..." 
               onkeypress="if(event.key==='Enter') vancedP2PClient.sendMessageFromInput()">
        <button onclick="vancedP2PClient.sendMessageFromInput()">Gửi</button>
      </div>
    `;

    if (this.chatContainer) {
      this.chatContainer.appendChild(this.p2pChatUI);
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // Focus input
    setTimeout(() => {
      const input = document.getElementById("p2p-message-input");
      if (input) input.focus();
    }, 100);
  }

  /**
   * Display message in P2P chat
   */
  displayMessage(message, sender, adminNickname = null) {
    const messagesContainer = document.getElementById("p2p-chat-messages");
    if (!messagesContainer) return;

    const messageDiv = document.createElement("div");
    messageDiv.className = `p2p-message p2p-${sender}-message`;

    const senderName =
      sender === "user"
        ? "Bạn"
        : adminNickname
        ? `${adminNickname}`
        : "Tư vấn viên";

    messageDiv.innerHTML = `
      <div class="p2p-message-sender">${senderName}</div>
      <div class="p2p-message-content">${message}</div>
      <div class="p2p-message-time">${new Date().toLocaleTimeString()}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Send message from input
   */
  sendMessageFromInput() {
    const input = document.getElementById("p2p-message-input");
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    if (this.sendMessage(message)) {
      input.value = "";
    }
  }

  /**
   * Update countdown display
   */
  updateCountdown(timeLeft) {
    const countdownElement = document.getElementById("p2p-countdown");
    if (countdownElement) {
      countdownElement.textContent = timeLeft;
    }
  } /**
 
  * Show success message
   */
  showSuccessMessage(message) {
    this.showStatusMessage("messess");
  }

  /**
   * Show error message
   */
  showErrorMessage(message) {
    this.showStatusMessage(message, "error");
  }

  /**
   * Show timeout message
   */
  showTimeoutMessage() {
    this.showStatusMessage(
      "⏰ Không có tư vấn viên trực tuyến. Vui lòng liên hệ trực tiếp qua email hoặc điện thoại.",
      "timeout"
    );

    // Show fallback contact options
    setTimeout(() => {
      this.showFallbackOptions();
    }, 2000);
  }

  /**
   * Show status message
   */
  showStatusMessage(message, type) {
    const statusDiv = document.createElement("div");
    statusDiv.className = `p2p-status-message p2p-status-${type}`;
    statusDiv.textContent = message;

    if (this.chatContainer) {
      this.chatContainer.appendChild(statusDiv);
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (statusDiv.parentNode) {
        statusDiv.parentNode.removeChild(statusDiv);
      }
    }, 5000);
  }

  /**
   * Show fallback contact options
   */
  showFallbackOptions() {
    const fallbackDiv = document.createElement("div");
    fallbackDiv.className = "p2p-fallback-options";
    fallbackDiv.innerHTML = `
      <div class="p2p-fallback-content">
        <h4>📞 Liên hệ trực tiếp</h4>
        <p>
          <strong>Email:</strong> 
          <a href="mailto:contact@vanced.agency">contact@vanced.agency</a>
        </p>
        <p>
          <strong>Điện thoại:</strong> 
          <a href="tel:+84123456789">0123-456-789</a>
        </p>
        <button onclick="this.parentNode.parentNode.remove()" class="p2p-close-btn">
          Đóng
        </button>
      </div>
    `;

    if (this.chatContainer) {
      this.chatContainer.appendChild(fallbackDiv);
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
  }

  /**
   * Cancel waiting
   */
  cancelWaiting() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    if (this.peer) {
      this.peer.destroy();
    }

    this.hideP2PUI();
    this.showStatusMessage("❌ Đã hủy chờ tư vấn viên", "error");
  }

  /**
   * Hide P2P UI
   */
  hideP2PUI() {
    if (this.waitingUI) {
      this.waitingUI.remove();
      this.waitingUI = null;
    }

    if (this.p2pChatUI) {
      this.p2pChatUI.remove();
      this.p2pChatUI = null;
    }
  }

  // ====== EVENT HANDLERS ======

  onPeerError(error) {
    this.showErrorMessage("Lỗi kết nối P2P: " + error.message);
  }

  onPeerClosed() {
    this.isConnected = false;
    this.showStatusMessage("Kết nối P2P đã đóng", "error");
  }

  onConnectionClosed() {
    this.isConnected = false;
    this.showStatusMessage("Tư vấn viên đã ngắt kết nối", "error");
  }

  onChatEnded() {
    this.showStatusMessage("✅ Cuộc trò chuyện đã kết thúc", "success");
    this.endChat();
  }
}

// ====== GLOBAL INSTANCE ======
let vancedP2PClient = null;

/**
 * Initialize P2P client
 */
function initializeP2PClient(machineId, workersEndpoint) {
  vancedP2PClient = new VancedP2PClient(machineId, workersEndpoint);
  p2pDebugLog("P2P Client instance created");
  return vancedP2PClient;
}

/**
 * Handle human support request from existing UI
 */
function handleHumanSupportRequest() {
  if (!vancedP2PClient) {
    console.error("P2P Client not initialized");
    return;
  }

  vancedP2PClient.requestHumanSupport().catch((error) => {
    console.error("Failed to request human support:", error);
  });
}

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { VancedP2PClient, initializeP2PClient };
}
