/**
 * Vanced Customer Support Chatbot - Google Apps Script
 * Quản lý Chat History và Rate Limiting System
 *
 * Module 1: Chat History Management
 * Module 2: Rate Limiting & Session Validation
 */

// ====== DEBUG CONFIGURATION ======
const DeBug_IsActive = true; // Set to false to disable debug logging

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
    Logger.log(`${logMessage} | Data: ${JSON.stringify(data)}`);
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

/**
 * Khởi tạo chat session - Giai đoạn 1 (OnLoad)
 * @param {string} machineId - MachineID của user
 * @param {string} userIP - IP address của user
 * @returns {Object} - Response object
 */
function initializeChatSession(machineId, userIP) {
  debugLog("initializeChatSession called", { machineId, userIP });

  try {
    const monthSheet = getCurrentMonthSheet();
    debugLog("Current month sheet", monthSheet);

    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);
    debugLog("Found machine row", { row, machineId });

    if (row > 0) {
      // User đã tồn tại - lấy chat history
      const data = sheet.getRange(row, 1, 1, 8).getValues()[0];
      const [
        ,
        ,
        conversation,
        requestedForRealPerson,
        rpm,
        rpd,
        lastRequestTimeStamp,
        summerize,
      ] = data;

      let chatHistory = [];
      try {
        chatHistory = conversation ? JSON.parse(conversation) : [];
      } catch (e) {
        Logger.log(`Error parsing conversation for ${machineId}: ${e.message}`);
        chatHistory = [];
      }

      Logger.log(`Existing user initialized: ${machineId}`);

      return {
        status: "existing_user",
        machineId: machineId,
        chatHistory: chatHistory,
        rpd: rpd || RPD_LIMIT,
        rpm: rpm || false,
        requestedForRealPerson: requestedForRealPerson || false,
        lastRequestTimeStamp: lastRequestTimeStamp,
      };
    } else {
      // User mới - tạo row mới
      const newRow = sheet.getLastRow() + 1;
      const currentTime = getVietnamTime().toISOString();

      const newData = [
        machineId, // MachineID
        userIP, // IP
        JSON.stringify([]), // Conversation (empty array)
        false, // RequestedForRealPerson
        false, // RPM
        RPD_LIMIT, // RPD
        currentTime, // LastRequestTimeStamp
        "", // Summerize (empty initially)
      ];

      sheet.getRange(newRow, 1, 1, 8).setValues([newData]);

      Logger.log(`New user created: ${machineId}`);

      return {
        status: "new_user",
        machineId: machineId,
        chatHistory: [],
        rpd: RPD_LIMIT,
        rpm: false,
        requestedForRealPerson: false,
        lastRequestTimeStamp: currentTime,
      };
    }
  } catch (error) {
    Logger.log(`Error in initializeChatSession: ${error.message}`);
    return {
      status: "error",
      message: "Lỗi khởi tạo chat session",
      error: error.message,
    };
  }
}

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

/**
 * Kiểm tra và xử lý rate limiting - Giai đoạn 2 (OnSubmit)
 * @param {string} machineId - MachineID
 * @param {string} message - Tin nhắn của user
 * @returns {Object} - Validation result
 */
function validateChatRequest(machineId, message) {
  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row === 0) {
      return {
        status: "error",
        message: "MachineID không tồn tại. Vui lòng refresh trang.",
      };
    }

    // Lấy dữ liệu hiện tại
    const data = sheet.getRange(row, 1, 1, 8).getValues()[0];
    let [, , conversation, , rpm, rpd, lastRequestTimeStamp, summerize] = data;

    // Reset RPD và RPM nếu là ngày mới
    if (isYesterday(lastRequestTimeStamp)) {
      rpd = RPD_LIMIT;
      rpm = false;
      Logger.log(`Reset daily limits for: ${machineId}`);
    }

    // Kiểm tra RPD (Rate Per Day)
    if (rpd <= 0) {
      return {
        status: "rate_limited_daily",
        message:
          "Chatbot hiện tại chỉ là bản thử nghiệm và bạn đã đạt ngưỡng 15 tin nhắn giới hạn mỗi ngày. Chúng tôi xin lỗi vì sự bất tiện này.",
      };
    }

    // Kiểm tra RPM (Rate Per Minute)
    if (rpm === true) {
      return {
        status: "rate_limited_minute",
        message:
          "Bạn đang nhắn quá nhanh, chúng tôi đặt giới hạn ở 01 tin nhắn mỗi phút",
      };
    }

    // Pass tất cả checks - cập nhật counters
    const newRpd = rpd - 1;
    const currentTime = getVietnamTime().toISOString();

    // Cập nhật RPD, RPM và timestamp
    sheet.getRange(row, 5).setValue(true); // Column E: RPM = true
    sheet.getRange(row, 6).setValue(newRpd); // Column F: RPD - 1
    sheet.getRange(row, 7).setValue(currentTime); // Column G: LastRequestTimeStamp

    // Set timeout để reset RPM sau 1 phút
    // Note: Apps Script không hỗ trợ setTimeout, sẽ dùng Trigger
    setRPMResetTrigger(machineId, row);

    Logger.log(`Rate check passed for: ${machineId}, RPD remaining: ${newRpd}`);

    return {
      status: "valid",
      message: "Request approved",
      rpdRemaining: newRpd,
      currentConversation: conversation ? JSON.parse(conversation) : [],
    };
  } catch (error) {
    Logger.log(`Error in validateChatRequest: ${error.message}`);
    return {
      status: "error",
      message: "Lỗi xử lý request",
      error: error.message,
    };
  }
}

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

/**
 * Main API endpoint - xử lý requests từ Workers
 * @param {GoogleAppsScript.Events.DoGet} e - GET request event
 * @returns {GoogleAppsScript.Content.TextOutput} - JSON response
 */
function doGet(e) {
  const params = e.parameter;
  const action = params.action;
  debugLog("Apps Script API Request", { action, params });

  let response = {};

  try {
    switch (action) {
      case "initChat":
        response = initializeChatSession(params.machineId, params.userIP);
        break;

      case "validateChat":
        response = validateChatRequest(params.machineId, params.message);
        break;

      case "updateHistory":
        const conversation = JSON.parse(params.conversation);
        const success = updateChatHistory(params.machineId, conversation);
        response = { status: success ? "success" : "error" };
        break;

      case "markHumanSupport":
        const marked = markRequestedHumanSupport(params.machineId);
        response = { status: marked ? "success" : "error" };
        break;

      case "updateSummerize":
        const summerizeUpdated = updateSummerize(
          params.machineId,
          params.summerize
        );
        response = { status: summerizeUpdated ? "success" : "error" };
        break;

      case "batchUpdate":
        response = handleBatchUpdate(params);
        break;

      default:
        response = { status: "error", message: "Invalid action" };
    }
  } catch (error) {
    debugLog("Apps Script API Error", { error: error.message, action });
    response = { status: "error", message: error.message };
  }

  debugLog("Apps Script API Response", {
    action,
    responseStatus: response.status,
    responseKeys: Object.keys(response),
  });
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(
    ContentService.MimeType.JSON
  );
}

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
 * POST endpoint (nếu cần)
 */
function doPost(e) {
  return doGet(e);
}
