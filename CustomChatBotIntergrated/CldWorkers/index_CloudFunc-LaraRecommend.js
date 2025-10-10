const functions = require("@google-cloud/functions-framework");
const Vx_Response_Schema = require("./responseSchema.json");

const fs = require("fs").promises;
const path = require("path");

// Lấy environment variables
const Vx_WEBAPP_URL = process.env.Web_URL;
const Vx_Gemini_API_KEY = process.env.Gemini_API_KEY;
const Vx_Allow_CORS = process.env.Allow_URL;

// Gemini API Endpoints
const UPLOAD_ENDPOINT =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GENERATE_ENDPOINT = process.env.Gemini_API_URL;

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
  res.set("Access-Control-Allow-Origin", Vx_Allow_CORS);

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
            data.userID,
            data.TunedURI
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
    console.group("🔄 Syncing with Worker");
    console.log("Processing browser data...");

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
      chatHistory: chatHistory.data,
      Vx_LaraTunedURI: chatHistory.TunedURI,
    };
  } catch (error) {
    console.error("Error in handleSyncID:", error);
    throw error;
  }
}

async function loadChatHistory(userID) {
  try {
    const params = new URLSearchParams({
      userID: userID,
      requestType: Vx_Sheet_RequestType.CHAT_HISTORY,
      schema: JSON.stringify(Vx_Response_Schema),
    });

    const response = await fetch(`${Vx_WEBAPP_URL}?${params.toString()}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || "Failed to load chat history");
    }

    return {
      data: result.data || [],
      TunedURI: result.TunedURI || "",
    };
  } catch (error) {
    console.error("Error loading chat history:", error);
    return {
      data: [],
      TunedURI: "",
    };
  }
}

async function handleNewMessage(
  chatHistory,
  message,
  userID,
  TunedURI = false
) {
  console.group("🚀 handleNewMessage");
  console.log("Input parameters:", {
    userID,
    message,
    chatHistoryLength: chatHistory?.length || 0,
    TunedURI,
  });

  try {
    let fileUri;
    let NewTunedURI = null;

    if (TunedURI === false) {
      // Upload training file to Gemini
      console.log("📁 Uploading training file to Gemini...");

      // Đọc nội dung file TXT
      const txtContent = await fs.readFile(
        path.join(__dirname, "[Lara]Tuned_DataV1.txt"),
        "utf8"
      );
      const numBytes = Buffer.from(txtContent).length;

      // Step 1: Get upload URL
      console.log("Requesting upload URL...");
      const initResponse = await fetch(
        `${UPLOAD_ENDPOINT}?key=${Vx_Gemini_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": numBytes,
            "X-Goog-Upload-Header-Content-Type": "text/plain",
          },
          body: JSON.stringify({
            file: {
              display_name: "[Lara]Tuned_DataV1",
            },
          }),
        }
      );

      if (!initResponse.ok) {
        throw new Error(`Initial request failed: ${initResponse.status}`);
      }

      const uploadUrl = initResponse.headers.get("x-goog-upload-url");
      if (!uploadUrl) {
        throw new Error("No upload URL received");
      }

      // Step 2: Upload file content
      console.log("Uploading file content...");
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Length": numBytes,
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize",
        },
        body: txtContent,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.text();
        throw new Error(
          `Upload failed: ${uploadResponse.status} - ${errorData}`
        );
      }

      const uploadResult = await uploadResponse.json();
      fileUri = uploadResult.file.uri;
      NewTunedURI = JSON.stringify({
        uri: uploadResult.file.uri,
        state: "ACTIVE",
      });

      // Save user message without waiting
      saveMessageToWebApp(userID, message, "user", null, NewTunedURI);
    } else {
      // Use existing URI and save message with await
      fileUri = TunedURI;
      console.log("Using existing URI:", fileUri);
      await saveMessageToWebApp(userID, message, "user");
    }

    // Log schema preparation
    console.log("📝 Preparing schema and contents for Gemini API...");
    let SchemaPrefix =
      "Bạn là Chatbot tạo bởi Vanced Media và hiện đang chat với khách hàng như một tư vấn viên, hãy trả lời dưới dạng JSON bên trong 3 dấu *** theo schema dưới dây:\n";

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: fileUri,
                mimeType: "text/plain",
              },
            },
            {
              text: SchemaPrefix + JSON.stringify(Vx_Response_Schema, null, 2),
            },
          ],
        },
        ...chatHistory,
        {
          role: "user",
          parts: [
            {
              text: message,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: "text/plain",
      },
    };

    // Call Gemini API
    console.log("🤖 Calling Gemini API... With Content: ", requestBody);
    const generateResponse = await fetch(
      `${GENERATE_ENDPOINT}?key=${Vx_Gemini_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json();
      throw new Error(`Generation failed: ${JSON.stringify(errorData)}`);
    }

    const result = await generateResponse.json();
    const botResponseText = result.candidates[0].content.parts[0].text;
    console.log(
      "✅ Received response from Gemini: ",
      result.candidates[0].content
    );

    // Parse bot response - Try both formats
    console.log("🔍 Attempting to parse response");
    let jsonContent = null;

    // First try: Look for JSON between *** markers
    const jsonMatch = botResponseText.match(/\*\*\*([\s\S]*?)\*\*\*/);
    if (jsonMatch && jsonMatch[1]) {
      console.log("Found JSON between *** markers");
      jsonContent = jsonMatch[1];
    } else {
      // Second try: Look for JSON in markdown code block
      const codeBlockMatch = botResponseText.match(
        /```json\s*([\s\S]*?)\s*```/
      );
      if (codeBlockMatch && codeBlockMatch[1]) {
        console.log("Found JSON in markdown code block");
        jsonContent = codeBlockMatch[1];
      } else {
        // Last try: Check if the entire response is a JSON
        if (
          botResponseText.trim().startsWith("{") &&
          botResponseText.trim().endsWith("}")
        ) {
          console.log("Response appears to be direct JSON");
          jsonContent = botResponseText;
        }
      }
    }

    if (!jsonContent) {
      console.error("❌ No valid JSON found in response");
      console.log("Raw response:", botResponseText);
      throw new Error("Could not find valid JSON in response");
    }

    // Clean up the matched content
    jsonContent = jsonContent
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/```\s*$/, "");

    console.log("Cleaned JSON content:", jsonContent);

    try {
      const botResponse = JSON.parse(jsonContent);
      console.log("Parsed bot response:", {
        hasAnswer: !!botResponse.Answer,
        answerLength: botResponse.Answer?.length,
      });

      // Validate required fields
      if (!botResponse.Answer) {
        throw new Error("Missing required 'Answer' field in response");
      }

      // Save bot message
      console.log("💾 Saving bot message to WebApp...");
      await saveMessageToWebApp(
        userID,
        botResponse.Answer,
        "model",
        botResponse,
        NewTunedURI
      );
      console.log("✅ Bot message saved successfully");

      // Update chat history
      console.log("📝 Updating chat history...");
      chatHistory.push(
        { parts: [{ text: message }], role: "user" },
        { parts: [{ text: botResponse.Answer }], role: "model" }
      );
      console.log("✅ Chat history updated");

      // Log recommendation questions if available
      if (botResponse.RecommendationQuestion) {
        console.log(
          "📝 Recommendation questions:",
          botResponse.RecommendationQuestion
        );
      }

      console.log("🎉 handleNewMessage completed successfully");
      console.groupEnd();
      return {
        success: true,
        chatHistory: chatHistory,
        botResponse: botResponse,
        NewTunedURI: NewTunedURI,
      };
    } catch (error) {
      console.error("❌ Error parsing JSON response:", error);
      console.groupEnd();
      throw error;
    }
  } catch (error) {
    console.error("❌ Error in handleNewMessage:", error);
    console.groupEnd();
    throw error;
  }
}

async function saveMessageToWebApp(
  userID,
  message,
  role,
  botResponse = null,
  NewTunedURI = null
) {
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
      const contentForSchema = schemaKeys.map((key) => botResponse[key]);
      requestData.contentForSchema = contentForSchema;
    }

    // Thêm NewTunedURI nếu có
    if (NewTunedURI) {
      requestData.NewTunedURI = NewTunedURI;
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
