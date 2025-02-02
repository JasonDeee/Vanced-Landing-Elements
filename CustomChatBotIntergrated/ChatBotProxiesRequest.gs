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
      .getRange("A1:F1")
      .setValues([
        [
          "User_ID",
          "Chat_Log",
          "Section_Records",
          "Topic_per_Section",
          "Summerize",
          "Request_for_RealAssistance_Count",
        ],
      ]);

    // Định dạng header
    sheet
      .getRange("A1:F1")
      .setBackground("#4a86e8")
      .setFontColor("white")
      .setFontWeight("bold");

    // Tự động điều chỉnh độ rộng cột
    sheet.autoResizeColumns(1, 6);
    logMessage("New sheet created and formatted successfully");
  } else {
    logMessage(`Found existing sheet: ${sheetName}`);
  }

  return sheet;
}

// Hàm cập nhật hoặc tạo mới chat log cho user
function updateChatLog(userID, newMessage) {
  executionLogs = []; // Reset logs cho mỗi request

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

    // Nếu user chưa có trong sheet, thêm mới
    if (userRow === -1) {
      userRow = sheet.getLastRow() + 1;
      logMessage(`Creating new user at row: ${userRow}`);

      // Thêm userID vào cột A
      sheet.getRange(userRow, 1).setValue(userID);

      // Khởi tạo chat log mới với tin nhắn đầu tiên
      const initialChatLog = [newMessage];
      const chatLogJson = JSON.stringify(initialChatLog);
      sheet.getRange(userRow, 2).setValue(chatLogJson);

      logMessage(`Initialized new chat log: ${chatLogJson}`);
    } else {
      // Nếu user đã tồn tại, cập nhật chat log
      const currentChatLogCell = sheet.getRange(userRow, 2);
      const currentChatLogValue = currentChatLogCell.getValue();
      logMessage(`Current chat log value: ${currentChatLogValue}`);

      let chatLog = [];
      try {
        chatLog = JSON.parse(currentChatLogValue || "[]");
      } catch (parseError) {
        logMessage(`Error parsing existing chat log: ${parseError}`);
        chatLog = [];
      }

      // Thêm tin nhắn mới vào chat log
      chatLog.push(newMessage);
      const newChatLogValue = JSON.stringify(chatLog);
      logMessage(`Updated chat log: ${newChatLogValue}`);

      // Lưu chat log mới
      currentChatLogCell.setValue(newChatLogValue);
    }

    logMessage("Chat log updated successfully");
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
    "Access-Control-Allow-Origin": "https://alpha.vanced.media",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Origin",
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
  executionLogs = []; // Reset logs

  logMessage("Received POST request");
  logMessage(`Request parameters: ${JSON.stringify(e.parameter)}`);
  logMessage(`Request content: ${e.postData.contents}`);

  const callback = e.parameter.callback;

  try {
    const postData = JSON.parse(e.postData.contents);
    logMessage(`Parsed post data: ${JSON.stringify(postData)}`);

    const result = updateChatLog(postData.userID, {
      parts: [{ text: postData.message }],
      role: postData.role,
    });

    // Thêm logs vào result
    result.logs = [...executionLogs, ...(result.logs || [])];

    logMessage(`Update result: ${JSON.stringify(result)}`);
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
  } catch (error) {
    logMessage(`Error in doPost: ${error.toString()}`);
    logMessage(`Error stack: ${error.stack}`);

    const errorOutput = JSON.stringify({
      success: false,
      error: error.toString(),
      logs: executionLogs,
    });

    if (callback) {
      return ContentService.createTextOutput(
        callback + "(" + errorOutput + ")"
      ).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService.createTextOutput(errorOutput).setMimeType(
      ContentService.MimeType.JSON
    );
  }
}

// Cập nhật hàm doOptions
function doOptions(e) {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(getCorsHeaders());
}
