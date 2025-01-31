function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("CloneSheet")
    .setTitle("Clone Sheet Module")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function verifyCredential(credential) {
  try {
    const verification = OAuth2.verifyIdToken(credential, {
      audience:
        "153083226508-qmlv5ko26irv72rrshs6g2i3vnr4d1g4.apps.googleusercontent.com",
    });

    const userEmail = verification.getEmail();

    // Thực hiện clone và lấy kết quả
    const result = copySpreadsheetAndScripts();

    return {
      success: true,
      email: userEmail,
      ...result,
    };
  } catch (error) {
    Logger.log("Invalid credential: " + error);
    return {
      success: false,
      error: error.toString(),
    };
  }
}

function copySpreadsheetAndScripts() {
  const templateSpreadsheetUrl =
    "https://docs.google.com/spreadsheets/d/1LFpJvFOPiZeRExUUfEeOLw5HlJG2Hexzm86dQJBIY10/edit?usp=sharing";

  try {
    const templateSpreadsheet = SpreadsheetApp.openByUrl(
      templateSpreadsheetUrl
    );

    // Tạo folder chính
    const rootFolder = DriveApp.getRootFolder();
    const mainFolder = rootFolder.createFolder("Vanced Media for Customer");

    // Tạo folder con
    const subFolder = mainFolder.createFolder("Vx_ChatBot_Intergration");

    // Copy spreadsheet mẫu
    const newSpreadsheet = templateSpreadsheet.copy("Vx_ChatBot-Logger");
    DriveApp.getFileById(newSpreadsheet.getId()).moveTo(subFolder);

    // Lấy ID của spreadsheet mới được tạo
    const newSpreadsheetId = newSpreadsheet.getId();

    // Lấy và copy script đính kèm
    const templateScriptId = templateSpreadsheet.getBoundScriptId();

    if (templateScriptId) {
      const templateProject = ScriptApp.getProjectById(templateScriptId);
      const newScript = templateProject.createVersion("Copy of Script");
      const scriptFile = DriveApp.getFileById(newScript.getId());
      scriptFile.moveTo(subFolder);
      DriveApp.getFileById(newSpreadsheetId).setBoundScriptId(
        newScript.getId()
      );
    }

    Logger.log("Main Folder ID: " + mainFolder.getId());
    Logger.log("Sub Folder ID: " + subFolder.getId());
    Logger.log("Spreadsheet ID: " + newSpreadsheetId);

    return {
      success: true,
      message: "Đã tạo folder và spreadsheet thành công!",
      mainFolderId: mainFolder.getId(),
      subFolderId: subFolder.getId(),
      spreadsheetId: newSpreadsheetId,
    };
  } catch (error) {
    Logger.log("Lỗi khi copy: " + error);
    return {
      success: false,
      message: "Đã xảy ra lỗi. Vui lòng thử lại.",
      error: error.toString(),
    };
  }
}
