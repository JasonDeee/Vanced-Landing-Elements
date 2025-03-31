// Code phía apps script điền vào đây

// Hàm tiện ích để chuyển dữ liệu từ sheet thành object
function getDataFromSheet(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// Hàm GET để test - trả về tất cả dữ liệu từ sheet 2010
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("2010");

    if (!sheet) {
      return ContentService.createTextOutput(
        JSON.stringify({
          error: "Sheet 2010 không tồn tại",
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const data = getDataFromSheet(sheet);

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        data: data,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        error: error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// Hàm POST để tìm kiếm dữ liệu theo điều kiện
function doPost(e) {
  try {
    // Parse dữ liệu từ request
    const postData = JSON.parse(e.postData.contents);
    const { year, score, block } = postData;

    if (!year || !score || !block) {
      throw new Error("Thiếu thông tin tìm kiếm");
    }

    // Lấy sheet theo năm
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(year.toString());

    if (!sheet) {
      throw new Error(`Không tìm thấy dữ liệu năm ${year}`);
    }

    // Lấy và xử lý dữ liệu
    const rawData = getDataFromSheet(sheet);

    // Nhóm dữ liệu theo trường
    const schoolsMap = new Map();

    rawData.forEach((row) => {
      if (row.Khối === block && parseFloat(row.Điểm) <= parseFloat(score)) {
        if (!schoolsMap.has(row["Trường học"])) {
          schoolsMap.set(row["Trường học"], {
            nameSchool: row["Trường học"],
            Aquired: [],
          });
        }

        schoolsMap.get(row["Trường học"]).Aquired.push({
          block: row.Khối,
          score: row.Điểm,
          field: row.Ngành,
        });
      }
    });

    // Chuyển Map thành array kết quả
    const result = Array.from(schoolsMap.values());

    return ContentService.createTextOutput(
      JSON.stringify({
        success: true,
        data: result,
      })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({
        error: error.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
