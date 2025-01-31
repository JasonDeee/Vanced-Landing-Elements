// Hàm lấy hoặc tạo sheet cho tháng hiện tại
function getOrCreateCurrentMonthSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentDate = new Date();
  const sheetName = Utilities.formatDate(currentDate, "GMT+7", "MMM yyyy"); // Ví dụ: "Mar 2024"

  let sheet = ss.getSheetByName(sheetName);

  // Nếu sheet chưa tồn tại, tạo mới
  if (!sheet) {
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
  }

  return sheet;
}

// Hàm cập nhật hoặc tạo mới chat log cho user
function updateChatLog(userID, newMessage) {
  const sheet = getOrCreateCurrentMonthSheet();

  // Tìm row của user trong sheet hiện tại
  const userIDColumn = sheet.getRange("A:A").getValues();
  let userRow = -1;

  for (let i = 1; i < userIDColumn.length; i++) {
    if (userIDColumn[i][0] === userID) {
      userRow = i + 1;
      break;
    }
  }

  try {
    // Nếu user chưa có trong sheet, thêm mới
    if (userRow === -1) {
      userRow = sheet.getLastRow() + 1;
      sheet.getRange(userRow, 1).setValue(userID);
      // Khởi tạo mảng chat rỗng
      sheet.getRange(userRow, 2).setValue(JSON.stringify([]));
    }

    // Lấy chat log hiện tại
    let chatLog = JSON.parse(sheet.getRange(userRow, 2).getValue() || "[]");

    // Thêm tin nhắn mới vào chat log
    chatLog.push(newMessage);

    // Cập nhật lại chat log trong sheet
    sheet.getRange(userRow, 2).setValue(JSON.stringify(chatLog));

    return { success: true };
  } catch (error) {
    console.error("Error updating chat log:", error);
    return {
      success: false,
      error: error.toString(),
    };
  }
}

// Hàm xử lý POST request từ client
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const { userID, message, role } = postData;

    if (!userID || !message || !role) {
      throw new Error("Missing required fields");
    }

    // Định dạng tin nhắn theo cấu trúc yêu cầu
    const formattedMessage = {
      parts: [{ text: message }],
      role: role,
    };

    const result = updateChatLog(userID, formattedMessage);

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Hàm lấy toàn bộ chat history của một user
function getChatHistory(userID) {
  try {
    const sheet = getOrCreateCurrentMonthSheet();
    const userIDColumn = sheet.getRange("A:A").getValues();
    let userRow = -1;

    for (let i = 1; i < userIDColumn.length; i++) {
      if (userIDColumn[i][0] === userID) {
        userRow = i + 1;
        break;
      }
    }

    if (userRow === -1) {
      return { success: true, data: [] };
    }

    const chatLog = JSON.parse(sheet.getRange(userRow, 2).getValue() || "[]");
    return { success: true, data: chatLog };
  } catch (error) {
    return {
      success: false,
      error: error.toString(),
    };
  }
}

// Hàm xử lý GET request để lấy chat history
function doGet(e) {
  try {
    const userID = e.parameter.userID;

    if (!userID) {
      throw new Error("Missing userID parameter");
    }

    const result = getChatHistory(userID);

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        error: error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
