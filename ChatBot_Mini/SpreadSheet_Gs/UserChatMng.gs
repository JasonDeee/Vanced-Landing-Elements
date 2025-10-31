/**
 * Vanced Customer Support Chatbot - Google Apps Script
 * Quản lý Chat History và Rate Limiting System
 *
 * Module 1: Chat History Management
 * Module 2: Rate Limiting & Session Validation
 */

// ====== DEBUG CONFIGURATION ======
const DeBug_IsActive = true; // Set to false to disable debug logging
const ADMIN_EMAIL = "me@vanced.media"; // Cập nhật email admin ở đây

/**
 * Debug logging function
 * @param {string} message - Debug message
 * @param {any} data - Optional data to log
 */
function debugLog(message, data = null) {
  if (!DeBug_IsActive) return;

  const timestamp = new Date().toISOString();
  const logMessage = `[DEBUG ${timestamp}] ${message}`;

  if (data !== null) {
    // Dùng cả logger của gs và Console cơ bản
    Logger.log(`${logMessage} | Data: ${JSON.stringify(data)}`);
    console.log(`${logMessage} | Data: ${JSON.stringify(data)}`);
  } else {
    Logger.log(logMessage);
  }
}

// ====== CONSTANTS ======
const RPD_LIMIT = 15; // Messages per day
const RPM_LIMIT = 1; // Messages per minute (boolean flag)
const TIMEZONE_OFFSET = 7; // GMT+7 Vietnam

// ====== UTILITY FUNCTIONS ======

/**
 * Lấy tên sheet theo tháng hiện tại
 * @returns {string} - Tên sheet (Jan, Feb, Mar, ...)
 */
function getCurrentMonthSheet() {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const now = new Date();
  const vietnamTime = new Date(
    now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000
  );
  return months[vietnamTime.getMonth()];
}

/**
 * Lấy thời gian hiện tại theo múi giờ Việt Nam
 * @returns {Date} - Thời gian GMT+7
 */
function getVietnamTime() {
  const now = new Date();
  return new Date(now.getTime() + TIMEZONE_OFFSET * 60 * 60 * 1000);
}

/**
 * Kiểm tra xem timestamp có phải là ngày hôm qua không
 * @param {string} timestamp - ISO timestamp string
 * @returns {boolean} - true nếu là hôm qua
 */
function isYesterday(timestamp) {
  if (!timestamp) return true; // Nếu chưa có timestamp, coi như hôm qua

  const vietnamTime = getVietnamTime();
  const lastRequest = new Date(timestamp);

  // So sánh ngày (không tính giờ)
  return vietnamTime.toDateString() !== lastRequest.toDateString();
}

/**
 * Lấy hoặc tạo sheet theo tháng
 * @param {string} monthName - Tên tháng (Jan, Feb, ...)
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} - Sheet object
 */
function getOrCreateMonthSheet(monthName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(monthName);

  if (!sheet) {
    // Tạo sheet mới nếu chưa có
    sheet = spreadsheet.insertSheet(monthName);

    // Tạo header với cột Summerize mới
    const headers = [
      "MachineID",
      "IP",
      "Conversation",
      "RequestedForRealPerson",
      "RPM",
      "RPD",
      "LastRequestTimeStamp",
      "Summerize",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Format header
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f0f0f0");

    Logger.log(`Created new sheet: ${monthName}`);
  }

  return sheet;
}

/**
 * Tìm row của MachineID trong sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet object
 * @param {string} machineId - MachineID cần tìm
 * @returns {number} - Row number (0 nếu không tìm thấy)
 */
function findMachineIdRow(sheet, machineId) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    // Bỏ qua header row
    if (data[i][0] === machineId) {
      return i + 1; // Google Sheets row index bắt đầu từ 1
    }
  }

  return 0; // Không tìm thấy
}

// ====== MODULE 1: CHAT HISTORY MANAGEMENT ======

// REMOVED: initializeChatSession - duplicate of handleInitChat

/**
 * Cập nhật conversation sau khi chat
 * @param {string} machineId - MachineID
 * @param {Array} newConversation - Mảng conversation mới
 * @returns {boolean} - Success status
 */
function updateChatHistory(machineId, newConversation) {
  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row > 0) {
      const conversationJson = JSON.stringify(newConversation);
      sheet.getRange(row, 3).setValue(conversationJson); // Column C: Conversation

      Logger.log(`Updated chat history for: ${machineId}`);
      return true;
    }

    return false;
  } catch (error) {
    Logger.log(`Error updating chat history: ${error.message}`);
    return false;
  }
}

/**
 * Đánh dấu user đã request human support
 * @param {string} machineId - MachineID
 * @returns {boolean} - Success status
 */
function markRequestedHumanSupport(machineId) {
  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row > 0) {
      sheet.getRange(row, 4).setValue(true); // Column D: RequestedForRealPerson
      Logger.log(`Marked human support request for: ${machineId}`);
      return true;
    }

    return false;
  } catch (error) {
    Logger.log(`Error marking human support: ${error.message}`);
    return false;
  }
}

/**
 * Cập nhật Summerize cho MachineID
 * @param {string} machineId - MachineID
 * @param {string} summerize - Nội dung summary
 * @returns {boolean} - Success status
 */
function updateSummerize(machineId, summerize) {
  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row > 0) {
      sheet.getRange(row, 8).setValue(summerize || ""); // Column H: Summerize
      Logger.log(`Updated summerize for: ${machineId}`);
      return true;
    }

    return false;
  } catch (error) {
    Logger.log(`Error updating summerize: ${error.message}`);
    return false;
  }
}

// ====== MODULE 2: RATE LIMITING & SESSION VALIDATION ======

// REMOVED: validateChatRequest - duplicate of handleValidateChat

/**
 * Tạo trigger để reset RPM sau 1 phút
 * @param {string} machineId - MachineID
 * @param {number} row - Row number trong sheet
 */
function setRPMResetTrigger(machineId, row) {
  try {
    // Tạo trigger chạy sau 1 phút
    const triggerFunction = "resetRPMForMachine";

    // Lưu thông tin vào PropertiesService để trigger có thể access
    const properties = PropertiesService.getScriptProperties();
    const triggerData = {
      machineId: machineId,
      row: row,
      monthSheet: getCurrentMonthSheet(),
      timestamp: new Date().getTime(),
    };

    properties.setProperty(
      `rpm_reset_${machineId}`,
      JSON.stringify(triggerData)
    );

    // Tạo time-based trigger
    ScriptApp.newTrigger(triggerFunction)
      .timeBased()
      .after(60 * 1000) // 1 phút
      .create();

    Logger.log(`Created RPM reset trigger for: ${machineId}`);
  } catch (error) {
    Logger.log(`Error creating RPM reset trigger: ${error.message}`);
  }
}

/**
 * Reset RPM flag sau 1 phút (được gọi bởi trigger)
 * @param {GoogleAppsScript.Events.TimeDriven} e - Trigger event
 */
function resetRPMForMachine(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();

    // Tìm tất cả RPM reset tasks
    for (const [key, value] of Object.entries(allProperties)) {
      if (key.startsWith("rpm_reset_")) {
        const triggerData = JSON.parse(value);
        const machineId = triggerData.machineId;
        const row = triggerData.row;
        const monthSheet = triggerData.monthSheet;
        const timestamp = triggerData.timestamp;

        // Kiểm tra xem trigger có đúng thời gian không (tolerance 5 phút)
        const now = new Date().getTime();
        if (now - timestamp > 5 * 60 * 1000) {
          // Quá cũ, xóa property
          properties.deleteProperty(key);
          continue;
        }

        // Reset RPM
        const sheet = getOrCreateMonthSheet(monthSheet);
        sheet.getRange(row, 5).setValue(false); // Column E: RPM = false

        // Xóa property sau khi xử lý
        properties.deleteProperty(key);

        Logger.log(`Reset RPM for: ${machineId}`);
      }
    }

    // Xóa trigger sau khi chạy
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === "resetRPMForMachine") {
        ScriptApp.deleteTrigger(trigger);
      }
    }
  } catch (error) {
    Logger.log(`Error in resetRPMForMachine: ${error.message}`);
  }
}

// ====== API ENDPOINTS ======

// REMOVED: Old doGet function - replaced by new version with WebSocket support

/**
 * Xử lý batch update - gộp nhiều actions thành 1 lần gọi
 * @param {Object} params - Parameters chứa actions array
 * @returns {Object} - Batch response
 */
function handleBatchUpdate(params) {
  debugLog("handleBatchUpdate called", { params });

  try {
    const actions = JSON.parse(params.actions || "[]");
    const machineId = params.machineId;

    if (!machineId) {
      return {
        status: "error",
        message: "MachineID is required for batch update",
      };
    }

    const results = {};
    let hasError = false;

    // Xử lý từng action trong batch
    for (const action of actions) {
      debugLog("Processing batch action", { type: action.type, machineId });

      switch (action.type) {
        case "updateHistory":
          const historySuccess = updateChatHistory(
            machineId,
            JSON.parse(action.data.conversation)
          );
          results.updateHistory = { success: historySuccess };
          if (!historySuccess) hasError = true;
          break;

        case "updateSummerize":
          const summerizeSuccess = updateSummerize(
            machineId,
            action.data.summerize
          );
          results.updateSummerize = { success: summerizeSuccess };
          if (!summerizeSuccess) hasError = true;
          break;

        case "markHumanSupport":
          const humanSupportSuccess = markRequestedHumanSupport(machineId);
          results.markHumanSupport = { success: humanSupportSuccess };
          if (!humanSupportSuccess) hasError = true;
          break;

        default:
          results[action.type] = {
            success: false,
            error: "Unknown action type",
          };
          hasError = true;
      }
    }

    debugLog("Batch update completed", {
      machineId,
      actionsCount: actions.length,
      hasError,
      results,
    });

    return {
      status: hasError ? "partial_success" : "success",
      message: hasError
        ? "Some actions failed"
        : "All actions completed successfully",
      results: results,
      processedActions: actions.length,
    };
  } catch (error) {
    debugLog("Error in handleBatchUpdate", { error: error.message, params });
    return {
      status: "error",
      message: "Batch update failed",
      error: error.message,
    };
  }
}

/**
 * Xử lý update tất cả - phiên bản đơn giản hóa
 * @param {Object} params - Parameters với các fields riêng biệt
 * @returns {Object} - Update response
 */
function handleUpdateAll(params) {
  debugLog("handleUpdateAll called", {
    machineId: params.machineId,
    hasConversation: !!params.conversation,
    hasSummerize: !!params.summerize,
    needsHumanSupport: params.needsHumanSupport,
  });

  try {
    const machineId = params.machineId;
    const conversation = params.conversation;
    const summerize = params.summerize;
    const needsHumanSupport =
      params.needsHumanSupport === true || params.needsHumanSupport === "true";

    if (!machineId) {
      return { status: "error", message: "MachineID is required" };
    }

    const results = {};
    let hasError = false;

    // 1. Cập nhật conversation
    if (conversation) {
      debugLog("Updating conversation", { machineId });
      const conversationArray = JSON.parse(conversation);
      const historySuccess = updateChatHistory(machineId, conversationArray);
      results.updateHistory = { success: historySuccess };
      if (!historySuccess) hasError = true;
    }

    // 2. Cập nhật summerize
    if (summerize) {
      debugLog("Updating summerize", {
        machineId,
        summerizeLength: summerize.length,
      });
      const summerizeSuccess = updateSummerize(machineId, summerize);
      results.updateSummerize = { success: summerizeSuccess };
      if (!summerizeSuccess) hasError = true;
    }

    // 3. Đánh dấu human support nếu cần
    if (needsHumanSupport) {
      debugLog("Marking human support", { machineId });
      const humanSupportSuccess = markRequestedHumanSupport(machineId);
      results.markHumanSupport = { success: humanSupportSuccess };
      if (!humanSupportSuccess) hasError = true;
    }

    debugLog("UpdateAll completed", {
      machineId,
      hasError,
      results,
      updatedConversation: !!conversation,
      updatedSummerize: !!summerize,
      markedHumanSupport: needsHumanSupport,
    });

    return {
      status: hasError ? "partial_success" : "success",
      message: hasError
        ? "Some updates failed"
        : "All updates completed successfully",
      results: results,
    };
  } catch (error) {
    debugLog("Error in handleUpdateAll", { error: error.message, params });
    return {
      status: "error",
      message: "Update failed",
      error: error.message,
    };
  }
}

// REMOVED: Old doPost function - replaced by new version with WebSocket support

// REMOVED: Old P2P support functions - replaced by WebSocket support system
// All P2P functionality now handled by WebSocket chat rooms
// REMOVED: Custom signaling server functions - replaced by WebSocket system
// All P2P signaling now handled by Durable Objects

// ====== MAIN HANDLER FUNCTIONS ======

/**
 * Main handler function for GET requests
 */
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (!action) {
      return createResponse("error", "Missing action parameter");
    }

    debugLog("Received GET request", { action, parameters: e.parameter });

    switch (action) {
      case "initChat":
        return handleInitChat(e.parameter);
      case "validateChat":
        return handleValidateChat(e.parameter);
      case "updateP2PRequest":
        return handleUpdateP2PRequest(e.parameter);
      case "getP2PRequests":
        return handleGetP2PRequests(e.parameter);
      case "updateP2PConnection":
        return handleUpdateP2PConnection(e.parameter);
      // New WebSocket chat actions
      case "createSupportRequest":
        return handleCreateSupportRequest(e.parameter);
      case "getSupportRequests":
        return handleGetSupportRequests(e.parameter);
      case "updateSupportConnection":
        return handleUpdateSupportConnection(e.parameter);
      case "saveChatMessage":
        return handleSaveChatMessage(e.parameter);
      case "saveChatHistory":
        return handleSaveChatHistory(e.parameter);
      case "getChatHistory":
        return handleGetChatHistory(e.parameter);
      case "endSupportChat":
        return handleEndSupportChat(e.parameter);
      default:
        return createResponse("error", "Unknown action: " + action);
    }
  } catch (error) {
    debugLog("Error in doGet", error);
    return createResponse("error", "Internal server error: " + error.message);
  }
}

/**
 * Main handler function for POST requests
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;

    if (!action) {
      return createResponse("error", "Missing action parameter");
    }

    debugLog("Received POST request", { action, data: postData });

    switch (action) {
      case "updateAll":
        return handleUpdateAll(postData);
      case "saveChatMessage":
        return handleSaveChatMessage(postData);
      case "endSupportChat":
        return handleEndSupportChat(postData);
      default:
        return createResponse("error", "Unknown POST action: " + action);
    }
  } catch (error) {
    debugLog("Error in doPost", error);
    return createResponse("error", "Internal server error: " + error.message);
  }
}

// ====== WEBSOCKET CHAT SUPPORT FUNCTIONS ======

/**
 * Create support request (WebSocket chat)
 */
function handleCreateSupportRequest(params) {
  try {
    const { machineId, supportData } = params;

    if (!machineId || !supportData) {
      return createResponse("error", "Missing required parameters");
    }

    const data = JSON.parse(supportData);
    debugLog("Creating support request", { machineId, data });

    // Get or create Support Requests sheet
    const sheet = getSupportRequestsSheet();

    // Check if request already exists
    const existingRow = findSupportRequestRow(sheet, machineId);

    if (existingRow > 0) {
      // Update existing request
      sheet
        .getRange(existingRow, 2, 1, 8)
        .setValues([
          [
            data.clientPeerID,
            data.roomID,
            data.adminPeerID || "",
            data.status,
            data.adminNickname || "",
            data.timestamp,
            data.connectionStartTime || "",
            JSON.stringify(data.chatHistory || []),
          ],
        ]);
    } else {
      // Create new request
      sheet.appendRow([
        machineId,
        data.clientPeerID,
        data.roomID,
        data.adminPeerID || "",
        data.status,
        data.adminNickname || "",
        data.timestamp,
        data.connectionStartTime || "",
        JSON.stringify(data.chatHistory || []),
      ]);
    }

    return createResponse("success", "Support request created", { machineId });
  } catch (error) {
    debugLog("Error creating support request", error);
    return createResponse(
      "error",
      "Failed to create support request: " + error.message
    );
  }
}

/**
 * Get all support requests for admin dashboard
 */
function handleGetSupportRequests(params) {
  try {
    const sheet = getSupportRequestsSheet();
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return createResponse("success", "No support requests found", {
        requests: [],
      });
    }

    const requests = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      requests.push({
        machineId: row[0],
        clientPeerID: row[1],
        roomID: row[2],
        adminPeerID: row[3],
        status: row[4],
        adminNickname: row[5],
        timestamp: row[6],
        connectionStartTime: row[7],
        chatHistory: row[8] ? JSON.parse(row[8]) : [],
      });
    }

    // Sort by timestamp (newest first)
    requests.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    debugLog("Retrieved support requests", { count: requests.length });
    return createResponse("success", "Support requests retrieved", {
      requests,
    });
  } catch (error) {
    debugLog("Error getting support requests", error);
    return createResponse(
      "error",
      "Failed to get support requests: " + error.message
    );
  }
}

/**
 * Update support connection status
 */
function handleUpdateSupportConnection(params) {
  try {
    const { machineId, connectionData } = params;

    if (!machineId || !connectionData) {
      return createResponse("error", "Missing required parameters");
    }

    const data = JSON.parse(connectionData);
    debugLog("Updating support connection", { machineId, data });

    const sheet = getSupportRequestsSheet();
    const row = findSupportRequestRow(sheet, machineId);

    if (row === 0) {
      return createResponse("error", "Support request not found");
    }

    // Update connection info
    if (data.adminPeerID) sheet.getRange(row, 4).setValue(data.adminPeerID);
    if (data.status) sheet.getRange(row, 5).setValue(data.status);
    if (data.adminNickname) sheet.getRange(row, 6).setValue(data.adminNickname);
    if (data.connectionStartTime)
      sheet.getRange(row, 8).setValue(data.connectionStartTime);

    return createResponse("success", "Connection updated", { machineId });
  } catch (error) {
    debugLog("Error updating support connection", error);
    return createResponse(
      "error",
      "Failed to update connection: " + error.message
    );
  }
}

/**
 * Save chat message to history
 */
function handleSaveChatMessage(params) {
  try {
    const { machineId, messageData } = params;

    if (!machineId || !messageData) {
      return createResponse("error", "Missing required parameters");
    }

    const message = JSON.parse(messageData);
    debugLog("Saving chat message", { machineId, message });

    const sheet = getSupportRequestsSheet();
    const row = findSupportRequestRow(sheet, machineId);

    if (row === 0) {
      return createResponse("error", "Support request not found");
    }

    // Get current chat history
    const currentHistoryStr = sheet.getRange(row, 9).getValue();
    let chatHistory = [];

    if (currentHistoryStr) {
      try {
        chatHistory = JSON.parse(currentHistoryStr);
      } catch (e) {
        debugLog("Error parsing chat history, starting fresh", e);
        chatHistory = [];
      }
    }

    // Add new message
    chatHistory.push({
      from: message.from,
      fromPeerID: message.fromPeerID,
      text: message.text,
      timestamp: message.timestamp,
      type: message.type,
    });

    // Update chat history in sheet
    sheet.getRange(row, 9).setValue(JSON.stringify(chatHistory));

    return createResponse("success", "Message saved", {
      machineId,
      messageCount: chatHistory.length,
    });
  } catch (error) {
    debugLog("Error saving chat message", error);
    return createResponse("error", "Failed to save message: " + error.message);
  }
}

/**
 * Get chat history for a machine ID
 */
function handleGetChatHistory(params) {
  try {
    const { machineId } = params;

    if (!machineId) {
      return createResponse("error", "Missing machineId parameter");
    }

    const sheet = getSupportRequestsSheet();
    const row = findSupportRequestRow(sheet, machineId);

    if (row === 0) {
      return createResponse("success", "No chat history found", {
        chatHistory: [],
      });
    }

    const historyStr = sheet.getRange(row, 9).getValue();
    let chatHistory = [];

    if (historyStr) {
      try {
        chatHistory = JSON.parse(historyStr);
      } catch (e) {
        debugLog("Error parsing chat history", e);
        chatHistory = [];
      }
    }

    debugLog("Retrieved chat history", {
      machineId,
      messageCount: chatHistory.length,
    });
    return createResponse("success", "Chat history retrieved", { chatHistory });
  } catch (error) {
    debugLog("Error getting chat history", error);
    return createResponse(
      "error",
      "Failed to get chat history: " + error.message
    );
  }
}

/**
 * End support chat session
 */
function handleEndSupportChat(params) {
  try {
    const { machineId, endData } = params;

    if (!machineId || !endData) {
      return createResponse("error", "Missing required parameters");
    }

    const data = JSON.parse(endData);
    debugLog("Ending support chat", { machineId, data });

    const sheet = getSupportRequestsSheet();
    const row = findSupportRequestRow(sheet, machineId);

    if (row === 0) {
      return createResponse("error", "Support request not found");
    }

    // Update status and end time
    sheet.getRange(row, 5).setValue(data.status || "ended");

    // Add end info to chat history
    const currentHistoryStr = sheet.getRange(row, 9).getValue();
    let chatHistory = [];

    if (currentHistoryStr) {
      try {
        chatHistory = JSON.parse(currentHistoryStr);
      } catch (e) {
        chatHistory = [];
      }
    }

    // Add end message to history
    chatHistory.push({
      from: "System",
      fromPeerID: "system",
      text: `Chat ended by ${data.endedBy || "unknown"}`,
      timestamp: data.endTime || new Date().toISOString(),
      type: "system",
    });

    sheet.getRange(row, 9).setValue(JSON.stringify(chatHistory));

    return createResponse("success", "Chat ended", { machineId });
  } catch (error) {
    debugLog("Error ending support chat", error);
    return createResponse("error", "Failed to end chat: " + error.message);
  }
}

// ====== SUPPORT SHEET MANAGEMENT ======

/**
 * Get or create Support Requests sheet
 */
function getSupportRequestsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName("SupportRequests");

  if (!sheet) {
    // Create new sheet
    sheet = spreadsheet.insertSheet("SupportRequests");

    // Create headers
    const headers = [
      "MachineID",
      "ClientPeerID",
      "RoomID",
      "AdminPeerID",
      "Status",
      "AdminNickname",
      "Timestamp",
      "ConnectionStartTime",
      "ChatHistory",
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Format header
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f0f0f0");

    debugLog("Created SupportRequests sheet");
  }

  return sheet;
}

/**
 * Find support request row by machine ID
 */
function findSupportRequestRow(sheet, machineId) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === machineId) {
      return i + 1; // Google Sheets row index starts from 1
    }
  }

  return 0; // Not found
}

/**
 * Create standardized response
 */
function createResponse(status, message, data = null) {
  const response = {
    status: status,
    message: message,
    timestamp: new Date().toISOString(),
  };

  if (data) {
    Object.assign(response, data);
  }

  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(
    ContentService.MimeType.JSON
  );
}
/**
 * Save entire chat history (WebSocket chat)
 */
function handleSaveChatHistory(params) {
  try {
    const { machineId, chatHistory } = params;

    if (!machineId || !chatHistory) {
      return createResponse("error", "Missing required parameters");
    }

    const history = JSON.parse(chatHistory);
    debugLog("Saving chat history", {
      machineId,
      messageCount: history.length,
    });

    const sheet = getSupportRequestsSheet();
    const row = findSupportRequestRow(sheet, machineId);

    if (row === 0) {
      return createResponse("error", "Support request not found");
    }

    // Update chat history in sheet
    sheet.getRange(row, 9).setValue(JSON.stringify(history));

    return createResponse("success", "Chat history saved", {
      machineId,
      messageCount: history.length,
    });
  } catch (error) {
    debugLog("Error saving chat history", error);
    return createResponse(
      "error",
      "Failed to save chat history: " + error.message
    );
  }
}
/**
 * Handle initChat request from Workers
 */
function handleInitChat(params) {
  try {
    const { machineId, userIP } = params;

    if (!machineId) {
      return createResponse("error", "Missing machineId parameter");
    }

    debugLog("Handling initChat request", { machineId, userIP });

    // Get current month sheet
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);

    // Find existing user
    const row = findMachineIdRow(sheet, machineId);

    if (row === 0) {
      // New user - create new row
      const newRow = sheet.getLastRow() + 1;
      const timestamp = new Date().toISOString();

      sheet.getRange(newRow, 1, 1, 8).setValues([
        [
          machineId, // MachineID
          userIP, // IP
          "[]", // Conversation (empty array)
          false, // RequestedForRealPerson
          false, // RPM
          RPD_LIMIT, // RPD (start with full limit)
          timestamp, // LastRequestTimeStamp
          "", // Summerize
        ],
      ]);

      debugLog("Created new user", { machineId, row: newRow });

      return createResponse("success", "New user created", {
        status: "new_user",
        chatHistory: [],
        rpd: RPD_LIMIT,
      });
    } else {
      // Existing user - get chat history
      const data = sheet.getRange(row, 1, 1, 8).getValues()[0];
      const [, , conversationStr, , , rpd, ,] = data;

      let chatHistory = [];
      if (conversationStr) {
        try {
          chatHistory = JSON.parse(conversationStr);
        } catch (e) {
          debugLog("Error parsing chat history", e);
          chatHistory = [];
        }
      }

      debugLog("Retrieved existing user", {
        machineId,
        row,
        chatHistoryLength: chatHistory.length,
        rpd,
      });

      return createResponse("success", "Existing user found", {
        status: "existing_user",
        chatHistory: chatHistory,
        rpd: rpd || RPD_LIMIT,
      });
    }
  } catch (error) {
    debugLog("Error in handleInitChat", error);
    return createResponse(
      "error",
      "Failed to initialize chat: " + error.message
    );
  }
}

/**
 * Handle validateChat request from Workers
 */
function handleValidateChat(params) {
  try {
    const { machineId, message } = params;

    if (!machineId || !message) {
      return createResponse("error", "Missing required parameters");
    }

    debugLog("Validating chat request", {
      machineId,
      messageLength: message.length,
    });

    // Get current month sheet
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);

    // Find user
    const row = findMachineIdRow(sheet, machineId);
    if (row === 0) {
      return createResponse("error", "User not found");
    }

    // Get current data
    const data = sheet.getRange(row, 1, 1, 8).getValues()[0];
    const [, , conversationStr, , rpm, rpd, lastRequestTimeStamp] = data;

    // Check RPD limit
    if (rpd <= 0) {
      return createResponse(
        "rate_limited_daily",
        "Bạn đã hết lượt chat trong ngày. Vui lòng quay lại vào ngày mai.",
        {
          rpdRemaining: 0,
        }
      );
    }

    // Check RPM limit (simple check - 1 message per minute)
    const now = new Date();
    const lastRequest = lastRequestTimeStamp
      ? new Date(lastRequestTimeStamp)
      : null;

    if (lastRequest && now - lastRequest < 60000) {
      // 60 seconds
      return createResponse(
        "rate_limited_minute",
        "Vui lòng chờ 1 phút trước khi gửi tin nhắn tiếp theo.",
        {
          rpdRemaining: rpd,
        }
      );
    }

    // Parse current conversation
    let currentConversation = [];
    if (conversationStr) {
      try {
        currentConversation = JSON.parse(conversationStr);
      } catch (e) {
        debugLog("Error parsing conversation", e);
        currentConversation = [];
      }
    }

    debugLog("Chat validation passed", {
      machineId,
      rpd,
      conversationLength: currentConversation.length,
    });

    return createResponse("valid", "Chat request is valid", {
      status: "valid",
      rpdRemaining: rpd,
      currentConversation: currentConversation,
    });
  } catch (error) {
    debugLog("Error in handleValidateChat", error);
    return createResponse("error", "Failed to validate chat: " + error.message);
  }
}
