// Code Logic chính của Workers ở đây
import {
  TUNED_DATA,
  SYSTEM_PROMPT_TEMPLATE,
  processTunedData,
} from "./data.js";

import { checkBanStatus, getBanListStats } from "./BanList.js";

/**
 * Vanced Customer Support Chatbot
 * Sử dụng OpenRouter để trả lời câu hỏi khách hàng
 */

// Cấu hình OpenRouter API
let OPENROUTER_API_KEY;
const OPENROUTER_MODEL = "openai/gpt-oss-20b:free";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Cấu hình Apps Script API
let APPS_SCRIPT_URL;

/**
 * Main handler cho Cloudflare Workers
 */
export default {
  async fetch(request, env) {
    OPENROUTER_API_KEY = env.OPENROUTER_API_KEY; // Từ environment variables
    APPS_SCRIPT_URL = env.APPS_SCRIPT_URL; // URL của Google Apps Script

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
      const stats = getBanListStats();
      const healthInfo = {
        status: "running",
        message: "Vanced Customer Support Bot is running!",
        banListStats: stats,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(healthInfo), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle POST requests
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const clientIP =
          request.headers.get("CF-Connecting-IP") ||
          request.headers.get("X-Forwarded-For") ||
          "unknown";

        let response;

        // Route based on action type
        switch (body.action) {
          case "initChat":
            response = await handleInitChat(body, clientIP, env);
            break;
          case "sendMessage":
            response = await handleSendMessage(body, clientIP, env);
            break;
          default:
            // Backward compatibility - treat as sendMessage
            response = await handleSendMessage(body, clientIP, env);
        }

        return new Response(JSON.stringify(response), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error handling request:", error);
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
 * Xử lý khởi tạo chat - Giai đoạn 1 (OnLoad)
 */
async function handleInitChat(body, clientIP, env) {
  const { fingerprint } = body;

  if (!fingerprint) {
    return {
      status: "error",
      message: "Browser fingerprint is required",
    };
  }

  try {
    // Generate MachineID từ fingerprint
    const machineId = await generateMachineIDFromFingerprint(fingerprint);

    // Check ban status
    const banStatus = checkBanStatus(clientIP, machineId);
    if (banStatus.isBanned) {
      return {
        status: "banned",
        message: banStatus.message,
        reason: banStatus.reason,
      };
    }

    // Call Apps Script để khởi tạo chat session
    const appsScriptResponse = await callAppsScript(
      "initChat",
      {
        machineId: machineId,
        userIP: clientIP,
      },
      env
    );

    if (appsScriptResponse.status === "error") {
      throw new Error(appsScriptResponse.message);
    }

    return {
      status: "success",
      machineId: machineId,
      chatHistory: appsScriptResponse.chatHistory || [],
      userType: appsScriptResponse.status, // 'new_user' or 'existing_user'
      rpdRemaining: appsScriptResponse.rpd,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error in handleInitChat:", error);
    return {
      status: "error",
      message: "Lỗi khởi tạo chat session",
      error: error.message,
    };
  }
}

/**
 * Xử lý gửi tin nhắn - Giai đoạn 2 (OnSubmit)
 */
async function handleSendMessage(body, clientIP, env) {
  const { message, machineId, chatHistory = [] } = body;

  if (!message || typeof message !== "string") {
    return {
      status: "error",
      message: "Message is required and must be a string",
    };
  }

  if (!machineId) {
    return {
      status: "error",
      message: "MachineID is required",
    };
  }

  try {
    // Check ban status again
    const banStatus = checkBanStatus(clientIP, machineId);
    if (banStatus.isBanned) {
      return {
        status: "banned",
        message: banStatus.message,
        reason: banStatus.reason,
      };
    }

    // Validate với Apps Script (rate limiting)
    const validationResponse = await callAppsScript(
      "validateChat",
      {
        machineId: machineId,
        message: message,
      },
      env
    );

    if (validationResponse.status !== "valid") {
      return {
        status: validationResponse.status,
        message: validationResponse.message,
        rpdRemaining: validationResponse.rpdRemaining,
      };
    }

    // Chuẩn bị system prompt với dữ liệu tuned
    const processedTunedData = processTunedData(TUNED_DATA);
    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
      "{TUNED_DATA}",
      processedTunedData
    );

    // Sử dụng conversation từ Spreadsheet nếu có, fallback về chatHistory từ client
    const currentConversation =
      validationResponse.currentConversation || chatHistory;

    // Chuẩn bị messages cho OpenRouter
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...currentConversation.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      })),
      {
        role: "user",
        content: message,
      },
    ];

    // Gọi OpenRouter API
    const openRouterResponse = await callOpenRouterAPI(messages, env);

    // Xử lý response
    const botResponse =
      openRouterResponse.choices?.[0]?.message?.content ||
      "Xin lỗi, tôi không thể trả lời câu hỏi này lúc này.";

    // Kiểm tra xem có cần chuyển sang human support không
    const needsHumanSupport = botResponse.includes("HUMAN_SUPPORT_NEEDED");

    // Cập nhật conversation
    const newConversation = [
      ...currentConversation,
      { role: "user", content: message },
      {
        role: "assistant",
        content: botResponse.replace("HUMAN_SUPPORT_NEEDED", "").trim(),
      },
    ];

    // Cập nhật chat history trong Spreadsheet
    await callAppsScript(
      "updateHistory",
      {
        machineId: machineId,
        conversation: JSON.stringify(newConversation),
      },
      env
    );

    // Đánh dấu human support nếu cần
    if (needsHumanSupport) {
      await callAppsScript(
        "markHumanSupport",
        {
          machineId: machineId,
        },
        env
      );
    }

    return {
      status: "success",
      response: botResponse.replace("HUMAN_SUPPORT_NEEDED", "").trim(),
      needsHumanSupport,
      rpdRemaining: validationResponse.rpdRemaining,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error in handleSendMessage:", error);
    return {
      status: "error",
      message: "Lỗi xử lý tin nhắn",
      error: error.message,
    };
  }
}

/**
 * Gọi OpenRouter API
 */
async function callOpenRouterAPI(messages, env) {
  const apiKey = env.OPENROUTER_API_KEY || OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const payload = {
    model: OPENROUTER_MODEL,
    messages: messages,
    temperature: 0.7,
    max_tokens: 1024,
    top_p: 0.95,
  };

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Generate MachineID từ browser fingerprint
 */
async function generateMachineIDFromFingerprint(fingerprint) {
  const fingerprintString = JSON.stringify(fingerprint);

  // Simple hash function for MachineID
  let hash = 0;
  for (let i = 0; i < fingerprintString.length; i++) {
    const char = fingerprintString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to positive hex string (16 characters)
  return Math.abs(hash).toString(16).padStart(16, "0").substring(0, 16);
}

/**
 * Call Google Apps Script API
 */
async function callAppsScript(action, params, env) {
  const appsScriptUrl = env.APPS_SCRIPT_URL || APPS_SCRIPT_URL;

  if (!appsScriptUrl) {
    throw new Error("Apps Script URL not configured");
  }

  const url = new URL(appsScriptUrl);
  url.searchParams.append("action", action);

  // Add all params to URL
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apps Script API error: ${response.status} - ${errorText}`);
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
