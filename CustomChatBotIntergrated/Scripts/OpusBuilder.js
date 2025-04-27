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
    const url = `${API_ENDPOINT}?${params.toString()}`;

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
  // Tìm nút chọn CPU và Mainboard
  const cpuButton = document.querySelector(
    'button.add-button[requestData="CPU"]'
  );
  const mainboardButton = document.querySelector(
    'button.add-button[requestData="MainBoard"]'
  );
  const ComponentsSelector = document.querySelector(
    ".pc-builder_ComponentsSelector"
  );

  // Hàm format giá tiền
  function formatPrice(price) {
    if (typeof price !== "number") return price;
    return price.toLocaleString("vi-VN") + "₫";
  }

  // Hàm render danh sách sản phẩm
  function renderProducts(products) {
    const listContainer = document.querySelector(".Components_Displayer");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    products.forEach((product) => {
      const productDiv = document.createElement("div");
      productDiv.className = "SingleComponent_Display";
      productDiv.innerHTML = `
        <div class="product-card__info">
          <img src="${product.productImage}" alt="${product.productName}" />
          <h3>
            ${product.productName}
            <div class="warranty">Bảo hành: ${product.warranty || ""}</div>
            <div class="stock">Kho hàng: ${product.Status || ""}</div>
            <div class="product-card__price">
              <p>${formatPrice(product.price)}</p>
            </div>
          </h3>
        </div>
        <button class="productSelectButton" style="background-image: url(./Assets/Add_Icon.svg)" data-product-id="${
          product.id
        }"></button>
      `;
      listContainer.appendChild(productDiv);
    });
  }

  // Hàm render lại filter
  function renderFilters(filters) {
    const filtersContainer = document.querySelector(".ComponentsFilters");
    if (!filtersContainer) return;
    // Xóa toàn bộ filter cũ
    filtersContainer.innerHTML = "";
    // Tạo filter mới từ dữ liệu
    filters.forEach((filterObj) => {
      const key = Object.keys(filterObj)[0];
      const values = filterObj[key];
      const filterDiv = document.createElement("div");
      filterDiv.className = "Filter";
      const h3 = document.createElement("h3");
      h3.textContent = key;
      filterDiv.appendChild(h3);
      const fieldset = document.createElement("fieldset");
      values.forEach((val) => {
        const label = document.createElement("label");
        label.setAttribute("for", key);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = key;
        input.value = val;
        input.placeholder = val;
        label.appendChild(input);
        label.appendChild(document.createTextNode(val));
        fieldset.appendChild(label);
      });
      filterDiv.appendChild(fieldset);
      filtersContainer.appendChild(filterDiv);
    });
  }

  // Hàm dùng chung để test API và log filter
  async function testGetAllProductDataByType(button, type) {
    if (!button) return;
    button.addEventListener("click", async () => {
      ComponentsSelector.classList.remove("hidden");
      ComponentsSelector.classList.add("OnLoading");

      try {
        const response = await FetchOpusAPI("getAllProductDataByType", {
          ProductType: type,
          PageCount: 1,
        });
        console.log(`${type} data:`, response);
        if (response.filters) {
          console.log(`${type} filters:`, response.filters);
          renderFilters(response.filters);
        }
        if (response.products) {
          renderProducts(response.products);
          addProductSelectEvents(
            response.products,
            `.component-row[data-row="${type}"]`,
            type
          );
        }
        ComponentsSelector.classList.remove("OnLoading");
      } catch (error) {
        console.error(`Error fetching ${type} data:`, error);
      }
    });
  }

  // Hàm render card sản phẩm cho component-row
  function renderSelectedComponent(product, rowSelector) {
    const row = document.querySelector(rowSelector);
    if (!row) return;
    // Gán id sản phẩm vào attr
    row.setAttribute("data-product-id", product.id);
    // Lấy vùng content để thay thế
    const content = row.querySelector(".component-row__content");
    if (!content) return;
    // Xóa toàn bộ nội dung cũ
    content.innerHTML = "";
    // Tạo card sản phẩm
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-card__info">
        <h3>
          <img src="${product.productImage}" alt="${product.productName}" />
          ${product.productName}
        </h3>
        <div class="warranty">Bảo hành: ${product.warranty || ""}</div>
        <div class="stock">Kho hàng: ${product.Status || ""}</div>
      </div>
      <div class="product-card__price">
        <p>${formatPrice(product.price)}</p>
      </div>
      <div class="ProductControl">
        <div class="Change">
          <button style="background-image: url(./Assets/Edit.svg)"></button>
        </div>
        <div class="Remove">
          <button style="background-image: url(./Assets/Remove.svg)"></button>
        </div>
      </div>
    `;
    content.appendChild(card);
  }

  // Sự kiện chọn sản phẩm
  function addProductSelectEvents(products, rowSelector, type) {
    const buttons = document.querySelectorAll(".productSelectButton");
    buttons.forEach((btn, idx) => {
      btn.onclick = () => {
        // Luôn map vào đúng .component-row[data-row=type]
        renderSelectedComponent(products[idx], rowSelector);
        // Ẩn selector
        ComponentsSelector.classList.add("hidden");
        // Sau 2s, xóa filter, sản phẩm và cleanup sự kiện
        setTimeout(() => {
          const filtersContainer = document.querySelector(".ComponentsFilters");
          if (filtersContainer) filtersContainer.innerHTML = "";
          const listContainer = document.querySelector(".Components_Displayer");
          if (listContainer) listContainer.innerHTML = "";
          // Cleanup sự kiện các nút (nếu cần)
          buttons.forEach((b) => {
            b.onclick = null;
          });
        }, 2000);
      };
    });
  }

  // Sự kiện đóng selector
  function setupSelectorClose() {
    const closeBtn = document.getElementById("SelectorNavigation__close");
    if (!closeBtn) return;
    closeBtn.onclick = () => {
      ComponentsSelector.classList.add("hidden");
      setTimeout(() => {
        const filtersContainer = document.querySelector(".ComponentsFilters");
        if (filtersContainer) filtersContainer.innerHTML = "";
        const listContainer = document.querySelector(".Components_Displayer");
        if (listContainer) listContainer.innerHTML = "";
        // Cleanup sự kiện các nút
        document.querySelectorAll(".productSelectButton").forEach((b) => {
          b.onclick = null;
        });
      }, 2000);
    };
  }
  setupSelectorClose();

  testGetAllProductDataByType(cpuButton, "CPU");
  testGetAllProductDataByType(mainboardButton, "MainBoard");
});
