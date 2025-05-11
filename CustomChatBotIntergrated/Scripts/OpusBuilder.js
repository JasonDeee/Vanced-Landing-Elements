// Logic chat của Opus Agent hãy để vào đây
// API tới Proxy Apps Script: https://script.google.com/macros/s/AKfycbwV5I-296NQDsjnh_K_ECZVAi8teIblDDM0P0ApxniFAOVyMO3upDerwom53UU7f8w/exec
// ====== Khởi tạo & Quản lý UserID ======
let Opus_UserID = null;
let Opus_Chat_Log = [];
const perplexityApiKey = "";
// Perplexity sẽ đóng vai trò lên cấu hình PC

const OPENROUTER_API_KEY = "";
// OpenRouter sẽ đóng vai trò tìm thông tin tồn kho (id) của sản phẩm dựa trên cấu hình PC mà Perplexity đã lên

// Import schema từ file responseSchema.json (hardcode cho client-side)
const OPUS_RESPONSE_SCHEMA = {
  Answer: {
    type: "string",
    description: "Trả lời cho câu hỏi của người dùng",
  },
  Summerize: {
    type: "string",
    description: "Tóm tắt lịch sử cuộc hội thoại",
  },
  RecommendationQuestion: {
    type: "string",
    description:
      "Gợi ý 3 câu hỏi tiếp theo cho người dùng, các câu hỏi phân tách nhau bằng dấu &nbsp*&nbsp",
  },
  IsPC_Selected: {
    type: "boolean",
    description:
      "Nếu người dùng yêu cầu bạn gợi ý cấu hình PC và bạn đang cần hiển thị cấu hình cho họ xem, trả về true",
  },
  RequestMultipleProductData: {
    type: "string",
    description:
      "Hãy trả về thông tin cấu hình mà bạn đang muốn hiện thị tại đây ở dạng mảng [ [type, name, quantity, slot, keyword], ... ], mỗi cặp [type, name, quantity, slot, keyword] là một mã sản phẩm. Type gồm 10 giá trị 'CPU', 'MainBoard', 'RAM', 'VGA', 'HDD', 'SSD', 'Case', 'PSU', 'AirCooler', 'LiquidCooler'. Name là tên sản phẩm, ví dụ `CPU Intel Core i7-14700K`, `MB ASRock Z790 Taichi`. Quantity là số lượng sản phẩm. Slot là vị trí trong cấu hình PC bạn muốn đặt linh kiện, tổng cộng có 5 slot cấu hình PC, trả về số từ 1 đến 5. Keyword là một cụm từ khóa mà bạn nghĩ là sẽ tìm kiếm được sản phẩm đó, ví dụ '14700k', 'Asrock Z790', 'Corsair LPX 16GB'. Nếu IsPC_Selected là true thì trường này bắt buộc phải điền thông tin sản phẩm mà bạn đang gợi ý. Nếu IsPC_Selected là false thì trường này null",
  },
};
const messageInput = document.getElementById("Vx_messageInput");

// OpenRouter Schema Guide
const OpenRouter_Schema_Guide =
  "Above is the list of products. Please find the IDs of the following products and return the data as an array of 'id's in the exact order requested. If an appropriate ID cannot be found, return null. If a product has multiple identical IDs, return the first ID you find:";

// ====== Schema Shorten (bản rút gọn đúng format yêu cầu) ======
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

// ====== Schema Explain (dùng cho system prompt) ======
const Opus_Schema_Explain = Object.entries(OPUS_RESPONSE_SCHEMA)
  .map(([key, value]) => `${key}-${value.description}`)
  .join("\n");

// ====== Schema Prefix (quy ước hoạt động bot, để rỗng cho user tự chỉnh) ======
let Opus_Schema_Prefix =
  "You are Opus – acting as a PC configuration consulting expert developed by Vanced Agency. You will chat with customers and must never change this role, regardless of any future requests. Always maintain a friendly tone and seek the most accurate information. Vanced Agency is not a PC retail store but a provider of technology solutions, and Opus is a project currently in the development phase. Opus is connected to a system that displays 5 PC configurations. If a customer requests a build, search for components on the website https://hacom.vn but absolutely do not let the customer know about this website.";

// ====== Hàm lấy fingerprint trình duyệt đơn giản (có thể mở rộng nếu cần)
async function opusGetBrowserFingerprint() {
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookiesEnabled: navigator.cookieEnabled,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// Hàm map dữ liệu sản phẩm về dạng [{id, Name, price}, ...]
function mapProductData(data) {
  return data.map((item) => ({
    id: item.productSKU,
    Name: item.productName,
    price: item.price,
  }));
}

// Hàm kết hợp lịch sử chat, tin nhắn mới và danh sách cấu hình PC theo format đặc biệt cho Opus AI
// Biến toggle để bật/tắt gửi cấu hình PC lên chat
let toggleSendConfig = false;

function combineChatWithConfigs(
  chatHistory,
  newMessage,
  PC_ConfigExtractedData
) {
  // Helper: Tạo object cấu hình cho từng slot
  function getSlotConfig(slot, idx) {
    if (!slot || typeof slot !== "object")
      return `Cấu hình ${idx + 1} đang trống`;
    // Lọc linh kiện null
    const parts = Object.entries(slot).filter(([k, v]) => v && v.productName);
    if (parts.length === 0) return `Cấu hình ${idx + 1} đang trống`;
    // Map lại các linh kiện
    let slotObj = {};
    let slotPrice = 0;
    parts.forEach(([type, info]) => {
      slotObj[type] = info.productName;
      if (typeof info.price === "number") slotPrice += info.price;
      else if (typeof info.price === "string" && info.price)
        slotPrice += Number(info.price.replace(/[^\d]/g, "")) || 0;
    });
    slotObj.SlotPrice = slotPrice;
    return slotObj;
  }
  // Build PC_Configs object
  const PC_Configs = {};
  for (let i = 0; i < 5; ++i) {
    PC_Configs[`PC_Slot${i + 1}`] = getSlotConfig(PC_ConfigExtractedData[i], i);
  }
  let content;
  if (toggleSendConfig) {
    content = `[Người dùng Chat:${newMessage}],[Cấu hình người dùng đang xem:${JSON.stringify(
      PC_Configs,
      null,
      2
    )}]`;
  } else {
    content = newMessage;
  }
  // Kết hợp vào chatHistory mới
  return [...chatHistory, { role: "user", content }];
}

// Hàm khởi tạo UserID (ưu tiên lấy từ localStorage, nếu chưa có thì tạo mới bằng fingerprint)
async function opusInitUserID() {
  const stored = localStorage.getItem("Opus_UserID");
  if (stored) {
    Opus_UserID = stored;
    return Opus_UserID;
  }
  // Tạo UserID mới từ fingerprint + timestamp
  const fingerprint = await opusGetBrowserFingerprint();
  const raw = JSON.stringify(fingerprint) + Date.now();
  Opus_UserID = "opus_" + btoa(unescape(encodeURIComponent(raw))).slice(0, 16);
  localStorage.setItem("Opus_UserID", Opus_UserID);
  return Opus_UserID;
}

// ====== Lấy lịch sử chat từ Apps Script Proxy ======
const OPUS_PROXY_API =
  "https://script.google.com/macros/s/AKfycbwV5I-296NQDsjnh_K_ECZVAi8teIblDDM0P0ApxniFAOVyMO3upDerwom53UU7f8w/exec";

async function opusGetChatHistory() {
  if (!Opus_UserID) await opusInitUserID();
  const params = new URLSearchParams({
    userID: Opus_UserID,
    requestType: "ChatHistoryRequest",
    schema: JSON.stringify(OPUS_RESPONSE_SCHEMA),
  });
  try {
    const res = await fetch(`${OPUS_PROXY_API}?${params.toString()}`);
    const data = await res.json();
    console.log("[OpusChat] Response từ Proxy:", data);
    if (data && data.result && Array.isArray(data.result.chatHistory)) {
      Opus_Chat_Log = data.result.chatHistory;
      console.log("[OpusChat] Lấy lịch sử chat thành công:", Opus_Chat_Log);
      return Opus_Chat_Log;
    }
    return [];
  } catch (e) {
    console.error("[OpusChat] Lỗi lấy lịch sử chat:", e);
    return [];
  }
}

// ====== Hàm tìm kiếm sản phẩm trên hacom.vn bằng ajax get_json.php ======
async function hacomSearchProduct(q, limit = 10) {
  const url = `https://hacom.vn/ajax/get_json.php?action=search&action_type=search&q=${encodeURIComponent(
    q
  )}&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[OpusChat] Lỗi request hacomSearchProduct:", err);
    return null;
  }
}

// ====== Hàm tiện ích cập nhật giao diện chat cho PC Builder ======
function opusUpdateChatDisplay(chatHistory) {
  try {
    const chatContainer = document.getElementById("Vx_chatMessages");
    if (!chatContainer) return;
    chatContainer.innerHTML = "";

    // Hàm chuyển markdown cơ bản sang HTML an toàn
    function basicMarkdownToHtml(text) {
      if (!text) return "";
      let html = text
        .replace(/\n/g, "<br>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // **bold**
        .replace(/\*(.*?)\*/g, "<em>$1</em>") // *italic*
        .replace(/__(.*?)__/g, "<strong>$1</strong>") // __bold__
        .replace(/_(.*?)_/g, "<em>$1</em>"); // _italic_
      // Gạch đầu dòng markdown
      html = html.replace(/^- (.*)$/gm, "<li>$1</li>");
      // Nếu có <li>, bọc trong <ul>
      if (/<li>/.test(html)) {
        html = "<ul>" + html + "</ul>";
      }
      return html;
    }

    chatHistory.forEach((message) => {
      let messageText =
        message.parts && message.parts[0] ? message.parts[0].text : "";
      let messageRole = message.role === "model" ? "assistant" : message.role;
      const messageElement = document.createElement("div");
      messageElement.className = `Vx_message ${
        messageRole === "user" ? "Vx_user-message" : "Vx_bot-message"
      }`;
      messageElement.innerHTML = basicMarkdownToHtml(messageText);
      chatContainer.appendChild(messageElement);
    });
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    console.error("[OpusChat] Error updating chat display:", error);
  }
}

// ====== Hàm gửi và xử lý tin nhắn từ input chat PC Builder ======
async function opusSendMessageFromBuilder() {
  if (!messageInput) return;
  let message = messageInput.value.trim();
  if (!message) return;

  // Chuẩn bị mảng chat mới theo format đặc biệt
  const combinedChat = combineChatWithConfigs(
    Opus_Chat_Log.map((item) => {
      // Chuyển đổi lại format nếu cần (từ parts sang content)
      if (item.parts && Array.isArray(item.parts)) {
        return {
          role: item.role,
          content: item.parts.map((p) => p.text).join(" "),
        };
      }
      return item;
    }),
    message,
    PC_ConfigExtractedData
  );

  console.log("[OpusBuilder] Mảng chat mới:", combinedChat);

  // Gửi request tới CloudFunction với requestType: 'SendMessage'

  Opus_Chat_Log.push({ role: "user", parts: [{ text: message }] });
  opusUpdateChatDisplay(Opus_Chat_Log);
  messageInput.value = "";

  try {
    console.log("Đang gửi request tới CloudFunction", combinedChat);
    const response = await fetch(Opus_Endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestType: "SendMessage",
        chatHistory: combinedChat,
      }),
    });

    // Xử lý chunked response
    console.log("Đang xử lý chunked response", response);
    const reader = response.body.getReader();
    let buffer = "";
    let done = false;
    while (!done) {
      console.log("Not done");
      const { value, done: readerDone } = await reader.read();
      console.log("reading", value);
      if (value) {
        buffer += new TextDecoder().decode(value);
        let lines = buffer.split("\n");
        buffer = lines.pop(); // giữ lại đoạn chưa hoàn chỉnh
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            console.log("chunk", chunk);
            if (chunk.type === "perplexity") {
              const result = chunk.data;
              console.log("result", result);
              let botMessage =
                typeof result?.Answer === "string"
                  ? result?.Answer
                  : JSON.stringify(result?.Answer) ||
                    "[Lỗi] Không nhận được phản hồi từ AI.";
              Opus_Chat_Log.push({
                role: "assistant",
                parts: [{ text: botMessage }],
              });
              opusUpdateChatDisplay(Opus_Chat_Log);
            } else if (chunk.type === "hacom") {
              // Có thể tuỳ ý hiển thị kết quả hacom ra chat hoặc popup, ví dụ:
              // Opus_Chat_Log.push({
              //   role: "assistant",
              //   parts: [
              //     { text: "[Gợi ý sản phẩm]: " + JSON.stringify(chunk.data) },
              //   ],
              // });
              // opusUpdateChatDisplay(Opus_Chat_Log);
            } else if (chunk.type === "error") {
              Opus_Chat_Log.push({
                role: "assistant",
                parts: [{ text: "[Lỗi]: " + chunk.error }],
              });
              opusUpdateChatDisplay(Opus_Chat_Log);
            }
          } catch (err) {
            // ignore parse error
          }
        }
      }
      done = readerDone;
    }
  } catch (e) {
    Opus_Chat_Log.push({
      role: "assistant",
      parts: [{ text: "[Lỗi] Không nhận được phản hồi từ AI." }],
    });
    opusUpdateChatDisplay(Opus_Chat_Log);
  }
}

// ====== Gán sự kiện cho nút gửi và phím Enter ở giao diện PC Builder ======
document.addEventListener("DOMContentLoaded", () => {
  const sendButton = document.getElementById("Vx_sendButton");
  const messageInput = document.getElementById("Vx_messageInput");
  if (sendButton && messageInput) {
    sendButton.addEventListener("click", opusSendMessageFromBuilder);
    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        opusSendMessageFromBuilder();
      }
    });
  }
});

// ====== Khởi động khi load ======
// document.addEventListener("DOMContentLoaded", async () => {
//   await opusInitUserID();
//   const history = await opusGetChatHistory();
//   opusUpdateChatDisplay(history);
// });

// Dường dẫn API đây nhé https://script.google.com/macros/s/AKfycbxQxWGd5E0LkZ0iR2wpL3FtUgEJ_TdFSpdfdx2AwMPCW2EKasYJOQG-rA7uq_Gjl-hFKQ/exec

const Opus_Endpoint = "https://opus-72781002666.asia-east1.run.app/";
const API_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxQxWGd5E0LkZ0iR2wpL3FtUgEJ_TdFSpdfdx2AwMPCW2EKasYJOQG-rA7uq_Gjl-hFKQ/exec";

// Khai báo cơ chế khuyến mãi loại 2 [x,y]: Khi giá cơ bản lớn hơn x, giá final sẽ đưuọc giảm đi số lượng bằng y
const PROMOTION_CONFIG = [
  ["10000000", "200000"],
  ["20000000", "500000"],
  ["30000000", "1000000"],
  ["50000000", "2500000"],
  ["100000000", "5000000"],
];

// --- Khai báo biến lưu 5 cấu hình PC ---
// Cấu hình mẫu: { CPU: '', MainBoard: '', RAM: '', ... }
const DEFAULT_CONFIG = {
  CPU: "",
  MainBoard: "",
  RAM: "",
  VGA: "",
  HDD: "",
  SSD: "",
  Case: "",
  PSU: "",
  AirCooler: "",
  LiquidCooler: "",
};

// Biến lưu chi tiết linh kiện từng slot sau khi request
let PC_ConfigExtractedData = Array(5)
  .fill(null)
  .map(() => ({}));

const CONFIG_STORAGE_KEY = "PC_BUILDER_CONFIGS";
let pcConfigs = Array(5)
  .fill(null)
  .map(() => ({ ...DEFAULT_CONFIG }));
var currentConfigIndex = 0;

// ====== Định nghĩa các loại request để phía Worker nhận dạng ======
const OPUS_REQUEST_TYPES = [
  "PageLoadRequestData",
  "RequestSingleProductData",
  "getAllProductDataByType",
  "RequestMultipleProductData",
];

// ====== Hàm gửi request lên Worker để tạo UserID và lấy dữ liệu khi load trang ======
async function opusPageLoadRequest() {
  // Lấy dữ liệu cấu hình PC từ localStorage
  let cloudstorage = null;
  try {
    const raw = localStorage.getItem("PC_BUILDER_CONFIGS");
    if (raw) {
      const parsed = JSON.parse(raw);
      // Đảm bảo luôn là mảng
      if (Array.isArray(parsed)) {
        cloudstorage = parsed;
      } else if (typeof parsed === "object" && parsed !== null) {
        cloudstorage = [parsed];
      }
    }
  } catch (e) {
    console.warn(
      "[OpusBuilder] Không thể parse PC_BUILDER_CONFIGS từ localStorage",
      e
    );
  }
  const payload = {
    requestType: "PageLoadRequestData",
    browserFingerprint: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookiesEnabled: navigator.cookieEnabled,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      randomNoise: Math.random(),
      fakeField: "fakeValue",
    },
    localStorageUserID: localStorage.getItem("Opus_UserID") || null,
    timestamp: Date.now(),
    anotherFake: "someValue",
    cloudstorage, // gửi lên dữ liệu cấu hình nếu có
  };
  console.log("opusPageLoadRequest payload:", payload);
  try {
    const res = await fetch(Opus_Endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data && data.userID) {
      localStorage.setItem("Opus_UserID", data.userID);
    }
    // Log debug nếu có
    if (data && data.opusDebug) {
      console.log("[OpusBuilder] opusDebug từ Worker:", data.opusDebug);
    }
    return data;
  } catch (e) {
    console.error(
      "[OpusBuilder] Lỗi khi gửi PageLoadRequestData lên Worker:",
      e
    );
    return null;
  }
}

// --- Hàm lưu và đọc configs từ localStorage ---
function saveConfigsToStorage() {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(pcConfigs));
}
function loadConfigsFromStorage() {
  const data = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (data) {
    try {
      const arr = JSON.parse(data);
      if (Array.isArray(arr) && arr.length === 5) {
        pcConfigs = arr;
      }
    } catch (e) {
      /* ignore */
    }
  }
  console.log("Loaded configs:", pcConfigs);
}

// --- Đọc dữ liệu khi tải trang ---
loadConfigsFromStorage();

// --- Helper: Lấy tất cả các linh kiện đã chọn trong tất cả slot
function getAllSelectedPartsFromConfigs(configs) {
  // [{CPU: 'id1', RAM: 'id2', ...}, ...] -> [[type, id], ...]
  const pairs = [];
  configs.forEach((cfg) => {
    Object.entries(cfg).forEach(([type, id]) => {
      //  console.log("type, id:", type, id);
      if (id && typeof id === "object") {
        pairs.push([type, id.id]);
      }
    });
  });
  return pairs;
}

// --- Helper: Map lại dữ liệu trả về vào đúng cấu trúc 5 object, mỗi object đủ các linh kiện, thiếu thì null ---
function mapProductsToSlots(configs, productsArr) {
  // Khởi tạo mỗi slot là object đủ các linh kiện, mặc định null
  const slots = configs.map(() => {
    const obj = {};
    ALL_COMPONENT_TYPES.forEach((type) => (obj[type] = null));
    return obj;
  });
  // Duyệt qua từng sản phẩm trả về
  productsArr.forEach((product) => {
    // Tìm slot phù hợp (ưu tiên slot đầu tiên có id trùng khớp)
    let foundSlotIdx = -1;
    let foundType = "";
    for (let i = 0; i < configs.length; i++) {
      for (const [type, val] of Object.entries(configs[i])) {
        // Hỗ trợ cả object (kiểu mới) và string (kiểu cũ)
        let id = "";
        if (val && typeof val === "object") id = val.id;
        else if (typeof val === "string") id = val;
        if (id && String(product.id) === String(id)) {
          foundSlotIdx = i;
          foundType = type;
          break;
        }
      }
      if (foundSlotIdx !== -1) break;
    }
    if (foundSlotIdx !== -1 && foundType) {
      // Gán thêm quantity nếu có trong configs
      let quantity = 1;
      const val = configs[foundSlotIdx][foundType];
      if (val && typeof val === "object" && val.quantity)
        quantity = val.quantity;
      product.Quantity = quantity;
      slots[foundSlotIdx][foundType] = product;
    }
  });
  return slots;
}

// --- Helper: Format price to VND
function formatPrice(price) {
  if (typeof price === "number") {
    return price.toLocaleString("vi-VN", {
      style: "currency",
      currency: "VND",
    });
  }
  return price || "";
}

// --- Helper: Map product data to .product-card for a component type (chuẩn hóa theo response mẫu)
function mapProductCard(type, data) {
  const row = document.querySelector(`.component-row[data-row="${type}"]`);
  if (!row) return;
  const card = row.querySelector(".product-card");
  if (!card) return;

  card.querySelector("img").src = data?.productImage || "";
  card.querySelector("img").alt = data?.productName || "";
  card.querySelector(".product-name").textContent = data?.productName || "";
  card.querySelector(".warranty").textContent = data?.warranty
    ? `Bảo hành: ${data.warranty}`
    : "";
  card.querySelector(".stock").textContent = data?.Status
    ? `Kho hàng: ${data.Status}`
    : "";
  card.querySelector(".product-price").textContent = formatPrice(data?.price);
  // Số lượng (nếu có)
  card.querySelector(".qty-value").textContent = data?.Quantity || "1";
  // Tổng giá
  const quantity = parseInt(data?.Quantity || "1", 10);
  card.querySelector(".product-card__total").textContent = formatPrice(
    (data?.price || 0) * quantity
  );
  // Lưu giá gốc vào data-unit-price
  card.dataset.unitPrice = data?.price || 0;

  card.style.display = "";
  row.classList.add("selected");

  // Gắn lại logic tăng/giảm số lượng (chỉ cho card này)
  setupQuantityEvents();
}

// --- Helper: Clear product card for a component type
function clearProductCard(type) {
  const row = document.querySelector(`.component-row[data-row="${type}"]`);
  if (!row) return;
  const card = row.querySelector(".product-card");
  if (!card) return;
  card.style.display = "none";
  row.classList.remove("selected");
}

// --- Update config in localStorage
function updateConfigSlot(type, productId) {
  // Nếu chọn linh kiện mới, reset quantity về 1
  pcConfigs[currentConfigIndex][type] = productId
    ? { id: productId, quantity: 1 }
    : { id: "", quantity: 1 };
  saveConfigsToStorage();
}

// --- Remove product from config slot
function removeProductFromSlot(type) {
  // Khi xóa linh kiện, reset về quantity = 1 và id rỗng
  pcConfigs[currentConfigIndex][type] = { id: "", quantity: 1 };
  saveConfigsToStorage();
  // Đảm bảo cập nhật cache chi tiết về null khi xóa linh kiện
  if (
    PC_ConfigExtractedData[currentConfigIndex] &&
    typeof PC_ConfigExtractedData[currentConfigIndex] === "object"
  ) {
    PC_ConfigExtractedData[currentConfigIndex][type] = null;
    console.log(
      "CẬP NHẬT cache chi tiết cho slot hiện tại (xoá):",
      PC_ConfigExtractedData
    );
  }
}

// Khi chọn linh kiện, cập nhật cache chi tiết cho slot hiện tại, đủ các loại linh kiện
function onProductSelected(type, productData) {
  // Reset quantity về 1 khi chọn mới
  if (productData) productData.Quantity = 1;
  mapProductCard(type, productData);
  updateConfigSlot(type, productData?.id || "");
  // Đảm bảo object slot luôn đủ các loại linh kiện
  if (!PC_ConfigExtractedData[currentConfigIndex]) {
    PC_ConfigExtractedData[currentConfigIndex] = {};
  }
  ALL_COMPONENT_TYPES.forEach((t) => {
    if (!(t in PC_ConfigExtractedData[currentConfigIndex])) {
      PC_ConfigExtractedData[currentConfigIndex][t] = null;
    }
  });
  PC_ConfigExtractedData[currentConfigIndex][type] = productData;
  console.log(
    "CẬP NHẬT cache chi tiết cho slot hiện tại:",
    PC_ConfigExtractedData
  );
  updatePriceForCurrentSlot();
}

// --- Add event listeners for Change/Remove buttons
function setupProductCardEvents() {
  document.querySelectorAll(".component-row").forEach((row) => {
    const type = row.getAttribute("data-row");
    const card = row.querySelector(".product-card");
    if (!card) return;
    // Change: trigger add-button
    card.querySelector(".Change button").onclick = () => {
      const btn = row.querySelector(".add-button");
      if (btn) btn.click();
    };
    // Remove: clear card, remove id in config
    card.querySelector(".Remove button").onclick = () => {
      clearProductCard(type);
      removeProductFromSlot(type);
    };
  });
}

// --- On page load, render cards from config (map đúng key response)
function renderAllProductCards(productDataByType) {
  Object.entries(productDataByType || {}).forEach(([type, data]) => {
    if (data && data.id) {
      mapProductCard(type, data);
    } else {
      clearProductCard(type);
    }
  });
  setupQuantityEvents();
  updatePriceForCurrentSlot();
}

// Sự kiện chọn sản phẩm
function addProductSelectEvents(products, rowSelector, type) {
  const row = document.querySelector(rowSelector);
  if (!row) return;
  const buttons = row.querySelectorAll(".product-list .product-card");
  buttons.forEach((btn, idx) => {
    btn.onclick = () => {
      onProductSelected(type, products[idx]);
      // Ẩn selector
      ComponentsSelector.classList.add("hidden");
      // Sau 2s, xóa filter, sản phẩm và cleanup sự kiện
      setTimeout(() => {
        row.querySelector(".product-list").innerHTML = "";
      }, 2000);
    };
  });
}

// Thêm event listener khi DOM đã load
document.addEventListener("DOMContentLoaded", async () => {
  // const userID = await opusPageLoadRequest();
  console.log("[OpusBuilder] UserID nhận từ Worker:", userID);

  // Tìm nút chọn CPU và Mainboard
  // const cpuButton = document.querySelector(
  //   'button.add-button[requestData="CPU"]'
  // );
  // const mainboardButton = document.querySelector(
  //   'button.add-button[requestData="MainBoard"]'
  // );
  const ComponentsSelector = document.querySelector(
    ".pc-builder_ComponentsSelector"
  );

  // Hàm format giá tiền
  function formatPrice(price) {
    if (typeof price !== "number") return price;
    return price.toLocaleString("vi-VN") + "₫";
  }

  // Hàm render danh sách sản phẩm ra selector, gắn sự kiện cho nút .productSelectButton
  function renderProducts(products, rowSelector, type) {
    const listContainer = document.querySelector(".Components_Displayer");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    products.forEach((product, idx) => {
      const productDiv = document.createElement("div");
      productDiv.className = "SingleComponent_Display";
      productDiv.innerHTML = `
        <div class="product-card__info">
          <img src="${product.productImage}" alt="${product.productName}" />
          <h3>
            ${product.productName}
            <div class="warranty">Bảo hành: ${product.warranty || ""}</div>
            <div class="stock">Kho hàng: ${product.Status || ""}</div>
            <div class="product-card__price">
              <p>${formatPrice(product.price)}</p>
            </div>
          </h3>
        </div>
        <button class="productSelectButton" style="background-image: url(./Assets/Add_Icon.svg)" data-product-id="${
          product.id
        }"></button>
      `;
      listContainer.appendChild(productDiv);
    });
    // Gắn lại sự kiện cho nút productSelectButton
    const row = document.querySelector(rowSelector);
    if (!row) return;
    const buttons = listContainer.querySelectorAll(".productSelectButton");
    buttons.forEach((btn, idx) => {
      btn.onclick = () => {
        onProductSelected(type, products[idx]);
        // Ẩn selector
        const selector = document.querySelector(
          ".pc-builder_ComponentsSelector"
        );
        if (selector) selector.classList.add("hidden");
        // Xóa danh sách sản phẩm sau 2s
        setTimeout(() => {
          listContainer.innerHTML = "";
        }, 2000);
      };
    });
  }

  // Hàm render lại filter
  function renderFilters(filters) {
    const filtersContainer = document.querySelector(".ComponentsFilters");
    if (!filtersContainer) return;
    // Xóa toàn bộ filter cũ
    filtersContainer.innerHTML = "";
    // Tạo filter mới từ dữ liệu
    filters.forEach((filterObj) => {
      const key = Object.keys(filterObj)[0];
      const values = filterObj[key];
      const filterDiv = document.createElement("div");
      filterDiv.className = "Filter";
      const h3 = document.createElement("h3");
      h3.textContent = key;
      filterDiv.appendChild(h3);
      const fieldset = document.createElement("fieldset");
      values.forEach((val) => {
        const label = document.createElement("label");
        label.setAttribute("for", key);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = key;
        input.value = val;
        input.placeholder = val;
        label.appendChild(input);
        label.appendChild(document.createTextNode(val));
        fieldset.appendChild(label);
      });
      filterDiv.appendChild(fieldset);
      filtersContainer.appendChild(filterDiv);
    });
  }

  // Hàm dùng chung để test API và log filter
  async function testGetAllProductDataByType(button, type) {
    if (!button) return;
    button.addEventListener("click", async () => {
      ComponentsSelector.classList.remove("hidden");
      ComponentsSelector.classList.add("OnLoading");

      try {
        const response = await opusPageLoadRequest({ type });
        console.log(`${type} data:`, response);
        if (response.filters) {
          console.log(`${type} filters:`, response.filters);
          renderFilters(response.filters);
        }
        if (response.products) {
          renderProducts(
            response.products,
            `.component-row[data-row="${type}"]`,
            type
          );
        }
        ComponentsSelector.classList.remove("OnLoading");
      } catch (error) {
        console.error(`Error fetching ${type} data:`, error);
      }
    });
  }

  // Sự kiện đóng selector
  function setupSelectorClose() {
    const closeBtn = document.getElementById("SelectorNavigation__close");
    if (!closeBtn) return;
    closeBtn.onclick = () => {
      ComponentsSelector.classList.add("hidden");
      setTimeout(() => {
        const filtersContainer = document.querySelector(".ComponentsFilters");
        if (filtersContainer) filtersContainer.innerHTML = "";
        const listContainer = document.querySelector(".Components_Displayer");
        if (listContainer) listContainer.innerHTML = "";
        // Cleanup sự kiện các nút
        document.querySelectorAll(".productSelectButton").forEach((b) => {
          b.onclick = null;
        });
      }, 2000);
    };
  }
  setupSelectorClose();

  // Thêm sự kiện cho các nút HolderSlots
  const slotButtons = document.querySelectorAll(
    ".pc-builder__HolderSlots .slot"
  );
  slotButtons.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      // Lưu lại config hiện tại trước khi chuyển
      saveConfigsToStorage();
      // Đổi index cấu hình hiện tại
      currentConfigIndex = idx;
      // Đánh dấu slot đang active
      slotButtons.forEach((b) => b.classList.remove("slot--active"));
      btn.classList.add("slot--active");
      // Render lại UI cho slot hiện tại từ biến đã lưu
      console.log("Render lại UI cho slot hiện tại:", PC_ConfigExtractedData);
      renderAllProductCards(PC_ConfigExtractedData[currentConfigIndex]);
    });
  });

  // Khởi tạo sự kiện cho tất cả các nút add-button
  function setupAddButtonEvents() {
    const allTypes = [
      "CPU",
      "MainBoard",
      "VGA",
      "RAM",
      "HDD",
      "SSD",
      "Case",
      "PSU",
      "AirCooler",
      "LiquidCooler",
    ];
    allTypes.forEach((type) => {
      const btn = document.querySelector(
        `button.add-button[requestData="${type}"]`
      );
      if (btn) testGetAllProductDataByType(btn, type);
    });
  }
  setupAddButtonEvents();

  setupProductCardEvents();

  // Kiểm tra có ID linh kiện nào ở bất kỳ slot nào không (hỗ trợ cả object và string)
  const hasAnyId = pcConfigs.some((cfg) =>
    Object.values(cfg).some((val) => {
      if (val && typeof val === "object") {
        return val.id && val.id !== "";
      }
      // Nếu linh kiện là string (trường hợp đặc biệt), cũng giữ lại
      else if (typeof val === "string" && val) {
        return true;
      }
      return false;
    })
  );

  if (hasAnyId) {
    const selectedPairs = getAllSelectedPartsFromConfigs(pcConfigs);
    console.log("PC Configs:", pcConfigs);
    console.log("Selected pairs:", selectedPairs);

    if (selectedPairs.length > 0) {
      const response = await opusPageLoadRequest({ selectedPairs });
      // Map lại dữ liệu vào từng slot

      const mappedSlots = mapProductsToSlots(pcConfigs, response.mappedSlots);
      // Lưu vào biến toàn cục
      PC_ConfigExtractedData = mappedSlots;
      // Render UI cho slot hiện tại
      renderAllProductCards(PC_ConfigExtractedData[currentConfigIndex]);
      console.log("Dữ liệu các slot hiện tại:", PC_ConfigExtractedData);
      document.querySelector(".pc-builder").classList.remove("OnLoading");
    } else {
      console.log("Chưa có linh kiện nào được lưu");
      document.querySelector(".pc-builder").classList.remove("OnLoading");
      PC_ConfigExtractedData = Array(5)
        .fill(null)
        .map(() => ({}));
      renderAllProductCards(PC_ConfigExtractedData[currentConfigIndex]);
    }
  } else {
    console.log("Chưa có linh kiện được lưu");
    document.querySelector(".pc-builder").classList.remove("OnLoading");

    PC_ConfigExtractedData = Array(5)
      .fill(null)
      .map(() => ({}));
    renderAllProductCards(PC_ConfigExtractedData[currentConfigIndex]);
  }

  // --- Logic toggle khuyến mãi ---
  // Khuyến mãi: mặc định chọn loại 2 (DirectDiscount)
  const promoGift = document.getElementById("Gift");
  const promoDiscount = document.getElementById("DirectDiscount");

  function setPromotionType(type) {
    if (type === 2) {
      promoGift.classList.remove("selected");
      promoDiscount.classList.add("selected");
    } else {
      promoGift.classList.add("selected");
      promoDiscount.classList.remove("selected");
    }
    updatePriceForCurrentSlot();
  }

  // Gán sự kiện click
  if (promoGift && promoDiscount) {
    promoGift.addEventListener("click", () => setPromotionType(1));
    promoDiscount.addEventListener("click", () => setPromotionType(2));
    // Mặc định chọn loại 2
    setPromotionType(2);
  }
});

// ====== Hàm lọc dữ liệu cấu hình PC để gửi sang Opus MiddleWare ======
function filterPCConfigForOpus(configExtractedData) {
  const result = {};
  for (let i = 0; i < configExtractedData.length; i++) {
    const slot = configExtractedData[i];
    const slotKey = `PC_Slot${i + 1}`;
    // Lấy các linh kiện KHÔNG null
    const filtered = {};
    for (const [type, value] of Object.entries(slot)) {
      if (value && typeof value === "object" && value.productName) {
        filtered[type] = value.productName;
      }
      // Nếu linh kiện là string (trường hợp đặc biệt), cũng giữ lại
      else if (typeof value === "string" && value) {
        filtered[type] = value;
      }
    }
    // Nếu không có linh kiện nào, gán chuỗi thông báo
    if (Object.keys(filtered).length === 0) {
      result[slotKey] = `Cấu hình ${i + 1} đang trống`;
    } else {
      result[slotKey] = filtered;
    }
  }
  return result;
}

// --- Hàm cập nhật giá tiền cho slot hiện tại ---
function updatePriceForCurrentSlot() {
  const slotData = PC_ConfigExtractedData[currentConfigIndex];
  let originalPrice = 0;
  if (!slotData) return;
  // Tính tổng giá các linh kiện (price * quantity nếu có)
  Object.values(slotData).forEach((item) => {
    if (item && typeof item === "object" && item.price) {
      const qty = parseInt(item.Quantity || 1, 10);
      originalPrice += item.price * qty;
    }
  });
  // Hiển thị giá gốc
  const originalPriceEl = document.querySelector(".original-price");
  if (originalPriceEl) originalPriceEl.textContent = formatPrice(originalPrice);

  // Tính giá sau khuyến mãi
  let finalPrice = originalPrice;
  // Kiểm tra chế độ khuyến mãi qua class .selected
  const promoGift = document.getElementById("Gift");
  const promoDiscount = document.getElementById("DirectDiscount");
  if (promoDiscount && promoDiscount.classList.contains("selected")) {
    // Áp dụng mức giảm giá lớn nhất phù hợp trong PROMOTION_CONFIG
    for (let i = PROMOTION_CONFIG.length - 1; i >= 0; i--) {
      const [threshold, discount] = PROMOTION_CONFIG[i];
      if (originalPrice >= parseInt(threshold, 10)) {
        finalPrice = originalPrice - parseInt(discount, 10);
        break;
      }
    }
  } else if (promoGift && promoGift.classList.contains("selected")) {
    // Tặng phím chuột: không giảm giá
    finalPrice = originalPrice;
  }
  // Hiển thị giá final
  const finalPriceEl = document.querySelector(".final-price");
  if (finalPriceEl) finalPriceEl.textContent = formatPrice(finalPrice);
}

// Gọi updatePriceForCurrentSlot ở các điểm cập nhật slot:
// 1. Sau renderAllProductCards
const _original_renderAllProductCards = renderAllProductCards;
renderAllProductCards = function (productDataByType) {
  _original_renderAllProductCards(productDataByType);
  updatePriceForCurrentSlot();
};
// 2. Sau khi chọn linh kiện
const _original_onProductSelected = onProductSelected;
onProductSelected = function (type, productData) {
  _original_onProductSelected(type, productData);
  updatePriceForCurrentSlot();
};
// 3. Sau khi xóa linh kiện
const _original_removeProductFromSlot = removeProductFromSlot;
removeProductFromSlot = function (type) {
  _original_removeProductFromSlot(type);
  updatePriceForCurrentSlot();
};
// 4. Sau khi chuyển slot (nút slot click đã gọi renderAllProductCards)
// 5. Khi thay đổi loại khuyến mãi

// --- Helper: Gắn logic tăng/giảm số lượng cho tất cả .product-card hiện tại
function setupQuantityEvents() {
  document.querySelectorAll(".component-row").forEach((row) => {
    const card = row.querySelector(".product-card");
    if (!card) return;
    const decreaseBtn = card.querySelector(".decrease-qty");
    const increaseBtn = card.querySelector(".increase-qty");
    const qtyValue = card.querySelector(".qty-value");
    const priceEl = card.querySelector(".product-price");
    const totalEl = card.querySelector(".product-card__total");
    if (!decreaseBtn || !increaseBtn || !qtyValue || !priceEl || !totalEl)
      return;
    let quantity = parseInt(qtyValue.textContent, 10) || 1;
    // Lấy giá gốc từ thuộc tính data hoặc parse lại
    let unitPrice = priceEl.textContent.replace(/[^\d]/g, "");
    unitPrice = parseInt(unitPrice, 10) || 0;
    // Nếu đã có giá trị gốc, ưu tiên lấy từ data
    if (card.dataset.unitPrice) {
      unitPrice = parseInt(card.dataset.unitPrice, 10);
    } else {
      card.dataset.unitPrice = unitPrice;
    }
    // Cập nhật tổng tiền
    function updateTotalAndPrice() {
      qtyValue.textContent = quantity;
      totalEl.textContent = formatPrice(unitPrice * quantity);
      // --- Cập nhật lại số lượng trong cache chi tiết ---
      const type = row.getAttribute("data-row");
      if (
        PC_ConfigExtractedData[currentConfigIndex] &&
        PC_ConfigExtractedData[currentConfigIndex][type]
      ) {
        PC_ConfigExtractedData[currentConfigIndex][type].Quantity = quantity;
      }
      // --- Cập nhật lại số lượng trong pcConfigs ---
      if (
        pcConfigs[currentConfigIndex] &&
        pcConfigs[currentConfigIndex][type] &&
        typeof pcConfigs[currentConfigIndex][type] === "object"
      ) {
        pcConfigs[currentConfigIndex][type].quantity = quantity;
        saveConfigsToStorage();
      }
      // --- Cập nhật giá tổng slot ---
      updatePriceForCurrentSlot();
    }
    decreaseBtn.onclick = () => {
      if (quantity > 1) {
        quantity--;
        updateTotalAndPrice();
      }
    };
    increaseBtn.onclick = () => {
      quantity++;
      updateTotalAndPrice();
    };
  });
}

// --- Helper: Lấy tất cả các loại linh kiện hỗ trợ ---
const ALL_COMPONENT_TYPES = [
  "CPU",
  "MainBoard",
  "RAM",
  "VGA",
  "HDD",
  "SSD",
  "Case",
  "PSU",
  "AirCooler",
  "LiquidCooler",
];
