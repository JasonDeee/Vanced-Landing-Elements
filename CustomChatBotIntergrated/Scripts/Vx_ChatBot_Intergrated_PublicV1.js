/**
 * Global Variables & Constants
 */

// Chat History & Current Chat Info
let Vx_Chat_Log_ClientSide = []; // Lưu lịch sử chat
let Vx_Current_Chat_Info = {
  topic: "",
  summerize: "",
};

// User & Cookie Management
let Vx_currentUserID = null; // ID của user hiện tại
let Vx_isCookieEnabled = (() => {
  try {
    document.cookie = "Vx_testCookie=1";
    const hasCookie = document.cookie.indexOf("Vx_testCookie=") !== -1;
    document.cookie = "Vx_testCookie=1; expires=Thu, 01 Jan 1970 00:00:00 GMT"; // xóa test cookie
    return hasCookie && navigator.cookieEnabled;
  } catch (error) {
    console.warn("Cookie test failed:", error);
    return false;
  }
})(); // Thực thi ngay để set giá trị ban đầu

// Workers Endpoints
const Vx_WORKERS_ENDPOINT =
  "https://asia-southeast2-fellas-tester.cloudfunctions.net/VxChatBot";

// Request Types Enum
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
  Vx_SyncID: "Vx_SyncID",
};

// Browser Fingerprint Configuration
const Vx_Fingerprint_Config = {
  canvasText: "Browser Fingerprint 👾 !@#$%^&*()_+-=[]{}|;:,.<>?",
  canvasWidth: 250,
  canvasHeight: 60,
  canvasFont: "14px Arial",
};

/**
 * Browser Information Collection Functions
 */

/**
 * Lấy toàn bộ thông tin browser để tạo fingerprint
 * @returns {Promise<Object>} Object chứa các thông tin browser
 */
async function getBrowserFingerprint() {
  try {
    // Canvas fingerprint
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = Vx_Fingerprint_Config.canvasWidth;
    canvas.height = Vx_Fingerprint_Config.canvasHeight;

    ctx.textBaseline = "top";
    ctx.font = Vx_Fingerprint_Config.canvasFont;
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);

    ctx.fillStyle = "#069";
    ctx.fillText(Vx_Fingerprint_Config.canvasText, 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText(Vx_Fingerprint_Config.canvasText, 4, 17);

    const canvasFingerprint = canvas.toDataURL();

    // WebGL fingerprint
    let webglFingerprint;
    try {
      const glCanvas = document.createElement("canvas");
      const gl =
        glCanvas.getContext("webgl") ||
        glCanvas.getContext("experimental-webgl");

      if (!gl) {
        webglFingerprint = "no-webgl";
      } else {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        webglFingerprint = {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
        };
      }
    } catch (e) {
      webglFingerprint = "webgl-error";
    }

    // Tổng hợp tất cả thông tin browser
    const browserData = {
      // Thông tin cơ bản
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      colorDepth: window.screen.colorDepth,

      // Thông tin timezone
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

      // Thông tin touch support
      touchSupport: "ontouchstart" in window,

      // Cookie status
      cookiesEnabled: Vx_isCookieEnabled,

      // Thông tin hardware
      hardwareConcurrency: navigator.hardwareConcurrency || "unknown",
      deviceMemory: navigator.deviceMemory || "unknown",

      // Fingerprints
      canvas: canvasFingerprint,
      webgl: webglFingerprint,

      // Additional browser capabilities
      doNotTrack: navigator.doNotTrack || "unknown",
    };

    return browserData;
  } catch (error) {
    console.error("Error collecting browser fingerprint:", error);
    // Return basic information if detailed collection fails
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookiesEnabled: Vx_isCookieEnabled,
    };
  }
}

/**
 * Sync browser fingerprint với worker để lấy UserID
 * @returns {Promise<string|null>} UserID từ worker hoặc null nếu có lỗi
 */
async function syncWithWorker() {
  try {
    console.group("🔄 Syncing with Worker");
    console.log("Collecting browser fingerprint...");

    const browserData = await getBrowserFingerprint();

    console.log("Sending data to worker...");
    const response = await fetch(Vx_WORKERS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://beta.vanced.media",
      },
      body: JSON.stringify({
        requestType: Vx_Sheet_RequestType.Vx_SyncID,
        browserData: browserData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Worker response error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !data.userID) {
      throw new Error("Invalid worker response format");
    }

    // Cập nhật UserID
    Vx_currentUserID = data.userID;
    console.log("✅ UserID updated:", Vx_currentUserID);

    // Cập nhật chat history
    if (data.chatHistory) {
      console.log("📜 Received chat history from worker");
      Vx_Chat_Log_ClientSide = data.chatHistory;
      console.log("Chat history:", Vx_Chat_Log_ClientSide);

      // Thêm dòng này để cập nhật giao diện
      Vx_UpdateChatDisplay(Vx_Chat_Log_ClientSide);
    }

    console.groupEnd();
    return Vx_currentUserID;
  } catch (error) {
    console.error("❌ Error syncing with worker:", error);
    console.groupEnd();
    return null;
  }
}

// Cập nhật hàm generateHashFromFingerprint thành deprecated
/**
 * @deprecated Use syncWithWorker() instead
 * Hàm này đã được chuyển sang xử lý ở worker
 */
async function generateHashFromFingerprint(browserData) {
  console.warn(
    "generateHashFromFingerprint is deprecated. Use syncWithWorker instead"
  );
  return null;
}

/**
 * Khởi tạo và đồng bộ hóa UserID khi DOM load xong
 */
document.addEventListener("DOMContentLoaded", async () => {
  console.group("🚀 Initializing User Session");
  console.log("Starting user synchronization...");

  try {
    // TODO: Bật lại tính năng check localStorage khi hoàn thiện các tính năng khác
    // Hiện tại luôn fetch để test worker và chat history
    /* 
    const storedUserID = localStorage.getItem("Vx_userID");
    if (storedUserID) {
      console.log("Found stored UserID:", storedUserID);
      Vx_currentUserID = storedUserID;
    } else {
      console.log("No stored UserID found, syncing with worker...");
      const newUserID = await syncWithWorker();
      if (newUserID) {
        localStorage.setItem("Vx_userID", newUserID);
        console.log("New UserID stored successfully");
      } else {
        console.error("Failed to get UserID from worker");
      }
    }
    */

    console.log("Syncing with worker...");
    const newUserID = await syncWithWorker();
    if (newUserID) {
      localStorage.setItem("Vx_userID", newUserID);
      console.log("UserID stored successfully");
    } else {
      console.error("Failed to get UserID from worker");
    }

    console.log("Current UserID:", Vx_currentUserID);
    console.groupEnd();
  } catch (error) {
    console.error("❌ Error during initialization:", error);
    console.groupEnd();
  }
});

/**
 * Cập nhật giao diện hiển thị chat từ lịch sử
 * @param {Array} chatHistory - Mảng chứa lịch sử chat
 */
function Vx_UpdateChatDisplay(chatHistory) {
  try {
    console.group("📝 Updating Chat Display");
    console.log("Processing chat history:", chatHistory);

    // Lấy container chứa tin nhắn
    let chatContainer = document.getElementById("Vx_chatMessages");

    // Xóa toàn bộ tin nhắn cũ (nếu có)
    chatContainer.innerHTML = "";

    // Thêm từng tin nhắn vào giao diện
    chatHistory.forEach((message) => {
      let messageText = message.parts[0].text;
      let messageRole = message.role;

      // Tạo element mới cho tin nhắn
      let messageElement = document.createElement("div");

      // Set class dựa vào role (user hoặc model/bot)
      messageElement.className = `Vx_message ${
        messageRole === "user" ? "Vx_user-message" : "Vx_bot-message"
      }`;

      // Set nội dung tin nhắn
      messageElement.textContent = messageText;

      // Thêm tin nhắn vào container
      chatContainer.appendChild(messageElement);
    });

    // Cuộn xuống tin nhắn mới nhất
    chatContainer.scrollTop = chatContainer.scrollHeight;

    console.log("✅ Chat display updated successfully");
    console.groupEnd();
  } catch (error) {
    console.error("❌ Error updating chat display:", error);
    console.groupEnd();
  }
}

/**
 * Gửi tin nhắn tới bot và xử lý phản hồi
 * @param {string} message - Tin nhắn của user
 */
async function Vx_SendMessageToBot(message) {
  try {
    console.group("🤖 Sending Message to Bot");
    console.log("Message:", message);
    console.log("Current UserID:", Vx_currentUserID); // Log để debug

    // Kiểm tra userID trước khi gửi
    if (!Vx_currentUserID) {
      console.log("No UserID found, attempting to sync...");
      await syncWithWorker();

      if (!Vx_currentUserID) {
        throw new Error("Failed to get UserID");
      }
    }

    console.log("Sending message with UserID:", Vx_currentUserID);

    // Hiển thị tin nhắn của user ngay lập tức
    Vx_UpdateChatDisplay([
      ...Vx_Chat_Log_ClientSide,
      {
        parts: [{ text: message }],
        role: "user",
      },
    ]);

    // Hiển thị loading message
    const chatContainer = document.getElementById("Vx_chatMessages");
    const loadingMessage = document.createElement("div");
    loadingMessage.className = "Vx_message Vx_bot-message";
    loadingMessage.textContent = "Đang nhập...";
    chatContainer.appendChild(loadingMessage);

    // Gửi request tới worker với userID
    const response = await fetch(Vx_WORKERS_ENDPOINT, {
      method: "POST",
      mode: "cors",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://beta.vanced.media",
      },
      body: JSON.stringify({
        requestType: Vx_Sheet_RequestType.NEW_MESSAGE,
        chatHistory: Vx_Chat_Log_ClientSide,
        message: message,
        userID: Vx_currentUserID, // Gửi userID lên worker
      }),
    });

    // Xóa loading message
    loadingMessage.remove();

    // Xử lý rate limit response
    if (response.status === 429) {
      const data = await response.json();
      const retryAfter = response.headers.get("Retry-After");

      // Hiển thị thông báo cho user với thông tin cụ thể hơn
      const errorMessage = document.createElement("div");
      errorMessage.className =
        "Vx_message Vx_system-message Vx_rate-limit-message";

      // Thêm icon cảnh báo
      errorMessage.innerHTML = `
        <div class="Vx_rate-limit-icon">⚠️</div>
        <div class="Vx_rate-limit-text">
          ${data.message}
          <div class="Vx_rate-limit-info">
            Còn lại: ${
              response.headers.get("X-RateLimit-User-Remaining") || 0
            } lần/user, 
            ${response.headers.get("X-RateLimit-IP-Remaining") || 0} lần/IP
          </div>
        </div>
      `;

      chatContainer.appendChild(errorMessage);
      return;
    }

    if (!response.ok) {
      throw new Error(`Worker response error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      // Hiển thị error message dựa vào loại lỗi
      let errorMessage = "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.";

      if (data.errorDetails?.type === "GEMINI_API_ERROR") {
        console.group("🔴 Gemini API Error");
        console.log("Status:", data.errorDetails.status);
        console.log("Details:", data.errorDetails.details);
        console.groupEnd();

        // Tạo error message container
        const errorContainer = document.createElement("div");
        errorContainer.className = "Vx_message Vx_bot-message Vx_error-message";

        // Thêm error details
        const errorTitle = document.createElement("div");
        errorTitle.className = "Vx_error-title";
        errorTitle.textContent = "⚠️ Lỗi API:";

        const errorBody = document.createElement("div");
        errorBody.className = "Vx_error-body";
        errorBody.textContent = `Status: ${data.errorDetails.status}`;

        const errorDetails = document.createElement("pre");
        errorDetails.className = "Vx_error-details";
        errorDetails.textContent = JSON.stringify(
          data.errorDetails.details,
          null,
          2
        );

        errorContainer.appendChild(errorTitle);
        errorContainer.appendChild(errorBody);
        errorContainer.appendChild(errorDetails);

        // Thêm vào chat container
        const chatContainer = document.getElementById("Vx_chatMessages");
        chatContainer.appendChild(errorContainer);
      } else {
        throw new Error(data.error || "Unknown error");
      }
    }

    // Cập nhật chat history và hiển thị
    Vx_Chat_Log_ClientSide = data.chatHistory;
    Vx_UpdateChatDisplay(Vx_Chat_Log_ClientSide);

    console.log("✅ Message processed successfully");
    console.groupEnd();
  } catch (error) {
    console.error("❌ Error sending message:", error);
    // Hiển thị lỗi cho user
    const chatContainer = document.getElementById("Vx_chatMessages");
    const errorMessage = document.createElement("div");
    errorMessage.className = "Vx_message Vx_bot-message";
    errorMessage.textContent =
      "Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.";
    chatContainer.appendChild(errorMessage);
    console.groupEnd();
  }
}

// Thêm event listeners cho nút gửi và input
document.addEventListener("DOMContentLoaded", () => {
  const sendButton = document.getElementById("Vx_sendButton");
  const messageInput = document.getElementById("Vx_messageInput");

  sendButton.addEventListener("click", () => {
    const message = messageInput.value.trim();
    if (message) {
      Vx_SendMessageToBot(message);
      messageInput.value = "";
    }
  });

  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const message = messageInput.value.trim();
      if (message) {
        Vx_SendMessageToBot(message);
        messageInput.value = "";
      }
    }
  });
});
