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
      "U2FsdGVkX18F1B5IlTPKO9cX+f0xuJiIoJoAkSMmLQhfdyg2WjGCaSVBexS71bxDHoIKycwpBvjbVpY2CXnfFw==";
    const passKey = "123121";
    const decrypted = decryptApiKey(encryptedApiKey, passKey);
    console.log("API Key decryption successful");
    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt API key:", error);
    return null;
  }
}

// Thêm biến global để lưu lịch sử chat
let Vx_Chat_Log_ClientSide = [];

// Thêm biến global để lưu thông tin cuộc hội thoại hiện tại
let Vx_Current_Chat_Info = {
  topic: "",
  summerize: "",
};

// Hàm gửi tin nhắn đến Gemini API
async function sendMessageToGemini(message) {
  console.log("Sending message to Gemini:", message);
  try {
    const API_KEY = await getDecryptedApiKey();
    if (!API_KEY) {
      console.error("No API key available");
      return null;
    }

    let SchemaPrefix =
      "Bạn hãy trả lời tôi dưới dạng JSON bên trong 3 dấu *** theo schema dưới dây:\n";

    let responseSchema = {
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

    // Gộp schema và prefix thành một string
    const schemaMessage =
      SchemaPrefix + JSON.stringify(responseSchema, null, 2);

    console.log("Preparing API request with chat history...");

    // Tạo mảng contents bao gồm lịch sử chat và tin nhắn mới
    const contents = [
      {
        parts: [{ text: schemaMessage }],
        role: "user",
      },
      ...Vx_Chat_Log_ClientSide,
      {
        parts: [{ text: message }],
        role: "user",
      },
    ];

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/tunedModels/vanced-test-tunning-to-chat-bot-v1-emwmn:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: contents,
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
        }),
      }
    );

    console.log(contents);

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

// Thêm enum cho các loại request
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
  Vx_SyncID: "Vx_SyncID", // Thêm type mới
};

// Thêm biến global để theo dõi trạng thái cookie
let Vx_isCookieEnabled = false;

// Thêm hàm mới để log trạng thái cookie
function logCookieStatus() {
  console.group("🍪 Cookie Status");
  console.log(`Cookie Enabled: ${Vx_isCookieEnabled ? "✅ Yes" : "❌ No"}`);
  console.log(
    `Storage Mode: ${Vx_isCookieEnabled ? "🌐 Server" : "💻 Local Only"}`
  );
  console.groupEnd();
}

// Hàm gửi tin nhắn lên Google Sheets
async function Vx_saveChatMessage(message, role, chatInfo = null) {
  try {
    console.group("💾 Saving Chat Message");
    logCookieStatus();

    // Format tin nhắn đúng cấu trúc
    const formattedMessage = {
      parts: [{ text: message }],
      role: role,
    };

    // Thêm tin nhắn vào Vx_Chat_Log_ClientSide
    Vx_Chat_Log_ClientSide.push(formattedMessage);

    // Cập nhật thông tin chat nếu có
    if (chatInfo) {
      Vx_Current_Chat_Info = {
        topic: chatInfo.topic || Vx_Current_Chat_Info.topic,
        summerize: chatInfo.summerize || Vx_Current_Chat_Info.summerize,
      };
    }

    console.log(Vx_Current_Chat_Info);
    if (!Vx_isCookieEnabled) {
      console.log("📱 Saving to local storage only");
      await saveToLocalStorage(formattedMessage);
      console.groupEnd();
      return true;
    }

    if (!Vx_currentUserID) {
      throw new Error("No user ID available");
    }

    const requestData = {
      userID: Vx_currentUserID,
      parts: [{ text: message }],
      role: role,
      topic: Vx_Current_Chat_Info.topic,
      summerize: Vx_Current_Chat_Info.summerize,
      priceConcern: chatInfo?.priceConcern || null,
      requestType: Vx_Sheet_RequestType.NEW_MESSAGE,
    };

    console.log("Sending data to server:", requestData);

    const response = await fetch(Vx_WEBAPP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });

    console.log("✅ Message sent to server");
    console.groupEnd();
    return true;
  } catch (error) {
    console.error("❌ Error saving chat message:", error);
    console.groupEnd();
    return false;
  }
}

// Thêm hàm mới để lưu tin nhắn vào localStorage
async function saveToLocalStorage(formattedMessage) {
  try {
    const localChatHistory = JSON.parse(
      localStorage.getItem("Vx_localChatHistory") || "[]"
    );
    localChatHistory.push(formattedMessage);
    localStorage.setItem(
      "Vx_localChatHistory",
      JSON.stringify(localChatHistory)
    );
    console.log("Message saved to local storage");
    return true;
  } catch (error) {
    console.error("Error saving to local storage:", error);
    return false;
  }
}

// Hàm tạo JSONP request (chỉ dùng cho load history)
function jsonp(url, callback) {
  return new Promise((resolve, reject) => {
    const callbackName = "jsonp_callback_" + Math.round(100000 * Math.random());
    const script = document.createElement("script");

    const cleanup = () => {
      document.body.removeChild(script);
      delete window[callbackName];
    };

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP request failed"));
    };

    const separator = url.indexOf("?") === -1 ? "?" : "&";
    script.src = `${url}${separator}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

// Hàm lấy lịch sử chat từ Google Sheets (sử dụng JSONP)
async function Vx_loadChatHistory() {
  try {
    console.log("Loading chat history...");

    if (!Vx_isCookieEnabled) {
      console.log("Cookies disabled - skipping server chat history load");
      return [];
    }

    if (!Vx_currentUserID) {
      throw new Error("No user ID available");
    }

    const params = new URLSearchParams({
      userID: Vx_currentUserID,
      requestType: Vx_Sheet_RequestType.CHAT_HISTORY,
    });

    const result = await jsonp(`${Vx_WEBAPP_URL}?${params.toString()}`);

    if (!result.success) {
      throw new Error(result.error || "Failed to load chat history");
    }

    console.log("Chat history loaded successfully");
    return result.data || [];
  } catch (error) {
    console.error("Error loading chat history:", error);
    return [];
  }
}

// Hàm hiển thị lịch sử chat
async function Vx_displayChatHistory() {
  try {
    console.group("📜 Loading Chat History");
    logCookieStatus();

    let chatHistory;
    if (Vx_isCookieEnabled) {
      console.log("📤 Loading history from server...");
      chatHistory = await Vx_loadChatHistory();
    } else {
      console.log("💾 Loading history from local storage...");
      chatHistory = JSON.parse(
        localStorage.getItem("Vx_localChatHistory") || "[]"
      );
    }

    // Lưu lịch sử chat vào biến global
    Vx_Chat_Log_ClientSide = chatHistory;

    const chatMessages = document.getElementById("Vx_chatMessages");
    chatMessages.innerHTML = "";

    console.log(`📝 Displaying ${chatHistory.length} messages`);
    chatHistory.forEach((message) => {
      const sender = message.role === "user" ? "user" : "bot";
      const text = message.parts[0].text;
      appendMessage(sender, text);
    });

    console.log("✅ Chat history displayed successfully");
    console.groupEnd();
  } catch (error) {
    console.error("❌ Error displaying chat history:", error);
    console.groupEnd();
  }
}

// Thêm hàm mới để parse JSON response từ bot
function parseGeminiResponse(responseText) {
  try {
    // Tìm JSON trong cặp dấu ***
    const jsonMatch = responseText.match(/\*\*\*([\s\S]*?)\*\*\*/);
    if (!jsonMatch) {
      console.error("No JSON found in response");
      return null;
    }

    // Parse JSON string
    const jsonResponse = JSON.parse(jsonMatch[1]);
    console.log("Parsed bot response:", jsonResponse);
    return jsonResponse;
  } catch (error) {
    console.error("Error parsing bot response:", error);
    return null;
  }
}

// Cập nhật hàm handleUserMessage để xử lý JSON response
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
    // Parse JSON response
    const botResponse = parseGeminiResponse(
      response.candidates[0].content.parts[0].text
    );

    if (botResponse && botResponse.Answer) {
      // Hiển thị phần Answer từ response
      console.log("Bot response:", botResponse);
      appendMessage("bot", botResponse.Answer);

      // Lưu phản hồi của bot với thông tin bổ sung
      await Vx_saveChatMessage(botResponse.Answer, "model", {
        topic: botResponse.Topic,
        summerize: botResponse.Summerize,
        priceConcern: botResponse.PriceConcern,
      });

      // Nếu bot yêu cầu hỗ trợ thật
      if (botResponse.Request_for_RealAssistance) {
        appendMessage(
          "bot",
          "Xin lỗi, tôi không thể trả lời câu hỏi này. Vui lòng liên hệ bộ phận hỗ trợ."
        );
      }
    } else {
      console.warn("Invalid JSON response from bot");
      appendMessage("bot", "Xin lỗi, đã có lỗi xảy ra khi xử lý câu trả lời.");
    }
  } else {
    console.warn("Invalid or empty response from Gemini");
    appendMessage(
      "bot",
      "Xin lỗi, tôi không thể xử lý yêu cầu của bạn lúc này."
    );
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

// Thêm hàm mới để kiểm tra trạng thái cookie
function checkCookieStatus() {
  Vx_isCookieEnabled = navigator.cookieEnabled;

  // Thử set và get một test cookie để đảm bảo cookies thực sự hoạt động
  try {
    document.cookie = "Vx_testCookie=1";
    const hasCookie = document.cookie.indexOf("Vx_testCookie=") !== -1;
    document.cookie = "Vx_testCookie=1; expires=Thu, 01 Jan 1970 00:00:00 GMT"; // xóa test cookie
    Vx_isCookieEnabled = hasCookie;
  } catch (error) {
    console.warn("Cookie test failed:", error);
    Vx_isCookieEnabled = false;
  }

  return Vx_isCookieEnabled;
}

// Cập nhật hàm initializeVx_user
async function initializeVx_user() {
  try {
    // Kiểm tra trạng thái cookie trước
    checkCookieStatus();
    logCookieStatus();

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

// Cập nhật hàm generateVx_userID
async function generateVx_userID() {
  try {
    console.group("🔑 Generating User ID");
    console.log("Starting user ID generation...");

    const Vx_browserData = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      colorDepth: window.screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: "ontouchstart" in window,
      cookiesEnabled: Vx_isCookieEnabled, // Sử dụng giá trị đã được kiểm tra
      canvas: await getVx_canvasFingerprint(),
      webgl: await getVx_webGLFingerprint(),
      hardware: await getVx_hardwareConcurrency(),
      deviceMemory: navigator.deviceMemory || "unknown",
    };

    // Không cập nhật Vx_isCookieEnabled ở đây nữa
    logCookieStatus();

    // Tiếp tục với phần còn lại của hàm...
    const Vx_dataString = JSON.stringify(Vx_browserData);
    const Vx_hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(Vx_dataString)
    );
    const Vx_hashArray = Array.from(new Uint8Array(Vx_hashBuffer));
    const Vx_hashHex = Vx_hashArray.map((b) =>
      b.toString(16).padStart(2, "0")
    ).join("");

    console.log("Vx_userID generated successfully");
    console.groupEnd();
    return Vx_hashHex.slice(0, 32);
  } catch (error) {
    console.error("❌ Error generating Vx_userID:", error);
    console.groupEnd();
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

// Thêm vào event listeners hiện có
document.addEventListener("DOMContentLoaded", async () => {
  console.group("🚀 Chat Interface Initialization");
  console.log("Starting initialization...");

  await initializeVx_user();
  logCookieStatus();

  await Vx_displayChatHistory();

  const sendButton = document.getElementById("Vx_sendButton");
  const messageInput = document.getElementById("Vx_messageInput");

  sendButton.addEventListener("click", handleUserMessage);
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleUserMessage();
    }
  });

  console.log("✅ Chat interface initialized successfully");
  console.groupEnd();
});

// Thêm hàm mới để sync user ID với worker
async function syncVx_UserID() {
  try {
    console.group("🔄 Syncing User ID with Worker");

    const Vx_browserData = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      colorDepth: window.screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      touchSupport: "ontouchstart" in window,
      cookiesEnabled: Vx_isCookieEnabled,
      canvas: await getVx_canvasFingerprint(),
      webgl: await getVx_webGLFingerprint(),
      hardware: await getVx_hardwareConcurrency(),
      deviceMemory: navigator.deviceMemory || "unknown",
    };

    const response = await fetch("YOUR_WORKER_URL", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestType: Vx_Sheet_RequestType.Vx_SyncID,
        browserData: Vx_browserData,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("✅ User ID synced successfully");
    console.groupEnd();
    return data.userID;
  } catch (error) {
    console.error("❌ Error syncing user ID:", error);
    console.groupEnd();
    return null;
  }
}
