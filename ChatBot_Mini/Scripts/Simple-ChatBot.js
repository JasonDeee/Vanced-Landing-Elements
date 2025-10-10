/**
 * Vanced Customer Support Chatbot Frontend
 * Tích hợp với MachineID và Rate Limiting System
 */

// ====== DEBUG CONFIGURATION ======
const DeBug_IsActive = true; // Set to false to disable debug logging

/**
 * Debug logging function for Frontend
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function debugLog(message, data = null) {
  if (!DeBug_IsActive) return;

  const timestamp = new Date().toISOString();
  const logMessage = `[FRONTEND-DEBUG ${timestamp}] ${message}`;

  if (data !== null) {
    console.log(`${logMessage}`, data);
  } else {
    console.log(logMessage);
  }
}

// Cấu hình
const WORKERS_ENDPOINT = "https://vanced-chatbot.caocv-work.workers.dev/"; // Cập nhật URL này
let chatHistory = [];
let machineId = null;
let isInitialized = false;
let rpdRemaining = 15;
let isBanned = false;

// DOM elements
const chatContainer = document.getElementById("Vx_chatMessages");
const messageInput = document.getElementById("Vx_messageInput");
const sendButton = document.getElementById("Vx_sendButton");

// Khởi tạo khi DOM loaded
document.addEventListener("DOMContentLoaded", async () => {
  await initializeChat();
  setupEventListeners();
});

/**
 * Khởi tạo chat với MachineID và validation
 */
async function initializeChat() {
  try {
    // Kiểm tra xem MachineID library có sẵn không
    if (typeof window.VancedMachineID === "undefined") {
      throw new Error("MachineID library not loaded");
    }

    // Generate browser fingerprint
    const fingerprint = window.VancedMachineID.generateFingerprint();
    console.log("Generated fingerprint for initialization");

    // Gửi request khởi tạo tới Workers
    const response = await fetch(WORKERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "initChat",
        fingerprint: fingerprint,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    debugLog("InitChat response from Workers", {
      status: data.status,
      userType: data.userType,
      rpdRemaining: data.rpdRemaining,
      chatHistoryLength: data.chatHistory?.length,
      hasTimestamp: !!data.timestamp,
    });

    // Xử lý response
    if (data.status === "banned") {
      debugLog("User banned during initialization", { reason: data.reason });
      handleBannedUser(data.message);
      return;
    }

    if (data.status === "error") {
      debugLog("Error during initialization", { error: data.message });
      throw new Error(data.message);
    }

    if (data.status === "success") {
      // Lưu thông tin session
      machineId = data.machineId;
      chatHistory = data.chatHistory || [];
      rpdRemaining = data.rpdRemaining || 15;
      isInitialized = true;

      console.log(
        `Chat initialized successfully. MachineID: ${machineId}, RPD remaining: ${rpdRemaining}`
      );

      // Hiển thị chat history nếu có
      if (chatHistory.length > 0) {
        chatHistory.forEach((message) => displayMessage(message));
        console.log(`Loaded ${chatHistory.length} previous messages`);
      } else {
        // Hiển thị welcome message cho user mới
        const welcomeMessage = {
          role: "assistant",
          content:
            "Xin chào! Tôi là trợ lý ảo của Vanced Agency. Tôi có thể giúp gì cho bạn hôm nay?",
        };
        displayMessage(welcomeMessage);
      }

      // Update UI state
      updateRPDDisplay();
      setInputState(true);
    }
  } catch (error) {
    console.error("Error initializing chat:", error);
    handleInitializationError(error.message);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Send button click
  sendButton.addEventListener("click", handleSendMessage);

  // Enter key press
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Recommendation questions click
  const recommendationQuestions = document.querySelectorAll(
    ".Vx_Recommendation_Question p"
  );
  recommendationQuestions.forEach((question) => {
    question.addEventListener("click", () => {
      messageInput.value = question.textContent;
      handleSendMessage();
    });
  });

  // Human support buttons (sẽ được thêm dynamically)
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("Opus_RequestForRealAssist_Button")) {
      handleHumanSupportRequest();
    } else if (e.target.classList.contains("Opus_StayWithOpus_Button")) {
      hideHumanSupportUI();
    }
  });
}

/**
 * Xử lý gửi tin nhắn với MachineID và rate limiting
 */
async function handleSendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // Kiểm tra xem đã khởi tạo chưa
  if (!isInitialized || !machineId) {
    showErrorMessage("Vui lòng refresh trang để khởi tạo lại chat.");
    return;
  }

  // Kiểm tra banned status
  if (isBanned) {
    showErrorMessage("Thiết bị này không hợp lệ!");
    return;
  }

  // Disable input và button
  setInputState(false);

  // Hiển thị tin nhắn user
  const userMessage = { role: "user", content: message };
  displayMessage(userMessage);

  // Clear input
  messageInput.value = "";

  // Hiển thị loading state
  chatContainer.classList.add("AwaitingResponse");

  try {
    // Gửi request đến Workers với MachineID
    const response = await fetch(WORKERS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "sendMessage",
        message: message,
        machineId: machineId,
        chatHistory: chatHistory.slice(-10), // Chỉ gửi 10 tin nhắn gần nhất
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    debugLog("SendMessage response from Workers", {
      status: data.status,
      responseLength: data.response?.length,
      needsHumanSupport: data.needsHumanSupport,
      rpdRemaining: data.rpdRemaining,
      hasTimestamp: !!data.timestamp,
      error: data.error,
    });

    // Xử lý các loại response khác nhau
    if (data.status === "banned") {
      debugLog("User banned during message send", { reason: data.reason });
      handleBannedUser(data.message);
      return;
    }

    if (data.status === "rate_limited_daily") {
      debugLog("Daily rate limit hit", { message: data.message });
      showRateLimitMessage(data.message);
      return;
    }

    if (data.status === "rate_limited_minute") {
      debugLog("Minute rate limit hit", { message: data.message });
      showRateLimitMessage(data.message);
      return;
    }

    if (data.status === "error") {
      debugLog("Error during message send", { error: data.message });
      throw new Error(data.message);
    }

    if (data.status === "success") {
      // Cập nhật chat history
      chatHistory.push(userMessage);

      // Hiển thị response từ bot
      const botMessage = { role: "assistant", content: data.response };
      displayMessage(botMessage);
      chatHistory.push(botMessage);

      // Cập nhật RPD remaining
      rpdRemaining = data.rpdRemaining;
      updateRPDDisplay();

      // Kiểm tra xem có cần human support không
      if (data.needsHumanSupport) {
        showHumanSupportUI();
      }
    }
  } catch (error) {
    console.error("Error sending message:", error);
    showErrorMessage(
      "Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau hoặc liên hệ trực tiếp với chúng tôi."
    );
  } finally {
    // Remove loading state và enable input
    chatContainer.classList.remove("AwaitingResponse");
    if (!isBanned) {
      setInputState(true);
    }
  }
}

/**
 * Hiển thị tin nhắn trong chat
 */
function displayMessage(message) {
  const messageElement = document.createElement("div");
  messageElement.className = `Vx_message ${
    message.role === "user" ? "Vx_user-message" : "Vx_bot-message"
  }`;

  // Xử lý markdown cơ bản
  const formattedContent = formatMessageContent(message.content);
  messageElement.innerHTML = formattedContent;

  chatContainer.appendChild(messageElement);

  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Format nội dung tin nhắn (markdown cơ bản)
 */
function formatMessageContent(content) {
  return content
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

/**
 * Hiển thị Human Support UI
 */
function showHumanSupportUI() {
  const template = document.querySelector(
    ".OpusPC_RequestForRealAssist_Message"
  );
  if (template) {
    const humanSupportUI = template.cloneNode(true);
    humanSupportUI.style.display = "block";
    humanSupportUI.style.animation = "fadeIn 0.3s ease-in-out";

    chatContainer.appendChild(humanSupportUI);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

/**
 * Ẩn Human Support UI
 */
function hideHumanSupportUI() {
  const humanSupportElements = document.querySelectorAll(
    '.OpusPC_RequestForRealAssist_Message[style*="block"]'
  );
  humanSupportElements.forEach((element) => {
    element.style.animation = "fadeOut 0.3s ease-in-out";
    setTimeout(() => element.remove(), 300);
  });

  // Thêm tin nhắn xác nhận
  const continueMessage = {
    role: "assistant",
    content: "Tôi sẽ tiếp tục hỗ trợ bạn. Bạn có câu hỏi gì khác không?",
  };
  displayMessage(continueMessage);
  chatHistory.push(continueMessage);
}

/**
 * Xử lý yêu cầu human support
 */
function handleHumanSupportRequest() {
  // Tạm thời hiển thị alert (sẽ implement redirect thật sau)
  alert(
    "Tính năng đang được phát triển. Bạn có thể liên hệ trực tiếp qua email: contact@vanced.agency"
  );

  // Ẩn human support UI
  hideHumanSupportUI();

  // Log analytics (nếu cần)
  console.log("Human support requested at:", new Date().toISOString());
}

/**
 * Set trạng thái input (enable/disable)
 */
function setInputState(enabled) {
  messageInput.disabled = !enabled;
  sendButton.disabled = !enabled;

  if (enabled) {
    messageInput.focus();
  }
}

/**
 * Utility: Thêm CSS animations
 */
const style = document.createElement("style");
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-10px); }
  }
`;
document.head.appendChild(style);

// ====== NEW HELPER FUNCTIONS ======

/**
 * Xử lý khi user bị ban
 */
function handleBannedUser(message) {
  isBanned = true;
  setInputState(false);

  // Hiển thị thông báo ban
  const banMessage = {
    role: "system",
    content: message || "Thiết bị này không hợp lệ!",
  };
  displayMessage(banMessage);

  // Đóng băng UI
  freezeChatUI();

  console.log("User has been banned");
}

/**
 * Xử lý lỗi khởi tạo
 */
function handleInitializationError(errorMessage) {
  const errorMsg = {
    role: "system",
    content: `Lỗi khởi tạo: ${errorMessage}. Vui lòng refresh trang.`,
  };
  displayMessage(errorMsg);
  setInputState(false);
}

/**
 * Hiển thị thông báo rate limit
 */
function showRateLimitMessage(message) {
  const rateLimitMsg = {
    role: "system",
    content: message,
  };
  displayMessage(rateLimitMsg);

  // Tạm thời disable input
  setInputState(false);

  // Enable lại sau 5 giây (cho rate limit per minute)
  setTimeout(() => {
    if (!isBanned) {
      setInputState(true);
    }
  }, 5000);
}

/**
 * Hiển thị error message
 */
function showErrorMessage(message) {
  const errorMsg = {
    role: "assistant",
    content: message,
  };
  displayMessage(errorMsg);
}

/**
 * Cập nhật hiển thị RPD remaining
 */
function updateRPDDisplay() {
  // Tạo hoặc cập nhật RPD indicator
  let rpdIndicator = document.getElementById("rpd-indicator");
  if (!rpdIndicator) {
    rpdIndicator = document.createElement("div");
    rpdIndicator.id = "rpd-indicator";
    rpdIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0,0,0,0.7);
      color: white;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 1000;
    `;
    document.body.appendChild(rpdIndicator);
  }

  rpdIndicator.textContent = `Tin nhắn còn lại: ${rpdRemaining}/15`;

  // Thay đổi màu dựa trên số lượng còn lại
  if (rpdRemaining <= 3) {
    rpdIndicator.style.background = "rgba(231, 33, 102, 0.9)"; // Red
  } else if (rpdRemaining <= 7) {
    rpdIndicator.style.background = "rgba(255, 165, 0, 0.9)"; // Orange
  } else {
    rpdIndicator.style.background = "rgba(0, 128, 0, 0.9)"; // Green
  }
}

/**
 * Đóng băng chat UI
 */
function freezeChatUI() {
  // Disable tất cả input
  setInputState(false);

  // Thêm overlay
  const overlay = document.createElement("div");
  overlay.id = "chat-freeze-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
    font-weight: bold;
  `;
  overlay.innerHTML = "🔒 Chat đã bị đóng băng";

  document.body.appendChild(overlay);
}

/**
 * Debug function - Clear MachineID và refresh
 */
function debugClearMachineID() {
  if (typeof window.VancedMachineID !== "undefined") {
    window.VancedMachineID.clear();
    console.log("MachineID cleared. Refreshing page...");
    location.reload();
  }
}

/**
 * Debug function - Show MachineID info
 */
async function debugShowMachineIDInfo() {
  if (typeof window.VancedMachineID !== "undefined") {
    const info = await window.VancedMachineID.getInfo();
    console.log("MachineID Info:", info);
    return info;
  }
}

// Expose debug functions to window for console access
window.VancedChatDebug = {
  clearMachineID: debugClearMachineID,
  showMachineIDInfo: debugShowMachineIDInfo,
  getCurrentState: () => ({
    machineId,
    isInitialized,
    rpdRemaining,
    isBanned,
    chatHistoryLength: chatHistory.length,
  }),
};

/**
 * Error handling cho uncaught errors
 */
window.addEventListener("error", (e) => {
  console.error("Uncaught error:", e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});
