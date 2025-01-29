// CSS Generator Core Module
class CSSGenerator {
  constructor() {
    // Khởi tạo các DOM references
    this.controls = document.querySelector(".Vx_CSS_Gen_Controls");
    this.preview = document.querySelector(".Vx_CSS_Gen_FinalResult");
    this.codeDisplay = document.querySelector(".generated-css");
    this.toolbar = document.querySelector(".Vx_CSS_Gen_Toolbar");

    // Thêm reference đến MainClassInput
    this.mainClassInput = document.getElementById("MainClassInput_1");

    // State management
    this.cssState = new Map(); // Lưu trữ trạng thái CSS hiện tại

    // Analyze DOM and generate templates
    this.inputTemplates = this.analyzeTemplates(this.controls);

    // Update template generator
    this.getRangeInputTemplate = (property) => {
      const template = this.inputTemplates.get(property);
      const units =
        template.units.length > 0
          ? this.generateUnitSelector(template.units)
          : "";

      return `
        <label class="RangeInput">
          ${template.label}
          <input 
            type="${template.inputType}" 
            data-css-label="${template.property}"
            value="${template.defaultValue}"
          />
          ${units}
        </label>
      `;
    };

    // Preset CSS properties
    this.presetCSS = new Map();
    Object.entries(window.GALLERY_PRESET_CSS).forEach(([selector, props]) => {
      this.presetCSS.set(selector, new Map(Object.entries(props)));
    });

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
    // Thay đổi để setup cho từng input range
    const rangeInputs = fieldset.querySelectorAll(".RangeInput");

    rangeInputs.forEach((rangeInput) => {
      const unitButton = rangeInput.querySelector(".UnitChangeButton");
      const unitList = unitButton.querySelector("li");
      const unitDisplay = Array.from(unitButton.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      );
      const input = rangeInput.querySelector('input[type="range"]');

      // Lưu đơn vị hiện tại vào data attribute của input
      input.dataset.unit = "px";

      unitButton.addEventListener("click", () => {
        unitButton.classList.toggle("UnitChanging");
      });

      unitList.querySelectorAll("ul").forEach((unit) => {
        unit.addEventListener("click", (e) => {
          e.stopPropagation();
          this.handleUnitChange(input, unit.textContent.trim(), {
            unitButton,
            unitDisplay,
            rangeInput,
          });
        });
      });
    });
  }

  handleUnitChange(input, newUnit, elements) {
    const { unitButton, unitDisplay, rangeInput } = elements;

    if (newUnit === "custom") {
      this.switchToCustomInput(rangeInput, input);
      unitDisplay.textContent = "";
      input.dataset.unit = "";
    } else {
      unitDisplay.textContent = newUnit;
      input.dataset.unit = newUnit;

      // Cập nhật CSS với đơn vị mới
      const value = input.value;
      const cssLabel = input.dataset.cssLabel;
      const targetClass = input.closest("fieldset").dataset.class;

      this.updateCSS(targetClass, cssLabel, `${value}${newUnit}`);
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
        if (target.type === "range") {
          const unit = target.dataset.unit || "px";
          this.updateCSS(targetClass, cssProperty, `${target.value}${unit}`);
        } else if (target.closest(".TextInput")) {
          this.updateCSS(targetClass, cssProperty, target.value);
        } else {
          this.updateCSS(targetClass, cssProperty, target.value);
        }
      }
    });

    // Thêm event listener cho MainClassInput
    this.mainClassInput.addEventListener("input", () => {
      this.updateCodeDisplay();
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
    let styleSheet = "";
    const parentClass = this.mainClassInput.value.trim();
    const previewStyle = document.getElementById("preview-style");

    for (const [selector, properties] of this.cssState) {
      // Thêm parent class nếu có
      const fullSelector = parentClass
        ? `.${parentClass} .${selector}`
        : `.${selector}`;

      styleSheet += `${fullSelector} {\n`;
      for (const [prop, value] of properties) {
        styleSheet += `  ${prop}: ${value};\n`;
      }
      styleSheet += "}\n";
    }

    // Cập nhật nội dung của thẻ style
    previewStyle.textContent = styleSheet;

    // Thêm/xóa class cha vào gallery nếu có
    const gallery = document.querySelector("#GALLERY1");
    if (gallery) {
      // Lấy class cũ (nếu có) từ data attribute
      const oldParentClass = gallery.dataset.parentClass;

      if (oldParentClass && oldParentClass !== parentClass) {
        gallery.classList.remove(oldParentClass);
      }

      if (parentClass) {
        gallery.classList.add(parentClass);
        // Lưu class mới vào data attribute
        gallery.dataset.parentClass = parentClass;
      }
    }
  }

  updateCodeDisplay() {
    let codeOutput = "";
    const parentClass = this.mainClassInput.value.trim();

    // Generate preset CSS first
    for (const [selector, properties] of this.presetCSS) {
      const fullSelector = parentClass
        ? `.${parentClass} .${selector}`
        : `.${selector}`;

      codeOutput += `${fullSelector} {\n`;
      for (const [prop, value] of properties) {
        codeOutput += `  ${prop}: ${value};\n`;
      }
      codeOutput += "}\n\n";
    }

    // Then generate dynamic CSS
    for (const [selector, properties] of this.cssState) {
      const fullSelector = parentClass
        ? `.${parentClass} .${selector}`
        : `.${selector}`;

      // Check if we need to merge with preset
      const presetProperties = this.presetCSS.get(selector);

      codeOutput += `${fullSelector} {\n`;

      // Add preset properties first
      if (presetProperties) {
        for (const [prop, value] of presetProperties) {
          // Skip if property is overridden by dynamic CSS
          if (!properties.has(prop)) {
            codeOutput += `  ${prop}: ${value};\n`;
          }
        }
      }

      // Add dynamic properties
      for (const [prop, value] of properties) {
        codeOutput += `  ${prop}: ${value};\n`;
      }

      codeOutput += "}\n\n";
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

  generateUnitSelector(units) {
    if (!units.length) return "";

    return `
      <div class="UnitChangeButton">
        ${units[0]}
        <li>
          ${units.map((unit) => `<ul>${unit}</ul>`).join("")}
          <ul>custom</ul>
        </li>
        <!-- ... svg icon ... -->
      </div>
    `;
  }

  // CSS Template Analyzer
  analyzeTemplates(rootElement) {
    const cssPropertyLabels = {
      "border-radius": "Border Radius",
      "margin-top": "Margin Top",
      "margin-bottom": "Margin Bottom",
      padding: "Padding",
      width: "Width",
      height: "Height",
      "font-size": "Font Size",
      "line-height": "Line Height",
      opacity: "Opacity",
    };

    const inputTypeMap = {
      range: [
        "border-radius",
        "margin",
        "padding",
        "width",
        "height",
        "font-size",
        "line-height",
        "opacity",
      ],
      color: ["background-color", "color", "border-color"],
      radio: ["display", "position", "overflow", "visibility"],
      text: ["font-family", "transform"],
    };

    const templates = new Map();
    const cssElements = rootElement.querySelectorAll("[data-css-label]");

    cssElements.forEach((element) => {
      const cssProperty = element.dataset.cssLabel;
      const inputType = element.type || element.tagName.toLowerCase();

      templates.set(cssProperty, {
        label:
          cssPropertyLabels[cssProperty] ||
          this.formatPropertyLabel(cssProperty),
        property: cssProperty,
        inputType: this.determineInputType(
          cssProperty,
          inputType,
          inputTypeMap
        ),
        defaultValue: element.value || "",
        units: this.getPropertyUnits(cssProperty),
      });
    });

    return templates;
  }

  formatPropertyLabel(property) {
    return property
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  determineInputType(property, currentType, inputTypeMap) {
    for (const [type, properties] of Object.entries(inputTypeMap)) {
      if (properties.includes(property)) return type;
    }
    return currentType;
  }

  getPropertyUnits(property) {
    const lengthUnits = ["px", "rem", "em", "vw", "vh", "%"];
    const timeUnits = ["s", "ms"];

    const unitMap = {
      "border-radius": lengthUnits,
      margin: lengthUnits,
      padding: lengthUnits,
      width: lengthUnits,
      height: lengthUnits,
      "font-size": lengthUnits,
      "transition-duration": timeUnits,
    };

    return unitMap[property] || [];
  }
}

// Initialize the generator when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.cssGenerator = new CSSGenerator();
});
