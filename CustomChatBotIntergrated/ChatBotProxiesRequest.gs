// Tạo một mảng global để lưu logs
let executionLogs = [];

// Thêm enum cho các loại request
const Vx_Sheet_RequestType = {
  CHAT_HISTORY: "ChatHistoryRequest",
  NEW_MESSAGE: "NewMessageUpdateForCurrentUser",
};

// Hàm log wrapper
function logMessage(message) {
  Logger.log(message); // Vẫn giữ Logger.log cho server
  executionLogs.push(message); // Thêm vào mảng logs
}

// Thêm hàm để lấy schema từ request
function getSchemaColumns(schema) {
  logMessage("Getting schema columns...");
  logMessage(`Input schema: ${JSON.stringify(schema)}`);

  if (!schema) {
    logMessage("❌ Warning: Schema is null or undefined");
    return [];
  }

  try {
    // Bỏ qua object Answer và lấy các key còn lại từ schema
    const { Answer, ...restSchema } = schema;
    const columns = Object.keys(restSchema);
    logMessage(`Extracted columns: ${columns.join(", ")}`);
    return columns;
  } catch (error) {
    logMessage(`❌ Error extracting schema columns: ${error.message}`);
    return [];
  }
}

// Hàm kiểm tra và cập nhật cấu trúc sheet
function validateAndUpdateSheetStructure(sheet, schema) {
  logMessage("Validating and updating sheet structure...");
  logMessage(`Sheet name: ${sheet.getName()}`);
  logMessage(`Input schema: ${JSON.stringify(schema)}`);

  // Các cột cố định
  const fixedColumns = ["User_ID", "Chat_Log", "Section_Records"];
  logMessage(`Fixed columns: ${fixedColumns.join(", ")}`);

  // Lấy các cột từ schema
  const schemaColumns = getSchemaColumns(schema);
  logMessage(`Schema columns: ${schemaColumns.join(", ")}`);

  // Tổng hợp tất cả các cột cần có
  const allRequiredColumns = [...fixedColumns, ...schemaColumns];
  logMessage(`All required columns: ${allRequiredColumns.join(", ")}`);

  try {
    // Lấy header hiện tại - Thêm kiểm tra sheet trống
    let currentHeaders = [];
    const lastColumn = sheet.getLastColumn();

    if (lastColumn > 0) {
      currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
      logMessage(`Current headers: ${currentHeaders.join(", ")}`);
    } else {
      logMessage("Sheet is empty, initializing with new headers");
    }

    // Nếu sheet trống hoặc cần thêm cột
    if (lastColumn === 0 || currentHeaders.length < allRequiredColumns.length) {
      // Nếu sheet trống, set up tất cả các cột
      if (lastColumn === 0) {
        logMessage("Setting up initial columns");
        const headerRange = sheet.getRange(1, 1, 1, allRequiredColumns.length);
        headerRange.setValues([allRequiredColumns]);
      } else {
        // Nếu cần thêm cột mới
        const columnsToAdd = allRequiredColumns.length - currentHeaders.length;
        logMessage(`Adding ${columnsToAdd} new columns`);
        sheet.insertColumnsAfter(lastColumn, columnsToAdd);

        // Cập nhật headers cho các cột mới
        const headerRange = sheet.getRange(1, 1, 1, allRequiredColumns.length);
        headerRange.setValues([allRequiredColumns]);
      }
    }

    // Định dạng header
    const headerRange = sheet.getRange(1, 1, 1, allRequiredColumns.length);
    headerRange
      .setBackground("#20124d")
      .setFontColor("white")
      .setFontWeight("bold");
    logMessage("Header formatting applied");

    // Tự động điều chỉnh độ rộng cột
    // sheet.autoResizeColumns(1, allRequiredColumns.length);
    // logMessage("Column widths adjusted");

    return allRequiredColumns;
  } catch (error) {
    logMessage(`❌ Error updating sheet structure: ${error.message}`);
    throw error;
  }
}

// Cập nhật hàm getOrCreateCurrentMonthSheet
function getOrCreateCurrentMonthSheet() {
  logMessage("Getting or creating current month sheet...");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentDate = new Date();
  const sheetName = Utilities.formatDate(currentDate, "GMT+7", "MMM yyyy");
  logMessage(`Target sheet name: ${sheetName}`);

  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    logMessage(`Sheet ${sheetName} not found, creating new sheet...`);
    sheet = ss.insertSheet(sheetName);
  } else {
    logMessage(`Found existing sheet: ${sheetName}`);
  }

  return sheet;
}

// Cập nhật hàm updateChatLog
function updateChatLog(userID, newMessage) {
  logMessage("Starting updateChatLog...");
  logMessage(`Processing message for user: ${userID}`);
  logMessage(`Message data: ${JSON.stringify(newMessage, null, 2)}`);

  const sheet = getOrCreateCurrentMonthSheet();
  logMessage(`Working with sheet: ${sheet.getName()}`);

  try {
    // Tìm hoặc tạo row cho user
    const userRow = findOrCreateUserRow(sheet, userID);

    // Cập nhật thông tin cơ bản
    const messageToSave = {
      parts: [{ text: newMessage.parts[0].text }],
      role: newMessage.role,
    };

    // Cập nhật chat log
    updateChatLogColumn(sheet, userRow, messageToSave);
    logMessage("Chat log updated");

    // Cập nhật timestamp
    sheet.getRange(userRow, 3).setValue(new Date().toISOString());
    logMessage("Timestamp updated");

    // Nếu có contentForSchema, cập nhật các cột từ cột 4 trở đi
    if (newMessage.contentForSchema) {
      logMessage(
        `Updating schema columns with: ${JSON.stringify(
          newMessage.contentForSchema
        )}`
      );
      const startColumn = 4; // Bắt đầu từ cột thứ 4
      newMessage.contentForSchema.forEach((value, index) => {
        const column = startColumn + index;
        logMessage(`Setting column ${column} to value: ${value}`);
        sheet.getRange(userRow, column).setValue(value);
      });
      logMessage("Schema columns updated");
    }

    return {
      success: true,
      logs: executionLogs,
    };
  } catch (error) {
    logMessage(`❌ Error in updateChatLog: ${error.toString()}`);
    logMessage(`Error stack: ${error.stack}`);
    return {
      success: false,
      error: error.toString(),
      logs: executionLogs,
    };
  }
}

// Helper function để tìm hoặc tạo row cho user
function findOrCreateUserRow(sheet, userID) {
  const userIDColumn = sheet.getRange("A:A").getValues();
  let userRow = -1;

  for (let i = 1; i < userIDColumn.length; i++) {
    if (userIDColumn[i][0] === userID) {
      userRow = i + 1;
      break;
    }
  }

  if (userRow === -1) {
    userRow = sheet.getLastRow() + 1;
    sheet.getRange(userRow, 1).setValue(userID);
    sheet.getRange(userRow, 2).setValue("[]");
  }

  return userRow;
}

// Helper function để cập nhật cột chat log
function updateChatLogColumn(sheet, userRow, messageToSave) {
  const chatLogCell = sheet.getRange(userRow, 2);
  const currentChatLog = JSON.parse(chatLogCell.getValue() || "[]");
  currentChatLog.push(messageToSave);
  chatLogCell.setValue(JSON.stringify(currentChatLog));
}

// Cập nhật hàm getCorsHeaders
function getCorsHeaders() {
  logMessage("Getting CORS headers");
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
  };
}

// Hàm xử lý yêu cầu lấy lịch sử chat và tạo user mới nếu cần
function handleChatHistoryRequest(userID) {
  logMessage("Handling chat history request...");

  try {
    const sheet = getOrCreateCurrentMonthSheet();
    logMessage(`Working with sheet: ${sheet.getName()}`);

    // Tìm hoặc tạo user
    const userRow = findOrCreateUser(sheet, userID);

    if (!userRow) {
      logMessage("Failed to find or create user");
      return {
        success: false,
        error: "Failed to process user data",
        logs: executionLogs,
      };
    }

    // Lấy chat history
    const chatLogCell = sheet.getRange(userRow, 2);
    const chatLogValue = chatLogCell.getValue();
    logMessage(`Retrieved chat log: ${chatLogValue}`);

    const chatLog = JSON.parse(chatLogValue || "[]");

    return {
      success: true,
      data: chatLog,
      logs: executionLogs,
    };
  } catch (error) {
    logMessage(`Error in handleChatHistoryRequest: ${error.toString()}`);
    return {
      success: false,
      error: error.toString(),
      logs: executionLogs,
    };
  }
}

// Hàm tìm hoặc tạo user mới
function findOrCreateUser(sheet, userID) {
  logMessage("Finding or creating user...");

  // Tìm user hiện có
  const userIDColumn = sheet.getRange("A:A").getValues();
  let userRow = -1;

  for (let i = 1; i < userIDColumn.length; i++) {
    if (userIDColumn[i][0] === userID) {
      userRow = i + 1;
      logMessage(`Found existing user at row: ${userRow}`);
      return userRow;
    }
  }

  // Nếu không tìm thấy, tạo mới
  try {
    userRow = sheet.getLastRow() + 1;
    logMessage(`Creating new user at row: ${userRow}`);

    // Thêm userID
    sheet.getRange(userRow, 1).setValue(userID);
    // Khởi tạo chat log trống
    sheet.getRange(userRow, 2).setValue("[]");

    logMessage("New user created successfully");
    return userRow;
  } catch (error) {
    logMessage(`Error creating new user: ${error.toString()}`);
    return null;
  }
}

// Cập nhật hàm doGet
function doGet(e) {
  executionLogs = [];
  logMessage("=== START doGet ===");
  logMessage(`Full request parameters: ${JSON.stringify(e.parameter)}`);

  const callback = e.parameter.callback;
  const requestType = e.parameter.requestType;
  const userID = e.parameter.userID;

  logMessage(`Callback: ${callback}`);
  logMessage(`Request Type: ${requestType}`);
  logMessage(`User ID: ${userID}`);

  // Log schema riêng vì có thể là JSON string
  try {
    const schema = e.parameter.schema ? JSON.parse(e.parameter.schema) : null;
    logMessage(`Parsed Schema: ${JSON.stringify(schema, null, 2)}`);
  } catch (error) {
    logMessage(`Error parsing schema: ${error.message}`);
    logMessage(`Raw schema value: ${e.parameter.schema}`);
  }

  if (!userID) {
    logMessage("❌ Error: Missing userID");
    return createResponse(
      {
        success: false,
        error: "Missing userID",
        logs: executionLogs,
      },
      callback
    );
  }

  let result;
  try {
    switch (requestType) {
      case Vx_Sheet_RequestType.CHAT_HISTORY:
        logMessage("📜 Processing CHAT_HISTORY request");

        try {
          // Parse schema
          const schema = e.parameter.schema
            ? JSON.parse(e.parameter.schema)
            : null;
          logMessage(`Parsed schema: ${JSON.stringify(schema)}`);

          if (!schema) {
            logMessage("❌ Error: Missing schema for CHAT_HISTORY request");
            return createResponse(
              {
                success: false,
                error: "Missing schema for CHAT_HISTORY request",
                logs: executionLogs,
              },
              callback
            );
          }

          logMessage("Getting sheet...");
          const sheet = getOrCreateCurrentMonthSheet();
          logMessage(`Working with sheet: ${sheet.getName()}`);

          logMessage("Validating sheet structure...");
          validateAndUpdateSheetStructure(sheet, schema);

          logMessage("Getting chat history...");
          result = handleChatHistoryRequest(userID);
          logMessage(`Chat history result: ${JSON.stringify(result)}`);
        } catch (error) {
          logMessage(`❌ Error in CHAT_HISTORY processing: ${error.message}`);
          return createResponse(
            {
              success: false,
              error: error.message,
              logs: executionLogs,
            },
            callback
          );
        }
        break;

      case Vx_Sheet_RequestType.NEW_MESSAGE:
        logMessage("💬 Processing NEW_MESSAGE request");
        logMessage(`Message: ${e.parameter.message}`);
        logMessage(`Role: ${e.parameter.role}`);

        result = updateChatLog(userID, {
          parts: [{ text: e.parameter.message }],
          role: e.parameter.role,
          contentForSchema: e.parameter.contentForSchema
            ? JSON.parse(e.parameter.contentForSchema)
            : null,
        });

        logMessage(`Update result: ${JSON.stringify(result)}`);
        break;

      default:
        logMessage(`❌ Error: Invalid request type: ${requestType}`);
        result = {
          success: false,
          error: "Invalid request type",
          logs: executionLogs,
        };
    }

    logMessage("=== END doGet - Success ===");
    return createResponse(result, callback);
  } catch (error) {
    logMessage(`❌ ERROR in doGet: ${error.message}`);
    logMessage(`Error stack: ${error.stack}`);
    logMessage("=== END doGet - Error ===");

    return createResponse(
      {
        success: false,
        error: error.message,
        stack: error.stack,
        logs: executionLogs,
      },
      callback
    );
  }
}

// Cập nhật helper function createResponse để thêm logs
function createResponse(result, callback) {
  logMessage("Creating response...");
  logMessage(`Result: ${JSON.stringify(result)}`);
  logMessage(`Using callback: ${callback ? "yes" : "no"}`);

  const output = JSON.stringify(result);

  if (callback) {
    logMessage("Returning JSONP response");
    return ContentService.createTextOutput(
      callback + "(" + output + ")"
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  logMessage("Returning JSON response");
  return ContentService.createTextOutput(output).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Cập nhật hàm doPost
function doPost(e) {
  executionLogs = [];
  logMessage("=== START doPost ===");

  try {
    logMessage(`Raw post data: ${e.postData.contents}`);
    const postData = JSON.parse(e.postData.contents);
    logMessage(`Parsed post data: ${JSON.stringify(postData, null, 2)}`);

    // Log các trường quan trọng
    logMessage(`UserID: ${postData.userID}`);
    logMessage(`Role: ${postData.role}`);
    logMessage(`Message: ${postData.parts[0].text}`);

    // Log contentForSchema nếu có
    if (postData.contentForSchema) {
      logMessage(
        `ContentForSchema: ${JSON.stringify(postData.contentForSchema)}`
      );
    }

    const result = updateChatLog(postData.userID, {
      parts: [{ text: postData.parts[0].text }],
      role: postData.role,
      contentForSchema: postData.contentForSchema,
    });

    logMessage(`Update result: ${JSON.stringify(result)}`);
    logMessage("=== END doPost - Success ===");

    // Sửa lỗi setHeaders bằng cách tách thành nhiều bước
    const response = ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        logs: executionLogs,
      })
    );

    response.setMimeType(ContentService.MimeType.JSON);

    // Thêm headers riêng lẻ
    const headers = getCorsHeaders();
    Object.keys(headers).forEach((key) => {
      response.addHeader(key, headers[key]);
    });

    return response;
  } catch (error) {
    logMessage(`❌ ERROR in doPost: ${error.message}`);
    logMessage(`Error stack: ${error.stack}`);
    logMessage("=== END doPost - Error ===");

    // Xử lý lỗi tương tự
    const errorResponse = ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
        logs: executionLogs,
      })
    );

    errorResponse.setMimeType(ContentService.MimeType.JSON);

    const headers = getCorsHeaders();
    Object.keys(headers).forEach((key) => {
      errorResponse.addHeader(key, headers[key]);
    });

    return errorResponse;
  }
}

// Cập nhật hàm doOptions
function doOptions(e) {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(getCorsHeaders());
}
