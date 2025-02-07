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

// API & Endpoints
// Xóa constant này vì đã chuyển sang worker
const Vx_ENCRYPTED_API_KEY =
  "U2FsdGVkX18F1B5IlTPKO9cX+f0xuJiIoJoAkSMmLQhfdyg2WjGCaSVBexS71bxDHoIKycwpBvjbVpY2CXnfFw==";
const Vx_API_PASSKEY = "123121";

// Request Types Enum
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
  Vx_SyncID: "Vx_SyncID",
};

// Schema Configuration
const Vx_Response_Schema = {
  Answer: {
    type: "string",
    description: "Trả lời cho câu hỏi của người dùng",
  },
  Summerize: {
    type: "string",
    description: "Tóm tắt lịch sử cuộc hội thoại",
  },
  Request_for_RealAssistance: {
    type: "boolean",
    description: "Nếu bạn không thể trả lời được câu hỏi, trả về true",
  },
  Topic: {
    type: "string",
    description: "Chủ đề của cuộc hội thoại",
  },
  PriceConcern: {
    type: "string",
    description:
      "Nếu người dùng trao đổi về giá, hãy trả về dưới dạng tiền tệ, ví dụ: 500.000₫. Nếu người dùng không nói đến giá, hãy trả về null",
  },
};

// Gemini API Configuration
const Vx_Gemini_Config = {
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2048,
    topP: 0.8,
    topK: 40,
  },
  safetySettings: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
  ],
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
    const response = await fetch("https://vx-chatbot.caocv-work.workers.dev/", {
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
