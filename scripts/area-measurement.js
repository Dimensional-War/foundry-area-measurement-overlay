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
    return this.getShapeAreaPixels(template?.shape);
  }

  /**
   * Compute a PIXI shape's area in pixels (shared by templates and regions).
   */
  static getShapeAreaPixels(shape) {
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
   * Compute a raw shape's geometric area in pixels^2 from its RegionShapeData
   * source (rectangle/ellipse/polygon). Circle/cone shapes are intentionally
   * NOT handled here - like templates, those are measured by radius, not by
   * geometric area (see calculateRegionAreaUnits).
   */
  static getRegionShapeDataAreaPixels(shape) {
    switch (shape?.type) {
      case "rectangle":
        return Math.abs((shape.width ?? 0) * (shape.height ?? 0));

      case "line":
        return Math.abs((shape.length ?? 0) * (shape.width ?? 0));

      case "ellipse":
        return Math.PI * Math.abs(shape.radiusX ?? 0) * Math.abs(shape.radiusY ?? 0);

      case "polygon": {
        const points = shape.points;
        if (!Array.isArray(points) || points.length < 6) return 0;
        return this.polygonAreaPixels(points);
      }

      default:
        return 0;
    }
  }

  /**
   * Calculate how many area units a Region covers.
   *
   * Mirrors the template measurement rules: circle/cone shapes are measured
   * by radius (a circle/cone with radius = sideLength counts as 1 area),
   * while rectangle/ellipse/polygon shapes are measured by geometric area
   * (a square whose side = sideLength counts as 1 area). Each non-hole shape
   * contributes positively, each hole subtracts, and the rounding mode is
   * applied once to the combined total (matching template behavior).
   */
  static calculateRegionAreaUnits(region) {
    const gridSize = canvas.scene.grid.size;
    const gridDistance = canvas.scene.grid.distance;
    const sideLength = game.settings.get(this.MODULE_ID, "squareUnitsPerArea");
    const roundingMode = game.settings.get(this.MODULE_ID, "roundingMode");

    if (!gridSize || !gridDistance || !sideLength || sideLength <= 0) return 0;

    const pixelsPerSceneUnit = gridSize / gridDistance;
    const shapes = region?.document?.shapes ?? [];

    let rawValue = 0;

    for (const shape of shapes) {
      const sign = shape.hole ? -1 : 1;

      if (
        shape.type === "circle" ||
        shape.type === "cone" ||
        shape.type === "ring" ||
        shape.type === "emanation"
      ) {
        const radiusSceneUnits = Math.max(0, Number(shape.radius ?? 0)) / pixelsPerSceneUnit;
        rawValue += sign * (radiusSceneUnits / sideLength);
      } else if (
        shape.type === "rectangle" ||
        shape.type === "polygon" ||
        shape.type === "line"
      ) {
        // Ray/line normalization: a shape whose short side (bounding-box
        // dimension) is at most one default grid square wide - i.e. drawn as
        // a "line", whether stored as a RegionRectangleShape, a dedicated
        // RegionLineShape (length/width fields), or a thin RegionPolygonShape
        // quad - is measured by its length, with that default width
        // normalized to sideLength. Same rule as a MeasuredTemplate ray, so a
        // 1-square-wide, sideLength-long strip always counts as 1 area
        // regardless of the grid's own square size.
        let wScene, hScene;
        if (shape.type === "rectangle") {
          wScene = Math.abs(Number(shape.width ?? 0)) / pixelsPerSceneUnit;
          hScene = Math.abs(Number(shape.height ?? 0)) / pixelsPerSceneUnit;
        } else if (shape.type === "line") {
          wScene = Math.abs(Number(shape.length ?? 0)) / pixelsPerSceneUnit;
          hScene = Math.abs(Number(shape.width ?? 0)) / pixelsPerSceneUnit;
        } else {
          const points = shape.points;
          if (Array.isArray(points) && points.length >= 6) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < points.length; i += 2) {
              minX = Math.min(minX, points[i]);
              maxX = Math.max(maxX, points[i]);
              minY = Math.min(minY, points[i + 1]);
              maxY = Math.max(maxY, points[i + 1]);
            }
            wScene = (maxX - minX) / pixelsPerSceneUnit;
            hScene = (maxY - minY) / pixelsPerSceneUnit;
          } else {
            wScene = hScene = 0;
          }
        }

        const lengthScene = Math.max(wScene, hScene);
        const widthScene = Math.min(wScene, hScene);
        const isDefaultWidth = !widthScene || (widthScene <= gridDistance + 0.01);

        if (isDefaultWidth) {
          rawValue += sign * ((lengthScene * sideLength) / Math.pow(sideLength, 2));
        } else {
          const areaPixels = this.getRegionShapeDataAreaPixels(shape);
          const areaSceneUnits = areaPixels / Math.pow(pixelsPerSceneUnit, 2);
          rawValue += sign * (areaSceneUnits / Math.pow(sideLength, 2));
        }
      } else {
        const areaPixels = this.getRegionShapeDataAreaPixels(shape);
        const areaSceneUnits = areaPixels / Math.pow(pixelsPerSceneUnit, 2);
        rawValue += sign * (areaSceneUnits / Math.pow(sideLength, 2));
      }
    }

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

  /**
   * Region text overlays are NOT parented to the Region placeable itself.
   * Foundry only renders a Region's own container (fill/border, and thus any
   * children of it) while it is hovered/controlled or the Regions layer is
   * active - everything else is hidden. Since we want the label to always be
   * visible (per the "always" visibility setting), we instead maintain our
   * own PIXI.Text objects on canvas.controls (a group that always renders),
   * keyed by region id.
   */
  static getRegionOverlayMap() {
    if (!this._regionOverlays) this._regionOverlays = new Map();
    return this._regionOverlays;
  }

  static removeRegionOverlay(regionId) {
    const overlays = this.getRegionOverlayMap();
    const existing = overlays.get(regionId);
    if (existing) {
      existing.parent?.removeChild(existing);
      if (!existing.destroyed) existing.destroy();
      overlays.delete(regionId);
    }
  }

  /**
   * Remove every tracked region overlay (destroying the PIXI.Text objects,
   * not just dropping references), used when tearing down for a new canvas.
   */
  static clearAllRegionOverlays() {
    const overlays = this.getRegionOverlayMap();
    for (const regionId of Array.from(overlays.keys())) {
      this.removeRegionOverlay(regionId);
    }
  }

  /**
   * Safety net against orphaned overlays: destroyRegion/deleteRegion don't
   * always fire for every region (e.g. a cancelled draw-preview, or a region
   * removed while its scene isn't the active canvas), and since these text
   * elements live on canvas.controls rather than as children of the Region
   * itself, an unfired hook leaves a stray label behind permanently. Drop
   * any tracked overlay whose region is no longer actually on the canvas.
   */
  static pruneOrphanedRegionOverlays() {
    const overlays = this.getRegionOverlayMap();
    if (!overlays.size) return;

    const liveIds = new Set(
      (canvas.regions?.placeables ?? []).map(region => region?.objectId).filter(Boolean)
    );

    for (const regionId of Array.from(overlays.keys())) {
      if (!liveIds.has(regionId)) this.removeRegionOverlay(regionId);
    }
  }

  /**
   * Hook into Region rendering/refresh to add area overlay
   */
  static onRenderRegion(region) {
    // objectId is "Region.<id>" for a real placed region, or "Region.<id>.preview"
    // for the temporary preview/drag-clone object Foundry uses while a shape is
    // being drawn or moved - this keeps those from clobbering each other's entry.
    const regionId = region?.objectId;
    if (!regionId) return;

    if (!game.settings.get(this.MODULE_ID, "enabled") || !region?.document) {
      this.removeRegionOverlay(regionId);
      return;
    }

    const visibilityMode = game.settings.get(this.MODULE_ID, "visibility");

    if (visibilityMode === "editing" && canvas.regions?.active !== true) {
      this.removeRegionOverlay(regionId);
      return;
    }

    const areaUnits = this.calculateRegionAreaUnits(region);
    const areaLabel = game.settings.get(this.MODULE_ID, "areaLabel");
    const textColor = game.settings.get(this.MODULE_ID, "textColor");
    const fontSize = game.settings.get(this.MODULE_ID, "fontSize");
    const overlayText = `${areaUnits} ${areaLabel}${areaUnits !== 1 ? "s" : ""}`;

    const overlays = this.getRegionOverlayMap();
    let textElement = overlays.get(regionId);

    if (!textElement || textElement.destroyed) {
      textElement = new PIXI.Text(overlayText, {
        fontFamily: "Arial",
        fontSize: fontSize,
        fill: textColor,
        stroke: "#000000",
        strokeThickness: 3,
        align: "center"
      });
      textElement.anchor.set(0.5, 0);
      textElement.areaOverlayText = true;
      overlays.set(regionId, textElement);
    } else {
      textElement.text = overlayText;
      textElement.style.fontSize = fontSize;
      textElement.style.fill = textColor;
    }

    // Always render, regardless of the Region's own hover/control/layer-active state.
    textElement.renderable = true;
    textElement.visible = true;
    textElement.alpha = 1;

    if (textElement.parent !== canvas.controls) {
      canvas.controls.addChild(textElement);
    }

    // Position just below the region's bounding box, not at its centroid -
    // Foundry draws its own distance/angle measurement labels centered on the
    // shape's edges (region._measurementLabels), and a centroid placement
    // collides with those.
    const bounds = region.animationState?.bounds ?? region.bounds ?? region.document?.bounds;
    if (bounds) {
      textElement.position.set(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height + 5
      );
    } else {
      textElement.position.set(0, 0);
    }
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

// Defensive cleanup: an area overlay text is a child of the template itself,
// so it's normally destroyed along with it, but guard against any case where
// the template is removed without its display object being torn down first.
Hooks.on("deleteMeasuredTemplate", document => {
  const template = document?.object;
  if (!template?.children) return;
  const existingAreaText = template.children.find(child => child.areaOverlayText);
  if (existingAreaText) {
    template.removeChild(existingAreaText);
    if (!existingAreaText.destroyed) existingAreaText.destroy();
  }
});

// Hook into region refresh/draw to update overlay
Hooks.on("refreshRegion", region => {
  AreaMeasurementOverlay.onRenderRegion(region);
});

Hooks.on("drawRegion", region => {
  AreaMeasurementOverlay.onRenderRegion(region);
});

Hooks.on("updateRegion", (document, changes) => {
  if (!("shapes" in changes) && !("elevation" in changes)) return;
  const region = document.object;
  if (region) AreaMeasurementOverlay.onRenderRegion(region);
});

// Clean up our overlay text when a Region placeable is destroyed. Now that
// entries are keyed by objectId (which distinguishes real regions from their
// temporary preview/drag-clone objects), this only ever removes the entry
// belonging to the exact instance being destroyed.
Hooks.on("destroyRegion", region => {
  const regionId = region?.objectId;
  if (regionId) AreaMeasurementOverlay.removeRegionOverlay(regionId);
});

// Belt-and-suspenders: also clean up by document id when a Region document
// is actually deleted from the scene, in case the placeable never fires
// destroyRegion for some reason.
Hooks.on("deleteRegion", document => {
  if (document?.id) AreaMeasurementOverlay.removeRegionOverlay(`Region.${document.id}`);
});

Hooks.on("canvasReady", () => {
  AreaMeasurementOverlay.clearAllRegionOverlays();
  canvas.regions?.placeables.forEach(region => {
    AreaMeasurementOverlay.onRenderRegion(region);
  });
});

// Backstop: destroyRegion/deleteRegion don't always fire for every region
// (cancelled draw-previews, undo, etc). Region overlays live outside the
// Region's own display tree, so a missed hook leaves the label stranded on
// the canvas forever. Periodically reconcile against the live placeables.
Hooks.on("sightRefresh", () => {
  AreaMeasurementOverlay.pruneOrphanedRegionOverlays();
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
    // Refresh all regions when control tools change
    canvas.regions?.placeables.forEach(region => {
      AreaMeasurementOverlay.onRenderRegion(region);
    });
  }
});

console.log("Area Measurement Overlay | Module loaded");
