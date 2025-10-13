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

      case "updateAll":
        response = handleUpdateAll(params);
        break;

      case "updateP2PRequest":
        response = handleP2PRequest(params.machineId, params.p2pData);
        break;

      case "getWaitingClients":
        response = getWaitingClients(params.adminNickname);
        break;

      case "updateClientStatus":
        response = updateClientStatus(
          params.machineId,
          params.status,
          params.adminPeerID,
          params.adminNickname
        );
        break;

      case "saveChatMessage":
        response = saveChatMessage(
          params.machineId,
          params.message,
          params.sender
        );
        break;

      case "getChatHistory":
        response = getChatHistory(params.machineId);
        break;

      case "checkAbandonedConnections":
        response = checkAbandonedConnections();
        break;

      // Custom Signaling API endpoints
      case "signaling":
        response = handleSignalingAPI(params.signalingAction, params);
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

/**
 * POST endpoint - xử lý batch updates
 */
function doPost(e) {
  debugLog("doPost called", {
    hasPostData: !!e.postData,
    contentType: e.postData?.type,
    dataLength: e.postData?.contents?.length,
  });

  try {
    // Parse JSON từ POST body
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;

    debugLog("POST data parsed", {
      action,
      machineId: postData.machineId,
      hasConversation: !!postData.conversation,
      hasSummerize: !!postData.summerize,
    });

    let response = {};

    switch (action) {
      case "updateAll":
        response = handleUpdateAll(postData);
        break;

      default:
        response = { status: "error", message: "Invalid POST action" };
    }

    debugLog("POST response prepared", {
      action,
      responseStatus: response.status,
      responseKeys: Object.keys(response),
    });

    return ContentService.createTextOutput(
      JSON.stringify(response)
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    debugLog("POST error", { error: error.message });

    const errorResponse = {
      status: "error",
      message: "POST processing failed",
      error: error.message,
    };

    return ContentService.createTextOutput(
      JSON.stringify(errorResponse)
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ====== P2P SUPPORT FUNCTIONS ======

/**
 * Handle P2P support request
 * @param {string} machineId - MachineID
 * @param {string} p2pDataJson - P2P data as JSON string
 * @returns {Object} - Response object
 */
function handleP2PRequest(machineId, p2pDataJson) {
  debugLog("handleP2PRequest called", { machineId, p2pDataJson });

  try {
    const p2pData = JSON.parse(p2pDataJson);
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row === 0) {
      return {
        status: "error",
        message: "MachineID không tồn tại",
      };
    }

    // Update cột I (ConfirmedRealPersonRequest)
    sheet.getRange(row, 9).setValue(JSON.stringify(p2pData)); // Column I

    // Send email notification
    sendP2PNotificationEmail(machineId, p2pData);

    debugLog("P2P request saved", { machineId, p2pData });

    return {
      status: "success",
      message: "P2P request saved successfully",
    };
  } catch (error) {
    debugLog("Error in handleP2PRequest", { error: error.message, machineId });
    return {
      status: "error",
      message: "Lỗi xử lý P2P request",
      error: error.message,
    };
  }
}

/**
 * Get waiting clients for admin dashboard
 * @param {string} adminNickname - Admin nickname
 * @returns {Object} - Response with client list
 */
function getWaitingClients(adminNickname) {
  debugLog("getWaitingClients called", { adminNickname });

  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const data = sheet.getDataRange().getValues();
    const clients = [];

    for (let i = 1; i < data.length; i++) {
      const [
        machineId,
        ip,
        conversation,
        requestedForRealPerson,
        rpm,
        rpd,
        lastRequestTimeStamp,
        summerize,
        confirmData,
      ] = data[i];

      if (confirmData) {
        try {
          const p2pData = JSON.parse(confirmData);

          // Only include waiting or warn status
          if (p2pData.status === "waiting" || p2pData.status === "warn") {
            clients.push({
              machineId: machineId,
              ip: ip,
              status: p2pData.status,
              clientPeerID: p2pData.clientPeerID,
              timestamp: p2pData.timestamp,
              summerize: summerize || "",
              lastRequestTimeStamp: lastRequestTimeStamp,
            });
          }
        } catch (parseError) {
          debugLog("Error parsing P2P data", {
            machineId,
            error: parseError.message,
          });
        }
      }
    }

    // Sort by timestamp (newest first)
    clients.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    debugLog("Retrieved waiting clients", {
      count: clients.length,
      adminNickname,
    });

    return {
      status: "success",
      clients: clients,
      count: clients.length,
    };
  } catch (error) {
    debugLog("Error in getWaitingClients", {
      error: error.message,
      adminNickname,
    });
    return {
      status: "error",
      message: "Lỗi lấy danh sách khách hàng",
      error: error.message,
    };
  }
}

/**
 * Update client P2P status
 * @param {string} machineId - MachineID
 * @param {string} status - New status
 * @param {string} adminPeerID - Admin PeerID
 * @param {string} adminNickname - Admin nickname
 * @returns {Object} - Response object
 */
function updateClientStatus(machineId, status, adminPeerID, adminNickname) {
  debugLog("updateClientStatus called", {
    machineId,
    status,
    adminPeerID,
    adminNickname,
  });

  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row === 0) {
      return {
        status: "error",
        message: "MachineID không tồn tại",
      };
    }

    // Get current P2P data
    const currentData = sheet.getRange(row, 9).getValue(); // Column I
    let p2pData = {};

    if (currentData) {
      try {
        p2pData = JSON.parse(currentData);
      } catch (parseError) {
        debugLog("Error parsing existing P2P data", parseError.message);
      }
    }

    // Update P2P data
    p2pData.status = status;
    if (adminPeerID) p2pData.adminPeerID = adminPeerID;
    if (adminNickname) p2pData.adminNickname = adminNickname;
    if (status === "connected")
      p2pData.connectionStartTime = new Date().toISOString();

    // Save updated data
    sheet.getRange(row, 9).setValue(JSON.stringify(p2pData));

    debugLog("Client status updated", { machineId, status, p2pData });

    return {
      status: "success",
      message: "Status updated successfully",
    };
  } catch (error) {
    debugLog("Error in updateClientStatus", {
      error: error.message,
      machineId,
    });
    return {
      status: "error",
      message: "Lỗi cập nhật status",
      error: error.message,
    };
  }
}
/**
 * Save P2P chat message
 * @param {string} machineId - MachineID
 * @param {string} message - Message content
 * @param {string} sender - Message sender
 * @returns {Object} - Response object
 */
function saveChatMessage(machineId, message, sender) {
  debugLog("saveChatMessage called", { machineId, message, sender });

  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row === 0) {
      return {
        status: "error",
        message: "MachineID không tồn tại",
      };
    }

    // Get current conversation
    const currentConversation = sheet.getRange(row, 3).getValue(); // Column C
    let conversation = [];

    if (currentConversation) {
      try {
        conversation = JSON.parse(currentConversation);
      } catch (parseError) {
        debugLog("Error parsing conversation", parseError.message);
        conversation = [];
      }
    }

    // Add new message
    const newMessage = {
      role: sender === "admin" ? "assistant" : "user",
      content: message,
    };

    conversation.push(newMessage);

    // Save updated conversation
    sheet.getRange(row, 3).setValue(JSON.stringify(conversation));

    debugLog("Chat message saved", {
      machineId,
      messageLength: message.length,
      conversationLength: conversation.length,
    });

    return {
      status: "success",
      message: "Message saved successfully",
    };
  } catch (error) {
    debugLog("Error in saveChatMessage", { error: error.message, machineId });
    return {
      status: "error",
      message: "Lỗi lưu tin nhắn",
      error: error.message,
    };
  }
}

/**
 * Get chat history for admin
 * @param {string} machineId - MachineID
 * @returns {Object} - Response with chat history
 */
function getChatHistory(machineId) {
  debugLog("getChatHistory called", { machineId });

  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const row = findMachineIdRow(sheet, machineId);

    if (row === 0) {
      return {
        status: "error",
        message: "MachineID không tồn tại",
      };
    }

    // Get conversation
    const conversationData = sheet.getRange(row, 3).getValue(); // Column C
    let chatHistory = [];

    if (conversationData) {
      try {
        chatHistory = JSON.parse(conversationData);
      } catch (parseError) {
        debugLog("Error parsing chat history", parseError.message);
        chatHistory = [];
      }
    }

    debugLog("Retrieved chat history", {
      machineId,
      historyLength: chatHistory.length,
    });

    return {
      status: "success",
      chatHistory: chatHistory,
      machineId: machineId,
    };
  } catch (error) {
    debugLog("Error in getChatHistory", { error: error.message, machineId });
    return {
      status: "error",
      message: "Lỗi lấy lịch sử chat",
      error: error.message,
    };
  }
}

/**
 * Check and update abandoned connections
 * @returns {Object} - Response object
 */
function checkAbandonedConnections() {
  debugLog("checkAbandonedConnections called");

  try {
    const monthSheet = getCurrentMonthSheet();
    const sheet = getOrCreateMonthSheet(monthSheet);
    const data = sheet.getDataRange().getValues();
    let updatedCount = 0;

    for (let i = 1; i < data.length; i++) {
      const [
        machineId,
        ip,
        conversation,
        requestedForRealPerson,
        rpm,
        rpd,
        lastRequestTimeStamp,
        summerize,
        confirmData,
      ] = data[i];

      if (confirmData) {
        try {
          const p2pData = JSON.parse(confirmData);
          const lastRequest = new Date(lastRequestTimeStamp);
          const now = getVietnamTime();
          const diffMinutes = (now - lastRequest) / (1000 * 60);

          // Check if connection is abandoned (>25 minutes)
          if (
            diffMinutes > 25 &&
            p2pData.status !== "closed" &&
            p2pData.status !== "warn"
          ) {
            p2pData.status = "warn";
            sheet.getRange(i + 1, 9).setValue(JSON.stringify(p2pData)); // Column I
            updatedCount++;

            debugLog("Marked connection as abandoned", {
              machineId,
              diffMinutes,
            });
          }
        } catch (parseError) {
          debugLog("Error parsing P2P data in abandoned check", {
            machineId,
            error: parseError.message,
          });
        }
      }
    }

    debugLog("Abandoned connections check completed", { updatedCount });

    return {
      status: "success",
      message: `Checked abandoned connections, updated ${updatedCount} records`,
      updatedCount: updatedCount,
    };
  } catch (error) {
    debugLog("Error in checkAbandonedConnections", { error: error.message });
    return {
      status: "error",
      message: "Lỗi kiểm tra kết nối bị bỏ",
      error: error.message,
    };
  }
}

/**
 * Send P2P notification email
 * @param {string} machineId - MachineID
 * @param {Object} p2pData - P2P data
 */
function sendP2PNotificationEmail(machineId, p2pData) {
  try {
    const subject = `[Vanced Support] Khách hàng yêu cầu hỗ trợ - ${machineId}`;
    const body = `
Khách hàng ${machineId} đang yêu cầu hỗ trợ trực tiếp.

Chi tiết:
- MachineID: ${machineId}
- PeerID: ${p2pData.clientPeerID}
- Thời gian: ${p2pData.timestamp}
- Status: ${p2pData.status}

Vui lòng truy cập Admin Dashboard để hỗ trợ khách hàng.

---
Vanced Customer Support System
    `;

    MailApp.sendEmail(ADMIN_EMAIL, subject, body);
    debugLog("P2P notification email sent", { machineId, email: ADMIN_EMAIL });
  } catch (error) {
    debugLog("Error sending P2P notification email", {
      error: error.message,
      machineId,
    });
  }
}
// ====== CUSTOM SIGNALING SERVER FUNCTIONS ======

/**
 * Initialize custom signaling - create signaling sheet if not exists
 */
function initializeSignalingSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let signalingSheet = spreadsheet.getSheetByName("P2P_Signaling");

  if (!signalingSheet) {
    signalingSheet = spreadsheet.insertSheet("P2P_Signaling");

    // Create headers for signaling data
    const headers = [
      "ID", // Unique message ID
      "FromPeerID", // Sender PeerID
      "ToPeerID", // Target PeerID
      "Type", // offer|answer|ice-candidate|ping|pong
      "Data", // SDP/ICE data (JSON string)
      "Timestamp", // Creation timestamp
      "Status", // pending|delivered|expired
      "RoomID", // P2P Room ID (for grouping)
    ];

    signalingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Format header
    const headerRange = signalingSheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#e8f0fe");

    debugLog("Created P2P_Signaling sheet", { headers });
  }

  return signalingSheet;
}

/**
 * Register peer in signaling system
 * @param {string} peerID - Peer ID to register
 * @param {string} roomID - Room ID for P2P session
 * @returns {Object} - Registration result
 */
function registerPeer(peerID, roomID) {
  debugLog("registerPeer called", { peerID, roomID });

  try {
    const signalingSheet = initializeSignalingSheet();

    // Send ping message to register peer
    const pingMessage = {
      id: generateMessageID(),
      fromPeerID: peerID,
      toPeerID: "SYSTEM",
      type: "ping",
      data: JSON.stringify({ action: "register", roomID: roomID }),
      timestamp: new Date().toISOString(),
      status: "pending",
      roomID: roomID,
    };

    // Add ping message to signaling sheet
    const newRow = signalingSheet.getLastRow() + 1;
    signalingSheet
      .getRange(newRow, 1, 1, 8)
      .setValues([
        [
          pingMessage.id,
          pingMessage.fromPeerID,
          pingMessage.toPeerID,
          pingMessage.type,
          pingMessage.data,
          pingMessage.timestamp,
          pingMessage.status,
          pingMessage.roomID,
        ],
      ]);

    debugLog("Peer registered successfully", {
      peerID,
      roomID,
      messageID: pingMessage.id,
    });

    return {
      status: "success",
      message: "Peer registered successfully",
      peerID: peerID,
      roomID: roomID,
      messageID: pingMessage.id,
    };
  } catch (error) {
    debugLog("Error in registerPeer", { error: error.message, peerID, roomID });
    return {
      status: "error",
      message: "Failed to register peer",
      error: error.message,
    };
  }
}

/**
 * Send signaling message (SDP offer/answer or ICE candidate)
 * @param {string} fromPeerID - Sender PeerID
 * @param {string} toPeerID - Target PeerID
 * @param {string} type - Message type (offer|answer|ice-candidate)
 * @param {Object} data - Signaling data
 * @param {string} roomID - Room ID
 * @returns {Object} - Send result
 */
function sendSignalingMessage(fromPeerID, toPeerID, type, data, roomID) {
  debugLog("sendSignalingMessage called", {
    fromPeerID,
    toPeerID,
    type,
    roomID,
    dataSize: JSON.stringify(data).length,
  });

  try {
    const signalingSheet = initializeSignalingSheet();

    const message = {
      id: generateMessageID(),
      fromPeerID: fromPeerID,
      toPeerID: toPeerID,
      type: type,
      data: JSON.stringify(data),
      timestamp: new Date().toISOString(),
      status: "pending",
      roomID: roomID,
    };

    // Add message to signaling sheet
    const newRow = signalingSheet.getLastRow() + 1;
    signalingSheet
      .getRange(newRow, 1, 1, 8)
      .setValues([
        [
          message.id,
          message.fromPeerID,
          message.toPeerID,
          message.type,
          message.data,
          message.timestamp,
          message.status,
          message.roomID,
        ],
      ]);

    debugLog("Signaling message sent", {
      messageID: message.id,
      type,
      fromPeerID,
      toPeerID,
    });

    return {
      status: "success",
      message: "Signaling message sent",
      messageID: message.id,
      timestamp: message.timestamp,
    };
  } catch (error) {
    debugLog("Error in sendSignalingMessage", {
      error: error.message,
      fromPeerID,
      toPeerID,
      type,
    });
    return {
      status: "error",
      message: "Failed to send signaling message",
      error: error.message,
    };
  }
}

/**
 * Poll for signaling messages for a specific peer
 * @param {string} peerID - Peer ID to poll messages for
 * @param {string} lastMessageID - Last received message ID (optional)
 * @returns {Object} - Poll result with messages
 */
function pollSignalingMessages(peerID, lastMessageID) {
  debugLog("pollSignalingMessages called", { peerID, lastMessageID });

  try {
    const signalingSheet = initializeSignalingSheet();
    const data = signalingSheet.getDataRange().getValues();

    const messages = [];
    let foundLastMessage = !lastMessageID; // If no lastMessageID, get all pending

    // Scan through all messages
    for (let i = 1; i < data.length; i++) {
      // Skip header row
      const [
        id,
        fromPeerID,
        toPeerID,
        type,
        messageData,
        timestamp,
        status,
        roomID,
      ] = data[i];

      // Skip if not for this peer
      if (toPeerID !== peerID && toPeerID !== "ALL") continue;

      // Skip if already delivered
      if (status === "delivered" || status === "expired") continue;

      // If we have lastMessageID, only get messages after it
      if (lastMessageID && !foundLastMessage) {
        if (id === lastMessageID) {
          foundLastMessage = true;
        }
        continue;
      }

      // Add message to results
      messages.push({
        id: id,
        fromPeerID: fromPeerID,
        toPeerID: toPeerID,
        type: type,
        data: messageData ? JSON.parse(messageData) : null,
        timestamp: timestamp,
        roomID: roomID,
      });

      // Mark message as delivered
      signalingSheet.getRange(i + 1, 7).setValue("delivered"); // Column G: Status
    }

    // Cleanup old messages (older than 5 minutes)
    cleanupOldSignalingMessages();

    debugLog("Polling completed", {
      peerID,
      messagesFound: messages.length,
      lastMessageID,
    });

    return {
      status: "success",
      messages: messages,
      count: messages.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    debugLog("Error in pollSignalingMessages", {
      error: error.message,
      peerID,
      lastMessageID,
    });
    return {
      status: "error",
      message: "Failed to poll signaling messages",
      error: error.message,
      messages: [],
    };
  }
}

/**
 * Get peers in a specific room
 * @param {string} roomID - Room ID to get peers for
 * @returns {Object} - Peers in room
 */
function getPeersInRoom(roomID) {
  debugLog("getPeersInRoom called", { roomID });

  try {
    const signalingSheet = initializeSignalingSheet();
    const data = signalingSheet.getDataRange().getValues();

    const peers = new Set();
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Find all peers that sent ping messages in this room recently
    for (let i = 1; i < data.length; i++) {
      const [
        id,
        fromPeerID,
        toPeerID,
        type,
        messageData,
        timestamp,
        status,
        msgRoomID,
      ] = data[i];

      if (msgRoomID === roomID && type === "ping") {
        const msgTime = new Date(timestamp);
        if (msgTime > fiveMinutesAgo) {
          peers.add(fromPeerID);
        }
      }
    }

    const peerList = Array.from(peers);

    debugLog("Peers in room found", { roomID, peers: peerList });

    return {
      status: "success",
      roomID: roomID,
      peers: peerList,
      count: peerList.length,
    };
  } catch (error) {
    debugLog("Error in getPeersInRoom", { error: error.message, roomID });
    return {
      status: "error",
      message: "Failed to get peers in room",
      error: error.message,
      peers: [],
    };
  }
}

/**
 * Cleanup old signaling messages (older than 5 minutes)
 */
function cleanupOldSignalingMessages() {
  try {
    const signalingSheet = initializeSignalingSheet();
    const data = signalingSheet.getDataRange().getValues();

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    let cleanedCount = 0;

    // Mark old messages as expired (from bottom to top to avoid index issues)
    for (let i = data.length - 1; i >= 1; i--) {
      const timestamp = data[i][5]; // Column F: Timestamp
      const status = data[i][6]; // Column G: Status

      if (timestamp && status !== "expired") {
        const msgTime = new Date(timestamp);
        if (msgTime < fiveMinutesAgo) {
          signalingSheet.getRange(i + 1, 7).setValue("expired");
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      debugLog("Cleaned up old signaling messages", { cleanedCount });
    }
  } catch (error) {
    debugLog("Error in cleanupOldSignalingMessages", { error: error.message });
  }
}

/**
 * Generate unique message ID
 * @returns {string} - Unique message ID
 */
function generateMessageID() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Handle signaling API requests
 * @param {string} action - API action
 * @param {Object} params - Request parameters
 * @returns {Object} - API response
 */
function handleSignalingAPI(action, params) {
  debugLog("handleSignalingAPI called", { action, params });

  switch (action) {
    case "register":
      return registerPeer(params.peerID, params.roomID);

    case "send":
      return sendSignalingMessage(
        params.fromPeerID,
        params.toPeerID,
        params.type,
        JSON.parse(params.data || "{}"),
        params.roomID
      );

    case "poll":
      return pollSignalingMessages(params.peerID, params.lastMessageID);

    case "getPeers":
      return getPeersInRoom(params.roomID);

    case "cleanup":
      cleanupOldSignalingMessages();
      return { status: "success", message: "Cleanup completed" };

    default:
      return {
        status: "error",
        message: "Invalid signaling action",
        validActions: ["register", "send", "poll", "getPeers", "cleanup"],
      };
  }
}
