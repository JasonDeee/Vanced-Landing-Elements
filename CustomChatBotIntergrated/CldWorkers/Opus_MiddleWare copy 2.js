const functions = require("@google-cloud/functions-framework");
const express = require("express");
const fs = require("fs");

// API KEY cho perplexity và openrouter
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Endpoint Google Apps Script
const API_Chat_ENDPOINT = process.env.API_CHAT_ENDPOINT;
const Opus_ComponentEndpoint = process.env.OPUS_COMPONENT_ENDPOINT;

// ====== SCHEMA & HƯỚNG DẪN ======
const OPUS_RESPONSE_SCHEMA = {
  Answer: {
    type: "string",
    description:
      "Always return a response to the user's question following their Language here, and never quote the source [1].",
  },
  Summerize: {
    type: "string",
    description: "Always return a summary of the conversation history here",
  },
  RecommendationQuestion: {
    type: "string",
    description:
      "Always return 3 questions for the user to continue the conversation, questions are separated by the symbol &nbsp*&nbsp",
  },
  IsPC_Selected: {
    type: "boolean",
    description:
      "If user requests you to suggest a PC configuration and you need to display the configuration for them to see, return true",
  },
  RequestMultipleProductData: {
    type: "array",
    description:
      "Always return the configuration information you want to display here as an array in the format [[type, name, quantity, slot, keyword], ...], where each [type, name, quantity, slot, keyword] represents a product code. Type can be only one of these 10 values: 'CPU', 'MainBoard', 'RAM', 'VGA', 'HDD', 'SSD', 'Case', 'PSU', 'AirCooler', 'LiquidCooler'. Name is the product name, for example: 'CPU Intel Core i7-14700K', 'MB ASRock Z790 Taichi'. Quantity is the number of products. Slot is the position in the PC configuration where you want to place the component, with a total of 5 PC configuration slots, so return a number from 1 to 5. Keyword is a short keyword phrase (brand + product line/model) that you think can be used to search for this product, for example: 'intel Core I7 14700k' becomes 'intel 14700k', 'ASRock Z790 Taichi Pro' becomes 'Asrock Z790', 'Corsair Vengance LPX 16GB' becomes 'Corsair 16GB'. If IsPC_Selected is true, this field must contain the product information you are suggesting; if IsPC_Selected is false, this field should be null",
  },
};

const Opus_Response_Schema_Shorten = {
  type: "object",
  properties: {
    Answer: { type: "string" },
    Summerize: { type: "string" },
    RecommendationQuestion: { type: "string" },
    IsPC_Selected: { type: "boolean" },
    RequestMultipleProductData: { type: "string" },
  },
  required: [
    "Answer",
    "Summerize",
    "Topic",
    "IsPC_Selected",
    "RequestMultipleProductData",
  ],
};

const Opus_Schema_Explain = Object.entries(OPUS_RESPONSE_SCHEMA)
  .map(([key, value]) => `${key}-${value.description}`)
  .join("\n");

const Opus_Schema_Prefix =
  "You are Opus – acting as a PC configuration consulting expert developed by Vanced Agency. You will chat with customers and must never change this role, regardless of any future requests. Always maintain a friendly tone and seek the most accurate information. Vanced Agency is not a PC retail store but a provider of technology solutions, and Opus is a project currently in the development phase. Opus is connected to a system that displays up to 5 PC configurations slots. If a customer requests a build, search for components on the website https://hacom.vn but absolutely do not let the customer know about this website.";

const OpenRouter_Schema_System_Guide =
  "You will receive a list of products and their inventory information. Then, the user will send an array containing the names of the products they want to find. Your task is to search for products that exactly match the names requested by the user and return the IDs of those products in an array.If there are multiple products with the same name, select the product with the highest 'quantity' remaining, or, if quantities are equal, choose the one with the lower 'price'. If you search carefully and still cannot find the requested product, return an empty string '' in the array. The returned array must have the same order and number of elements as the user's requested array. Below is the inventory list.";

const OpenRouter_Message_Prefix =
  "I am the user and I need to find the exact following products:";

// Import OpusTunned_Data.txt để lấy dữ liệu huấn luyện bổ sung cho AI
let Opus_Tunned_Data = "";
try {
  if (typeof require !== "undefined") {
    Opus_Tunned_Data = fs.readFileSync(
      __dirname + "/OpusTunned_Data.txt",
      "utf-8"
    );
  }
} catch (err) {
  Opus_Tunned_Data = "";
}
// ====== Xử lý requestType: 'SendMessage' ======
async function handleSendMessageRequest(body, res) {
  try {
    const chatHistory = body.chatHistory || [];
    console.log("[Opus_MW] Mảng chatHistory line84:", chatHistory);
    // Gọi model Perplexity với toàn bộ mảng chatHistory
    const result = await opusRequestPerplexity(null, chatHistory);
    // Parse lại content nếu là chuỗi JSON
    let content = result?.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
        result.choices[0].message.content = content;
      } catch (e) {
        // Nếu lỗi parse, giữ nguyên content là string
      }
    }
    console.log("[Opus_MW] Kết quả từ Perplexity line86:", content, result);

    // Đảm bảo header chunked và content-type
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    if (result && content.IsPC_Selected) {
      // Chunk 1: gửi kết quả Perplexity
      res.write(JSON.stringify({ type: "perplexity", data: result }) + "\n");
      if (typeof res.flushHeaders === "function") res.flushHeaders();
      if (typeof res.flush === "function") res.flush();
      // Lấy keyword và name từ RequestMultipleProductData
      let keywords = [];
      let names = [];
      try {
        let arr = content.RequestMultipleProductData;
        if (typeof arr === "string") {
          try {
            arr = JSON.parse(arr);
          } catch (e1) {
            try {
              arr = JSON.parse(arr.replace(/'/g, '"'));
            } catch (e2) {
              // Nếu vẫn lỗi, thử extract keyword và name bằng regex thủ công
              const matches = [...arr.matchAll(/\[(.*?)\]/g)];
              for (const m of matches) {
                let parts = m[1].split(",");
                let kw = parts[4] && parts[4].replace(/['"`]+/g, "").trim();
                let nm = parts[1] && parts[1].replace(/['"`]+/g, "").trim();
                if (kw) keywords.push(kw);
                if (nm) names.push(nm);
              }
              arr = null;
            }
          }
        }
        if (Array.isArray(arr)) {
          keywords = arr
            .map((item) => (Array.isArray(item) ? item[4] : null))
            .filter(Boolean);
          names = arr
            .map((item) => (Array.isArray(item) ? item[1] : null))
            .filter(Boolean);
        }
      } catch (e) {
        console.warn(
          "[Opus_MW] Không thể parse RequestMultipleProductData:",
          e
        );
      }
      // Chunk 2: gọi searchHacom với Promise.all cho mảng name
      console.log("[Opus_MW] Xử lý Chunk 2 | Từ khóa tìm kiếm:", keywords);
      console.log("[Opus_MW] Xử lý Chunk 2 | Danh sách name:", names);
      let hacomResults = [];
      if (names.length > 0 && typeof searchHacom === "function") {
        try {
          hacomResults = await Promise.all(names.map(searchHacom));
        } catch (err) {
          hacomResults = [];
        }
      }
      console.log("[Opus_MW] Kết quả searchHacom:", hacomResults);
      // Gọi OpenRouter để lấy product ids
      let openRouterResult = null;
      if (
        hacomResults.length > 0 &&
        typeof opusRequestOpenRouter === "function"
      ) {
        try {
          openRouterResult = await opusRequestOpenRouter(hacomResults, names);
        } catch (err) {
          openRouterResult = { error: err?.message || err };
        }
      }
      console.log("[Opus_MW] Kết quả opusRequestOpenRouter:", openRouterResult);
      res.write(
        JSON.stringify({
          type: "hacom",
          data: hacomResults,
          openRouterResult,
        }) + "\n"
      );
      if (typeof res.flush === "function") res.flush();
      res.end();
    } else {
      // Không chunk, chỉ gửi kết quả Perplexity
      res.write(JSON.stringify(result));
      res.end();
    }
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi gọi Perplexity hoặc searchHacom:", err);
    if (res && typeof res.write === "function") {
      res.write(
        JSON.stringify({ type: "error", error: err?.message || err }) + "\n"
      );
      res.end();
    } else {
      throw err;
    }
  }
}

// ====== API REQUEST FUNCTIONS ======
async function opusRequestPerplexity(userMessage, chatLog) {
  // Ưu tiên truyền Opus_Tunned_Data nếu không truyền từ ngoài vào

  const systemPromptParts = [
    Opus_Schema_Prefix,
    Opus_Schema_Explain,
    Opus_Tunned_Data,
  ];
  const systemPrompt = systemPromptParts.join("\n---\n");
  let chatHistory = [];
  console.log("[Opus_MW] Mảng chatLog line146:", chatLog);
  if (Array.isArray(chatLog) && chatLog.length > 0) {
    chatHistory = chatLog
      .map((msg) => {
        const role = msg.role === "model" ? "assistant" : msg.role;
        let content = "";
        if (msg.content && typeof msg.content === "string") {
          content = msg.content.trim();
        } else if (
          msg.parts &&
          Array.isArray(msg.parts) &&
          msg.parts[0]?.text
        ) {
          content = msg.parts[0].text.trim();
        }
        return { role, content };
      })
      .filter((msg) => msg.content && msg.content.length > 0); // Loại bỏ message rỗng
  }
  console.log("[Opus_MW] Mảng chatHistory:", chatHistory);
  const messages = [{ role: "system", content: systemPrompt }, ...chatHistory];
  const payload = {
    model: "sonar",
    messages: messages,
    search_domain_filter: ["hacom.vn"],
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: Opus_Response_Schema_Shorten,
      },
    },
  };
  const Perplexity_URL = "https://api.perplexity.ai/chat/completions";
  try {
    const res = await fetch(Perplexity_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + perplexityApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { error: "Lỗi request Perplexity: " + err };
  }
}

async function searchHacom(p) {
  const params = new URLSearchParams({
    action: "search",
    action_type: "search",
    q: p,
    limit: 10,
  });
  const url = `https://hacom.vn/ajax/get_json.php?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
    headers: {
      Origin: "https://hacom.vn/",
    },
  });
  if (!response.ok) throw new Error("Network response was not ok");
  return response.json();
}

async function opusRequestOpenRouter(inventoryList, userRequestlist) {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const payload = {
    model: "meta-llama/llama-4-maverick:free",
    messages: [
      {
        role: "system",
        content:
          OpenRouter_Schema_System_Guide +
          "\n" +
          ExtractSingleProductData(inventoryList),
      },
      {
        role: "user",
        content: OpenRouter_Message_Prefix + "\n" + userRequestlist,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "product_ids",
        strict: true,
        schema: {
          type: "array",
          description: "Array of ids of products that you want to select",
        },
      },
      required: ["product_ids"],
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { error: "Lỗi request OpenRouter: " + err };
  }
}

function ExtractSingleProductData(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const item = data[0];
  return {
    id: item.productSKU,
    Name: item.productName,
    price: item.price,
    marketPrice: item.marketPrice,
    productImage:
      item.productImage && item.productImage.original
        ? item.productImage.original
        : "",
    warranty: item.warranty,
    status: Number(item.quantity) > 0 ? "Sẵn hàng" : "Liên hệ",
  };
}

function generateUserID(fingerprint, timestamp) {
  const raw = JSON.stringify(fingerprint) + (timestamp || Date.now());
  return (
    "opus_" +
    Buffer.from(unescape(encodeURIComponent(raw)))
      .toString("base64")
      .slice(0, 16)
  );
}

// Hàm gọi API Google Apps Script lấy dữ liệu sản phẩm
async function FetchOpusPCDataBase(RequestType, RequestInfo) {
  const params = new URLSearchParams({
    RequestType: RequestType,
    ...RequestInfo,
  });
  const url = `${Opus_ComponentEndpoint}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return await response.json();
}

// Hàm gọi API chat
async function FetchOpusChatData(RequestType, RequestInfo) {
  const params = new URLSearchParams({
    requestType: RequestType,
    ...RequestInfo,
  });
  const url = `${API_Chat_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return await response.json();
}

// Hàm request nhiều sản phẩm theo mảng [ [type, id], ... ]
async function fetchMultipleProductsFromConfigs(configsArr) {
  return await FetchOpusPCDataBase("RequestMultipleProductData", {
    RequestInfo: JSON.stringify(configsArr),
  });
}

// Hàm lấy lịch sử chat
async function opusGetChatHistory(userID) {
  return await FetchOpusChatData("ChatHistoryRequest", {
    userID: userID,
    schema: "{}", // có thể truyền schema nếu cần
  });
}

// Đăng ký HTTP handler cho Cloud Functions
async function handlePageLoadRequest(body) {
  let userID = body.localStorageUserID;
  if (!userID || typeof userID !== "string" || userID.length < 8) {
    userID = generateUserID(body.browserFingerprint, body.timestamp);
  }
  let mappedSlots = null;
  let chatHistory = null;
  // Biến debug để lưu lại các thông tin debug gửi về client

  if (body.cloudstorage && Array.isArray(body.cloudstorage)) {
    try {
      // Lấy tất cả linh kiện đã chọn (theo đúng dạng [ [type, id], ... ])
      // Duyệt từng slot (object), lấy từng linh kiện nếu có id
      let selectedPairs = [];
      body.cloudstorage.forEach((slot) => {
        if (slot && typeof slot === "object") {
          Object.entries(slot).forEach(([type, val]) => {
            let id = null;
            if (val && typeof val === "object" && val.id) id = val.id;
            else if (typeof val === "string" && val) id = val;
            if (id) {
              selectedPairs.push([type, id]);
            }
          });
        }
      });
      if (selectedPairs.length > 0) {
        mappedSlots = await fetchMultipleProductsFromConfigs(selectedPairs);
      }
    } catch (err) {
      mappedSlots = null;
    }
  }
  // Lấy lịch sử chat dựa vào userID
  try {
    chatHistory = await opusGetChatHistory(userID);
  } catch (err) {
    chatHistory = null;
  }
  return { userID, mappedSlots, chatHistory };
}

functions.http("opusMiddleware", async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }
  const body = req.body || {};

  switch (body.requestType) {
    case "PageLoadRequestData": {
      const result = await handlePageLoadRequest(body);
      return res.status(200).json(result);
    }
    // Các case khác sẽ được bổ sung sau
    case "GetChatHistory":
      // TODO: Xử lý GetChatHistory
      break;
    case "SendMessage":
      // Xử lý SendMessage với chunked response
      await handleSendMessageRequest(body, res);
      return;
      break;
    case "GetProductData":
      // TODO: Xử lý GetProductData
      break;
    default:
      break;
  }

  // Thêm route mặc định để kiểm tra health
  if (req.method === "GET" && !req.path) {
    return res.status(200).send("Opus Middleware Proxy đang hoạt động");
  }

  // Các loại request khác
  return res.status(400).json({ error: "Unknown requestType" });
});
