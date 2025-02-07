addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

// Thêm constants
const Vx_WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxIn6xWfd0af8eMXRen8HA3sZ21G-O8z63wAQ5fRkdIejaYfrtZZXQvd15oHHYXiLMA/exec";
const Vx_Gemini_API_KEY = "AIzaSyDbbfqZ5VC6v4AdmugerAtMfNOg2YdD5Pg";

// Cập nhật Vx_Current_Chat_Info global
let Vx_Current_Chat_Info = {
  topic: "",
  summerize: "",
};

// Thêm biến global để lưu current userID
let Vx_currentUserID = null;

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

// Thêm enum types
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
  Vx_SyncID: "Vx_SyncID",
};

async function handleRequest(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://beta.vanced.media",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Origin",
    "Access-Control-Max-Age": "86400",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === "POST") {
    const data = await request.json();

    switch (data.requestType) {
      case "Vx_SyncID":
        return await handleSyncID(data.browserData, corsHeaders);
      case "NewMessageUpdateForCurrentUser":
        // Cập nhật Vx_currentUserID từ request
        Vx_currentUserID = data.userID;
        // console.log("Received userID:", Vx_currentUserID); // Log để debug

        return await handleNewMessage(
          data.chatHistory,
          data.message,
          corsHeaders
        );
      default:
        return new Response("Invalid request type", {
          status: 400,
          headers: corsHeaders,
        });
    }
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
}

async function loadChatHistory(userID) {
  try {
    const params = new URLSearchParams({
      userID: userID,
      requestType: Vx_Sheet_RequestType.CHAT_HISTORY,
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

async function handleSyncID(browserData, corsHeaders) {
  try {
    // Tạo UserID như cũ
    const dataString = JSON.stringify(browserData);
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(dataString)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const userID = hashHex.slice(0, 32);

    // Load chat history với UserID vừa tạo
    const chatHistory = await loadChatHistory(userID);

    return new Response(
      JSON.stringify({
        success: true,
        userID: userID,
        chatHistory: chatHistory, // Thêm chat history vào response
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
}

// Thêm hàm mới để lưu chat message
async function saveMessageToWebApp(userID, message, role, botResponse = null) {
  try {
    // Cập nhật Vx_Current_Chat_Info nếu có response từ bot
    if (botResponse) {
      Vx_Current_Chat_Info = {
        topic: botResponse.Topic || Vx_Current_Chat_Info.topic,
        summerize: botResponse.Summerize || Vx_Current_Chat_Info.summerize,
      };
    }

    // Chuẩn bị data để gửi lên WebApp
    const requestData = {
      userID: userID,
      parts: [{ text: message }],
      role: role,
      topic: Vx_Current_Chat_Info.topic,
      summerize: Vx_Current_Chat_Info.summerize,
      priceConcern: botResponse?.PriceConcern || null,
      requestType: Vx_Sheet_RequestType.NEW_MESSAGE,
    };

    // Gửi request lên WebApp
    const response = await fetch(Vx_WEBAPP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });

    return true;
  } catch (error) {
    console.error("Error saving message to WebApp:", error);
    return false;
  }
}

// Cập nhật hàm handleNewMessage
async function handleNewMessage(chatHistory, message, corsHeaders) {
  try {
    // Sử dụng Vx_currentUserID thay vì trích xuất từ chatHistory
    if (!Vx_currentUserID) {
      throw new Error("No userID provided");
    }

    // Lưu tin nhắn của user ngay lập tức với userID chính xác
    saveMessageToWebApp(Vx_currentUserID, message, "user");

    let SchemaPrefix =
      "Bạn hãy trả lời tôi dưới dạng JSON bên trong 3 dấu *** theo schema dưới dây:\n";

    // Tạo mảng contents bao gồm schema, lịch sử chat và tin nhắn mới
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

    // Gửi request đến Gemini API
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

    // Kiểm tra response format
    if (!geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid Gemini API response format");
    }

    // Parse và validate bot response
    const botResponseText = geminiResponse.candidates[0].content.parts[0].text;
    const jsonMatch = botResponseText.match(/\*\*\*([\s\S]*?)\*\*\*/);

    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("Could not find JSON response between *** markers");
    }

    let botResponse;
    try {
      botResponse = JSON.parse(jsonMatch[1]);
    } catch (parseError) {
      throw new Error(
        `Failed to parse bot JSON response: ${parseError.message}`
      );
    }

    // Validate botResponse format
    if (!botResponse.Answer) {
      throw new Error("Bot response missing required Answer field");
    }

    // Lưu tin nhắn của bot với userID chính xác
    saveMessageToWebApp(
      Vx_currentUserID,
      botResponse.Answer,
      "model",
      botResponse
    );

    // Cập nhật chat history với tin nhắn mới
    chatHistory.push(
      { parts: [{ text: message }], role: "user" },
      { parts: [{ text: botResponse.Answer }], role: "model" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        chatHistory: chatHistory,
        botResponse: botResponse,
        currentChatInfo: Vx_Current_Chat_Info,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in handleNewMessage:", error);

    // Parse error message nếu là Gemini error
    let errorDetails = {};
    try {
      if (error.message.includes("GEMINI_API_ERROR")) {
        errorDetails = JSON.parse(error.message);
      }
    } catch (e) {
      errorDetails = { type: "UNKNOWN_ERROR", message: error.message };
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        errorDetails: errorDetails,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
}
