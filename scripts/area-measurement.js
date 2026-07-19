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
    const squareUnitsPerGridSquare = Math.pow(gridDistance, 2);
    const sideLength = game.settings.get(this.MODULE_ID, "squareUnitsPerArea");
    const templateData = template?.document ?? template;

    // Ray normalization: Foundry defaults ray width to one grid unit. For area-mode
    // workflows, treat default-width rays as "sideLength" thick so a 15' ray maps
    // to 1 area when sideLength=15. This MUST run before touched grid squares check.
    if (templateData?.t === "ray") {
      const rawWidth = Number(templateData.width ?? 0);
      const isDefaultWidth =
        !rawWidth || Math.abs(rawWidth - gridDistance) < 1e-6;
      const effectiveWidth = isDefaultWidth ? sideLength : rawWidth;
      return (
        Math.max(0, Number(templateData.distance ?? 0)) *
        Math.max(0, effectiveWidth)
      );
    }

    // Preferred mode: count touched grid squares so overlay matches what users see.
    const touchedSquares = this.countTouchedGridSquares(template);
    if (Number.isFinite(touchedSquares) && touchedSquares >= 0) {
      return touchedSquares * squareUnitsPerGridSquare;
    }

    // Prefer rendered shape geometry for accurate area on rays, rotated templates,
    // and any non-axis-aligned placement. Convert pixel area -> scene square units.
    const shapeAreaPixels = this.getTemplateShapeAreaPixels(template);
    if (shapeAreaPixels > 0 && gridSize > 0 && gridDistance > 0) {
      const pixelsPerSceneUnit = gridSize / gridDistance;
      return shapeAreaPixels / Math.pow(pixelsPerSceneUnit, 2);
    }

    let areaInGridSquares = 0;

    switch (templateData.t) {
      case "circle":
        // Circular area: measured by radius, not geometric area
        const radiusInGrids = templateData.distance / gridDistance;
        areaInGridSquares = radiusInGrids;
        break;

      case "cone":
        // Cone area: measured by distance/radius, not geometric area
        const coneRadiusInGrids = templateData.distance / gridDistance;
        areaInGridSquares = coneRadiusInGrids;
        break;

      case "rect":
        // Rectangular area: width * height
        // NOTE: For square templates (width = 0), template.distance is the DIAGONAL
        // We need to divide by √2 to get the side length
        let widthInGrids, heightInGrids;

        if (!templateData.width || templateData.width === 0) {
          // Square template - distance is diagonal, convert to side length
          const sideInGrids =
            templateData.distance / gridDistance / Math.sqrt(2);
          widthInGrids = sideInGrids;
          heightInGrids = sideInGrids;
        } else {
          // Rectangular template - use distance and width
          widthInGrids = templateData.distance / gridDistance;
          heightInGrids = templateData.width / gridDistance;
        }

        areaInGridSquares = widthInGrids * heightInGrids;
        break;

      case "ray":
        // Ray/line: distance * width
        const lengthInGrids = templateData.distance / gridDistance;
        const rayWidthInGrids =
          (templateData.width || gridDistance) / gridDistance;
        areaInGridSquares = lengthInGrids * rayWidthInGrids;
        break;

      default:
        return 0;
    }

    // Convert grid squares to square units
    // Each grid square is (gridDistance x gridDistance) in the scene's units
    const totalSquareUnits = areaInGridSquares * squareUnitsPerGridSquare;

    return totalSquareUnits;
  }

  /**
   * Count touched grid squares for this template.
   * Uses Foundry's own highlighted grid positions when available.
   */
  static countTouchedGridSquares(template) {
    const grid = canvas?.grid;
    const layer = canvas?.templates;
    if (!grid || !layer) return null;

    try {
      // Prefer Foundry's internal highlight generation if exposed.
      if (typeof template?._getGridHighlightPositions === "function") {
        const positions = template._getGridHighlightPositions();
        if (Array.isArray(positions)) return positions.length;
      }

      if (
        typeof template?.document?._getGridHighlightPositions === "function"
      ) {
        const positions = template.document._getGridHighlightPositions();
        if (Array.isArray(positions)) return positions.length;
      }

      // Fallback approximation: sample points in each grid cell across template bounds.
      const gridSize = canvas.scene.grid.size;
      const bounds = template?.getBounds?.();
      if (!bounds || !gridSize) return null;

      const minCol = Math.floor(bounds.x / gridSize);
      const maxCol = Math.floor((bounds.x + bounds.width) / gridSize);
      const minRow = Math.floor(bounds.y / gridSize);
      const maxRow = Math.floor((bounds.y + bounds.height) / gridSize);

      let touched = 0;
      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const cellX = col * gridSize;
          const cellY = row * gridSize;
          if (this.cellTouchesTemplate(template, cellX, cellY, gridSize)) {
            touched += 1;
          }
        }
      }

      return touched;
    } catch (err) {
      console.warn(
        "Area Measurement Overlay | Failed touched-square calculation, falling back to geometric area",
        err
      );
      return null;
    }
  }

  /**
   * Approximate whether a grid cell touches a template by sampling points in the cell.
   */
  static cellTouchesTemplate(template, cellX, cellY, cellSize) {
    const shape = template?.shape;
    const worldTransform = template?.worldTransform;
    if (!shape || !worldTransform) return false;

    // 5x5 sample grid (corners, center, and intermediates)
    const divisions = 4;
    const step = cellSize / divisions;
    const pt = new PIXI.Point(0, 0);

    for (let ix = 0; ix <= divisions; ix++) {
      for (let iy = 0; iy <= divisions; iy++) {
        const worldX = cellX + ix * step;
        const worldY = cellY + iy * step;
        pt.set(worldX, worldY);
        worldTransform.applyInverse(pt, pt);
        if (shape.contains(pt.x, pt.y)) return true;
      }
    }

    return false;
  }

  /**
   * Compute the rendered template shape area in pixels.
   */
  static getTemplateShapeAreaPixels(template) {
    const shape = template?.shape;
    if (!shape) return 0;

    if (shape instanceof PIXI.Circle) {
      return Math.PI * Math.pow(shape.radius, 2);
    }

    if (shape instanceof PIXI.Ellipse) {
      // PIXI Ellipse stores semi-axes in width/height.
      return Math.PI * Math.abs(shape.width) * Math.abs(shape.height);
    }

    if (shape instanceof PIXI.Rectangle) {
      return Math.abs(shape.width * shape.height);
    }

    if (shape instanceof PIXI.Polygon) {
      return this.polygonAreaPixels(shape.points);
    }

    if (Array.isArray(shape.points)) {
      return this.polygonAreaPixels(shape.points);
    }

    return 0;
  }

  /**
   * Shoelace formula for polygon area from PIXI point arrays [x1,y1,x2,y2,...]
   */
  static polygonAreaPixels(points) {
    if (!Array.isArray(points) || points.length < 6) return 0;
    let area2 = 0;
    const n = Math.floor(points.length / 2);

    for (let i = 0; i < n; i++) {
      const x1 = points[i * 2];
      const y1 = points[i * 2 + 1];
      const j = (i + 1) % n;
      const x2 = points[j * 2];
      const y2 = points[j * 2 + 1];
      area2 += x1 * y2 - x2 * y1;
    }

    return Math.abs(area2) / 2;
  }

  /**
   * Calculate how many area units the template covers
   */
  static calculateAreaUnits(template) {
    const templateData = template?.document ?? template;
    const squareUnits = this.calculateAreaSquareUnits(template);
    const sideLength = game.settings.get(this.MODULE_ID, "squareUnitsPerArea");
    const roundingMode = game.settings.get(this.MODULE_ID, "roundingMode");

    // Cone mode: measure by distance/radius, not geometric area
    // A cone with distance = sideLength should count as 1 area
    if (templateData?.t === "cone") {
      const distance = Math.max(0, Number(templateData.distance ?? 0));
      if (!sideLength || sideLength <= 0) return 0;

      const rawValue = distance / sideLength;

      // Apply rounding mode
      let result;
      switch (roundingMode) {
        case "floor":
          result = Math.floor(rawValue * 10) / 10;
          break;
        case "ceil":
          result = Math.ceil(rawValue * 10) / 10;
          break;
        case "trunc":
          result = Math.trunc(rawValue);
          break;
        case "round":
        default:
          result = Math.round(rawValue * 10) / 10;
          break;
      }

      return result;
    }

    // Circle mode: measure by radius, not geometric area
    // A circle with radius = sideLength should count as 1 area
    if (templateData?.t === "circle") {
      const distance = Math.max(0, Number(templateData.distance ?? 0));
      if (!sideLength || sideLength <= 0) return 0;

      const rawValue = distance / sideLength;

      // Apply rounding mode
      let result;
      switch (roundingMode) {
        case "floor":
          result = Math.floor(rawValue * 10) / 10;
          break;
        case "ceil":
          result = Math.ceil(rawValue * 10) / 10;
          break;
        case "trunc":
          result = Math.trunc(rawValue);
          break;
        case "round":
        default:
          result = Math.round(rawValue * 10) / 10;
          break;
      }

      return result;
    }

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

    const areaUnits = this.calculateAreaUnits(template);
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
