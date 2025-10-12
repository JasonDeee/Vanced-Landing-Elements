/**
 * Vanced Customer Support - Admin Dashboard Logic
 * Handles admin P2P connections and client management
 */

// ====== DEBUG CONFIGURATION ======
const ADMIN_DEBUG_ACTIVE = true;

/**
 * Debug logging function for Admin
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function adminDebugLog(message, data = null) {
  if (!ADMIN_DEBUG_ACTIVE) return;

  const timestamp = new Date().toISOString();
  const logMessage = `[ADMIN-DEBUG ${timestamp}] ${message}`;

  if (data !== null) {
    console.log(`${logMessage}`, data);
  } else {
    console.log(logMessage);
  }
}

// ====== ADMIN DASHBOARD CLASS ======
class VancedAdminDashboard {
  constructor(adminNickname, spreadsheetUrl) {
    this.adminNickname = adminNickname;
    this.spreadsheetUrl = spreadsheetUrl;
    this.peer = null;
    this.currentConnection = null;
    this.currentClient = null;
    this.clientList = [];
    this.isConnected = false;

    adminDebugLog("Admin Dashboard initialized", {
      adminNickname,
      spreadsheetUrl,
    });
  }

  /**
   * Initialize admin dashboard
   */
  async initialize() {
    try {
      adminDebugLog("Initializing admin dashboard");

      // Load initial client list
      await this.refreshClientList();

      // Setup periodic refresh (every 30 seconds)
      setInterval(() => {
        if (!this.isConnected) {
          this.refreshClientList();
        }
      }, 30000);
    } catch (error) {
      adminDebugLog("Error initializing dashboard", error);
      this.showError("Lỗi khởi tạo dashboard: " + error.message);
    }
  }

  /**
   * Refresh client list from Spreadsheet
   */
  async refreshClientList() {
    try {
      adminDebugLog("Refreshing client list");

      const url = new URL(this.spreadsheetUrl);
      url.searchParams.append("action", "getWaitingClients");
      url.searchParams.append("adminNickname", this.adminNickname);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      adminDebugLog("Client list response", data);

      if (data.status === "success") {
        this.clientList = data.clients || [];
        this.updateClientListUI();
      } else {
        throw new Error(data.message || "Failed to fetch client list");
      }
    } catch (error) {
      adminDebugLog("Error refreshing client list", error);
      this.showError("Lỗi tải danh sách khách hàng: " + error.message);
    }
  }

  /**
   * Update client list UI
   */
  updateClientListUI() {
    const clientListElement = document.getElementById("clientList");
    if (!clientListElement) return;

    if (this.clientList.length === 0) {
      clientListElement.innerHTML = `
        <div class="empty-state">
          <p>Không có khách hàng nào đang chờ</p>
        </div>
      `;
      return;
    }

    const clientsHTML = this.clientList
      .map((client) => {
        const statusClass = this.getStatusClass(client.status);
        const timeAgo = this.getTimeAgo(client.timestamp);
        const isWarning = client.status === "warn";

        return `
        <div class="client-item ${isWarning ? "warning" : ""}" 
             onclick="adminDashboard.selectClient('${client.machineId}')">
          <div class="client-info">
            <h4>${client.machineId}</h4>
            <div class="client-meta">
              <span class="status-badge status-${statusClass}">
                ${this.getStatusText(client.status)}
              </span>
              <span>${timeAgo}</span>
            </div>
            ${
              client.summerize
                ? `<p class="client-summary">${client.summerize}</p>`
                : ""
            }
          </div>
        </div>
      `;
      })
      .join("");

    clientListElement.innerHTML = clientsHTML;
    adminDebugLog("Updated client list UI", {
      clientCount: this.clientList.length,
    });
  }

  /**
   * Select client to connect
   */
  async selectClient(machineId) {
    try {
      adminDebugLog("Selecting client", machineId);

      const client = this.clientList.find((c) => c.machineId === machineId);
      if (!client) {
        throw new Error("Client not found");
      }

      if (client.status === "connected") {
        this.showError("Khách hàng này đã được kết nối bởi admin khác");
        return;
      }

      // Highlight selected client
      this.highlightSelectedClient(machineId);

      // Connect to client
      await this.connectToClient(client);
    } catch (error) {
      adminDebugLog("Error selecting client", error);
      this.showError("Lỗi chọn khách hàng: " + error.message);
    }
  }

  /**
   * Connect to client via P2P
   */
  async connectToClient(client) {
    try {
      adminDebugLog("Connecting to client", client);

      // Generate admin PeerID
      const adminPeerID = P2PUtils.generateAdminPeerID(this.adminNickname);
      adminDebugLog("Generated admin PeerID", adminPeerID);

      // Initialize admin peer
      this.peer = new Peer(adminPeerID);

      this.peer.on("open", (id) => {
        adminDebugLog("Admin peer opened", id);
        this.initiateConnection(client, id);
      });

      this.peer.on("error", (error) => {
        adminDebugLog("Admin peer error", error);
        this.showError("Lỗi P2P: " + error.message);
      });
    } catch (error) {
      adminDebugLog("Error connecting to client", error);
      this.showError("Lỗi kết nối: " + error.message);
    }
  }
  /**
   * Initiate P2P connection to client
   */
  async initiateConnection(client, adminPeerID) {
    try {
      adminDebugLog("Initiating connection to client", {
        clientPeerID: client.clientPeerID,
        adminPeerID,
      });

      // Connect to client
      this.currentConnection = this.peer.connect(client.clientPeerID);
      this.currentClient = client;

      this.currentConnection.on("open", () => {
        adminDebugLog("Connection established with client");
        this.onConnectionEstablished(client, adminPeerID);
      });

      this.currentConnection.on("data", (data) => {
        adminDebugLog("Received data from client", data);
        this.handleClientMessage(data);
      });

      this.currentConnection.on("close", () => {
        adminDebugLog("Connection closed by client");
        this.onConnectionClosed();
      });

      this.currentConnection.on("error", (error) => {
        adminDebugLog("Connection error", error);
        this.showError("Lỗi kết nối P2P: " + error.message);
      });
    } catch (error) {
      adminDebugLog("Error initiating connection", error);
      this.showError("Lỗi khởi tạo kết nối: " + error.message);
    }
  }

  /**
   * Handle connection established
   */
  async onConnectionEstablished(client, adminPeerID) {
    try {
      this.isConnected = true;

      // Update Spreadsheet status
      await this.updateClientStatus(client.machineId, "connected", adminPeerID);

      // Update UI
      this.showChatUI(client);

      // Load chat history
      await this.loadChatHistory(client.machineId);

      adminDebugLog("Connection fully established", {
        machineId: client.machineId,
        adminPeerID,
      });
    } catch (error) {
      adminDebugLog("Error in onConnectionEstablished", error);
      this.showError("Lỗi thiết lập kết nối: " + error.message);
    }
  }

  /**
   * Handle client message
   */
  handleClientMessage(data) {
    if (data.type === "message") {
      this.displayMessage(data.message, "client");

      // Save message to chat history (admin responsibility)
      this.saveChatMessage(data.message, "client");
    } else if (data.type === "end_chat") {
      this.onChatEnded();
    }
  }

  /**
   * Send message to client
   */
  sendMessage() {
    const input = document.getElementById("messageInput");
    if (!input) return;

    const message = input.value.trim();
    if (!message || !this.currentConnection) return;

    // Send to client
    const messageData = P2PUtils.createMessageData(
      "message",
      message,
      "admin",
      { adminNickname: this.adminNickname }
    );

    this.currentConnection.send(messageData);

    // Display locally
    this.displayMessage(message, "admin");

    // Save to chat history
    this.saveChatMessage(message, "admin");

    // Clear input
    input.value = "";

    adminDebugLog("Sent message to client", messageData);
  }

  /**
   * End chat session
   */
  async endChat() {
    try {
      if (this.currentConnection) {
        // Notify client
        this.currentConnection.send(
          P2PUtils.createMessageData(
            "end_chat",
            "Admin ended the chat",
            "admin"
          )
        );

        this.currentConnection.close();
      }

      if (this.peer) {
        this.peer.destroy();
      }

      // Update Spreadsheet status
      if (this.currentClient) {
        await this.updateClientStatus(this.currentClient.machineId, "closed");
      }

      // Reset state
      this.resetChatState();

      // Refresh client list
      await this.refreshClientList();

      adminDebugLog("Chat ended by admin");
    } catch (error) {
      adminDebugLog("Error ending chat", error);
      this.showError("Lỗi kết thúc chat: " + error.message);
    }
  }

  /**
   * Update client status in Spreadsheet
   */
  async updateClientStatus(machineId, status, adminPeerID = null) {
    try {
      const p2pData = P2PUtils.createP2PData(
        null, // clientPeerID will be preserved
        adminPeerID,
        status,
        this.adminNickname
      );

      const url = new URL(this.spreadsheetUrl);
      url.searchParams.append("action", "updateClientStatus");
      url.searchParams.append("machineId", machineId);
      url.searchParams.append("status", status);
      url.searchParams.append("adminPeerID", adminPeerID || "");
      url.searchParams.append("adminNickname", this.adminNickname);

      const response = await fetch(url.toString());
      const data = await response.json();

      adminDebugLog("Updated client status", {
        machineId,
        status,
        response: data,
      });
    } catch (error) {
      adminDebugLog("Error updating client status", error);
    }
  }
  /**
   * Save chat message to Spreadsheet
   */
  async saveChatMessage(message, sender) {
    try {
      if (!this.currentClient) return;

      const formattedMessage = `[RealPersonSaid] ${
        sender === "admin" ? `Admin(${this.adminNickname})` : "User"
      }: ${message}`;

      const url = new URL(this.spreadsheetUrl);
      url.searchParams.append("action", "saveChatMessage");
      url.searchParams.append("machineId", this.currentClient.machineId);
      url.searchParams.append("message", formattedMessage);
      url.searchParams.append("sender", sender);

      const response = await fetch(url.toString());
      const data = await response.json();

      adminDebugLog("Saved chat message", {
        message: formattedMessage,
        response: data,
      });
    } catch (error) {
      adminDebugLog("Error saving chat message", error);
    }
  }

  /**
   * Load chat history from Spreadsheet
   */
  async loadChatHistory(machineId) {
    try {
      const url = new URL(this.spreadsheetUrl);
      url.searchParams.append("action", "getChatHistory");
      url.searchParams.append("machineId", machineId);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status === "success" && data.chatHistory) {
        this.displayChatHistory(data.chatHistory);
      }

      adminDebugLog("Loaded chat history", {
        machineId,
        historyLength: data.chatHistory?.length,
      });
    } catch (error) {
      adminDebugLog("Error loading chat history", error);
    }
  }

  /**
   * Display chat history
   */
  displayChatHistory(chatHistory) {
    const messagesContainer = document.getElementById("chatMessages");
    if (!messagesContainer) return;

    // Clear existing messages
    messagesContainer.innerHTML = "";

    chatHistory.forEach((msg) => {
      if (msg.content.includes("[RealPersonSaid]")) {
        // Parse P2P message
        const match = msg.content.match(/\[RealPersonSaid\] (.*?): (.*)/);
        if (match) {
          const sender = match[1].includes("Admin") ? "admin" : "client";
          const message = match[2];
          this.displayMessage(message, sender, false); // Don't save again
        }
      } else {
        // Regular AI message
        this.displayMessage(
          msg.content,
          msg.role === "user" ? "client" : "ai",
          false
        );
      }
    });
  }

  /**
   * Display message in chat UI
   */
  displayMessage(message, sender, shouldSave = true) {
    const messagesContainer = document.getElementById("chatMessages");
    if (!messagesContainer) return;

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}`;

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.textContent = message;

    const messageTime = document.createElement("div");
    messageTime.className = "message-time";
    messageTime.textContent = new Date().toLocaleTimeString();

    messageDiv.appendChild(messageContent);
    messageDiv.appendChild(messageTime);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Show chat UI
   */
  showChatUI(client) {
    // Update chat header
    const chatHeader = document.getElementById("chatHeader");
    if (chatHeader) {
      chatHeader.innerHTML = `
        <div>
          <h3>💬 Chat với ${client.machineId}</h3>
          <p>Status: <span class="status-badge status-connected">Connected</span></p>
        </div>
      `;
    }

    // Show chat input
    const chatInput = document.getElementById("chatInput");
    if (chatInput) {
      chatInput.style.display = "flex";
    }

    // Clear and focus message input
    const messageInput = document.getElementById("messageInput");
    if (messageInput) {
      messageInput.value = "";
      messageInput.focus();
    }
  }

  /**
   * Reset chat state
   */
  resetChatState() {
    this.isConnected = false;
    this.currentConnection = null;
    this.currentClient = null;
    this.peer = null;

    // Reset UI
    const chatHeader = document.getElementById("chatHeader");
    if (chatHeader) {
      chatHeader.innerHTML = `
        <div class="empty-state">
          <p>Chọn khách hàng để bắt đầu chat</p>
        </div>
      `;
    }

    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="empty-state">
          <p>💬 Chọn khách hàng từ danh sách bên trái</p>
        </div>
      `;
    }

    const chatInput = document.getElementById("chatInput");
    if (chatInput) {
      chatInput.style.display = "none";
    }

    // Remove client selection highlight
    document.querySelectorAll(".client-item.active").forEach((item) => {
      item.classList.remove("active");
    });
  }
  // ====== UI HELPER METHODS ======

  /**
   * Highlight selected client
   */
  highlightSelectedClient(machineId) {
    // Remove previous selection
    document.querySelectorAll(".client-item.active").forEach((item) => {
      item.classList.remove("active");
    });

    // Add selection to current client
    const clientItems = document.querySelectorAll(".client-item");
    clientItems.forEach((item) => {
      if (item.textContent.includes(machineId)) {
        item.classList.add("active");
      }
    });
  }

  /**
   * Get status class for styling
   */
  getStatusClass(status) {
    switch (status) {
      case "waiting":
        return "waiting";
      case "connected":
        return "connected";
      case "warn":
        return "warn";
      case "closed":
        return "closed";
      default:
        return "waiting";
    }
  }

  /**
   * Get status text for display
   */
  getStatusText(status) {
    switch (status) {
      case "waiting":
        return "Đang chờ";
      case "connected":
        return "Đã kết nối";
      case "warn":
        return "Cảnh báo";
      case "closed":
        return "Đã đóng";
      default:
        return status;
    }
  }

  /**
   * Get time ago string
   */
  getTimeAgo(timestamp) {
    if (!timestamp) return "Unknown";

    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return "Vừa xong";
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  }

  /**
   * Show error message
   */
  showError(message) {
    // Create error toast
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      max-width: 300px;
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    // Auto remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    const successDiv = document.createElement("div");
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4caf50;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      max-width: 300px;
    `;
    successDiv.textContent = message;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.parentNode.removeChild(successDiv);
      }
    }, 3000);
  }

  // ====== EVENT HANDLERS ======

  onConnectionClosed() {
    this.showError("Khách hàng đã ngắt kết nối");
    this.resetChatState();
    this.refreshClientList();
  }

  onChatEnded() {
    this.showSuccess("Cuộc trò chuyện đã kết thúc");
    this.endChat();
  }
}

// ====== GLOBAL INSTANCE ======
let adminDashboard = null;

/**
 * Initialize admin dashboard
 */
function initializeAdminDashboard(adminNickname) {
  const spreadsheetUrl =
    "https://script.google.com/macros/s/AKfycbwYour_Spreadsheet_URL_Here/exec"; // Cập nhật URL này

  adminDashboard = new VancedAdminDashboard(adminNickname, spreadsheetUrl);
  adminDashboard.initialize();

  adminDebugLog("Admin dashboard initialized globally", { adminNickname });
}

// ====== UTILITY FUNCTIONS ======

/**
 * Check abandoned connections (to be called periodically)
 */
async function checkAbandonedConnections() {
  if (!adminDashboard) return;

  try {
    const url = new URL(adminDashboard.spreadsheetUrl);
    url.searchParams.append("action", "checkAbandonedConnections");

    const response = await fetch(url.toString());
    const data = await response.json();

    adminDebugLog("Checked abandoned connections", data);

    if (data.updatedCount > 0) {
      adminDashboard.refreshClientList();
    }
  } catch (error) {
    adminDebugLog("Error checking abandoned connections", error);
  }
}

// Run abandoned connection check every 5 minutes
setInterval(checkAbandonedConnections, 5 * 60 * 1000);

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { VancedAdminDashboard, initializeAdminDashboard };
}
