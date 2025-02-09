const functions = require("@google-cloud/functions-framework");
const Vx_Response_Schema = require("./responseSchema.json");

// Lấy environment variables
const Vx_WEBAPP_URL = process.env.Vx_WEBAPP_URL;
const Vx_Gemini_API_KEY = process.env.Vx_Gemini_API_KEY;

// Kiểm tra xem có environment variables hay không
if (!Vx_WEBAPP_URL || !Vx_Gemini_API_KEY) {
  console.error("Missing required environment variables");
  throw new Error("Missing required environment variables");
}

// Constants
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
  Vx_SyncID: "Vx_SyncID",
};

// CORS headers
// const corsHeaders = {
//   "Access-Control-Allow-Origin": "https://beta.vanced.media",
//   "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
//   "Access-Control-Allow-Headers": "Content-Type, Origin",
//   "Access-Control-Max-Age": "86400",
// };

// Unified Rate Limiter class
class UnifiedRateLimiter {
  constructor(ipLimit = 30) {
    this.windowMs = 60000; // 1 phút
    this.ipLimit = ipLimit;
    this.userLimit = Math.floor(ipLimit / 2); // User limit luôn = 1/2 IP limit
    this.ipRequests = new Map();
    this.userRequests = new Map();
  }

  checkLimit(ip, userID) {
    const now = Date.now();

    // Kiểm tra IP limit
    const ipRequests = this.ipRequests.get(ip) || [];
    const recentIpRequests = ipRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (recentIpRequests.length >= this.ipLimit) {
      return {
        allowed: false,
        type: "IP",
        retryAfter: Math.ceil(this.windowMs / 1000),
      };
    }

    // Kiểm tra User limit
    const userRequests = this.userRequests.get(userID) || [];
    const recentUserRequests = userRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    if (recentUserRequests.length >= this.userLimit) {
      return {
        allowed: false,
        type: "USER",
        retryAfter: Math.ceil(this.windowMs / 1000),
      };
    }

    // Ghi nhận request mới
    recentIpRequests.push(now);
    recentUserRequests.push(now);
    this.ipRequests.set(ip, recentIpRequests);
    this.userRequests.set(userID, recentUserRequests);

    return { allowed: true };
  }

  getRemainingRequests(ip, userID) {
    const now = Date.now();

    // Tính remaining cho IP
    const ipRequests = this.ipRequests.get(ip) || [];
    const recentIpRequests = ipRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    // Tính remaining cho User
    const userRequests = this.userRequests.get(userID) || [];
    const recentUserRequests = userRequests.filter(
      (timestamp) => now - timestamp < this.windowMs
    );

    return {
      ip: this.ipLimit - recentIpRequests.length,
      user: this.userLimit - recentUserRequests.length,
    };
  }

  // Getter/Setter cho IP limit
  setIpLimit(newLimit) {
    this.ipLimit = newLimit;
    this.userLimit = Math.floor(newLimit / 2);
  }

  getIpLimit() {
    return this.ipLimit;
  }

  getUserLimit() {
    return this.userLimit;
  }
}

// Khởi tạo Rate Limiter với IP limit mặc định là 30
const rateLimiter = new UnifiedRateLimiter(30);

// Main function handler
functions.http("vxChatbot", async (req, res) => {
  // Minimal CORS setup - chỉ cho phép domain của chúng ta
  res.set("Access-Control-Allow-Origin", "https://beta.vanced.media");

  // Preflight request
  if (req.method === "OPTIONS") {
    // Required headers for preflight
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "3600");
    res.status(204).send("");
    return;
  }

  if (req.method === "POST") {
    try {
      const data = req.body;
      const userID = data.userID;
      const ip =
        req.ip ||
        req.headers["x-forwarded-for"] ||
        req.connection.remoteAddress ||
        "unknown";

      // Kiểm tra cả IP và User limit cùng lúc
      const limitCheck = rateLimiter.checkLimit(ip, userID);

      if (!limitCheck.allowed) {
        res.set("Retry-After", limitCheck.retryAfter);
        res.status(429).json({
          success: false,
          error: `${limitCheck.type} Rate Limit Exceeded`,
          message:
            limitCheck.type === "IP"
              ? `Quá nhiều yêu cầu từ địa chỉ IP của bạn. Vui lòng thử lại sau ${limitCheck.retryAfter} giây`
              : `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${limitCheck.retryAfter} giây`,
          remainingTime: limitCheck.retryAfter,
        });
        return;
      }

      // Lấy thông tin remaining requests
      const remaining = rateLimiter.getRemainingRequests(ip, userID);

      // Thêm headers thông tin
      res.set({
        "X-RateLimit-IP-Limit": rateLimiter.getIpLimit(),
        "X-RateLimit-User-Limit": rateLimiter.getUserLimit(),
        "X-RateLimit-IP-Remaining": remaining.ip,
        "X-RateLimit-User-Remaining": remaining.user,
      });

      console.log("Received request data:", data);

      switch (data.requestType) {
        case Vx_Sheet_RequestType.Vx_SyncID:
          const syncResult = await handleSyncID(data.browserData);
          res.json(syncResult);
          break;

        case Vx_Sheet_RequestType.NEW_MESSAGE:
          if (!data.userID) {
            res.status(400).json({
              success: false,
              error: "Missing userID in request",
            });
            return;
          }
          const messageResult = await handleNewMessage(
            data.chatHistory,
            data.message,
            data.userID
          );
          res.json(messageResult);
          break;

        default:
          res.status(400).json({
            success: false,
            error: "Invalid request type",
          });
      }
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  } else {
    res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }
});

// Helper Functions
async function handleSyncID(browserData) {
  try {
    // Create UserID from browser data
    const dataString = JSON.stringify(browserData);
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const userID = hashHex.slice(0, 32);

    // Load chat history
    const chatHistory = await loadChatHistory(userID);

    return {
      success: true,
      userID: userID,
      chatHistory: chatHistory,
    };
  } catch (error) {
    console.error("Error in handleSyncID:", error);
    throw error;
  }
}

async function loadChatHistory(userID) {
  try {
    // Tạo schema object mới, bỏ qua Answer
    const { Answer, ...schemaWithoutAnswer } = Vx_Response_Schema;

    const params = new URLSearchParams({
      userID: userID,
      requestType: Vx_Sheet_RequestType.CHAT_HISTORY,
      schema: JSON.stringify(schemaWithoutAnswer),
    });

    const response = await fetch(`${Vx_WEBAPP_URL}?${params.toString()}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to load chat history");
    }

    return result.data || [];
  } catch (error) {
    console.error("Error loading chat history:", error);
    return [];
  }
}

async function handleNewMessage(chatHistory, message, userID) {
  try {
    // Save user message
    saveMessageToWebApp(userID, message, "user");

    let SchemaPrefix =
      "Bạn hãy trả lời tôi dưới dạng JSON bên trong 3 dấu *** theo schema dưới dây:\n";

    // Prepare contents for Gemini API
    let contents = [
      {
        parts: [
          { text: SchemaPrefix + JSON.stringify(Vx_Response_Schema, null, 2) },
        ],
        role: "user",
      },
      ...chatHistory,
      {
        parts: [{ text: message }],
        role: "user",
      },
    ];

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/tunedModels/vanced-test-tunning-to-chat-bot-v1-emwmn:generateContent?key=${Vx_Gemini_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: contents,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096,
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

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        JSON.stringify({
          type: "GEMINI_API_ERROR",
          status: response.status,
          details: errorData,
        })
      );
    }

    const geminiResponse = await response.json();
    console.log("Gemini response:", geminiResponse);

    // Parse bot response
    const botResponseText = geminiResponse.candidates[0].content.parts[0].text;
    const jsonMatch = botResponseText.match(/\*\*\*([\s\S]*?)\*\*\*/);

    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("Could not find JSON response between *** markers");
    }

    const botResponse = JSON.parse(jsonMatch[1]);

    // Save bot message
    saveMessageToWebApp(userID, botResponse.Answer, "model", botResponse);

    // Update chat history
    chatHistory.push(
      { parts: [{ text: message }], role: "user" },
      { parts: [{ text: botResponse.Answer }], role: "model" }
    );

    return {
      success: true,
      chatHistory: chatHistory,
      botResponse: botResponse,
    };
  } catch (error) {
    console.error("Error in handleNewMessage:", error);
    throw error;
  }
}

async function saveMessageToWebApp(userID, message, role, botResponse = null) {
  try {
    // Khởi tạo requestData với các trường cơ bản
    const requestData = {
      userID: userID,
      parts: [{ text: message }],
      role: role,
      requestType: Vx_Sheet_RequestType.NEW_MESSAGE,
    };

    // Nếu là bot response, tạo mảng giá trị theo thứ tự schema
    if (botResponse) {
      const { Answer, ...schemaWithoutAnswer } = Vx_Response_Schema;
      const schemaKeys = Object.keys(schemaWithoutAnswer);

      // Tạo mảng giá trị theo thứ tự của schema
      const contentForSchema = schemaKeys.map((key) => botResponse[key]);

      // Thêm vào requestData
      requestData.contentForSchema = contentForSchema;
    }

    const response = await fetch(Vx_WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });

    return response.ok;
  } catch (error) {
    console.error("Error saving message to WebApp:", error);
    return false;
  }
}
