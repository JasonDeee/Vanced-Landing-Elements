// Dường dẫn API đây nhé https://script.google.com/macros/s/AKfycbxQxWGd5E0LkZ0iR2wpL3FtUgEJ_TdFSpdfdx2AwMPCW2EKasYJOQG-rA7uq_Gjl-hFKQ/exec

const API_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxQxWGd5E0LkZ0iR2wpL3FtUgEJ_TdFSpdfdx2AwMPCW2EKasYJOQG-rA7uq_Gjl-hFKQ/exec";

async function FetchOpusAPI(RequestType, RequestInfo) {
  try {
    // Tạo URLSearchParams object để xây dựng query string
    const params = new URLSearchParams({
      RequestType: RequestType,
      ...RequestInfo,
    });

    // Thêm params vào URL
    const url = `${API_ENDPOINT}?${params.toString()}&callback=callback`;

    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Thêm event listener khi DOM đã load
document.addEventListener("DOMContentLoaded", () => {
  // Tìm nút chọn Bo mạch chủ
  const mainboardButton = document.querySelector(
    'button.add-button[requestData="MainBoard"]'
  );

  if (mainboardButton) {
    mainboardButton.addEventListener("click", async () => {
      try {
        const response = await FetchOpusAPI("getAllProductDataByType", {
          ProductType: mainboardButton.getAttribute("requestData"),
          PageCount: 1,
        });

        console.log("Mainboard data:", response);
        // Ở đây bạn có thể xử lý dữ liệu mainboard nhận được
      } catch (error) {
        console.error("Error fetching mainboard data:", error);
      }
    });
  }
});
