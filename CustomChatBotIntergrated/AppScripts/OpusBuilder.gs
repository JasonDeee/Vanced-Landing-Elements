// Đây là phía google App Scripts hãy xem kỹ file này

const REQUEST_TYPES = [
  "RequestSingleProductData",
  "getAllProductDataByType",
  "RequestMultipleProductData",
];

/**
 * API endpoint xử lý các request POST.
 * @param {Object} e - Event object chứa thông tin request POST.
 * @returns {ContentService} - Response trả về dưới dạng JSON.
 */

function getSingleProductData(ProductType, ProductID) {
  // 1. Lấy Spreadsheet hiện tại
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // 2. Tìm Sheet theo tên ProductType
  var sheet = spreadsheet.getSheetByName(ProductType);

  // Kiểm tra xem Sheet có tồn tại không
  if (!sheet) {
    return { error: "Sheet not found" }; // Trả về lỗi nếu không tìm thấy Sheet
  }

  // 3. Lấy dữ liệu từ Sheet (giả sử dữ liệu bắt đầu từ hàng 1)
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();

  // Lấy header của các cột từ hàng đầu tiên
  var headers = values[0];

  // 4. Tìm ProductID trong cột A và lấy dữ liệu của dòng đó
  var productData = null;
  for (var i = 1; i < values.length; i++) {
    // Bắt đầu từ hàng thứ 2 (index 1) để bỏ qua header
    var row = values[i];
    var id = row[0]; // ProductID ở cột A (index 0)

    if (id === ProductID) {
      productData = {};
      // Tạo JSON object với key là header và value là dữ liệu tương ứng
      for (var j = 0; j < headers.length; j++) {
        productData[headers[j]] = row[j];
      }
      break; // Dừng vòng lặp khi tìm thấy ProductID
    }
  }

  // 5. Kiểm tra nếu không tìm thấy ProductID
  if (!productData) {
    return { error: "ProductID not found" }; // Trả về lỗi nếu không tìm thấy ProductID
  }

  // 6. Trả về dữ liệu sản phẩm dưới dạng JSON
  return productData;
}

function getAllProductDataByType(ProductType, PageCount) {
  // Số lượng sản phẩm trên mỗi trang
  var PRODUCTS_PER_PAGE = 20;

  // 1. Lấy Spreadsheet hiện tại
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // 2. Tìm Sheet theo tên ProductType
  var sheet = spreadsheet.getSheetByName(ProductType);

  // Kiểm tra xem Sheet có tồn tại không
  if (!sheet) {
    return { error: "Sheet not found" }; // Trả về lỗi nếu không tìm thấy Sheet
  }

  // 3. Lấy dữ liệu từ Sheet
  var dataRange = sheet.getDataRange();
  var values = dataRange.getValues();

  // Lấy header của các cột từ hàng đầu tiên
  var headers = values[0];

  // --- BẮT ĐẦU ĐỌC FILTER ---
  // Đọc ô M2 (hàng 2, cột 13 - index 12)
  var filterMetaRaw = sheet.getRange(2, 13).getValue();
  var filterKeys = [];
  try {
    filterKeys = JSON.parse(filterMetaRaw);
  } catch (e) {
    filterKeys = [];
  }
  var filters = [];
  if (filterKeys && filterKeys.length > 0) {
    // Đọc từng cột filter bắt đầu từ cột N (cột 14, index 13)
    for (var i = 0; i < filterKeys.length; i++) {
      var colIdx = 14 + i; // cột bắt đầu từ 14
      var filterArr = [];
      var rowIdx = 1; // bắt đầu từ hàng 1 (bỏ header là hàng 0)
      while (true) {
        var val = sheet.getRange(rowIdx + 1, colIdx).getValue(); // rowIdx+1 vì Google Sheets bắt đầu từ 1
        if (val === "" || val === null) break;
        filterArr.push(val.toString().trim());
        rowIdx++;
      }
      var filterObj = {};
      filterObj[filterKeys[i]] = filterArr;
      filters.push(filterObj);
    }
  }
  // --- KẾT THÚC ĐỌC FILTER ---

  // Tính toán hàng bắt đầu và hàng kết thúc cho trang hiện tại
  var startRow = (PageCount - 1) * PRODUCTS_PER_PAGE + 1; // +1 để bỏ qua hàng header
  var endRow = startRow + PRODUCTS_PER_PAGE;

  var productList = [];
  var isFinalPage = false;
  var productCount = 0; // Đếm số lượng sản phẩm đã thêm vào trang hiện tại

  // 4. Duyệt qua các dòng dữ liệu để lấy sản phẩm cho trang hiện tại
  for (var i = startRow; i < endRow && i < values.length; i++) {
    var row = values[i];
    var productId = row[0]; // ProductID ở cột A (index 0)

    // Kiểm tra nếu ProductID ở cột A bị trống, tức là trang cuối
    if (!productId) {
      isFinalPage = true;
      break; // Dừng vòng lặp nếu gặp dòng trống ở cột A
    }

    var productData = {};
    // Tạo JSON object với key là header và value là dữ liệu tương ứng
    for (var j = 0; j < headers.length; j++) {
      productData[headers[j]] = row[j];
    }
    productList.push(productData);
    productCount++;
  }

  // Nếu không có sản phẩm nào trong trang này và không phải trang đầu tiên, có nghĩa là trang không tồn tại
  if (productList.length === 0 && PageCount > 1) {
    return { error: "Page not found" };
  }

  // Nếu là trang cuối cùng hoặc không đủ số lượng sản phẩm trên trang yêu cầu
  if (
    isFinalPage ||
    productCount < PRODUCTS_PER_PAGE ||
    endRow >= values.length
  ) {
    isFinalPage = true;
  }

  // 5. Trả về dữ liệu sản phẩm dưới dạng JSON, kèm theo thông tin IsFinalPage và filters
  return {
    IsFinalPage: isFinalPage,
    products: productList,
    filters: filters,
  };
}

/**
 * Lấy nhiều sản phẩm theo mảng [ [loại, id], ... ]
 * @param {Array} arr - Mảng các cặp [ProductType, ProductID]
 * @returns {Array} - Mảng các object sản phẩm chi tiết
 */
function RequestMultipleProductData(arr) {
  Logger.log("[RequestMultipleProductData] Input arr:", JSON.stringify(arr));
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var result = [];
  if (!Array.isArray(arr)) {
    Logger.log("[RequestMultipleProductData] arr is not array!");
    return result;
  }
  for (var idx = 0; idx < arr.length; idx++) {
    var pair = arr[idx];
    Logger.log("[RequestMultipleProductData] pair:", JSON.stringify(pair));
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    var type = pair[0];
    var id = pair[1];
    Logger.log("[RequestMultipleProductData] type:", type, "id:", id);
    if (!type || !id) continue;
    var sheet = spreadsheet.getSheetByName(type);
    if (!sheet) {
      Logger.log("[RequestMultipleProductData] Sheet not found for type:", type);
      continue;
    }
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    var headers = values[0];
    var found = null;
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var rowId = row[0];
      if (rowId == id) {
        found = {};
        for (var h = 0; h < headers.length; h++) {
          found[headers[h]] = row[h];
        }
        Logger.log("[RequestMultipleProductData] Found product:", JSON.stringify(found));
        break;
      }
    }
    if (found) {
      result.push(found);
    } else {
      Logger.log("[RequestMultipleProductData] Product not found for type:", type, "id:", id);
    }
  }
  Logger.log("[RequestMultipleProductData] Final result:", JSON.stringify(result));
  return result;
}

function processRequest(requestData) {
  try {
    var requestType = requestData.RequestType;
    var requestInfo = requestData.RequestInfo || requestData; // Hỗ trợ cả format mới và cũ

    // Kiểm tra RequestType có hợp lệ không
    if (!REQUEST_TYPES.includes(requestType)) {
      throw new Error("Invalid RequestType: " + requestType);
    }

    var responseData;

    // Switch case để xử lý các loại RequestType khác nhau
    switch (requestType) {
      case "RequestSingleProductData":
        if (!requestInfo.ProductType || !requestInfo.ProductID) {
          throw new Error(
            "Missing parameters for RequestSingleProductData. Must contain ProductType and ProductID."
          );
        }
        responseData = getSingleProductData(
          requestInfo.ProductType,
          requestInfo.ProductID
        );
        break;

      case "getAllProductDataByType":
        if (!requestInfo.ProductType || !requestInfo.PageCount) {
          throw new Error(
            "Missing parameters for getAllProductDataByType. Must contain ProductType and PageCount."
          );
        }
        responseData = getAllProductDataByType(
          requestInfo.ProductType,
          requestInfo.PageCount
        );
        break;

      case "RequestMultipleProductData":
        Logger.log("[DEBUG] Raw requestInfo: " + JSON.stringify(requestInfo));
        // Nếu là string (do client gửi JSON.stringify), parse lại
        if (typeof requestInfo === "string") {
          try {
            requestInfo = JSON.parse(requestInfo);
            Logger.log(
              "[DEBUG] Parsed requestInfo: " + JSON.stringify(requestInfo)
            );
          } catch (e) {
            throw new Error("RequestInfo parse error: " + e.message);
          }
        }
        if (!requestInfo || !Array.isArray(requestInfo)) {
          throw new Error(
            "Missing parameters for RequestMultipleProductData. Must be array of pairs."
          );
        }
        responseData = RequestMultipleProductData(requestInfo);
        break;

      default:
        throw new Error("Unknown RequestType: " + requestType);
    }

    return responseData;
  } catch (error) {
    return { error: error.message };
  }
}

function createJSONResponse(data, callback) {
  var response = ContentService.createTextOutput();
  if (callback) {
    // Nếu có callback parameter, trả về JSONP
    response.setContent(callback + "(" + JSON.stringify(data) + ")");
    response.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    // Nếu không, trả về JSON bình thường
    response.setContent(JSON.stringify(data));
    response.setMimeType(ContentService.MimeType.JSON);
  }
  return response;
}

function doGet(e) {
  try {
    // Xử lý parameters từ URL
    var params = e.parameter;
    var callback = params.callback; // Lấy callback parameter nếu có
    var responseData = processRequest(params);

    return createJSONResponse(responseData, callback);
  } catch (error) {
    var errorResponse = {
      error: error.message,
    };
    return createJSONResponse(errorResponse, callback);
  }
}

function doPost(e) {
  if (e.requestMethod == "OPTIONS") {
    return ContentService.createTextOutput("");
  }

  try {
    var requestData = JSON.parse(e.postData.contents);
    var responseData = processRequest(requestData);

    return createJSONResponse(responseData);
  } catch (error) {
    var errorResponse = {
      error: error.message,
    };
    return createJSONResponse(errorResponse);
  }
}
