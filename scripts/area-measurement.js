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
      name: "Side Length per Area",
      hint: "The side length in scene units that equals one area. For example, enter 15 to make a 15×15 ft template = 1 area, or enter 10 to make a 10×10 ft template = 1 area.",
      scope: "world",
      config: true,
      type: Number,
      default: 15,
      range: {
        min: 1,
        max: 1000,
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

    game.settings.register(this.MODULE_ID, "visibility", {
      name: "Visibility Mode",
      hint: "When to show the area measurement overlay",
      scope: "world",
      config: true,
      type: String,
      choices: {
        always: "Always Visible",
        editing: "Only While Editing Templates"
      },
      default: "always"
    });

    game.settings.register(this.MODULE_ID, "roundingMode", {
      name: "Rounding Mode",
      hint: "How to round area values when they are not whole numbers",
      scope: "world",
      config: true,
      type: String,
      choices: {
        round: "Round (nearest)",
        floor: "Floor (round down)",
        ceil: "Ceil (round up)",
        trunc: "Trunc (remove decimal)"
      },
      default: "floor"
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
        // NOTE: For square templates (width = 0), template.distance is the DIAGONAL
        // We need to divide by √2 to get the side length
        let widthInGrids, heightInGrids;

        if (!template.width || template.width === 0) {
          // Square template - distance is diagonal, convert to side length
          const sideInGrids = template.distance / gridDistance / Math.sqrt(2);
          widthInGrids = sideInGrids;
          heightInGrids = sideInGrids;
        } else {
          // Rectangular template - use distance and width
          widthInGrids = template.distance / gridDistance;
          heightInGrids = template.width / gridDistance;
        }

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
    const sideLength = game.settings.get(this.MODULE_ID, "squareUnitsPerArea");
    const roundingMode = game.settings.get(this.MODULE_ID, "roundingMode");

    // Side length is already in scene units (e.g., feet)
    // Square it to get the area per unit
    const squareUnitsPerArea = Math.pow(sideLength, 2);
    const rawValue = squareUnits / squareUnitsPerArea;

    // Apply rounding mode
    let result;
    switch (roundingMode) {
      case "floor":
        result = Math.floor(rawValue * 10) / 10; // Floor to 1 decimal
        break;
      case "ceil":
        result = Math.ceil(rawValue * 10) / 10; // Ceil to 1 decimal
        break;
      case "trunc":
        result = Math.trunc(rawValue); // Truncate decimal (whole number only)
        break;
      case "round":
      default:
        result = Math.round(rawValue * 10) / 10; // Round to 1 decimal
        break;
    }

    return result;
  }

  /**
   * Hook into template rendering to add area overlay
   */
  static onRenderMeasuredTemplate(template, html) {
    if (!game.settings.get(this.MODULE_ID, "enabled")) return;

    const visibilityMode = game.settings.get(this.MODULE_ID, "visibility");

    // Check if we should show based on visibility mode
    if (visibilityMode === "editing" && canvas.templates?.active !== true) {
      // Remove text if it exists when not in editing mode
      const existingAreaText = template.children.find(
        child => child.areaOverlayText
      );
      if (existingAreaText) {
        template.removeChild(existingAreaText);
      }
      return;
    }

    const areaUnits = this.calculateAreaUnits(template.document);
    const areaLabel = game.settings.get(this.MODULE_ID, "areaLabel");
    const textColor = game.settings.get(this.MODULE_ID, "textColor");
    const fontSize = game.settings.get(this.MODULE_ID, "fontSize");

    // Remove existing area text if it exists
    const existingAreaText = template.children.find(
      child => child.areaOverlayText
    );
    if (existingAreaText) {
      template.removeChild(existingAreaText);
    }

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

    textElement.anchor.set(0.5, 0);
    textElement.areaOverlayText = true; // Mark this as our overlay text

    // Position near the template's measurement text
    // Find the existing measurement text (it's a PIXI.Text child)
    const measurementText = template.children.find(
      child => child instanceof PIXI.Text && !child.areaOverlayText
    );

    if (measurementText) {
      // Match the same anchor and position as measurement text
      // Calculate the bottom of the measurement text accounting for its anchor
      const textBottom =
        measurementText.y +
        measurementText.height * (1 - measurementText.anchor.y);

      // Position directly below the measurement text
      // Add horizontal offset to align with the measurement text which appears to the right
      const xOffset = measurementText.x + measurementText.width / 2;

      textElement.position.set(
        xOffset, // Offset to the right to align with measurement text
        textBottom + 5
      );
    } else {
      // Fallback: position at template origin with offset
      textElement.position.set(0, 30);
    }

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

// Hook into control tool changes to update visibility when switching to/from template editing mode
Hooks.on("renderSceneControls", () => {
  const visibilityMode = game.settings.get(
    AreaMeasurementOverlay.MODULE_ID,
    "visibility"
  );
  if (visibilityMode === "editing") {
    // Refresh all templates when control tools change
    canvas.templates?.placeables.forEach(template => {
      AreaMeasurementOverlay.onRenderMeasuredTemplate(template, null);
    });
  }
});

console.log("Area Measurement Overlay | Module loaded");
