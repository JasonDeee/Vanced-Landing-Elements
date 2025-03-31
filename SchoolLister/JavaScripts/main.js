document.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.querySelector(".search-form");
  const scoreInput = document.getElementById("score");
  const subjectGroupInput = document.getElementById("subject-input");
  const yearSelect = document.getElementById("year");
  const searchButton = document.querySelector(".search-button");

  // URL của web app sau khi deploy (thay thế bằng URL thực tế)
  const API_URL =
    "https://script.google.com/macros/s/AKfycbxXdG0mUmEfdmZOAy8TW79N5iNZKS8AWg9AWKHvh_ZVmcCINTDjToZTECecoiyIS2Cyaw/exec";

  // Test API bằng GET request
  fetch(API_URL)
    .then((response) => response.json())
    .then((data) => {
      console.log("Test GET request - All data from 2010:", data);
    })
    .catch((error) => {
      console.error("Error testing API:", error);
    });

  // Format score input to use comma as decimal separator
  scoreInput.addEventListener("input", (e) => {
    let value = e.target.value.replace(",", ".");
    if (!isNaN(value)) {
      e.target.value = parseFloat(value).toLocaleString("vi-VN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  });

  // Handle form submission
  searchButton.addEventListener("click", async (e) => {
    e.preventDefault();

    const score = scoreInput.value.replace(",", ".");
    const block = subjectGroupInput.value.split(" ")[0]; // Lấy mã khối (vd: A00)
    const year = yearSelect.value;

    // Validate inputs
    if (!score || !block || !year) {
      alert("Vui lòng điền đầy đủ thông tin!");
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year,
          score: parseFloat(score),
          block,
        }),
      });

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      console.log("Search results:", result.data);

      // TODO: Hiển thị kết quả tìm kiếm trên giao diện
      displayResults(result.data);
    } catch (error) {
      console.error("Error searching:", error);
      alert("Có lỗi xảy ra khi tìm kiếm. Vui lòng thử lại!");
    }
  });
});

// Hàm hiển thị kết quả (sẽ implement sau)
function displayResults(data) {
  // TODO: Implement display logic
  console.log("Results to display:", data);
}
