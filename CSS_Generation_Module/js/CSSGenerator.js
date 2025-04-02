// CSS Generator Core Module
class CSSGenerator {
  constructor() {
    // Khởi tạo các DOM references
    this.controls = document.querySelector(".Vx_CSS_Gen_Controls");
    this.preview = document.querySelector(".Vx_CSS_Gen_FinalResult");
    this.codeDisplay = document.querySelector(".generated-css");
    this.customPart = document.querySelector(".CustomPart");
    this.mainClassInput = document.getElementById("MainClassInput_1");

    // Lưu trữ prefix classes
    this.prefixClasses = this.customPart ? this.customPart.classList.value : [];

    // Tạo style element cho preview
    const previewStyle = document.createElement("style");
    previewStyle.id = "preview-style";
    document.head.appendChild(previewStyle);

    // State management
    this.cssState = new Map(); // Lưu trữ trạng thái CSS hiện tại
    this.inputUnits = new Map(); // Thêm Map để lưu trữ đơn vị cho mỗi input

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
    this.initializeDefaultState();
    this.initUnitControls();
    this.initMainClassHandler();
  }

  // Unit Controls Management
  initUnitControls() {
    const unitFields = document.querySelectorAll(".Fieldset_Unit_Changable");
    unitFields.forEach((field) => {
      this.setupUnitControl(field);
    });
  }

  setupUnitControl(fieldset) {
    const rangeInputs = fieldset.querySelectorAll(".RangeInput");

    rangeInputs.forEach((rangeInput) => {
      const unitButton = rangeInput.querySelector(".UnitChangeButton");
      const unitList = unitButton.querySelector("li");
      const unitDisplay = Array.from(unitButton.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE
      );
      const input = rangeInput.querySelector('input[type="range"]');

      // Khởi tạo đơn vị mặc định và lưu vào Map
      const inputId = this.generateInputId(input);
      this.inputUnits.set(inputId, "px");

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

  // Thêm hàm để tạo ID duy nhất cho mỗi input
  generateInputId(input) {
    const fieldset = input.closest("fieldset");
    const cssLabel = input.dataset.cssLabel;
    return `${fieldset.dataset.class}_${cssLabel}`;
  }

  handleUnitChange(input, newUnit, elements) {
    const { unitButton, unitDisplay, rangeInput } = elements;
    const inputId = this.generateInputId(input);

    if (newUnit === "custom") {
      this.switchToCustomInput(input);
      unitDisplay.textContent = "";
    } else {
      // Cập nhật đơn vị trong Map
      this.inputUnits.set(inputId, newUnit);
      unitDisplay.textContent = newUnit;

      const value = input.value;
      const cssLabel = input.dataset.cssLabel;
      const targetClass = rangeInput.closest("fieldset").dataset.class;

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

  switchToCustomInput(input) {
    const rangeInput = input.closest(".RangeInput");
    const fieldset = rangeInput.closest("fieldset");
    const cssLabel = input.dataset.cssLabel;
    const targetClass = fieldset.dataset.class;

    const textInput = document.createElement("label");
    textInput.className = "TextInput";
    textInput.innerHTML = `
      ${rangeInput.childNodes[0].textContent.trim()}
      <input
        type="text"
        placeholder="Enter custom value"
        data-css-label="${cssLabel}"
        data-target-class="${targetClass}"
      />
    `;

    rangeInput.replaceWith(textInput);
  }

  // Event Handlers
  bindControlEvents() {
    this.controls.addEventListener("input", (e) => {
      const target = e.target;
      const cssLabel = target.dataset.cssLabel;

      if (cssLabel) {
        const fieldset = target.closest("fieldset");
        const targetClass = fieldset
          ? fieldset.dataset.class
          : target.dataset.targetClass;

        if (target.type === "range") {
          // Lấy đơn vị từ Map thay vì dataset
          const inputId = this.generateInputId(target);
          const unit = this.inputUnits.get(inputId) || "px";
          this.updateCSS(targetClass, cssLabel, `${target.value}${unit}`);
        } else if (target.closest(".TextInput")) {
          this.updateCSS(targetClass, cssLabel, target.value);
        } else {
          this.updateCSS(targetClass, cssLabel, target.value);
        }
      }
    });

    if (this.mainClassInput) {
      this.mainClassInput.addEventListener("input", () => {
        this.updateCodeDisplay();
      });
    }
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
    const previewStyle = document.getElementById("preview-style");
    let cssText = "";
    const parentClass = this.mainClassInput.value.trim();

    // Generate preset CSS first
    for (const [selector, properties] of this.presetCSS) {
      const fullSelector = parentClass
        ? `.${parentClass} .${selector}`
        : `.${selector}`;

      cssText += `${fullSelector} {\n`;
      for (const [prop, value] of properties) {
        cssText += `  ${prop}: ${value};\n`;
      }
      cssText += "}\n\n";
    }

    // Then generate dynamic CSS
    for (const [selector, properties] of this.cssState) {
      const fullSelector = parentClass
        ? `.${parentClass} .${selector}`
        : `.${selector}`;

      // Check if we need to merge with preset
      const presetProperties = this.presetCSS.get(selector);

      cssText += `${fullSelector} {\n`;

      // Add preset properties first
      if (presetProperties) {
        for (const [prop, value] of presetProperties) {
          // Skip if property is overridden by dynamic CSS
          if (!properties.has(prop)) {
            cssText += `  ${prop}: ${value};\n`;
          }
        }
      }

      // Add dynamic properties
      for (const [prop, value] of properties) {
        cssText += `  ${prop}: ${value};\n`;
      }

      cssText += "}\n\n";
    }

    // Update preview style
    previewStyle.textContent = cssText;
  }

  updateCodeDisplay() {
    let codeOutput = "";
    const parentClass = this.mainClassInput.value.trim();

    // Start style tag
    codeOutput += "<style>\n";

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

    // End style tag
    codeOutput += "</style>";

    this.codeDisplay.textContent = codeOutput;
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

  // Main Class Input Handler
  initMainClassHandler() {
    if (!this.mainClassInput || !this.customPart) return;

    // Xử lý sự kiện input
    this.mainClassInput.addEventListener("input", () => {
      const dynamicClass = this.mainClassInput.value.trim();

      // Thêm dynamic class nếu có
      if (dynamicClass) {
        this.customPart.className = this.prefixClasses + " " + dynamicClass;
        console.log(this.customPart.classList.value);
      }
    });

    // Trigger sự kiện input lần đầu để set giá trị mặc định
    this.mainClassInput.dispatchEvent(new Event("input"));
  }
}

// Initialize the generator when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.cssGenerator = new CSSGenerator();
});
