/**
 * Area Measurement Overlay Module
 * Displays custom area measurements on Foundry VTT templates
 */

class AreaMeasurementOverlay {
  static MODULE_ID = "area-measurement-overlay";

  /**
   * Initialize the module
   */
  static init() {
    console.log("Area Measurement Overlay | Initializing");
    this.registerSettings();
  }

  /**
   * Register module settings
   */
  static registerSettings() {
    game.settings.register(this.MODULE_ID, "areaLabel", {
      name: "Area Label",
      hint: "The label to display for area measurements (e.g., 'area', 'zone', 'sector')",
      scope: "world",
      config: true,
      type: String,
      default: "area"
    });

    game.settings.register(this.MODULE_ID, "squareUnitsPerArea", {
      name: "Square Units per Area",
      hint: "How many square units equals one area? (e.g., 225 for a 15×15 grid = 1 area)",
      scope: "world",
      config: true,
      type: Number,
      default: 225,
      range: {
        min: 1,
        max: 10000,
        step: 1
      }
    });

    game.settings.register(this.MODULE_ID, "enabled", {
      name: "Enable Area Overlay",
      hint: "Show area measurements on templates",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(this.MODULE_ID, "textColor", {
      name: "Text Color",
      hint: "Color for the area measurement text (CSS color value)",
      scope: "world",
      config: true,
      type: String,
      default: "#FFFFFF"
    });

    game.settings.register(this.MODULE_ID, "fontSize", {
      name: "Font Size",
      hint: "Font size for the area measurement text (in pixels)",
      scope: "world",
      config: true,
      type: Number,
      default: 24,
      range: {
        min: 10,
        max: 60,
        step: 1
      }
    });
  }

  /**
   * Calculate area in square units from a measured template
   */
  static calculateAreaSquareUnits(template) {
    const gridSize = canvas.scene.grid.size;
    const gridDistance = canvas.scene.grid.distance;
    const gridUnits = canvas.scene.grid.units;

    let areaInGridSquares = 0;

    switch (template.t) {
      case "circle":
      case "cone":
        // Circular area: π * r²
        const radiusInGrids = template.distance / gridDistance;
        areaInGridSquares = Math.PI * Math.pow(radiusInGrids, 2);
        break;

      case "rect":
        // Rectangular area: width * height
        const widthInGrids = template.distance / gridDistance;
        const heightInGrids =
          (template.width || template.distance) / gridDistance;
        areaInGridSquares = widthInGrids * heightInGrids;
        break;

      case "ray":
        // Ray/line: distance * width
        const lengthInGrids = template.distance / gridDistance;
        const rayWidthInGrids = (template.width || gridDistance) / gridDistance;
        areaInGridSquares = lengthInGrids * rayWidthInGrids;
        break;

      default:
        return 0;
    }

    // Convert grid squares to square units
    // Each grid square is (gridDistance x gridDistance) in the scene's units
    const squareUnitsPerGridSquare = Math.pow(gridDistance, 2);
    const totalSquareUnits = areaInGridSquares * squareUnitsPerGridSquare;

    return totalSquareUnits;
  }

  /**
   * Calculate how many area units the template covers
   */
  static calculateAreaUnits(template) {
    const squareUnits = this.calculateAreaSquareUnits(template);
    const squareUnitsPerArea = game.settings.get(
      this.MODULE_ID,
      "squareUnitsPerArea"
    );
    return Math.round((squareUnits / squareUnitsPerArea) * 10) / 10; // Round to 1 decimal
  }

  /**
   * Hook into template rendering to add area overlay
   */
  static onRenderMeasuredTemplate(template, html) {
    if (!game.settings.get(this.MODULE_ID, "enabled")) return;

    const areaUnits = this.calculateAreaUnits(template.document);
    const areaLabel = game.settings.get(this.MODULE_ID, "areaLabel");
    const textColor = game.settings.get(this.MODULE_ID, "textColor");
    const fontSize = game.settings.get(this.MODULE_ID, "fontSize");

    // Create overlay text
    const overlayText = `${areaUnits} ${areaLabel}${areaUnits !== 1 ? "s" : ""}`;

    // Create a text element
    const textElement = new PIXI.Text(overlayText, {
      fontFamily: "Arial",
      fontSize: fontSize,
      fill: textColor,
      stroke: "#000000",
      strokeThickness: 3,
      align: "center"
    });

    textElement.anchor.set(0.5, 0.5);
    textElement.position.set(0, fontSize); // Position below center

    // Add to template's template layer
    template.addChild(textElement);
  }
}

// Initialize on ready
Hooks.once("init", () => AreaMeasurementOverlay.init());

// Hook into template refresh to update overlay
Hooks.on("refreshMeasuredTemplate", template => {
  AreaMeasurementOverlay.onRenderMeasuredTemplate(template, null);
});

console.log("Area Measurement Overlay | Module loaded");
