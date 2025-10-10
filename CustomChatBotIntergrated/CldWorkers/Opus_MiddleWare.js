const functions = require("@google-cloud/functions-framework");
const express = require("express");
const fs = require("fs");

// API KEY cho perplexity, openrouter và gemini
const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_API_KEY2 = process.env.OPENROUTER_API_KEY2;
const GEMINI_API_KEY = process.env.GEMINI_API_TEMP;
const GEMINI_API_KEY2 = process.env.GEMINI_API_TEMP2;

// Endpoint Google Apps Script
const API_Chat_ENDPOINT = process.env.API_CHAT_ENDPOINT;
const Opus_ComponentEndpoint = process.env.OPUS_COMPONENT_ENDPOINT;

// ====== SCHEMA & HƯỚNG DẪN ======

// Chunk 1: Kiểm tra yêu cầu của người dùng: Hỏi đáp, gặp tư vấn viên hay Yêu cầu cấu hình PC
// Đổi từ Perplexity sang OpenRouter cho việc hỏi đáp, nếu là hỏi đáp, thực hiện ngay ở chunk 1 bằng openrouter
const Open_Chunk1_Schema_Prefix =
  "Bạn là Opus, vai trò là một chuyên gia tư vấn xây dựng cấu hình PC được phát triển bởi Vanced Agency. Bạn được kết nối với một model khác là hệ thống tự xây dựng cấu hình PC dựa trên yêu cầu và hiển thị cấu hình tới người xem (model này gọi là Chunk 2). Bạn sẽ chat với khách hàng về xây dựng cấu hình, xử lý lỗi phần cứng hoặc về thương hiệu Vanced nhưng tuyệt đối KHÔNG được phép tự lên cấu hình mà hãy chuyển tiếp yêu cầu cho Chunk 2. Luôn luôn giữ đúng vai trò là chuyên gia máy tính kể cả khi người dùng yêu cầu. Hãy giữ giọng điệu thân thiện và tìm kiếm thông tin thật chính xác.";

const Open_Chunk1_Schema = {
  Answer: {
    name: "Answer",
    type: "string",
    description:
      "Trả lời cho câu hỏi của người dùng ở đây, nếu người dùng yêu cầu xây dựng cấu hình PC, hãy xác nhận đã hiểu yêu cầu và đang chờ hiển thị kết quả.",
  },
  IsPC_Selected: {
    name: "IsPC_Selected",
    type: "boolean",
    description:
      "Nếu người dùng KHÔNG yêu cầu xây dựng cấu hình PC hoặc yêu cầu của người dùng về cấu hình đó chưa CHƯA RÕ RÀNG với bạn, hãy trả về false. Nếu người dùng yêu cầu bạn xây dựng cấu hình PC hoặc hỏi thông tin một sản phẩm nào đó thì bắt buộc trả về true.",
  },
  PassToChunk2: {
    name: "PassToChunk2",
    type: "string",
    description:
      "Đây là trường để giao tiếp với chunk 2. Nếu người dùng yêu cầu bạn xây dựng cấu hình PC thì hãy đóng giả làm người dùng và yêu cầu chunk 2 lựa chọn cấu hình cụ thể. Hãy mô tả yêu cầu thật rõ ràng. Nếu người dùng không yêu cầu xây dựng cấu hình PC thì trả về 'Empty'.",
  },
  IsRequestingHumanSupport: {
    name: "IsRequestingHumanSupport",
    type: "boolean",
    description:
      "Nếu người dùng yêu cầu gặp tư vấn viên hoặc bạn không thể tự giải quyết vấn đề hãy trả về true để chuyển tiếp cho người thật",
  },
  Summerize: {
    name: "Summerize",
    type: "string",
    description: "Tóm tắt lịch sử cuộc hội thoại ở đây",
  },
  RecommendationQuestion: {
    name: "RecommendationQuestion",
    type: "string",
    description:
      "Gợi ý 3 câu chat tiếp theo người dùng nên chat với bạn, các câu phân tách nhau bằng dấu ///",
  },
};

// Biến string dạng làm phẳng của schema với cấu trúc "name - description"
const Open_Chunk1_Schema_Flattened = Object.entries(Open_Chunk1_Schema)
  .map(([key, value]) => `${key} - ${value.description}`)
  .join("\n");

// Biến object giống schema gốc nhưng bỏ thuộc tính description và name
const Open_Chunk1_Schema_Simple = Object.fromEntries(
  Object.entries(Open_Chunk1_Schema).map(([key, value]) => [
    key,
    { type: value.type },
  ])
);

let Opus_Tunned_Data = "";

// Chunk 2: Nếu người dùng yêu cầu cấu hình PC, sử dụng prompt chaining để tạo cấu hình
// Chunk 2 sẽ nhận thông tin từ chunk 1 và xử lý theo 2-chain prompting
// Chain 1: Dùng OpenRouter (DeepSeek) để dựng cấu hình cơ bản, trả về text thuần
// Chain 2: Dùng Gemini để đánh giá và chuẩn hóa cấu hình từ Chain 1, trả về JSON schema chuẩn

// Chain 1 prefix
const Opus_Chunk2_Chain1_Prefix =
  "Bạn là một chuyên gia xây dựng bộ cấu hình máy tính theo yêu cầu của người dùng. Mỗi bộ có tối đa 10 loại linh kiện là CPU, MainBoard, RAM, VGA, HDD, SSD, Case, PSU, Tản nhiệt khí, tản nhiệt nước. Bạn sẽ nhận được yêu cầu từ người dùng cùng với mong muốn của họ. Hãy tìm kiếm thông tin thật chính xác và trả về các linh kiện mà bạn cho là phù hợp với mong muốn của người dùng.";
const Opus_Chunk2_Chain1_Guide =
  "Hãy trả về kết quả thật ngắn gọn và tuân thủ các bước sau khi lên cấu hình";

const Opus_Chunk2_Chain1_GuideStep = [
  "Hãy chú ý vào mức giá của bộ máy đầu tiên. Nếu người dùng không cung cấp ngân sách, hãy tự đặt ra mức giá dựa trên thông tin khác",
  "\n",
  "Hãy xem xét nhu cầu của người dùng để lựa chọn CPU và VGA phù hợp. Nếu người dùng không yêu cầu đặc biệt về CPU và VGA, hãy đảm bảo giá của CPU cộng VGA trong khoảng 45%-60% giá trị của bộ máy",
  "\n",
  "Tiếp theo, hãy đảm bảo mức giá của MainBoard phù hợp với thế hệ CPU hiện tại. Đảm bảo PSU có công suất phù hợp với VGA và có mức giá trong khoảng 10-20% giá trị của bộ máy",
  "\n",
  "Các linh kiện còn lại bạn hoàn toàn có thể tự tối ưu mức giá và số lượng dựa trên sáng tạo của bạn.",
];

const Opus_Chunk2_Chain1_Guide_After =
  "Chỉ cần trả về danh sách cấu hình, không cần trả về bất kỳ thông tin nào khác. Ví dụ: CPU Intel Core i7-14700K, MainBoard ASRock Z790 Taichi, RAM 16GB, VGA 5060, PSU A650BN, HDD 1TB, SSD 1TB, Case XXX, AirCooler XXX, LiquidCooler XXX";

const Opus_Chunk2_Prefix =
  "Bạn là một bot trong một Promt Chain. Bạn sẽ đóng vai chuyên gia xây dựng bộ cấu hình máy tính theo yêu cầu của người dùng và bạn có thể hiển thị cáu hình đó tới người xem. Bạn sẽ nhận được yêu cầu của người dùng và một bộ cấu hình máy tính mẫu của Promt trước đang xây dựng dựa trên yêu cầu đó. Mỗi bộ có tối đa 10 loại (type) linh kiện là 'CPU', 'MainBoard', 'RAM', 'VGA', 'HDD', 'SSD', 'Case', 'PSU', 'AirCooler', 'LiquidCooler'. Bạn hãy xem lại cấu hình mẫu sau đó đánh giá lại mức độ phù hợp với nhu cầu của người dùng. Nếu bạn thấy có vấn đề với cấu hình đó, hãy chỉnh sửa lại sao cho phù hợp với nhu cầu của người dùng";

const Opus_UpSale_Products_Prefix =
  "Bạn sẽ nhận thêm một danh sách sản phẩm đang cần đẩy mạnh bán hàng. Hãy sử dụng chúng nếu có thể. Nhưng ưu tiên hàng đầu là cấu hình đầu ra đáp ứng đúng yêu cầu và ngân sách của người dùng kể cả phải sử dụng các sản phẩm khác ngoài danh sách này.";
let Opus_UpSale_Products = null;
const Opus_Chunk2_After_Rule =
  "Lưu ý: Bắt buộc về kết quả dạng mảng các object theo và đặt trong thẻ <PC_Components>. Và không được phép để keyword trống. ";

// Schema mới (Bọc thêm 1 lớp object vào mảng schema cũ) - Giúp AI dễ trả về hơn
const Opus_Response_Chunk2_Chain2_Schema_Shorten_New = {
  type: "json_schema",
  json_schema: {
    name: "PCConfigurationResponse",
    strict: true,
    schema: {
      type: "object",
      properties: {
        PC_Components: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
              },
              name: {
                type: "string",
              },
              quantity: {
                type: "string",
              },
              keyword: {
                type: "string",
              },
            },
          },
        },
      },
      required: ["PC_Components"],
      additionalProperties: false,
    },
  },
};

// Schema mới cho Llama 4
const Opus_Response_Chunk2_Chain2_Schema_Shorten = {
  type: "array",
  items: {
    type: "object",
    properties: {
      type: {
        type: "string",
        description: "Loại của vật phẩm",
      },
      name: {
        type: "string",
        description: "Tên của vật phẩm",
      },
      quantity: {
        type: "number",
        description: "Số lượng của vật phẩm",
      },
      keyword: {
        type: "string",
        description: "Từ khóa liên quan đến vật phẩm",
      },
    },
    required: ["type", "name", "quantity", "keyword"],
  },
};

const Opus_Perplexity_Chunk2_Schema_Explain =
  'Hãy trả về cấu hình PC dưới dạng JSON array. Mỗi item trong array có 4 trường: type, name, quantity, keyword. Type gồm: CPU, MainBoard, RAM, VGA, HDD, SSD, Case, PSU, AirCooler, LiquidCooler. Ví dụ format:\n\n[{"type":"CPU","name":"Intel Core i7-14700K","quantity":1,"keyword":"CPU 14700K"},{"type":"VGA","name":"RTX 4060","quantity":1,"keyword":"VGA 4060"}]\n\nChỉ trả về JSON array, không thêm text hay tag nào khác.';

//  Chunk 3: Với kết quả tìm kiếm của chunk 2, Sử dụng hàm GeminiChunk3Builder và searchHacom để tìm kiếm thông tin sản phẩm

const OpenRouter_Schema_System_Guide =
  "You will receive a list of products and their inventory information. Then, the user will send an array containing the names of the products they want to find. Your task is to search for products that exactly match the names requested by the user and return the exact 'productSKU' of those products in an array. If there are multiple products with the same name, select the product with the highest 'quantity' remaining, or, if quantities are equal, choose the one with the lower 'price'. If you cannot find the exact product, please select a product from the inventory with the same key specifications and, preferably, a similar price. If you search carefully and still cannot find the requested product, return an empty string '' in the array. The returned array must have the same order and number of elements as the user's requested array. Below is the inventory list." +
  "\n-----\n" +
  "Always return exact number of products as the user's requested array, do not make up any products or SKU.";

const OpenRouter_Message_Prefix =
  "I am the user and I need to find these following products:";

// Import OpusTunned_Data.txt để lấy dữ liệu huấn luyện bổ sung cho AI
try {
  if (typeof require !== "undefined") {
    Opus_Tunned_Data = fs.readFileSync(
      __dirname + "/OpusTunned_Data.txt",
      "utf-8"
    );
    Opus_UpSale_Products = fs.readFileSync(
      __dirname + "/UpSale-Components.txt",
      "utf-8"
    );
  }
} catch (err) {
  Opus_Tunned_Data = "";
  Opus_UpSale_Products = "";
}
// ====== Xử lý requestType: 'SendMessage' ======
async function handleSendMessageRequest(body, res) {
  try {
    // Cờ để bật/tắt tính năng đo độ trễ
    const ENABLE_LATENCY_TRACKING = true;

    const chatHistory = body.chatHistory || [];

    // CHUNK 1: Xử lý ban đầu với OpenRouter để phân loại yêu cầu
    let startTime;
    if (ENABLE_LATENCY_TRACKING) {
      startTime = Date.now();
      console.log("[Opus_MW] Bắt đầu gọi OpenRouter Chunk 1...");
    }

    const chunk1Result = await opusRequestOpenRouter_Chunk1(chatHistory);

    if (ENABLE_LATENCY_TRACKING) {
      const latency = Date.now() - startTime;
      console.log(`[Opus_MW] Tổng thời gian xử lý Chunk 1: ${latency}ms`);
    }

    if (chunk1Result.error) {
      console.error("[Opus_MW] Lỗi từ OpenRouter Chunk 1:", chunk1Result.error);
      res.write(
        JSON.stringify({
          type: "error",
          error: "Không thể xử lý yêu cầu lúc này, vui lòng thử lại sau.",
        }) + "\n"
      );
      res.end();
      return;
    }
    // console.log("[Opus_MW] Chunk 1 chunk1Result:", chunk1Result);

    // Parse lại content nếu là chuỗi JSON
    let chunk1Content = chunk1Result?.choices?.[0]?.message?.content;
    console.log("[Opus_MW] Chunk 1 chunk1Content:", chunk1Content);
    if (typeof chunk1Content === "string") {
      try {
        chunk1Content = JSON.parse(chunk1Content);
        // chunk1Result.choices[0].message.content = chunk1Content;
      } catch (e) {
        // Nếu lỗi parse, giữ nguyên content là string
        console.warn("[Opus_MW] Không thể parse JSON từ Chunk 1 content:", e);
      }
    }

    console.log("[Opus_MW] Kết quả từ OpenRouter Chunk 1:", chunk1Content);

    // Đảm bảo header chunked và content-type
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    // Kiểm tra yêu cầu hỗ trợ từ tư vấn viên
    if (chunk1Content.IsRequestingHumanSupport) {
      // Log cho analytics
      logHumanSupportRequest(
        chatHistory.length > 0
          ? chatHistory[chatHistory.length - 1].content
          : "Unknown request",
        body.userID
      );

      // Tạo response đặc biệt để hiển thị UI human support
      const humanSupportResponse = {
        type: "humanSupport",
        data: {
          Answer: chunk1Content.Answer || "Đang chuyển bạn đến tư vấn viên...",
          IsRequestingHumanSupport: true,
          HumanSupportUI: {
            title: "Chuyển hướng gặp tư vấn viên.",
            message:
              "Không phải mô hình nào cũng hoàn hảo, đôi khi Opus sẽ mắc lỗi. Bạn có thể yêu cầu chat với CSKH hoặc tiếp tục trò chuyện với Opus về lỗi bạn đang gặp phải.",
            primaryButtonText: "Gặp tư vấn viên",
            secondaryButtonText: "Tiếp tục với Opus",
          },
        },
      };

      res.write(JSON.stringify(humanSupportResponse) + "\n");
      if (typeof res.flush === "function") res.flush();
      res.end();
      return;
    }

    // Kiểm tra xem có phải yêu cầu cấu hình PC không
    // Nếu không phải yêu cầu cấu hình PC, trả về kết quả luôn
    res.write(
      JSON.stringify({
        type: "Chunk1Result",
        data: {
          Answer: chunk1Content.Answer,
          rawResult: chunk1Result,
          RecommendationQuestion: chunk1Content.RecommendationQuestion || "",
          // IsRequestingHumanSupport: false,
          IsPC_Selected: chunk1Content.IsPC_Selected,
        },
      }) + "\n"
    );
    if (typeof res.flush === "function") res.flush();

    if (!chunk1Content.IsPC_Selected) {
      res.end();
      return;
    }

    // CHUNK 2: Nếu là yêu cầu cấu hình PC, gọi OpenRouterChunk2Builder để lấy thông tin cấu hình
    if (ENABLE_LATENCY_TRACKING) {
      startTime = Date.now();
      console.log("[Opus_MW] Bắt đầu gọi OpenRouterChunk2Builder Chunk 2...");
    }

    // Lấy thông tin từ PassToChunk2 từ Chunk 1
    const chunk2Message =
      chunk1Content.PassToChunk2 ||
      chatHistory ||
      "Hãy gợi ý một cấu hình PC phù hợp.";

    let systemContent =
      Opus_Chunk2_Chain1_Prefix +
      "\n---\n" +
      Opus_Chunk2_Chain1_Guide +
      "\n" +
      Opus_Chunk2_Chain1_GuideStep +
      "\n---\n" +
      Opus_Chunk2_Chain1_Guide_After;

    // Gọi OpenRouterChunk2Builder với message và system content
    const result = await OpenRouterChunk2Builder(chunk2Message, systemContent);

    if (ENABLE_LATENCY_TRACKING) {
      const latency = Date.now() - startTime;
      console.log(
        `[Opus_MW] Độ trễ của OpenRouterChunk2Builder Chunk 2 (Về đến Chain 1): ${latency}ms`
      );
    }

    if (result.error) {
      console.error(
        "[Opus_MW] Lỗi từ OpenRouterChunk2Builder Chunk 2 (Chain 1):",
        result.error
      );
      res.write(
        JSON.stringify({
          type: "error",
          error: "Không thể tạo cấu hình PC lúc này, vui lòng thử lại sau.",
        }) + "\n"
      );
      res.end();
      return;
    }

    // Parse lại content từ Chunk 2 Chain 1 nếu là chuỗi JSON
    let chain1Result = result?.choices?.[0]?.message?.content;
    if (typeof chain1Result === "string") {
      try {
        // Thử parse nếu là JSON, nhưng không ép buộc vì Chain 1 trả về văn bản thuần
        chain1Result = JSON.parse(chain1Result);
      } catch (e) {
        // Chain 1 trả về dạng văn bản thuần, không cần xử lý
        console.log(
          "[Opus_MW] Chain 1 trả về dạng văn bản thuần:",
          chain1Result
        );
      }
    }

    console.log(
      "[Opus_MW] Kết quả từ OpenRouterChunk2Builder Chunk 2 (Chain 1):",
      chain1Result
    );

    // ===== CHAIN 2: Xử lý kết quả từ Chain 1 =====

    if (ENABLE_LATENCY_TRACKING) {
      startTime = Date.now();
      console.log(
        "[Opus_MW] Bắt đầu gọi OpenRouterChunk2Builder Chunk 2 (Chain 2)..."
      );
    }

    // Chuẩn bị nội dung cho Chain 2
    // Chain 2 nhận cả request ban đầu và cấu hình từ Chain 1
    const chain2Message =
      "Yêu cầu của khách hàng:\n" +
      chunk2Message +
      "\n---\n" +
      "Cấu hình từ Promt trước:\n" +
      (typeof chain1Result === "string"
        ? chain1Result
        : JSON.stringify(chain1Result));

    // System content cho Chain 2
    const chain2SystemContent =
      Opus_Chunk2_Prefix +
      "\n---\n" +
      Opus_UpSale_Products_Prefix +
      "\n" +
      Opus_UpSale_Products +
      "\n---\n" +
      Opus_Chunk2_After_Rule +
      "\n" +
      Opus_Perplexity_Chunk2_Schema_Explain +
      '\n\nVí dụ response hoàn chỉnh:\n<PC_Components>\n[{"type":"CPU","name":"Intel Core i5-12400F","quantity":1,"keyword":"CPU 12400F"},{"type":"MainBoard","name":"MSI B660M PRO-VDH","quantity":1,"keyword":"MainBoard B660M"},{"type":"RAM","name":"Corsair Vengeance LPX 16GB","quantity":1,"keyword":"RAM 16GB"},{"type":"VGA","name":"RTX 4060","quantity":1,"keyword":"VGA 4060"},{"type":"SSD","name":"Samsung 980 500GB","quantity":1,"keyword":"SSD 500GB"},{"type":"PSU","name":"Corsair CV650","quantity":1,"keyword":"PSU 650W"},{"type":"Case","name":"Cooler Master MasterBox Q300L","quantity":1,"keyword":"Case Mini"}]\n</PC_Components>';

    // Gọi OpenRouterChunk2Builder cho Chain 2
    const chain2Result = await OpenRouterChunk2Builder(
      chain2Message,
      chain2SystemContent,
      2
    );

    if (ENABLE_LATENCY_TRACKING) {
      const latency = Date.now() - startTime;
      console.log(
        `[Opus_MW] Độ trễ của OpenRouterChunk2Builder Chunk 2 (Chain 2): ${latency}ms`
      );
    }

    if (chain2Result.error) {
      console.error(
        "[Opus_MW] Lỗi từ OpenRouterChunk2Builder Chunk 2 (Chain 2):",
        chain2Result.error
      );
      res.write(
        JSON.stringify({
          type: "error",
          error: "Không thể tạo cấu hình PC lúc này, vui lòng thử lại sau.",
        }) + "\n"
      );
      res.end();
      return;
    }

    // Parse lại content từ Chain 2 nếu là chuỗi JSON
    let content = chain2Result?.choices?.[0]?.message?.content;
    console.log(
      "[Opus_MW] Kết quả từ OpenRouterChunk2Builder Chunk 2 (Chain 2):",
      typeof content === "string" ? content.substring(0, 100) + "..." : content
    );

    // Kiểm tra xem content đã được xử lý ở hàm OpenRouterChunk2Builder chưa
    // Nếu vẫn là string, kiểm tra thêm một lần nữa
    if (typeof content === "string") {
      console.log("[Opus_MW] Content vẫn là string, kiểm tra thêm lần cuối");

      // Thử parse một lần cuối nếu là JSON string hợp lệ
      try {
        content = JSON.parse(content);
        console.log("[Opus_MW] Đã parse content thành công ở bước cuối");
      } catch (e) {
        console.warn(
          "[Opus_MW] Content không phải JSON hợp lệ, tiếp tục xử lý dạng string"
        );
      }
    }

    console.log("[Opus_MW] Kết quả đã xử lý từ Chain 2:", content);

    // Nếu không có PC_Components hoặc mảng rỗng
    if (!content || (Array.isArray(content) && content.length === 0)) {
      res.write(
        JSON.stringify({
          type: "error",
          data1: chain1Result,
          data2: chain2Result,
          error:
            "Không thể tạo cấu hình PC từ thông tin cung cấp. Vui lòng cung cấp thêm thông tin.",
        }) + "\n"
      );
      res.end();
      return;
    }

    // Gửi kết quả Chunk 2: kết hợp câu trả lời từ Chunk 1 và cấu hình từ Chunk 2
    res.write(
      JSON.stringify({
        type: "Chunk2Result",
        data: {
          // Answer: chunk1Content.Answer,
          // IsPC_Selected: true,
          rawChunk2Result: chain2Result,
          RequestMultipleProductData:
            content && content.PC_Components ? content.PC_Components : content,
        },
      }) + "\n"
    );

    if (typeof res.flushHeaders === "function") res.flushHeaders();
    if (typeof res.flush === "function") res.flush();

    // CHUNK 3: Xử lý tìm kiếm sản phẩm
    // Lấy keyword và name từ PC_Components (dạng object chứa mảng các object)
    console.log(
      "[Opus_MW] Xử lý Chunk 3 | PC_Components - Nay chỉ còn là phần content"
    );
    console.log(
      "[OPUS_DEBUG] Content từ Chunk 2:",
      JSON.stringify(content, null, 2)
    );
    console.log("[OPUS_DEBUG] Type của content:", typeof content);
    console.log("[OPUS_DEBUG] Array.isArray(content):", Array.isArray(content));
    if (Array.isArray(content) && content.length > 0) {
      console.log(
        "[OPUS_DEBUG] Content[0]:",
        JSON.stringify(content[0], null, 2)
      );
      console.log("[OPUS_DEBUG] Type của content[0]:", typeof content[0]);
    }

    let keywords = [];
    let names = [];
    try {
      let productItems = content;

      // Xử lý nếu content vẫn là string (không nên xảy ra sau khi đã xử lý ở Chain 2)
      if (typeof productItems === "string") {
        try {
          productItems = JSON.parse(productItems);
        } catch (e1) {
          try {
            productItems = JSON.parse(productItems.replace(/'/g, '"'));
          } catch (e2) {
            console.warn(
              "[Opus_MW] Không thể parse PC_Components từ string:",
              e2.message
            );
            productItems = {};
          }
        }
      }

      // Trích xuất mảng PC_Components từ object response hoặc từ plain text
      if (
        productItems &&
        typeof productItems === "object" &&
        productItems.PC_Components
      ) {
        productItems = productItems.PC_Components;
        console.log(
          "[Opus_MW] Đã trích xuất PC_Components từ object:",
          productItems
        );
      } else if (typeof productItems === "string") {
        // Nếu là string, thử trích xuất từ PC_Components tag
        const extractedFromTag = extractJSONFromPCComponentsTag(productItems);
        if (extractedFromTag) {
          productItems = extractedFromTag;
          console.log(
            "[Opus_MW] Đã trích xuất PC_Components từ string tag:",
            productItems
          );
        }
      }

      // Xử lý dạng mới - mảng các object
      if (Array.isArray(productItems)) {
        console.log("[OPUS_DEBUG] Đã vào nhánh Array.isArray(productItems)");
        // Kiểm tra xem có phải mảng các object hay không
        if (
          productItems.length > 0 &&
          typeof productItems[0] === "object" &&
          !Array.isArray(productItems[0])
        ) {
          console.log(
            "[OPUS_DEBUG] Đã vào nhánh 'mảng các object' - Gemini format"
          );
          // Dạng mới: mảng các object
          keywords = productItems
            .map((item) => item.keyword || "")
            .filter(Boolean)
            .map((kw) => {
              if (typeof kw !== "string") return kw;
              return kw
                .replace(/\bVGA\b/g, "Card màn hình")
                .replace(/\bMB\b/g, "Mainboard")
                .replace(/\bPSU\b/g, "Nguồn")
                .replace(/\bAirCooler\b/g, "Tản khí")
                .replace(/\bLiquidCooler\b/g, "Tản nước")
                .replace(/\bHDD\b/g, "Ổ cứng HDD")
                .replace(/\bSSD\b/g, "Ổ cứng SSD")
                .replace(/\bRAM\b/g, "RAM Desktop");
            });

          console.log(
            "[OPUS_DEBUG] Raw keywords từ productItems:",
            productItems.map((item) => item.keyword || "")
          );
          names = productItems.map((item) => item.name || "").filter(Boolean);
          console.log(
            "[OPUS_DEBUG] Raw names từ productItems:",
            productItems.map((item) => item.name || "")
          );
        }
        // Nếu là dạng cũ (mảng lồng mảng), chuyển đổi
        else if (productItems.length > 0 && Array.isArray(productItems[0])) {
          console.log("[OPUS_DEBUG] Đã vào nhánh 'mảng lồng mảng' - format cũ");
          keywords = productItems
            .map((item) => (Array.isArray(item) ? item[4] : null))
            .filter(Boolean)
            .map((kw) => {
              if (typeof kw !== "string") return kw;
              return kw
                .replace(/\bVGA\b/g, "Card màn hình")
                .replace(/\bPSU\b/g, "Nguồn")
                .replace(/\bAirCooler\b/g, "Tản khí")
                .replace(/\bLiquidCooler\b/g, "Tản nước")
                .replace(/\bHDD\b/g, "Ổ cứng HDD")
                .replace(/\bSSD\b/g, "Ổ cứng SSD")
                .replace(/\bRAM\b/g, "RAM Desktop");
            });

          names = productItems
            .map((item) => (Array.isArray(item) ? item[1] : null))
            .filter(Boolean);
        } else {
          console.log(
            "[OPUS_DEBUG] productItems là mảng nhưng không match format nào"
          );
          console.log("[OPUS_DEBUG] productItems.length:", productItems.length);
          if (productItems.length > 0) {
            console.log(
              "[OPUS_DEBUG] typeof productItems[0]:",
              typeof productItems[0]
            );
            console.log(
              "[OPUS_DEBUG] Array.isArray(productItems[0]):",
              Array.isArray(productItems[0])
            );
          }
        }
      } else {
        console.log("[OPUS_DEBUG] productItems KHÔNG phải là mảng");
      }

      console.log(
        "[OPUS_DEBUG] Final productItems:",
        JSON.stringify(productItems, null, 2)
      );
      console.log("[OPUS_DEBUG] Type của productItems:", typeof productItems);
      console.log(
        "[OPUS_DEBUG] Array.isArray(productItems):",
        Array.isArray(productItems)
      );
      if (Array.isArray(productItems) && productItems.length > 0) {
        console.log(
          "[OPUS_DEBUG] productItems[0]:",
          JSON.stringify(productItems[0], null, 2)
        );
        console.log(
          "[OPUS_DEBUG] Type của productItems[0]:",
          typeof productItems[0]
        );
        console.log(
          "[OPUS_DEBUG] productItems[0].keyword:",
          productItems[0].keyword
        );
        console.log("[OPUS_DEBUG] productItems[0].name:", productItems[0].name);
      }

      console.log("[OPUS_DEBUG] Extracted keywords:", keywords);
      console.log("[OPUS_DEBUG] Extracted names:", names);
    } catch (e) {
      console.warn("[Opus_MW] Không thể parse PC_Components:", e.message);
    }

    // Chunk 3: Tìm kiếm sản phẩm với searchHacom
    console.log("[Opus_MW] Xử lý Chunk 3 | Từ khóa tìm kiếm:", keywords);
    console.log("[Opus_MW] Xử lý Chunk 3 | Danh sách name:", names);

    if (ENABLE_LATENCY_TRACKING) {
      startTime = Date.now();
      console.log("[Opus_MW] Bắt đầu xử lý Chunk 3...");
    }

    let hacomResults = [];
    let hacomFinalResult = null;

    if (keywords.length > 0 && typeof searchHacom === "function") {
      try {
        hacomResults = await Promise.all(keywords.map(searchHacom));
      } catch (err) {
        hacomResults = [];
        console.error("[Opus_MW] Lỗi khi tìm kiếm Hacom:", err);
      }
    } else {
      console.warn(
        "[Opus_MW] Không có từ khóa tìm kiếm hoặc hàm searchHacom không khả dụng"
      );
    }

    // Gọi Gemini để lấy product ids
    let openRouterResult = null;
    if (hacomResults.length > 0 && typeof GeminiChunk3Builder === "function") {
      try {
        let inventoryList = FilterHacomSearchResult(hacomResults, false);
        console.log(
          "[Opus_MW] Danh sách sản phẩm tìm thấy:",
          inventoryList.length
        );

        if (inventoryList.length === 0) {
          console.warn("[Opus_MW] Không tìm thấy sản phẩm nào từ Hacom");
          // Gửi kết quả trống
          res.write(
            JSON.stringify({
              type: "hacom",
              data: [],
              message:
                "Không tìm thấy sản phẩm phù hợp. Vui lòng thử lại với yêu cầu khác.",
            }) + "\n"
          );
          if (typeof res.flush === "function") res.flush();
          res.end();
          return;
        }

        openRouterResult = await GeminiChunk3Builder(inventoryList, names);
        console.log(
          "[Opus_MW] GeminiChunk3Builder result:",
          openRouterResult.choices[0].message,
          openRouterResult.choices[0].message.content
        );
      } catch (err) {
        openRouterResult = { error: err?.message || err };
        console.error("[Opus_MW] Lỗi khi gọi GeminiChunk3Builder:", err);
      }
    } else {
      console.warn(
        "[Opus_MW] Không có kết quả tìm kiếm từ Hacom hoặc hàm GeminiChunk3Builder không khả dụng"
      );
      // Gửi kết quả trống
      res.write(
        JSON.stringify({
          type: "Chunk3Result",
          data: [],
          message:
            "Không tìm thấy sản phẩm phù hợp. Vui lòng thử lại với yêu cầu khác.",
        }) + "\n"
      );
      if (typeof res.flush === "function") res.flush();
      res.end();
      return;
    }

    let openRouter_ParsedResult = null;
    if (openRouterResult?.choices?.[0]?.message?.content) {
      openRouter_ParsedResult = openRouterResult.choices[0].message.content;
      console.log(
        "[Opus_MW] openRouter_ParsedResult:",
        openRouter_ParsedResult
      );

      if (!Array.isArray(openRouter_ParsedResult)) {
        try {
          openRouter_ParsedResult = JSON.parse(
            openRouterResult.choices[0].message.content
          );
          console.log(
            "[Opus_MW] Đã parse openRouter_ParsedResult thành:",
            openRouter_ParsedResult
          );
        } catch (e) {
          console.error(
            "[Opus_MW] Không thể parse openRouter_ParsedResult:",
            e
          );
          openRouter_ParsedResult = [];
        }
      }

      try {
        if (
          Array.isArray(openRouter_ParsedResult) &&
          openRouter_ParsedResult.length > 0
        ) {
          let RawHacomFinal = await Promise.all(
            openRouter_ParsedResult.map(searchHacom)
          );

          hacomFinalResult = FilterHacomSearchResult(RawHacomFinal, true);
          console.log("[Opus_MW] hacomFinalResult:", hacomFinalResult);
        } else {
          console.warn(
            "[Opus_MW] GeminiChunk3Builder không trả về id sản phẩm nào"
          );
          hacomFinalResult = [];
        }
      } catch (e) {
        console.error("[Opus_MW] Lỗi khi tìm kiếm hacomFinalResult:", e);
        hacomFinalResult = [];
      }
    } else {
      console.warn(
        "[Opus_MW] Không nhận được kết quả hợp lệ từ GeminiChunk3Builder"
      );
      hacomFinalResult = [];
    }

    // Kiểm tra kết quả cuối cùng
    if (!hacomFinalResult || hacomFinalResult.length === 0) {
      console.warn("[Opus_MW] Không có kết quả sản phẩm cuối cùng");
      res.write(
        JSON.stringify({
          type: "Chunk3Result",
          data: [],
          message:
            "Không tìm thấy sản phẩm phù hợp. Vui lòng thử lại với yêu cầu khác.",
        }) + "\n"
      );
      if (typeof res.flush === "function") res.flush();
      res.end();
      return;
    }

    if (ENABLE_LATENCY_TRACKING) {
      const latency = Date.now() - startTime;
      console.log(`[Opus_MW] Tổng thời gian xử lý Chunk 3: ${latency}ms`);
    }

    // Gửi kết quả Chunk 3
    res.write(
      JSON.stringify({
        type: "Chunk3Result",
        data: hacomFinalResult,
      }) + "\n"
    );

    if (typeof res.flush === "function") res.flush();
    res.end();
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi xử lý SendMessage:", err);
    console.log(err);

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

async function searchHacom(pee) {
  const url = "https://apis-web.hacom.vn/api-client/api/v1/TblItemV/get-list";
  const payload = {
    isCount: false,
    SearchModel: {
      keySearch: pee,
      skip: 0,
      take: 3,
      attIds: [],
    },
  };

  console.log(`[Opus_MW] searchHacom tìm kiếm: "${pee}"`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`[Opus_MW] searchHacom lỗi HTTP: ${response.status}`);
    throw new Error("Network response was not ok");
  }

  const result = await response.json();
  console.log(`[Opus_MW] searchHacom response cho "${pee}":`, {
    success: result.success,
    httpStatusCode: result.httpStatusCode,
    dataLength: result.data ? result.data.length : 0,
    totalCount: result.totalCount,
    // // Log 1 sản phẩm đầu tiên để xem structure
    // firstItem: result.data && result.data.length > 0 ? result.data[0] : null,
  });

  return result;
}

// [DEPRECATED for Chunk 3] Hàm này đã được thay thế bởi GeminiChunk3Builder cho Chunk 3
// Giữ lại để backward compatibility với các module khác

// Hàm request Gemini cho chunk3 - tìm kiếm product SKU
async function GeminiChunk3Builder(inventoryList, userRequestList) {
  const model = "gemini-2.5-flash-lite-preview-06-17";
  const api = "generateContent";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${api}?key=${GEMINI_API_KEY2}`;

  // Chuẩn bị system content giống như OpenRouter
  const systemContent =
    OpenRouter_Schema_System_Guide +
    "\n" +
    Opus_UpSale_Products +
    "\n" +
    (typeof inventoryList === "string"
      ? inventoryList
      : JSON.stringify(inventoryList));

  const userContent =
    OpenRouter_Message_Prefix +
    "\n" +
    (typeof userRequestList === "string"
      ? userRequestList
      : JSON.stringify(userRequestList));

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: userContent,
          },
        ],
      },
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: "application/json",
      systemInstruction: [
        {
          text: systemContent,
        },
      ],
      responseSchema: {
        type: "array",
        items: {
          type: "string",
          description: "Product SKU",
        },
        description: "Array of product SKU(s) that you want to select",
      },
    },
  };

  try {
    const startTime = Date.now();
    console.log("[Opus_MW] Bắt đầu gọi Gemini Chunk 3...");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log(
      "Hoàn thành get data Gemini Chunk 3",
      `Độ trễ: ${latency}ms`,
      data.candidates?.[0]?.content?.parts?.[0]?.text
    );

    // Xử lý response từ Gemini - trả về format tương tự OpenRouter
    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
    ) {
      let content = data.candidates[0].content.parts[0].text;

      // Gemini trả về JSON trực tiếp, parse luôn
      try {
        const jsonContent = JSON.parse(content);
        console.log("[Opus_MW] Đã parse JSON từ Gemini Chunk 3 thành công");

        // Format lại để tương thích với logic hiện tại
        return {
          choices: [
            {
              message: {
                content: jsonContent,
              },
            },
          ],
        };
      } catch (e) {
        console.error("[Opus_MW] Lỗi parse JSON từ Gemini Chunk 3:", e.message);
        console.error("[Opus_MW] Raw content:", content);
        return { error: "Lỗi parse JSON từ Gemini Chunk 3: " + e.message };
      }
    } else {
      console.error("[Opus_MW] Gemini Chunk 3 response không đúng format");
      return { error: "Gemini Chunk 3 response không đúng format" };
    }

    latency = Date.now() - startTime;
    console.log(
      `[Opus_MW] Tổng thời gian xử lý GeminiChunk3Builder: ${latency}ms`
    );
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi gọi GeminiChunk3Builder:", err);
    return { error: "Lỗi request GeminiChunk3Builder: " + err };
  }
}

// Hàm request Gemini cho chain2 của Chunk 2
async function GeminiChunk2Builder(inputData, systemContent) {
  const model = "gemini-2.5-flash-lite-preview-06-17";
  const api = "generateContent";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${api}?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              typeof inputData === "string"
                ? inputData
                : JSON.stringify(inputData),
          },
        ],
      },
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: "application/json",
      systemInstruction: [
        {
          text: systemContent,
        },
      ],
      responseSchema: {
        type: "array",
        items: {
          type: "object",
          required: ["type", "name", "quantity", "keyword"],
          properties: {
            type: {
              type: "string",
              description: "Loại của vật phẩm",
            },
            name: {
              type: "string",
              description: "Tên của vật phẩm",
            },
            quantity: {
              type: "number",
              description: "Số lượng của vật phẩm",
            },
            keyword: {
              type: "string",
              description: "Từ khóa liên quan đến vật phẩm",
            },
          },
        },
      },
    },
  };

  try {
    const startTime = Date.now();
    console.log("[Opus_MW] Bắt đầu gọi Gemini Chain 2...");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log(
      "Hoàn thành get data Gemini Chain 2",
      `Độ trễ: ${latency}ms`,
      data.candidates?.[0]?.content?.parts?.[0]?.text
    );

    // Xử lý response từ Gemini - trả về format tương tự OpenRouter
    if (
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
    ) {
      let content = data.candidates[0].content.parts[0].text;

      // Gemini trả về JSON trực tiếp, parse luôn
      try {
        const jsonContent = JSON.parse(content);
        console.log("[Opus_MW] Đã parse JSON từ Gemini Chain 2 thành công");

        // Format lại để tương thích với logic hiện tại
        return {
          choices: [
            {
              message: {
                content: jsonContent,
              },
            },
          ],
        };
      } catch (e) {
        console.error("[Opus_MW] Lỗi parse JSON từ Gemini Chain 2:", e.message);
        console.error("[Opus_MW] Raw content:", content);
        return { error: "Lỗi parse JSON từ Gemini Chain 2: " + e.message };
      }
    } else {
      console.error("[Opus_MW] Gemini Chain 2 response không đúng format");
      return { error: "Gemini Chain 2 response không đúng format" };
    }

    latency = Date.now() - startTime;
    console.log(
      `[Opus_MW] Tổng thời gian xử lý GeminiChunk2Builder: ${latency}ms`
    );
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi gọi GeminiChunk2Builder:", err);
    return { error: "Lỗi request GeminiChunk2Builder: " + err };
  }
}

// Hàm request OpenRouter với model deepseek cho chain1 của Chunk 2
async function OpenRouterChunk2Builder(
  inputData,
  systemContent,
  chainPhase = 1
) {
  // Với chainPhase === 2, sử dụng Gemini thay vì OpenRouter
  if (chainPhase === 2) {
    console.log("[Opus_MW] Chain 2 - Sử dụng Gemini thay vì OpenRouter");
    return await GeminiChunk2Builder(inputData, systemContent);
  }

  // Với chainPhase === 1, giữ nguyên logic OpenRouter
  console.log("[Opus_MW] Chain 1 - Sử dụng OpenRouter");
  const url = "https://openrouter.ai/api/v1/chat/completions";

  // Cấu hình cho Chain 1 (DeepSeek)
  const chain1Config = {
    // model: "deepseek/deepseek-r1-distill-llama-70b:free",
    model: "deepseek/deepseek-r1-0528-qwen3-8b:free",
    // model: "tngtech/deepseek-r1t-chimera:free",
    max_tokens: 5000,
    reasoning: {
      max_tokens: 5000,
    },
    provider: {
      sort: "throughput",
    },
  };

  let selectedConfig = chain1Config;

  let payload = {
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content:
          typeof inputData === "string" ? inputData : JSON.stringify(inputData),
      },
    ],
    ...selectedConfig,
  };

  try {
    const startTime = Date.now();
    // console.log(
    //   "[Opus_MW]Đang xử lý chunk 2:",
    //   inputData.slice(0, 12) + "...",
    //   systemContent.slice(0, 30) + "..."
    // );

    // khi là Chain 2 hãy nhận dạng ```json```
    // if (chainPhase === 2) {
    // Đoạn code này sẽ được di chuyển xuống sau khi gọi API
    // Nơi đây chỉ nên thực hiện các cấu hình trước khi gọi API
    // }

    let res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY2,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;

    let data = await res.json();
    console.log(
      "Hoàn Thành get data chunk 2",
      `Độ trễ: ${latency}ms`,
      data.choices?.[0]?.message,
      data.choices?.[0]?.message?.content
    );

    // Xử lý kết quả trả về cho Chain 1 (chỉ còn xử lý Chain 1 vì Chain 2 đã chuyển sang Gemini)
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      let content = data.choices[0].message.content;

      // Với Chain 1, thử parse nếu có thể
      try {
        const jsonContent = JSON.parse(content);
        data.choices[0].message.content = jsonContent;
        console.log("[Opus_MW] Đã xử lý content Chain 1 thành công");
      } catch (e) {
        // Không có vấn đề nếu không parse được - chain 1 có thể trả về text
        console.log(
          "[Opus_MW] Chain 1 trả về nội dung không phải JSON:",
          content.substring(0, 100) + "..."
        );
      }
    }

    latency = Date.now() - startTime;
    console.log(
      `[Opus_MW] Tổng thời gian xử lý OpenRouterChunk2Builder (Chain 1): ${latency}ms`
    );
    return data;
  } catch (err) {
    console.error(
      "[Opus_MW] Lỗi khi gọi OpenRouterChunk2Builder (Chain 1):",
      err
    );
    return { error: "Lỗi request OpenRouterChunk2Builder (Chain 1): " + err };
  }
}

// Lọc dữ liệu Hacom từ API mới, chỉ giữ các trường itemName và sku
function FilterHacomSearchResult(rawData, requireImage) {
  // console.log("[Opus_MW] FilterHacomSearchResult nhận rawData:", rawData);

  if (!Array.isArray(rawData)) {
    console.warn("[Opus_MW] rawData không phải là mảng:", typeof rawData);
    return [];
  }

  let allProducts = [];

  // Duyệt qua từng response từ các search calls
  rawData.forEach((response, index) => {
    // console.log(`[Opus_MW] Xử lý response ${index}:`, response);

    if (
      response &&
      typeof response === "object" &&
      response.success &&
      Array.isArray(response.data)
    ) {
      console.log(
        `[Opus_MW] Response ${index} có ${response.data.length} sản phẩm`
      );

      // Lấy từng sản phẩm từ response.data và chỉ giữ itemName và sku
      const products = response.data
        .filter(
          (item) =>
            item && typeof item === "object" && (item.itemName || item.sku)
        )
        .map((item) => ({
          productSKU: item.sku || "",
          productName: item.itemName || "",
          price: item.unitSellingPrice || "",
          imageURL: requireImage ? item.primaryImage || "" : "",
        }));

      allProducts = allProducts.concat(products);
      console.log(
        `[Opus_MW] Đã thêm ${products.length} sản phẩm từ response ${index}`
      );
    } else {
      console.warn(
        `[Opus_MW] Response ${index} không hợp lệ hoặc không có data:`,
        response
      );
    }
  });

  console.log(
    `[Opus_MW] Tổng cộng có ${allProducts.length} sản phẩm sau khi filter`
  );
  return allProducts;
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

// ====== OPENROUTER REQUEST FUNCTIONS - CHUNK 1 ======
async function opusRequestOpenRouter_Chunk1(chatLog) {
  // Chuẩn bị chat history theo định dạng chuẩn cho OpenRouter
  let chatHistory = [];
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

  const messages = [
    {
      role: "system",
      content:
        Open_Chunk1_Schema_Prefix +
        "\n---\n" +
        "Hãy trả lời theo schema sau:\n" +
        Open_Chunk1_Schema_Flattened +
        "\n---\n" +
        Opus_Tunned_Data,
    },
    ...chatHistory,
  ];

  // Giảm log để cải thiện hiệu suất
  console.log(
    "[Opus_MW] Messages cho OpenRouter Chunk 1:",
    chatHistory.length,
    "tin nhắn"
  );

  // Chuẩn bị payload cho OpenRouter API
  const payload = {
    model: "meta-llama/llama-4-maverick:free",
    //model: "meta-llama/llama-4-scout:free",

    messages: messages,
    provider: {
      order: ["chutes/fp8", "meta/fp8", "chutes/bf16"],
      //   sort: "throughput",
    },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Chunk1Result",
        strict: true,
        schema: {
          type: "object",
          properties: Open_Chunk1_Schema_Simple,
          required: [
            "Chunk1Result",
            "Answer",
            "IsRequestingHumanSupport",
            "IsPC_Selected",
            "PassToChunk2",
            "RecommendationQuestion",
          ],
          additionalProperties: false,
        },
      },
    },
  };

  // Gọi OpenRouter API
  const url = "https://openrouter.ai/api/v1/chat/completions";
  let res = null;
  try {
    console.log("[Opus_MW] Gửi request Chunk 1 tới OpenRouter...");
    const startTime = Date.now(); // Đo thời gian xử lý

    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;

    const data = await res.json(); // Đã sửa từ res.json() thành await res.json()
    console.log(
      `[Opus_MW] Độ trễ của OpenRouter Chunk 1-Bước1: ${latency}ms`,
      data.choices?.[0]?.message?.content,
      data
    );

    return data;
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi gọi OpenRouter Chunk 1:", err, res);
    return { error: "Lỗi request OpenRouter Chunk 1: " + err };
  }
}

// Hàm làm sạch JSON trước khi parse
function sanitizeJSON(jsonString) {
  if (typeof jsonString !== "string") return jsonString;

  // Loại bỏ BOM và các ký tự điều khiển
  let cleanString = jsonString
    .replace(/^\uFEFF/, "") // Remove BOM
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ""); // Remove control characters

  // Xử lý các dấu phẩy trùng lặp trong JSON
  cleanString = cleanString
    .replace(/,\s*,/g, ",") // Thay thế các dấu phẩy liên tiếp
    .replace(/,\s*\}/g, "}") // Loại bỏ dấu phẩy trước dấu đóng ngoặc
    .replace(/,\s*\]/g, "]"); // Loại bỏ dấu phẩy trước dấu đóng ngoặc vuông

  // Xử lý các chuỗi không được đóng đúng cách
  let openQuotes = false;
  let escapedChar = false;
  let result = "";

  for (let i = 0; i < cleanString.length; i++) {
    let char = cleanString[i];

    if (char === "\\" && !escapedChar) {
      escapedChar = true;
      result += char;
      continue;
    }

    if (char === '"' && !escapedChar) {
      openQuotes = !openQuotes;
    }

    if (escapedChar) {
      escapedChar = false;
    }

    result += char;
  }

  // Đóng các chuỗi chưa đóng
  if (openQuotes) {
    result += '"';
  }

  return result;
}

// Hàm trích xuất JSON từ văn bản bằng regex
function extractJSONFromText(text) {
  if (typeof text !== "string") return null;

  try {
    // Tìm tất cả các đối tượng JSON có thể có trong văn bản
    const matches = text.match(
      /\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g
    );

    if (matches && matches.length > 0) {
      // Thử parse từng đối tượng tìm thấy
      for (const match of matches) {
        try {
          const obj = JSON.parse(match);
          // Kiểm tra xem đối tượng có các trường cần thiết không
          if (obj.Answer !== undefined && obj.IsPC_Selected !== undefined) {
            return obj;
          }
        } catch (e) {
          continue; // Thử đối tượng tiếp theo nếu parse thất bại
        }
      }
    }

    return null;
  } catch (e) {
    console.error("[Opus_MW] Lỗi khi trích xuất JSON từ văn bản:", e.message);
    return null;
  }
}

// Hàm trích xuất JSON từ thẻ <PC_Components>
function extractJSONFromPCComponentsTag(text) {
  if (typeof text !== "string") return null;

  try {
    console.log("[Opus_MW] Bắt đầu trích xuất từ PC_Components tag:", text);

    // Tìm nội dung trong thẻ <PC_Components>...</PC_Components>
    const pcComponentsRegex =
      /<PC_Components>\s*([\s\S]*?)\s*<\/PC_Components>/i;
    const match = text.match(pcComponentsRegex);

    if (match && match[1]) {
      const jsonText = match[1].trim();
      console.log(
        "[Opus_MW] Tìm thấy nội dung trong PC_Components tag:",
        jsonText
      );

      try {
        const jsonContent = JSON.parse(jsonText);
        console.log("[Opus_MW] Đã parse JSON thành công từ PC_Components tag");
        return jsonContent;
      } catch (e) {
        console.warn(
          "[Opus_MW] Lỗi parse JSON từ PC_Components tag:",
          e.message
        );
        // Thử clean và parse lại
        try {
          const cleanedJson = jsonText
            .replace(/'/g, '"') // Thay ' thành "
            .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Thêm quotes cho keys
            .replace(/:\s*([^",{\[\]}\s]+?)(\s*[,}\]])/g, ':"$1"$2'); // Thêm quotes cho values

          const jsonContent = JSON.parse(cleanedJson);
          console.log(
            "[Opus_MW] Đã parse JSON sau khi clean từ PC_Components tag"
          );
          return jsonContent;
        } catch (e2) {
          console.warn("[Opus_MW] Vẫn lỗi sau khi clean:", e2.message);
        }
      }
    }

    // Fallback: Tìm JSON array trực tiếp trong text
    const arrayMatch = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      try {
        const jsonContent = JSON.parse(arrayMatch[0]);
        console.log("[Opus_MW] Đã trích xuất mảng JSON fallback thành công");
        return jsonContent;
      } catch (e) {
        console.warn("[Opus_MW] Lỗi parse mảng JSON fallback:", e.message);
      }
    }

    console.log("[Opus_MW] Không tìm thấy PC_Components tag hoặc JSON hợp lệ");
    return null;
  } catch (e) {
    console.error(
      "[Opus_MW] Lỗi khi trích xuất từ PC_Components tag:",
      e.message
    );
    return null;
  }
}

// Hàm trích xuất JSON từ code block ```json``` (giữ lại để backward compatibility)
function extractJSONFromCodeBlock(text) {
  if (typeof text !== "string") return null;

  try {
    console.log(
      "[Opus_MW] Bắt đầu trích xuất JSON từ:",
      text.substring(0, 100) + "..."
    );

    // Tìm JSON trong code block ```json ... ```
    // Sử dụng regex lỏng lẻo hơn để khớp với nhiều kiểu code block hơn
    const jsonBlockRegexes = [
      /```json\s*([\s\S]*?)\s*```/i, // Chuẩn ```json ... ```
      /```\s*([\s\S]*?)\s*```/, // Bất kỳ code block ``` ... ```
      /`{3,}(\s*json)?\s*([\s\S]*?)\s*`{3,}/i, // Linh hoạt với số lượng backticks
    ];

    // Thử từng regex cho đến khi tìm thấy match
    let jsonContent = null;
    for (const regex of jsonBlockRegexes) {
      const match = text.match(regex);
      if (match) {
        // Lấy nhóm đầu tiên có nội dung
        const jsonText = match[1]?.includes("{") ? match[1] : match[2];
        if (jsonText) {
          try {
            jsonContent = JSON.parse(jsonText.trim());
            console.log(
              "[Opus_MW] Đã trích xuất JSON từ code block với regex:",
              regex
            );
            return jsonContent;
          } catch (e) {
            console.warn(
              "[Opus_MW] Lỗi parse JSON từ code block với regex:",
              regex,
              e.message
            );
            // Tiếp tục thử regex tiếp theo
          }
        }
      }
    }

    // Nếu không tìm thấy code block, thử tìm JSON trực tiếp
    // Tìm mảng JSON trong văn bản
    const arrayMatch = text.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (arrayMatch) {
      try {
        jsonContent = JSON.parse(arrayMatch[0]);
        console.log("[Opus_MW] Đã trích xuất mảng JSON thành công");
        return jsonContent;
      } catch (e) {
        console.warn("[Opus_MW] Lỗi parse mảng JSON:", e.message);
      }
    }

    // Thử tìm object JSON đơn lẻ
    const objectMatch = text.match(/\{[\s\S]*?\}/);
    if (objectMatch) {
      try {
        jsonContent = JSON.parse(objectMatch[0]);
        console.log("[Opus_MW] Đã trích xuất object JSON thành công");
        return jsonContent;
      } catch (e) {
        console.warn("[Opus_MW] Lỗi parse object JSON:", e.message);
      }
    }

    console.log("[Opus_MW] Không tìm thấy JSON hợp lệ trong text");
    return null;
  } catch (e) {
    console.error(
      "[Opus_MW] Lỗi khi trích xuất JSON từ code block:",
      e.message
    );
    return null;
  }
}

// Thêm hàm log analytics
function logHumanSupportRequest(userRequest, userID) {
  const timestamp = new Date().toISOString();
  const logData = {
    event: "human_support_requested",
    timestamp,
    userID: userID || "unknown",
    userRequest:
      typeof userRequest === "string"
        ? userRequest
        : JSON.stringify(userRequest),
  };

  console.log("[ANALYTICS] Human support requested:", logData);

  // TODO: Gửi log tới hệ thống monitoring/analytics nếu có
  // Ví dụ: gửi tới Google Analytics, Firebase Analytics, v.v.
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
