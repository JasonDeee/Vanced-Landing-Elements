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

// Hàm lấy hoặc tạo sheet cho tháng hiện tại
function getOrCreateCurrentMonthSheet() {
  logMessage("Getting or creating current month sheet...");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentDate = new Date();

  // Log thông tin về thời gian
  logMessage(`Current date: ${currentDate}`);
  logMessage(`Current timezone: ${Session.getScriptTimeZone()}`);

  const sheetName = Utilities.formatDate(currentDate, "GMT+7", "MMM yyyy");
  logMessage(`Generated sheet name: ${sheetName}`);

  let sheet = ss.getSheetByName(sheetName);

  // Nếu sheet chưa tồn tại, tạo mới
  if (!sheet) {
    logMessage(`Sheet ${sheetName} not found, creating new sheet...`);
    sheet = ss.insertSheet(sheetName);
    // Tạo headers
    sheet
      .getRange("A1:G1")
      .setValues([
        [
          "User_ID",
          "Chat_Log",
          "Section_Records",
          "Topic_per_Section",
          "Summerize",
          "Request_for_RealAssistance_Count",
          "priceConcern",
        ],
      ]);

    // Định dạng header
    sheet
      .getRange("A1:G1")
      .setBackground("#4a86e8")
      .setFontColor("white")
      .setFontWeight("bold");

    // Tự động điều chỉnh độ rộng cột
    sheet.autoResizeColumns(1, 7);
    logMessage("New sheet created and formatted successfully");
  } else {
    logMessage(`Found existing sheet: ${sheetName}`);
  }

  return sheet;
}

// Cập nhật hàm updateChatLog
function updateChatLog(userID, newMessage) {
  executionLogs = [];
  logMessage("Starting updateChatLog...");
  logMessage(`UserID: ${userID}`);
  logMessage(`New message: ${JSON.stringify(newMessage)}`);

  const sheet = getOrCreateCurrentMonthSheet();
  logMessage(`Current sheet name: ${sheet.getName()}`);

  try {
    // Tìm row của user trong sheet hiện tại
    const userIDColumn = sheet.getRange("A:A").getValues();
    let userRow = -1;

    for (let i = 1; i < userIDColumn.length; i++) {
      if (userIDColumn[i][0] === userID) {
        userRow = i + 1;
        logMessage(`Found existing user at row: ${userRow}`);
        break;
      }
    }

    // Lấy timestamp hiện tại
    const currentTimestamp = new Date().toISOString();

    // Format tin nhắn đúng cấu trúc
    const messageToSave = {
      parts: [{ text: newMessage.parts[0].text }],
      role: newMessage.role,
    };

    // Nếu user chưa có trong sheet, thêm mới
    if (userRow === -1) {
      userRow = sheet.getLastRow() + 1;
      logMessage(`Creating new user at row: ${userRow}`);

      const newRow = [
        userID, // User_ID
        JSON.stringify([messageToSave]), // Chat_Log với format đúng
        currentTimestamp, // Section_Records - lưu timestamp
        newMessage.topic || "", // Topic_per_Section
        newMessage.summerize || "", // Summerize
        "0", // Request_for_RealAssistance_Count
        newMessage.priceConcern || "", // priceConcern - đảm bảo tên trường khớp
      ];

      sheet.getRange(userRow, 1, 1, 7).setValues([newRow]);
      logMessage("New user row created with initial data");

      // Thêm xử lý PriceConcern trong phần cập nhật user hiện có
      if (newMessage.priceConcern) {
        const priceConcernCell = sheet.getRange(userRow, 7);
        priceConcernCell.setValue(newMessage.priceConcern);
        logMessage(`Updated priceConcern: ${newMessage.priceConcern}`);
      }
    } else {
      // Nếu user đã tồn tại, cập nhật thông tin
      const currentChatLogCell = sheet.getRange(userRow, 2);
      const currentChatLogValue = currentChatLogCell.getValue();
      let chatLog = [];
      try {
        chatLog = JSON.parse(currentChatLogValue || "[]");
      } catch (parseError) {
        logMessage(`Error parsing existing chat log: ${parseError}`);
        chatLog = [];
      }

      // Thêm tin nhắn mới với format đúng
      chatLog.push(messageToSave);
      currentChatLogCell.setValue(JSON.stringify(chatLog));

      // Cập nhật Topic nếu có
      if (newMessage.topic) {
        const topicCell = sheet.getRange(userRow, 4);
        topicCell.setValue(newMessage.topic);
      }

      // Cập nhật Summerize nếu có
      if (newMessage.summerize) {
        const summerizeCell = sheet.getRange(userRow, 5);
        summerizeCell.setValue(newMessage.summerize);
      }

      // Cập nhật Section_Records với timestamp mới nhất
      const sectionCell = sheet.getRange(userRow, 3);
      sectionCell.setValue(currentTimestamp);

      // Cập nhật priceConcern nếu có
      if (newMessage.priceConcern) {
        const priceConcernCell = sheet.getRange(userRow, 7);
        priceConcernCell.setValue(newMessage.priceConcern);
        logMessage(`Updated priceConcern: ${newMessage.priceConcern}`);
      }

      logMessage("Existing user data updated successfully");
    }

    return {
      success: true,
      logs: executionLogs,
    };
  } catch (error) {
    logMessage(`Error in updateChatLog: ${error.toString()}`);
    logMessage(`Error stack: ${error.stack}`);
    return {
      success: false,
      error: error.toString(),
      logs: executionLogs,
    };
  }
}

// Cập nhật hàm getCorsHeaders
function getCorsHeaders() {
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
  logMessage("Received GET request");
  logMessage(`Request parameters: ${JSON.stringify(e.parameter)}`);

  const callback = e.parameter.callback;
  const requestType = e.parameter.requestType;
  const userID = e.parameter.userID;

  if (!userID) {
    logMessage("Missing userID parameter");
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
  switch (requestType) {
    case Vx_Sheet_RequestType.CHAT_HISTORY:
      result = handleChatHistoryRequest(userID);
      break;
    case Vx_Sheet_RequestType.NEW_MESSAGE:
      result = updateChatLog(userID, {
        parts: [{ text: e.parameter.message }],
        role: e.parameter.role,
        topic: e.parameter.topic,
        summerize: e.parameter.summerize,
        priceConcern: e.parameter.priceConcern,
      });
      break;
    default:
      result = {
        success: false,
        error: "Invalid request type",
        logs: executionLogs,
      };
  }

  return createResponse(result, callback);
}

// Helper function để tạo response
function createResponse(result, callback) {
  const output = JSON.stringify(result);

  if (callback) {
    return ContentService.createTextOutput(
      callback + "(" + output + ")"
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(output).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Cập nhật hàm doPost
function doPost(e) {
  executionLogs = [];

  try {
    const postData = JSON.parse(e.postData.contents);
    const result = updateChatLog(postData.userID, {
      parts: [{ text: postData.parts[0].text }],
      role: postData.role,
      topic: postData.topic,
      summerize: postData.summerize,
      priceConcern: postData.priceConcern,
    });

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
      })
    )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(getCorsHeaders());
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
      })
    )
      .setMimeType(ContentService.MimeType.JSON)
      .setHeaders(getCorsHeaders());
  }
}

// Cập nhật hàm doOptions
function doOptions(e) {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(getCorsHeaders());
}
