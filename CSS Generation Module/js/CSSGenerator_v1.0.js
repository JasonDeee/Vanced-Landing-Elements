// CSS Generator Core Module
class CSSGenerator {
  constructor() {
    // Khởi tạo các DOM references
    this.controls = document.querySelector(".Vx_CSS_Gen_Controls");
    this.preview = document.querySelector(".Vx_CSS_Gen_FinalResult");
    this.codeDisplay = document.querySelector(".generated-css");
    this.toolbar = document.querySelector(".Vx_CSS_Gen_Toolbar");

    // State management
    this.cssState = new Map(); // Lưu trữ trạng thái CSS hiện tại

    // Tạo template map để lưu trữ các template theo property
    this.inputTemplates = new Map([
      [
        "border-radius",
        {
          label: "Border Radius",
          property: "border-radius",
        },
      ],
      [
        "margin-top",
        {
          label: "Margin Top",
          property: "margin-top",
        },
      ],
      // Có thể thêm các template khác ở đây
    ]);

    // Cập nhật template để sử dụng dynamic property
    this.getRangeInputTemplate = (property) => {
      const template = this.inputTemplates.get(property);
      return `
        <label class="RangeInput">${template.label}
          <input type="range" data-css-label="${template.property}" />
        </label>
      `;
    };

    // Khởi tạo ứng dụng
    this.init();
  }

  init() {
    this.bindControlEvents();
    this.bindToolbarEvents();
    this.initializeDefaultState();
    this.initUnitControls();
  }

  // Unit Controls Management
  initUnitControls() {
    const unitFields = document.querySelectorAll(".Fieldset_Unit_Changable");
    unitFields.forEach((field) => {
      this.setupUnitControl(field);
    });
  }

  setupUnitControl(fieldset) {
    const unitButton = fieldset.querySelector(".UnitChangeButton");
    const unitList = fieldset.querySelector(".UnitChangeButton li");
    const unitDisplay = Array.from(unitButton.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE
    );
    const rangeInputContainer = fieldset.querySelector(".RangeInput");

    // Toggle UnitChanging class
    unitButton.addEventListener("click", () => {
      unitButton.classList.toggle("UnitChanging");
    });

    // Handle unit selection
    unitList.querySelectorAll("ul").forEach((unit) => {
      unit.addEventListener("click", (e) => {
        e.stopPropagation();
        this.handleUnitChange(fieldset, unit.textContent.trim(), {
          unitButton,
          unitDisplay,
          rangeInputContainer,
        });
      });
    });
  }

  handleUnitChange(fieldset, newUnit, elements) {
    const { unitButton, unitDisplay } = elements;

    if (newUnit === "custom") {
      // Lấy input container hiện tại
      const currentInput = fieldset.querySelector(".RangeInput, .TextInput");
      if (currentInput) {
        this.switchToCustomInput(fieldset, currentInput);
        // Reset unit display và data-unit khi chuyển sang custom
        unitDisplay.textContent = "";
        fieldset.dataset.unit = "";
      }
    } else {
      // Cập nhật hiển thị đơn vị trên button
      unitDisplay.textContent = newUnit;

      // Cập nhật data-unit attribute
      fieldset.dataset.unit = newUnit;

      // Kiểm tra nếu đang ở chế độ custom thì chuyển về range
      const currentInput = fieldset.querySelector(".TextInput");
      if (currentInput) {
        this.switchToRangeInput(fieldset, currentInput);
      }

      // Cập nhật CSS với đơn vị mới
      this.updateCSSUnit(
        fieldset,
        fieldset.querySelector(".RangeInput"),
        newUnit
      );
    }

    unitButton.classList.remove("UnitChanging");
  }

  switchToRangeInput(fieldset, currentInput) {
    const cssProperty = currentInput.querySelector("input").dataset.cssLabel;
    const container = document.createElement("div");
    container.innerHTML = this.getRangeInputTemplate(cssProperty);
    const rangeInput = container.firstElementChild;

    currentInput.replaceWith(rangeInput);

    const input = rangeInput.querySelector('input[type="range"]');
    input.value = 0;
    input.dispatchEvent(new Event("input"));
  }

  updateCSSUnit(fieldset, rangeInputContainer, unit) {
    const rangeInput = rangeInputContainer.querySelector('input[type="range"]');
    if (rangeInput) {
      const value = rangeInput.value;
      const cssLabel = rangeInput.dataset.cssLabel;
      const targetClass = fieldset.dataset.class;

      this.updateCSS(targetClass, cssLabel, `${value}${unit}`);
    }
  }

  switchToCustomInput(fieldset, currentInput) {
    const cssProperty = currentInput.querySelector("input").dataset.cssLabel;
    const template = this.inputTemplates.get(cssProperty);

    const textInput = document.createElement("label");
    textInput.className = "TextInput";
    textInput.innerHTML = `
      ${template.label}
      <input
        type="text"
        name="${fieldset.dataset.class}"
        placeholder="Enter custom value"
        data-css-label="${cssProperty}"
      />
    `;

    currentInput.replaceWith(textInput);
  }

  // Event Handlers
  bindControlEvents() {
    this.controls.addEventListener("input", (e) => {
      const target = e.target;
      const cssProperty = target.dataset.cssLabel;
      const fieldset = target.closest("fieldset");
      const targetClass = fieldset.dataset.class;

      if (cssProperty) {
        if (fieldset.classList.contains("Fieldset_Unit_Changable")) {
          // Kiểm tra xem có phải input custom không
          if (target.closest(".TextInput")) {
            // Với custom input, sử dụng giá trị trực tiếp không thêm unit
            this.updateCSS(targetClass, cssProperty, target.value);
          } else {
            // Với range input, thêm unit như bình thường
            const unit = fieldset.dataset.unit || "px";
            this.updateCSS(targetClass, cssProperty, `${target.value}${unit}`);
          }
        } else {
          this.updateCSS(targetClass, cssProperty, target.value);
        }
      }
    });
  }

  bindToolbarEvents() {
    this.toolbar.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      switch (action) {
        case "copy":
          this.copyCSS();
          break;
        case "reset":
          this.resetState();
          break;
        case "save":
          this.saveTemplate();
          break;
      }
    });
  }

  // CSS Management
  updateCSS(targetClass, property, value) {
    // Lưu vào state
    if (!this.cssState.has(targetClass)) {
      this.cssState.set(targetClass, new Map());
    }
    this.cssState.get(targetClass).set(property, value);

    // Cập nhật UI
    this.updatePreview();
    this.updateCodeDisplay();
  }

  updatePreview() {
    // Tạo stylesheet cho preview
    let styleSheet = "";
    for (const [selector, properties] of this.cssState) {
      styleSheet += `.${selector} {\n`;
      for (const [prop, value] of properties) {
        styleSheet += `  ${prop}: ${value};\n`;
      }
      styleSheet += "}\n";
    }

    // Áp dụng vào preview
    this.preview.style.cssText = styleSheet;
  }

  updateCodeDisplay() {
    let codeOutput = "";
    for (const [selector, properties] of this.cssState) {
      codeOutput += `.${selector} {\n`;
      for (const [prop, value] of properties) {
        codeOutput += `  ${prop}: ${value};\n`;
      }
      codeOutput += "}\n";
    }
    this.codeDisplay.textContent = codeOutput;
  }

  // Toolbar Actions
  copyCSS() {
    const cssText = this.codeDisplay.textContent;
    navigator.clipboard
      .writeText(cssText)
      .then(() => alert("CSS copied to clipboard!"))
      .catch((err) => console.error("Failed to copy:", err));
  }

  resetState() {
    // Clear state
    this.cssState.clear();

    // Reset UI
    this.updatePreview();
    this.updateCodeDisplay();

    // Reset all inputs
    this.controls.querySelectorAll("input, select").forEach((input) => {
      if (input.type === "range") {
        input.value = input.defaultValue;
      } else if (input.type === "radio") {
        input.checked = false;
      } else if (input.tagName === "SELECT") {
        input.selectedIndex = 0;
      }
    });
  }

  saveTemplate() {
    const template = {
      name: prompt("Enter template name:"),
      styles: Object.fromEntries(this.cssState),
    };

    // Lưu vào localStorage
    const savedTemplates = JSON.parse(
      localStorage.getItem("cssTemplates") || "[]"
    );
    savedTemplates.push(template);
    localStorage.setItem("cssTemplates", JSON.stringify(savedTemplates));

    alert("Template saved!");
  }

  // Initialization
  initializeDefaultState() {
    // Set default values cho các controls
    this.controls.querySelectorAll("[data-css-label]").forEach((control) => {
      if (control.type === "range") {
        const cssProperty = control.dataset.cssLabel;
        const fieldset = control.closest("fieldset");
        const targetClass = fieldset.dataset.class;

        // Kiểm tra xem fieldset có unit không
        if (fieldset.classList.contains("Fieldset_Unit_Changable")) {
          const unit = fieldset.dataset.unit || "px";
          this.updateCSS(targetClass, cssProperty, `${control.value}${unit}`);
        } else {
          this.updateCSS(targetClass, cssProperty, control.value);
        }
      }
    });
  }
}

// Initialize the generator when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.cssGenerator = new CSSGenerator();
});
