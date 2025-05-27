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
  PassToPerplexity: {
    name: "PassToPerplexity",
    type: "string",
    description:
      "Đây là trường để giao tiếp với chunk 2. Nếu người dùng yêu cầu bạn xây dựng cấu hình PC thì hãy giả làm người dùng và yêu cầu chunk 2 lựa chọn cấu hình cụ thể (mục đích, mức giá, yêu cầu đặc biệt nếu có). Nếu người dùng không yêu cầu xây dựng cấu hình PC thì trả về 'Empty'",
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
      "Gợi ý 3 câu hỏi tiếp theo cho người dùng, các câu hỏi phân tách nhau bằng dấu &nbsp*&nbsp",
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

// Chunk 2: Nếu người dùng yêu cầu cấu hình PC, sử dụng perplexity để tìm kiếm cấu hình phù hợp
// Chunk 2 sẽ nhận thông tin từ chunk 1 và sử dụng Perplexity để tìm kiếm cấu hình phù hợp
// Chunk 2 sẽ hoạt động dưới phương thức Prompt Chaining để tăng cường độ chính xác và tính tương tác. Chain 1 sẽ có chức năng dựng cấu hình cơ bản nhưng không cần trả về theo schema. Chain 2 sẽ đánh giá lại cấu hình kết quả của chain 1, chỉnh sửa nếu cần và tổng hợp trả về theo schema. Cả 2 chain đều sử dụng chung một mô hình thông qua OpenRouterChunk2Builder nhưng sẽ có phần system content khác nhau.

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
  "Lưu ý: Bắt buộc về kết quả theo schema và chỉ schema, không thêm thông tin nào khác.";
const Opus_Response_Schema_Shorten = {
  type: "object",
  properties: {
    RequestMultipleProductData: { type: "array" },
  },
  required: ["RequestMultipleProductData"],
}; // Schema cho chunk 2 cũ

// Schema mới cho Llama 4 Maverick
const Opus_Response_Chunk2_Chain2_Schema_Shorten = {
  type: "json_schema",
  json_schema: {
    name: "RequestMultipleProductData",
    strict: true,
    schema: {
      type: "array",
      description: "Đây là RequestMultipleProductData",
    },
  },
  required: ["RequestMultipleProductData"],
};

const Opus_Perplexity_Chunk2_Schema_Explain =
  "RequestMultipleProductData là 1 mảng để bạn trả về cấu hình mà bạn đang muốn hiện thị. Hãy trả về dạng mảng các object [{type, name, quantity, keyword}, ...], trong đó mỗi object đại diện cho một linh kiện. Type gồm 1 trong 10 loại linh kiện. Name là tên sản phẩm, ví dụ `CPU Intel Core i7-14700K`, `MainBoard ASRock Z790 Taichi`. Quantity là số lượng sản phẩm bạn muốn đưa vào cấu hình. Keyword để tìm kiếm sản phẩm trong kho là một cụm từ khóa thật ngắn gọn - kết hợp giữa type và thông số nổi bật hoặc tên mã sản phẩm, ví dụ 'CPU 14700K', 'MainBoard Z790', 'RAM 16GB', 'VGA 5060', 'PSU A650BN'.";

//  Chunk 3: Với kết quả tìm kiếm của chunk 2, Sử dụng hàm OpenRouter thứ 2 và searchHacom để tìm kiếm thông tin sản phẩm

const OpenRouter_Schema_System_Guide =
  "You will receive a list of products and their inventory information. Then, the user will send an array containing the names of the products they want to find. Your task is to search for products that exactly match the names requested by the user and return the exact 'productSKU' of those products in an array. If there are multiple products with the same name, select the product with the highest 'quantity' remaining, or, if quantities are equal, choose the one with the lower 'price'. If you cannot find the exact product, please select a product from the inventory with the same key specifications and, preferably, a similar price. If you search carefully and still cannot find the requested product, return an empty string '' in the array. The returned array must have the same order and number of elements as the user's requested array. Below is the inventory list.";

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
      __dirname + "/UpSale-Components.json",
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

    // Lấy thông tin từ PassToPerplexity từ Chunk 1
    const chunk2Message =
      chunk1Content.PassToPerplexity ||
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
      (typeof Opus_UpSale_Products === "string"
        ? Opus_UpSale_Products
        : JSON.stringify(Opus_UpSale_Products)) +
      "\n---\n" +
      Opus_Chunk2_After_Rule +
      "\n" +
      Opus_Perplexity_Chunk2_Schema_Explain;

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
    let content = await chain2Result?.choices?.[0]?.message?.content;
    console.log(
      "[Opus_MW] Kết quả raw từ OpenRouterChunk2Builder Chunk 2 (Chain 2):",
      content
    );
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
        // chain2Result.choices[0].message.content = content;
      } catch (e) {
        console.warn(
          "[Opus_MW] Không thể parse JSON từ Chunk 2 (Chain 2) content:",
          e
        );
      }
    }
    console.log(
      "[Opus_MW] Kết quả đã xử lý từ OpenRouterChunk2Builder Chunk 2 (Chain 2):",
      content,
      chain2Result
    );
    // Nếu không có RequestMultipleProductData hoặc mảng rỗng
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
          RequestMultipleProductData: content,
        },
      }) + "\n"
    );

    if (typeof res.flushHeaders === "function") res.flushHeaders();
    if (typeof res.flush === "function") res.flush();

    // CHUNK 3: Xử lý tìm kiếm sản phẩm
    // Lấy keyword và name từ RequestMultipleProductData (dạng mảng các object)
    console.log(
      "[Opus_MW] Xử lý Chunk 3 | RequestMultipleProductData - Nay chỉ còn là phần content"
    );
    let keywords = [];
    let names = [];
    try {
      let productItems = content;

      // Xử lý nếu RequestMultipleProductData là string
      if (typeof productItems === "string") {
        try {
          productItems = JSON.parse(productItems);
        } catch (e1) {
          try {
            productItems = JSON.parse(productItems.replace(/'/g, '"'));
          } catch (e2) {
            console.warn(
              "[Opus_MW] Không thể parse RequestMultipleProductData từ string:",
              e2
            );
            productItems = [];
          }
        }
      }

      // Xử lý dạng mới - mảng các object
      if (Array.isArray(productItems)) {
        // Kiểm tra xem có phải mảng các object hay không
        if (
          productItems.length > 0 &&
          typeof productItems[0] === "object" &&
          !Array.isArray(productItems[0])
        ) {
          // Dạng mới: mảng các object
          keywords = productItems
            .map((item) => item.keyword || "")
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

          names = productItems.map((item) => item.name || "").filter(Boolean);
        }
        // Nếu là dạng cũ (mảng lồng mảng), chuyển đổi
        else if (productItems.length > 0 && Array.isArray(productItems[0])) {
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
        }
      }
    } catch (e) {
      console.warn("[Opus_MW] Không thể parse RequestMultipleProductData:", e);
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

    // Gọi OpenRouter để lấy product ids
    let openRouterResult = null;
    if (
      hacomResults.length > 0 &&
      typeof opusRequestOpenRouter === "function"
    ) {
      try {
        let inventoryList = FilterHacomSearchResult(hacomResults);
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

        openRouterResult = await opusRequestOpenRouter(inventoryList, names);
        console.log("[Opus_MW] openRouterResult:", openRouterResult);
      } catch (err) {
        openRouterResult = { error: err?.message || err };
        console.error("[Opus_MW] Lỗi khi gọi OpenRouter Chunk 3:", err);
      }
    } else {
      console.warn(
        "[Opus_MW] Không có kết quả tìm kiếm từ Hacom hoặc hàm opusRequestOpenRouter không khả dụng"
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
          hacomFinalResult = await Promise.all(
            openRouter_ParsedResult.map(searchHacom)
          );
        } else {
          console.warn("[Opus_MW] OpenRouter không trả về id sản phẩm nào");
          hacomFinalResult = [];
        }
      } catch (e) {
        console.error("[Opus_MW] Lỗi khi tìm kiếm hacomFinalResult:", e);
        hacomFinalResult = [];
      }
    } else {
      console.warn("[Opus_MW] Không nhận được kết quả hợp lệ từ OpenRouter");
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

// ====== PERPLEXITY REQUEST FUNCTIONS - CHUNK 2 ======
async function opusRequestPerplexity(passToPerplexityMessage) {
  // Đo thời gian để kiểm tra hiệu suất
  const startTime = Date.now();
  console.log("[Opus_MW] Gửi request Chunk 2 tới Perplexity...");

  // Chuẩn bị system prompt đơn giản hơn, chỉ tập trung vào việc tạo cấu hình
  const systemPromptParts = [
    Opus_Chunk2_Prefix,
    Opus_Perplexity_Chunk2_Schema_Explain,
    Opus_UpSale_Products_Prefix + "/n" + typeof Opus_UpSale_Products ===
    "string"
      ? Opus_UpSale_Products
      : JSON.stringify(Opus_UpSale_Products),
  ];
  const systemPrompt = systemPromptParts.join("\n---\n");

  // Tạo message đơn giản, chỉ gồm system prompt và yêu cầu từ Chunk 1
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: passToPerplexityMessage },
  ];

  console.log(
    "[Opus_MW] Yêu cầu cấu hình từ Chunk 1:",
    passToPerplexityMessage
  );

  // Chuẩn bị payload cho Perplexity API
  const payload = {
    model: "sonar",
    messages: messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        schema: Opus_Response_Schema_Shorten,
      },
    },
  };

  // Gọi Perplexity API
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

    // Tính toán độ trễ
    const latency = Date.now() - startTime;
    console.log(`[Opus_MW] Độ trễ của Perplexity API: ${latency}ms`);

    // Kiểm tra và parse response
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      let content = data.choices[0].message.content;

      // Nếu content là string, thử parse thành JSON
      if (typeof content === "string") {
        try {
          content = JSON.parse(content);
          // Kiểm tra RequestMultipleProductData
          if (content.RequestMultipleProductData) {
            if (typeof content.RequestMultipleProductData === "string") {
              try {
                content.RequestMultipleProductData = JSON.parse(
                  content.RequestMultipleProductData
                );
              } catch (e) {
                // Nếu không parse được, giữ nguyên string
                console.warn(
                  "[Opus_MW] Không thể parse RequestMultipleProductData:",
                  e
                );
              }
            }
          }
          data.choices[0].message.content = content;
        } catch (e) {
          console.warn("[Opus_MW] Không thể parse JSON từ Perplexity:", e);
        }
      }
    }

    return data;
  } catch (err) {
    console.error("[Opus_MW] Lỗi request Perplexity:", err);
    return { error: "Lỗi request Perplexity: " + err };
  }
}

async function searchHacom(pee) {
  const params = new URLSearchParams({
    action: "search",
    action_type: "search",
    q: pee,
    limit: 5,
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
    // model: "deepseek/deepseek-v3-base:free",
    // model: "meta-llama/llama-4-scout:free",
    model: "meta-llama/llama-4-maverick:free",

    messages: [
      {
        role: "system",
        content:
          OpenRouter_Schema_System_Guide +
          "\n" +
          (typeof Opus_UpSale_Products === "string"
            ? Opus_UpSale_Products
            : JSON.stringify(Opus_UpSale_Products)) +
          "\n" +
          (typeof inventoryList === "string"
            ? inventoryList
            : JSON.stringify(inventoryList)),
      },
      {
        role: "user",
        content:
          OpenRouter_Message_Prefix +
          "\n" +
          (typeof userRequestlist === "string"
            ? userRequestlist
            : JSON.stringify(userRequestlist)),
      },
    ],
    provider: {
      sort: "throughput",
    },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "product_ids",
        strict: true,
        schema: {
          type: "array",
          description: "Array of product SKU(s) that you want to select",
        },
      },
      required: ["product_ids"],
    },
  };
  // console.log(
  //   "[Opus_MW] Payload gửi đến OpenRouter line316:",
  //   payload.messages[0].content,
  //   payload.messages[1].content
  // );
  try {
    const startTime = Date.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    const latency = Date.now() - startTime;
    console.log(`[Opus_MW] Độ trễ của opusRequestOpenRouter: ${latency}ms`);

    // Xử lý parse JSON nếu cần
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      try {
        let content = data.choices[0].message.content;
        // Thử parse nếu là string
        if (typeof content === "string") {
          data.choices[0].message.content = JSON.parse(content);
        }
      } catch (e) {
        console.warn(
          "[Opus_MW] Không thể parse JSON từ opusRequestOpenRouter:",
          e
        );
        // Giữ nguyên content nếu parse thất bại
      }
    }

    return data;
  } catch (err) {
    console.error("[Opus_MW] Lỗi request OpenRouter:", err);
    return { error: "Lỗi request OpenRouter: " + err };
  }
}

// Hàm request OpenRouter với model deepseek cho chain1 của Chunk 2
async function OpenRouterChunk2Builder(
  inputData,
  systemContent,
  chainPhase = 1
) {
  // console.log("[Opus_MW] Bắt đầu gọi OpenRouterChunk2Builder...");
  const url = "https://openrouter.ai/api/v1/chat/completions";

  // Cấu hình cơ bản cho Chain 1 (Phi-4)
  const chain1Config = {
    model: "deepseek/deepseek-r1-distill-llama-70b:free",
    // model: "tngtech/deepseek-r1t-chimera:free",
    max_tokens: 5000,
    reasoning: {
      max_tokens: 5000,
    },
    provider: {
      sort: "throughput",
    },
  };

  // Cấu hình cơ bản cho Chain 2 (Llama-4)
  const chain2Config = {
    // model: "meta-llama/llama-4-maverick:free",
    model: "meta-llama/llama-4-scout:free",
    // response_format: Opus_Response_Chunk2_Chain2_Schema_Shorten,
    provider: {
      order: ["chutes/bf16", "meta/fp8"],
    },
  };

  // Chọn cấu hình dựa trên chain phase
  let selectedConfig = chainPhase === 2 ? chain2Config : chain1Config;

  let payload = {
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      {
        role: "user",
        content: inputData,
      },
    ],
    ...selectedConfig,
  };

  try {
    const startTime = Date.now();
    console.log(
      "[Opus_MW]Đang xử lý chunk 2:",
      inputData.slice(0, 12) + "...",
      systemContent.slice(0, 30) + "..."
    );

    let res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;

    let data = await res.json(); // Đã sửa: thêm await
    let content = data.choices[0].message.content;
    console.log(
      "Hoàn Thành get data chunk 2",
      `Độ trễ: ${latency}ms`,
      data.choices[0].message
    );

    // Xử lý kết quả trả về, đặc biệt cho chainPhase 2
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      // Với chainPhase 2, trích xuất JSON từ code block ```json
      if (chainPhase === 2) {
        console.log("[Opus_MW] Xử lý nội dung chainPhase 2:", inputData);
        // // Thử nhiều pattern regex để bắt JSON
        // const jsonPatterns = [
        //   /```json\s*([\s\S]*?)```/, // ```json ... ```
        //   /```\s*([\s\S]*?)```/, // ``` ... ```
        //   /`([^`]*)`/, // `...`
        // ];
        // let jsonContent = null;
        // let extractedText = null;
        // for (const pattern of jsonPatterns) {
        //   //   const match = content.match(pattern);
        //   //   if (match && match[1]) {
        //   //     extractedText = match[1].trim();
        //   //     try {
        //   //       jsonContent = JSON.parse(extractedText);
        //   //       console.log(
        //   //         "[Opus_MW] Đã trích xuất JSON từ code block thành công với pattern:",
        //   //         pattern
        //   //       );
        //   //       break;
        //   //     } catch (e) {
        //   //       console.warn(
        //   //         `[Opus_MW] Thử parse với pattern ${pattern} thất bại:`,
        //   //         e.message
        //   //       );
        //   //       continue;
        //   //     }
        //   //   }
        // }
        // if (jsonContent) {
        //   //   data.choices[0].message.content = jsonContent;
        // } else {
        //   //   console.warn(
        //   //     "[Opus_MW] Không thể trích xuất JSON từ bất kỳ pattern nào"
        //   //   );
        //   //   // Thử parse trực tiếp toàn bộ content
        //   //   try {
        //   //     const directJsonContent = JSON.parse(content);
        //   //     data.choices[0].message.content = directJsonContent;
        //   //     console.log("[Opus_MW] Parse trực tiếp toàn bộ content thành công");
        //   //   } catch (e) {
        //   //     console.warn(
        //   //       "[Opus_MW] Parse trực tiếp toàn bộ content thất bại:",
        //   //       e.message
        //   //     );
        //   //     // Giữ nguyên content gốc nếu tất cả đều thất bại
        //   //     console.log(
        //   //       "[Opus_MW] Giữ nguyên content gốc:",
        //   //       content.substring(0, 200) + "..."
        //   //     );
        //   //   }
        // }
      }
      // Với chainPhase 1 hoặc các trường hợp khác, thử parse nếu có thể
      else {
        try {
          const jsonContent = JSON.parse(content);
          data.choices[0].message.content = jsonContent;
          console.log("Đã xử lý content");
        } catch (e) {
          // Không có vấn đề nếu không parse được - chain 1 có thể trả về text
          console.log(
            "[Opus_MW] Chain 1 trả về nội dung không phải JSON:",
            content.substring(0, 100) + "..."
          );
        }
      }
    }
    latency = Date.now() - startTime;
    return data;
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi gọi OpenRouterChunk2Builder:", err);
    return { error: "Lỗi request OpenRouterChunk2Builder: " + err };
  }
}

// function ExtractSingleProductData(item) {
//   if (!item || typeof item !== "object") return null;
//   return {
//     id: item.productSKU,
//     name: item.productName,
//     price: item.price,
//     marketPrice: item.marketPrice,
//     productImage:
//       item.productImage && item.productImage.original
//         ? item.productImage.original
//         : "",
//     warranty: item.warranty || "",
//     status: Number(item.quantity) > 0 ? "Sẵn hàng" : "Liên hệ",
//     brand: item.brand && item.brand.name ? item.brand.name : "",
//     // categories: Array.isArray(item.categories)
//     //   ? item.categories.map((c) => c.name).join(", ")
//     //   : "",
//     url: item.productUrl || "",
//   };
// }

// Làm phẳng dữ liệu kết quả tìm kiếm Hacom
// function FlattenHacomSearchResult(rawData) {
//   // rawData là mảng lồng mảng hoặc mảng có thể rỗng
//   if (!Array.isArray(rawData)) return [];
//   // Lấy tất cả các object sản phẩm từ các mảng con
//   return rawData
//     .filter(Array.isArray) // chỉ lấy các phần tử là mảng
//     .flat() // làm phẳng thành 1 mảng các object sản phẩm
//     .filter(
//       (item) =>
//         item &&
//         typeof item === "object" &&
//         (item.productName || item.productSKU)
//     );
// }

// Lọc dữ liệu Hacom, chỉ giữ các trường productSKU, productName, price, quantity
function FilterHacomSearchResult(rawData) {
  if (!Array.isArray(rawData)) return [];
  return rawData
    .filter(Array.isArray)
    .flat()
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.productName || item.productSKU)
    )
    .map((item) => ({
      productSKU: item.productSKU || "",
      productName: item.productName || "",
      price: item.price || "",
      quantity: item.quantity || "",
    }));
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
    messages: messages,
    provider: {
      sort: "throughput",
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
            "RecommendationQuestion",
            "IsRequestingHumanSupport",
            "IsPC_Selected",
            "PassToPerplexity",
          ],
        },
      },
    },
  };

  // Gọi OpenRouter API
  const url = "https://openrouter.ai/api/v1/chat/completions";
  try {
    console.log("[Opus_MW] Gửi request Chunk 1 tới OpenRouter...");
    const startTime = Date.now(); // Đo thời gian xử lý

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + OPENROUTER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;
    console.log(`[Opus_MW] Độ trễ của OpenRouter Chunk 1-Bước1: ${latency}ms`);

    const data = await res.json(); // Đã sửa từ res.json() thành await res.json()
    latency = Date.now() - startTime;
    console.log(`[Opus_MW] Độ trễ của OpenRouter Chunk 1-Bước2: ${latency}ms`);

    // Parse kết quả nếu cần
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      try {
        let content = JSON.parse(data.choices[0].message.content);
        data.choices[0].message.content = content;
      } catch (e) {
        console.warn(
          "[Opus_MW] Không thể parse JSON từ OpenRouter Chunk 1:",
          e
        );
        // Nếu không parse được, giữ nguyên chuỗi
      }
    }

    return data;
  } catch (err) {
    console.error("[Opus_MW] Lỗi khi gọi OpenRouter Chunk 1:", err);
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
