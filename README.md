# Area Measurement Overlay

A Foundry VTT module that displays custom area measurements on templates based on configurable square footage.

## Features

- **Custom Area Labels**: Configure the label (e.g., "area", "zone", "sector")
- **Configurable Units**: Define how many square units (based on your scene's grid units) equals one area
- **Automatic Calculation**: Calculates area based on template shape (circle, rectangle, cone, ray)
- **Visual Overlay**: Displays area units directly on templates
- **Customizable Appearance**: Adjust text color and font size

## Installation

### Method 1: Manual Installation

1. Copy the `area-measurement-overlay` folder to your Foundry VTT modules directory:
   - Windows: `%localappdata%\FoundryVTT\Data\modules\`
   - Linux/Mac: `~/.local/share/FoundryVTT/Data/modules/`

2. Restart Foundry VTT

3. Enable the module in your world's Module Settings

### Method 2: Symlink (Development)

Create a symbolic link from your development directory to Foundry's modules folder.

## Configuration

Access module settings in **Game Settings → Module Settings → Area Measurement Overlay**

### Settings

- **Area Label**: The text label for your area units (default: "area")
- **Square Units per Area**: How many square units (in your scene's grid units) equals one area (default: 225 for 15×15 = 1 area)
- **Enable Area Overlay**: Toggle the overlay on/off (default: enabled)
- **Text Color**: CSS color for the overlay text (default: #FFFFFF white)
- **Font Size**: Size of the overlay text in pixels (default: 24px)

## Usage

1. Configure your settings (e.g., set "Square Units per Area" to 225 if 15×15 grid units = 1 area)
2. Place any template on the canvas (circle, cone, rectangle, or ray)
3. The module automatically calculates and displays the area units

### Example

**Configuration:**

- Square Units per Area: 225 (15 × 15 grid units)
- Area Label: "area"

**Result:**

- 15×15 grid unit template → displays "1 area"
- 30×30 grid unit template → displays "4 areas"
- 45×45 grid unit template → displays "9 areas"

## How It Works

The module:

1. Hooks into Foundry's template rendering
2. Calculates the template's area in square units (based on your scene's grid distance setting)
3. Divides by your configured "Square Units per Area" value
4. Overlays the result on the template

### Supported Template Types

- **Circle/Cone**: Calculates using πr²
- **Rectangle**: Calculates using width × height
- **Ray/Line**: Calculates using length × width

## Compatibility

- **Foundry VTT Version**: 12+
- **Game Systems**: Universal (works with any system)
- **Conflicts**: None known

## Changelog

### v1.0.0

- Initial release
- Support for all template types
- Configurable labels and units
- Customizable appearance

## License

This module is provided as-is for use with Foundry VTT.

## Support

For issues or feature requests, please contact the module author.
