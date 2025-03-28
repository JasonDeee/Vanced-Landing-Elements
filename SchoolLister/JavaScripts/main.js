document.addEventListener("DOMContentLoaded", () => {
  const searchForm = document.querySelector(".search-form");
  const scoreInput = document.getElementById("score");
  const subjectGroupInput = document.getElementById("subject-group");
  const yearSelect = document.getElementById("year");
  const searchButton = document.querySelector(".search-button");

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
  searchButton.addEventListener("click", (e) => {
    e.preventDefault();

    const score = scoreInput.value.replace(",", ".");
    const subjectGroup = subjectGroupInput.value;
    const year = yearSelect.value;

    // Validate inputs
    if (!score || !subjectGroup || !year) {
      alert("Vui lòng điền đầy đủ thông tin!");
      return;
    }

    // Here you would typically make an API call to search for results
    console.log("Searching with:", {
      score,
      subjectGroup,
      year,
    });
  });
});
