// Code Logic chính của Workers ở đây
import {
  TUNED_DATA,
  SYSTEM_PROMPT_TEMPLATE,
  processTunedData,
} from "./data.js";

/**
 * Vanced Customer Support Chatbot
 * Sử dụng Gemini Flash Lite để trả lời câu hỏi khách hàng
 */

// Cấu hình Gemini API
let GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash-lite";
// let GEMINI_API_URL;

/**
 * Main handler cho Cloudflare Workers
 */
export default {
  async fetch(request, env, ctx) {
    GEMINI_API_KEY = env.GEMINI_API_1; // Từ environment variables
    // GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    // CORS headers
    const allowedOrigins = [
      "http://127.0.0.1:5500",
      "https://package.vanced.media",
      "https://vanced.media",
      "https://beta.vanced.media",
    ];

    const origin = request.headers.get("Origin");
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
        ? origin
        : "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle preflight request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Health check endpoint
    if (request.method === "GET") {
      return new Response("Vanced Customer Support Bot is running!", {
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    // Handle POST requests (chat messages)
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const response = await handleChatRequest(body, env);

        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error handling chat request:", error);
        return new Response(
          JSON.stringify({
            error: "Internal server error",
            message: error.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Method not allowed
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  },
};

/**
 * Xử lý yêu cầu chat từ frontend
 */
async function handleChatRequest(body, env) {
  const { message, chatHistory = [] } = body;

  if (!message || typeof message !== "string") {
    throw new Error("Message is required and must be a string");
  }

  // Chuẩn bị system prompt với dữ liệu tuned
  const processedTunedData = processTunedData(TUNED_DATA);
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    "{TUNED_DATA}",
    processedTunedData
  );

  // Chuẩn bị messages cho Gemini
  const messages = [
    {
      role: "user",
      parts: [{ text: systemPrompt }],
    },
    ...chatHistory.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: message }],
    },
  ];

  // Gọi Gemini API
  const geminiResponse = await callGeminiAPI(messages, env);

  // Xử lý response
  const botResponse =
    geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text ||
    "Xin lỗi, tôi không thể trả lời câu hỏi này lúc này.";

  // Kiểm tra xem có cần chuyển sang human support không
  const needsHumanSupport = botResponse.includes("HUMAN_SUPPORT_NEEDED");

  return {
    response: botResponse.replace("HUMAN_SUPPORT_NEEDED", "").trim(),
    needsHumanSupport,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Gọi Gemini API
 */
async function callGeminiAPI(messages, env) {
  const apiKey = env.GEMINI_API_1 || GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API key not configured");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const payload = {
    contents: messages,
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 1024,
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Utility function để log requests (cho debugging)
 */
function logRequest(request, response) {
  console.log({
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
    status: response?.status || "unknown",
  });
}
