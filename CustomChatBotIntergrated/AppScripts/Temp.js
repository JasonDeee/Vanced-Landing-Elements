// File: MacroProcessor.gs

// Đảm bảo bạn đã đặt API key trong Script Properties
// Đi tới: Tiện ích mở rộng > Apps Script > Properties > Script properties
// Thêm một property mới: Key = GEMINI_API_KEY, Value = [Your Gemini API Key]
const apiKey =
  PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

// Cấu hình chung cho API Gemini
const GEMINI_GENERATION_CONFIG = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "application/json",
  responseSchema: {
    type: "object",
    properties: {
      Brand: {
        type: "string",
      },
      "Product Line": {
        type: "string",
      }, // Sử dụng chuỗi vì có khoảng trắng
      "Generation with name": {
        type: "string",
      }, // Sử dụng chuỗi vì có khoảng trắng
      Socket: {
        type: "string",
      },
    },
    required: ["Brand", "Product Line", "Generation with name", "Socket"], // Required fields
  },
};

// Ví dụ mẫu cho Gemini (Few-shot examples) - ĐÃ CẬP NHẬT LẠI CẤU TRÚC LỊCH SỬ
const BASE_GEMINI_CONTENTS = [
  {
    role: "user",
    parts: [
      {
        text: 'Hãy lọc thông tin thuộc tính của một số loại CPU giúp tôi theo Shema sau:\n{\n  "Brand": Thương hiệu nhà sản xuất,\n  "Generation with name": thế hệ CPU - tên thế hệ,\n  "Product Line": Dòng sản phẩm,\n  "Socket": chuẩn giao tiếp của CPU\n}\n\nVí dụ 1:\nCPU Intel Core i7-14700KF (Up to 5.6Ghz, 20 nhân 28 luồng, 33MB Cache, 125W) - Socket Intel LGA 1700/RAPTOR LAKE',
      },
    ],
  },
  {
    role: "model",
    parts: [
      {
        text: '{\n  "Brand": "Intel",\n  "Generation with name": "Intel 14th Gen - Raptor Lake",\n  "Product Line": "Intel Core i7",\n  "Socket": "LGA 1700"\n}',
      },
    ],
  },
  {
    // Thêm ví dụ thứ 2
    role: "user",
    parts: [
      {
        text: "CPU AMD Athlon 3000G (3.5GHz, 2 nhân 4 luồng , 5MB Cache, 35W) - Socket AMD AM4",
      }, // Lưu ý: Tên CPU này từ sheet là AM4, ví dụ của bạn ghi AM5 - tôi giữ nguyên theo sheet để khớp với ví dụ thực tế hơn. Nếu muốn AM5 thì sửa lại chuỗi này.
    ],
  },
  {
    // Kết quả mẫu cho ví dụ thứ 2
    role: "model",
    parts: [
      {
        text: '{\n  "Brand": "AMD",\n  "Generation with name": "AMD Athlon Series",\n  "Product Line": "AMD Athlon",\n  "Socket": "AM4"\n}',
      }, // Socket AM4 để khớp với tên CPU mẫu
    ],
  },
  {
    // Thêm ví dụ thứ 3 (từ ví dụ bạn đưa ra trong prompt)
    role: "user",
    parts: [
      {
        text: "CPU INTEL CORE I9-14900K (UP TO 5.8Ghz, 24 NHÂN 32 LUỒNG, 36MB CACHE, 125W) - Socket Intel LGA 1700/RAPTOR LAKE",
      },
    ],
  },
  {
    // Kết quả mẫu cho ví dụ thứ 3
    role: "model",
    parts: [
      {
        text: '{\n  "Brand": "Intel",\n  "Generation with name": "Intel 14th Gen - Raptor Lake",\n  "Product Line": "Intel Core i9",\n  "Socket": "LGA 1700"\n}',
      },
    ],
  },
  {
    // Thêm ví dụ thứ 4 (từ ví dụ bạn đưa ra trong prompt)
    role: "user",
    parts: [
      {
        text: "CPU AMD Ryzen Threadripper 7970X (4.0hz up to 5.3Ghz/160MB/32 cores 64 threads/350W/Socket sTR5)",
      },
    ],
  },
  {
    // Kết quả mẫu cho ví dụ thứ 4
    role: "model",
    parts: [
      {
        text: '{\n  "Brand": "AMD",\n  "Generation with name": "AMD Ryzen Threadripper 7000 Series",\n  "Product Line": "AMD Ryzen Threadripper",\n  "Socket": "sTR5"\n}',
      },
    ],
  },
  // Placeholder cho input thực tế - Vị trí này đã thay đổi
  {
    role: "user",
    parts: [{ text: "INSERT_INPUT_HERE" }],
  },
];

/**
 * Hàm chính chạy như một Macro để xử lý thuộc tính CPU.
 */
function processCpuAttributesWithGemini() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getActiveSheet(); // Xử lý trên sheet đang mở

  // Lấy input từ người dùng qua hộp thoại
  var ui = SpreadsheetApp.getUi();
  var startRowResponse = ui.prompt(
    "Xử lý thuộc tính CPU",
    "Bắt đầu từ hàng:",
    ui.ButtonSet.OK_CANCEL
  );

  // Xử lý nếu người dùng nhấn Cancel hoặc đóng hộp thoại
  if (
    startRowResponse.getSelectedButton() == ui.Button.CANCEL ||
    startRowResponse.getSelectedButton() == ui.Button.CLOSE
  ) {
    ui.alert("Đã hủy thao tác.");
    return;
  }

  var startRow = parseInt(startRowResponse.getResponseText());

  // Kiểm tra input startRow
  if (isNaN(startRow) || startRow < 2) {
    // Hàng 1 là header, bắt đầu từ hàng 2
    ui.alert(
      "Lỗi: Hàng bắt đầu không hợp lệ. Vui lòng nhập một số nguyên >= 2."
    );
    return;
  }

  var numRowsResponse = ui.prompt(
    "Xử lý thuộc tính CPU",
    "Số hàng cần xử lý:",
    ui.ButtonSet.OK_CANCEL
  );

  // Xử lý nếu người dùng nhấn Cancel hoặc đóng hộp thoại
  if (
    numRowsResponse.getSelectedButton() == ui.Button.CANCEL ||
    numRowsResponse.getSelectedButton() == ui.Button.CLOSE
  ) {
    ui.alert("Đã hủy thao tác.");
    return;
  }

  var numRows = parseInt(numRowsResponse.getResponseText());

  // Kiểm tra input numRows
  if (isNaN(numRows) || numRows < 1) {
    ui.alert(
      "Lỗi: Số hàng cần xử lý không hợp lệ. Vui lòng nhập một số nguyên >= 1."
    );
    return;
  }

  // Định nghĩa các cột input/output (sử dụng chỉ số 1-based cho sheet range)
  const COLUMN_PRODUCT_NAME = 3; // Cột C
  const COLUMN_BRAND = 9; // Cột I
  const COLUMN_SERIES = 10; // Cột J (Product Line)
  const COLUMN_GENERATION = 11; // Cột K (Generation with name)
  const COLUMN_SOCKET = 12; // Cột L

  var processedCount = 0;

  ui.alert(
    "Đang bắt đầu xử lý. Quá trình có thể mất vài phút tùy số lượng hàng."
  );

  // Bắt đầu vòng lặp xử lý từng hàng
  for (var i = 0; i < numRows; i++) {
    var currentRow = startRow + i;
    var productNameRange = sheet.getRange(currentRow, COLUMN_PRODUCT_NAME);
    var productName = productNameRange.getValue();

    // Kiểm tra nếu ô tên sản phẩm trống, dừng xử lý
    if (!productName || productName.toString().trim() === "") {
      Logger.log("Dừng xử lý tại hàng " + currentRow + ": Tên sản phẩm trống.");
      break;
    }

    Logger.log("Xử lý hàng " + currentRow + ": " + productName);

    try {
      // Gọi hàm helper để lấy thuộc tính từ Gemini
      var attributes = getGeminiCpuAttributes(productName);

      if (attributes && !attributes.error) {
        // Ghi kết quả vào các cột tương ứng
        sheet.getRange(currentRow, COLUMN_BRAND).setValue(attributes.Brand);
        sheet
          .getRange(currentRow, COLUMN_SERIES)
          .setValue(attributes["Product Line"]); // Sử dụng key từ schema
        sheet
          .getRange(currentRow, COLUMN_GENERATION)
          .setValue(attributes["Generation with name"]); // Sử dụng key từ schema
        sheet.getRange(currentRow, COLUMN_SOCKET).setValue(attributes.Socket);
        processedCount++;
      } else {
        // Ghi thông báo lỗi vào cột Brand nếu API trả về lỗi
        sheet
          .getRange(currentRow, COLUMN_BRAND)
          .setValue(
            "Lỗi API: " +
              (attributes ? attributes.error : "Không nhận được phản hồi")
          );
        Logger.log(
          "Lỗi xử lý hàng " +
            currentRow +
            ": " +
            (attributes
              ? attributes.error
              : "Không nhận được phản hồi từ Gemini")
        );
      }
    } catch (e) {
      // Ghi thông báo lỗi vào cột Brand nếu có lỗi trong script
      sheet
        .getRange(currentRow, COLUMN_BRAND)
        .setValue("Lỗi Script: " + e.message);
      Logger.log("Lỗi Script xử lý hàng " + currentRow + ": " + e.message);
    }

    // Có thể thêm một khoảng dừng nhỏ để tránh quá tải API (tùy chọn)
    // Utilities.sleep(100); // Dừng 100ms
  }

  ui.alert(
    "Đã hoàn thành xử lý " +
      processedCount +
      " hàng bắt đầu từ hàng " +
      startRow +
      "."
  );
}

/**
 * Hàm helper để gọi API Gemini và lấy thuộc tính CPU.
 * @param {string} cpuName - Tên CPU từ sheet.
 * @returns {Object|null} - JSON object chứa thuộc tính hoặc {error: message}.
 */
function getGeminiCpuAttributes(cpuName) {
  if (!apiKey) {
    return {
      error: "API key not set. Please set GEMINI_API_KEY in Script Properties.",
    };
  }

  // Sao chép cấu trúc contents cơ bản và thay thế placeholder
  var contents = JSON.parse(JSON.stringify(BASE_GEMINI_CONTENTS));
  // Vị trí của placeholder đã thay đổi từ index 2 sang index 4 do thêm 2 cặp user/model
  contents[6].parts[0].text = cpuName;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
  const options = {
    method: "POST",
    contentType: "application/json",
    payload: JSON.stringify({
      generationConfig: GEMINI_GENERATION_CONFIG,
      contents: contents,
    }),
    muteHttpExceptions: true, // Cho phép UrlFetchApp không ném ngoại lệ khi có lỗi HTTP
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    if (responseCode >= 200 && responseCode < 300) {
      // Phản hồi thành công
      var parsedResponse = JSON.parse(responseText);

      // Kiểm tra xem cấu trúc phản hồi có đúng như mong đợi không
      // Gemini có thể trả về response với text trong parts[0] thay vì parse trực tiếp theo schema
      // Chúng ta cần kiểm tra và parse thêm nếu cần
      if (
        parsedResponse &&
        parsedResponse.candidates &&
        parsedResponse.candidates[0] &&
        parsedResponse.candidates[0].content &&
        parsedResponse.candidates[0].content.parts &&
        parsedResponse.candidates[0].content.parts[0] &&
        parsedResponse.candidates[0].content.parts[0].text
      ) {
        // Nếu response là text (dạng string của JSON object), parse lại
        try {
          // Loại bỏ ```json và ``` nếu có
          let jsonString = parsedResponse.candidates[0].content.parts[0].text
            .replace(/```json\n|\n```/g, "")
            .trim();

          // Thêm một kiểm tra để đảm bảo chuỗi JSON không rỗng sau khi loại bỏ ký tự
          if (jsonString) {
            return JSON.parse(jsonString);
          } else {
            Logger.log(
              "Empty JSON string received from Gemini after cleaning: " +
                parsedResponse.candidates[0].content.parts[0].text
            );
            return {
              error: "Received empty JSON string from Gemini.",
            };
          }
        } catch (parseError) {
          Logger.log(
            "Error parsing inner JSON string from Gemini response: " +
              parseError.message +
              " - ResponseText: " +
              parsedResponse.candidates[0].content.parts[0].text
          );
          return {
            error: "Failed to parse inner JSON from Gemini response.",
          };
        }
      } else {
        // Nếu response đã là JSON object trực tiếp (mong muốn với responseSchema)
        // Cần kiểm tra cấu trúc response trực tiếp hơn
        // Note: Với responseSchema, Gemini flash lite thường trả về JSON trực tiếp ở root
        if (
          parsedResponse &&
          parsedResponse.Brand !== undefined &&
          parsedResponse["Product Line"] !== undefined &&
          parsedResponse["Generation with name"] !== undefined &&
          parsedResponse.Socket !== undefined
        ) {
          return parsedResponse; // Trả về object đã parse
        } else {
          // Cấu trúc phản hồi không như mong đợi dù code 2xx
          Logger.log(
            "Unexpected successful response structure from Gemini: " +
              responseText
          );
          return {
            error:
              "Unexpected response structure from Gemini. Response: " +
              responseText,
          };
        }
      }
    } else {
      // Phản hồi lỗi từ API
      Logger.log(
        "Gemini API Error - Code: " +
          responseCode +
          ", Response: " +
          responseText
      );
      try {
        var errorResponse = JSON.parse(responseText);
        return {
          error:
            "API Error: " +
            (errorResponse.error ? errorResponse.error.message : responseText),
        };
      } catch (parseError) {
        return {
          error: "API Error: " + responseText,
        };
      }
    }
  } catch (e) {
    // Lỗi trong quá trình gửi request hoặc xử lý response
    Logger.log("Error during API call: " + e.message);
    return {
      error: "Script Error during API call: " + e.message,
    };
  }
}

const aray = ["Brand", "Series", "Generation", "Socket"];

const arrayofObject = [
  {
    Brand: ["Intel", "AMD"],
  },
  {
    Series: ["Core i7", "Core i5", "Core i3"],
  },
  {
    Generation: ["14th Gen", "13th Gen", "12th Gen"],
  },
  {
    Socket: ["LGA 1700", "LGA 1200", "LGA 1151"],
  },
];