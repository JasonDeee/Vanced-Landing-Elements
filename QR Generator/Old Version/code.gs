function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const qrDonateName = data.QRDonateName;
  const qrDonateMessage = data.QRDonateMessage;
  const qrDonatePrice = data.QRDonatePrice;

  // Lấy Spreadsheet hiện tại
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Chọn sheet "Donater List"
  var sheet = spreadsheet.getSheetByName("Donater List");
  const currentTime = Utilities.formatDate(
    new Date(),
    "GMT+7",
    "dd/MM/yyyy HH:mm:ss"
  );
  // Thêm dữ liệu vào sheet
  sheet.appendRow([qrDonateName, qrDonateMessage, qrDonatePrice, currentTime]);

  // Trả về phản hồi (tuỳ chọn - bạn có thể điều hướng đến trang khác)
  return ContentService.createTextOutput("Lời nhắn của bạn đã được gửi!");
}

function doGet(e) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Filtered List");
  const section = parseInt(e.parameter.section) || 1;
  const rowsPerPage = 50;
  const startRow = (section - 1) * rowsPerPage + 2; // Bắt đầu từ dòng 2, bỏ qua dòng tiêu đề
  const endRow = startRow + rowsPerPage - 1;

  const data = [];
  let isEnd = false;

  for (let row = startRow; row <= endRow; row++) {
    const name = sheet.getRange(row, 1).getValue();
    if (name === "") {
      isEnd = true;
      break;
    }

    const sumValue = sheet.getRange(row, 2).getValue();
    const latestDate = sheet.getRange(row, 3).getValue();

    data.push({
      name: name,
      sumValue: sumValue,
      latestDate: latestDate,
    });
  }

  const response = {
    data: data,
    isEnd: isEnd,
  };

  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(
    ContentService.MimeType.JSON
  );
}
