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

// Thêm hàm kiểm tra section mới
function checkNewSection(lastMessageTime, currentTime) {
  const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 giờ tính bằng milliseconds
  return currentTime - lastMessageTime >= SIX_HOURS;
}

// Cập nhật hàm updateChatLog
function updateChatLog(userID, messageData) {
  executionLogs = [];
  logMessage("Starting updateChatLog...");

  const sheet = getOrCreateCurrentMonthSheet();
  try {
    const userRow = findOrCreateUser(sheet, userID);
    if (!userRow) throw new Error("Failed to find or create user");

    const chatLogCell = sheet.getRange(userRow, 2);
    const sectionRecordsCell = sheet.getRange(userRow, 3);

    let chatLog = chatLogCell.getValue() || "";
    let sectionRecords = sectionRecordsCell.getValue() || "";

    // Format tin nhắn mới
    const formattedMessage = `[${
      messageData.role === "user" ? "User" : "Bot"
    }] ${messageData.parts[0].text} // ${messageData.time}`;

    // Kiểm tra section mới
    const lastMessageMatch = chatLog.match(/\/\/ ([^-]*?)(?:\n---|$)/);
    if (lastMessageMatch) {
      const lastMessageTime = new Date(lastMessageMatch[1]).getTime();
      const currentMessageTime = new Date(messageData.time).getTime();

      if (checkNewSection(lastMessageTime, currentMessageTime)) {
        chatLog += `\n---${lastMessageMatch[1]}---\n`;
        if (sectionRecords) sectionRecords += "\n";
        sectionRecords += `[${lastMessageMatch[1]}]`;
        sectionRecordsCell.setValue(sectionRecords);
      }
    }

    // Thêm tin nhắn mới
    if (chatLog) chatLog += "\n";
    chatLog += formattedMessage;

    chatLogCell.setValue(chatLog);

    logMessage("Chat log updated successfully");
    return {
      success: true,
      logs: executionLogs,
    };
  } catch (error) {
    logMessage(`Error in updateChatLog: ${error.toString()}`);
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
    "Access-Control-Allow-Origin": "https://beta.vanced.media",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Origin, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "3600",
  };
}

// Cập nhật hàm handleChatHistoryRequest
function handleChatHistoryRequest(userID) {
  logMessage("Handling chat history request...");

  try {
    const sheet = getOrCreateCurrentMonthSheet();
    const userRow = findOrCreateUser(sheet, userID);

    if (!userRow) {
      throw new Error("Failed to find or create user");
    }

    const chatLog = sheet.getRange(userRow, 2).getValue();

    if (!chatLog) {
      return {
        success: true,
        data: [],
        logs: executionLogs,
      };
    }

    // Chuyển đổi chat log thành mảng các object
    const messages = chatLog
      .split("\n")
      .filter((msg) => msg && !msg.startsWith("---"))
      .map((msg) => {
        const match = msg.match(/\[(.*?)\](.*?)\/\/(.*)/);
        if (match) {
          const [_, role, content, timestamp] = match;
          return {
            role: role.toLowerCase() === "user" ? "user" : "model",
            time: timestamp.trim(),
            parts: [{ text: content.trim() }],
          };
        }
        return null;
      })
      .filter((msg) => msg !== null);

    return {
      success: true,
      data: messages,
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

// Cập nhật hàm findOrCreateUser
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
    // Khởi tạo chat log trống - không dùng "[]" nữa
    sheet.getRange(userRow, 2).setValue("");

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
  executionLogs = [];
  logMessage("Received POST request");

  try {
    logMessage(`Content type: ${e.postData.type}`);
    logMessage(`Raw content: ${e.postData.contents}`);

    const postData = JSON.parse(e.postData.contents);
    logMessage(`Parsed post data: ${JSON.stringify(postData)}`);

    let result;
    switch (postData.requestType) {
      case Vx_Sheet_RequestType.NEW_MESSAGE:
        // Sử dụng trực tiếp messageData từ payload
        result = updateChatLog(postData.userID, postData.message);
        break;
      case Vx_Sheet_RequestType.CHAT_HISTORY:
        result = handleChatHistoryRequest(postData.userID);
        break;
      default:
        result = {
          success: false,
          error: "Invalid request type",
          logs: executionLogs,
        };
    }

    // Không cần trả về response chi tiết với no-cors
    return ContentService.createTextOutput("OK");
  } catch (error) {
    logMessage(`Error in doPost: ${error.toString()}`);
    logMessage(`Error stack: ${error.stack}`);
    return ContentService.createTextOutput("Error");
  }
}

// Cập nhật hàm doOptions
function doOptions(e) {
  const headers = getCorsHeaders();
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders(headers);
}
