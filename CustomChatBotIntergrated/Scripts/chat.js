// Hàm giải mã (để sẵn để sử dụng sau này)
function decryptApiKey(encryptedText, passKey) {
  try {
    // Tạo salt từ passkey
    const salt = CryptoJS.enc.Utf8.parse(passKey);

    // Giải mã
    const decrypted = CryptoJS.AES.decrypt(encryptedText, salt.toString());

    // Chuyển đổi kết quả về string
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
}

// Hàm để giải mã API key
async function getDecryptedApiKey() {
  try {
    // Thay thế các giá trị này bằng API key đã mã hóa và passkey của bạn
    const encryptedApiKey =
      "U2FsdGVkX1/vDj/J2Aj1Bx1aJ2nym3FOv0Of5TdLh9joRWJrCoAFU95TpdTxFLQ80VA6tj3csCTkqq1x/kop0A==";
    const passKey = "123121";
    const decrypted = decryptApiKey(encryptedApiKey, passKey);
    console.log("API Key decryption successful");
    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt API key:", error);
    return null;
  }
}

// Hàm gửi tin nhắn đến Gemini API
async function sendMessageToGemini(message) {
  console.log("Sending message to Gemini:", message);
  try {
    const API_KEY = await getDecryptedApiKey();
    if (!API_KEY) {
      console.error("No API key available");
      return null;
    }

    console.log("Preparing API request...");

    // Thay đổi URL để sử dụng tuned model
    // Thay YOUR_TUNED_MODEL_NAME bằng tên model của bạn
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/tunedModels/vanced-test-tunning-to-chat-bot-v1-emwmn:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: message }],
            },
          ],
          // Thêm các tham số cho tuned model
          generationConfig: {
            temperature: 0.7, // Điều chỉnh độ sáng tạo (0.0 - 1.0)
            maxOutputTokens: 2048, // Giới hạn độ dài output
            topP: 0.8, // Điều chỉnh đa dạng của output
            topK: 40, // Số lượng tokens được xem xét
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
        }),
      }
    );

    console.log("API Response status:", response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("API Response data:", data);
    return data;
  } catch (error) {
    console.error("Error in sendMessageToGemini:", error);
    return null;
  }
}

// Thêm biến để lưu URL của web app
const Vx_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxIn6xWfd0af8eMXRen8HA3sZ21G-O8z63wAQ5fRkdIejaYfrtZZXQvd15oHHYXiLMA/exec";

// Hàm tạo JSONP request
function jsonp(url, callback) {
  return new Promise((resolve, reject) => {
    // Tạo tên callback function ngẫu nhiên
    const callbackName = "jsonp_callback_" + Math.round(100000 * Math.random());

    // Tạo script element
    const script = document.createElement("script");

    // Cleanup function
    const cleanup = () => {
      document.body.removeChild(script);
      delete window[callbackName];
    };

    // Setup callback function
    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    // Setup error handling
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    // Add callback parameter to URL
    const separator = url.indexOf("?") === -1 ? "?" : "&";
    script.src = `${url}${separator}callback=${callbackName}`;

    // Add script to document
    document.body.appendChild(script);
  });
}

// Thêm enum cho các loại request
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
};

// Hàm gửi tin nhắn lên Google Sheets
async function Vx_saveChatMessage(message, role) {
  try {
    console.log("Saving chat message to sheets...");
    if (!Vx_currentUserID) {
      throw new Error("No user ID available");
    }

    const params = new URLSearchParams({
      userID: Vx_currentUserID,
      message: message,
      role: role,
      requestType: Vx_Sheet_RequestType.NEW_MESSAGE,
    });

    // Log dữ liệu gửi lên server
    console.group("Client Request Data:");
    console.log("UserID:", Vx_currentUserID);
    console.log("Message:", message);
    console.log("Role:", role);
    console.log("Request Type:", Vx_Sheet_RequestType.NEW_MESSAGE);
    console.log("Full URL:", `${Vx_WEBAPP_URL}?${params.toString()}`);
    console.groupEnd();

    const result = await jsonp(`${Vx_WEBAPP_URL}?${params.toString()}`);

    // Hiển thị logs từ server nếu có
    if (result.logs) {
      console.group("Server Logs:");
      result.logs.forEach((log) => console.log(log));
      console.groupEnd();
    }

    if (!result.success) {
      throw new Error(result.error || "Failed to save chat message");
    }

    console.log("Chat message saved successfully");
    return true;
  } catch (error) {
    console.error("Error saving chat message:", error);
    return false;
  }
}

// Hàm lấy lịch sử chat từ Google Sheets
async function Vx_loadChatHistory() {
  try {
    console.log("Loading chat history...");
    if (!Vx_currentUserID) {
      throw new Error("No user ID available");
    }

    const params = new URLSearchParams({
      userID: Vx_currentUserID,
      requestType: Vx_Sheet_RequestType.CHAT_HISTORY,
    });

    // Log dữ liệu request
    console.group("Client Request Data:");
    console.log("UserID:", Vx_currentUserID);
    console.log("Request Type:", Vx_Sheet_RequestType.CHAT_HISTORY);
    console.log("Full URL:", `${Vx_WEBAPP_URL}?${params.toString()}`);
    console.groupEnd();

    const result = await jsonp(`${Vx_WEBAPP_URL}?${params.toString()}`);

    // Hiển thị logs từ server nếu có
    if (result.logs) {
      console.group("Server Logs:");
      result.logs.forEach((log) => console.log(log));
      console.groupEnd();
    }

    if (!result.success) {
      throw new Error(result.error || "Failed to load chat history");
    }

    console.log("Chat history loaded successfully");
    return result.data;
  } catch (error) {
    console.error("Error loading chat history:", error);
    return [];
  }
}

// Hàm hiển thị lịch sử chat
async function Vx_displayChatHistory() {
  try {
    const chatHistory = await Vx_loadChatHistory();
    const chatMessages = document.getElementById("Vx_chatMessages");

    // Xóa tin nhắn hiện tại
    chatMessages.innerHTML = "";

    // Hiển thị từng tin nhắn trong lịch sử
    chatHistory.forEach((message) => {
      const sender = message.role === "user" ? "user" : "bot";
      const text = message.parts[0].text;
      appendMessage(sender, text);
    });

    console.log("Chat history displayed successfully");
  } catch (error) {
    console.error("Error displaying chat history:", error);
  }
}

// Hàm xử lý khi người dùng gửi tin nhắn
async function handleUserMessage() {
  const messageInput = document.getElementById("Vx_messageInput");
  const message = messageInput.value.trim();

  if (message === "") return;

  console.log("Processing user message:", message);

  // Hiển thị tin nhắn của người dùng
  appendMessage("user", message);
  messageInput.value = "";

  // Lưu tin nhắn người dùng
  await Vx_saveChatMessage(message, "user");

  // Hiển thị loading state
  console.log("Showing loading state...");
  const loadingMessage = appendMessage("bot", "Đang nhập...");

  // Gửi tin nhắn đến Gemini API
  console.log("Waiting for Gemini response...");
  const response = await sendMessageToGemini(message);

  // Xóa loading message
  loadingMessage.remove();

  if (
    response &&
    response.candidates &&
    response.candidates[0].content.parts[0].text
  ) {
    // Hiển thị phản hồi từ bot
    const botResponse = response.candidates[0].content.parts[0].text;
    console.log("Bot response:", botResponse);
    appendMessage("bot", botResponse);

    // Lưu phản hồi của bot
    await Vx_saveChatMessage(botResponse, "model");
  } else {
    console.warn("Invalid or empty response from Gemini");
    const errorMessage =
      "Xin lỗi, tôi không thể xử lý yêu cầu của bạn lúc này.";
    appendMessage("bot", errorMessage);

    // Lưu tin nhắn lỗi
    await Vx_saveChatMessage(errorMessage, "model");
  }
}

// Hàm thêm tin nhắn vào khung chat
function appendMessage(sender, message) {
  console.log(`Appending ${sender} message:`, message);
  const chatMessages = document.getElementById("Vx_chatMessages");
  const messageElement = document.createElement("div");
  messageElement.className = `Vx_message ${sender}-message`;
  messageElement.textContent = message;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return messageElement;
}

// Hàm tạo user ID từ browser fingerprint
async function generateVx_userID() {
  try {
    console.log("Generating Vx_userID...");

    // Collect browser information
    const Vx_browserData = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      colorDepth: window.screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: "ontouchstart" in window,
      cookiesEnabled: navigator.cookieEnabled,
      canvas: await getVx_canvasFingerprint(),
      webgl: await getVx_webGLFingerprint(),
      hardware: await getVx_hardwareConcurrency(),
      deviceMemory: navigator.deviceMemory || "unknown",
    };

    // Tạo chuỗi từ tất cả thông tin
    const Vx_dataString = JSON.stringify(Vx_browserData);

    // Tạo hash từ chuỗi dữ liệu
    const Vx_hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(Vx_dataString)
    );

    // Chuyển hash buffer thành hex string
    const Vx_hashArray = Array.from(new Uint8Array(Vx_hashBuffer));
    const Vx_hashHex = Vx_hashArray.map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    console.log("Vx_userID generated successfully");
    return Vx_hashHex.slice(0, 32);
  } catch (error) {
    console.error("Error generating Vx_userID:", error);
    return null;
  }
}

// Hàm lấy canvas fingerprint
async function getVx_canvasFingerprint() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const text = "Browser Fingerprint 👾 !@#$%^&*()_+-=[]{}|;:,.<>?";

  canvas.width = 250;
  canvas.height = 60;

  ctx.textBaseline = "top";
  ctx.font = "14px Arial";
  ctx.fillStyle = "#f60";
  ctx.fillRect(125, 1, 62, 20);

  ctx.fillStyle = "#069";
  ctx.fillText(text, 2, 15);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.fillText(text, 4, 17);

  return canvas.toDataURL();
}

// Hàm lấy WebGL fingerprint
async function getVx_webGLFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    if (!gl) return "no-webgl";

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
    };
  } catch (e) {
    return "webgl-error";
  }
}

// Hàm lấy thông tin về CPU
async function getVx_hardwareConcurrency() {
  return navigator.hardwareConcurrency || "unknown";
}

// Khởi tạo và lưu trữ user ID
let Vx_currentUserID = null;

async function initializeVx_user() {
  try {
    // Kiểm tra xem đã có ID trong localStorage chưa
    let Vx_storedID = localStorage.getItem("Vx_userID");

    if (!Vx_storedID) {
      // Nếu chưa có, tạo ID mới
      Vx_storedID = await generateVx_userID();
      if (Vx_storedID) {
        localStorage.setItem("Vx_userID", Vx_storedID);
      }
    }

    Vx_currentUserID = Vx_storedID;
    console.log("User initialized with Vx_userID:", Vx_currentUserID);
    return Vx_currentUserID;
  } catch (error) {
    console.error("Error initializing Vx_user:", error);
    return null;
  }
}

// Thêm vào event listeners hiện có
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Chat interface initialized");

  // Khởi tạo user ID
  await initializeVx_user();

  // Load chat history
  await Vx_displayChatHistory();

  const sendButton = document.getElementById("Vx_sendButton");
  const messageInput = document.getElementById("Vx_messageInput");

  sendButton.addEventListener("click", handleUserMessage);
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleUserMessage();
    }
  });
});
