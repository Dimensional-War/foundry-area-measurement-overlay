# Area Measurement Overlay

A Foundry VTT module that displays custom area measurements on templates based on configurable square footage.

## Features

- **Custom Area Labels**: Configure the label (e.g., "area", "zone", "sector")
- **Simple Configuration**: Just enter the side length - the module squares it automatically
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
- **Side Length per Area**: The side length in scene units (feet, meters, etc.) that equals one area. Enter 15 to make a 15×15 ft template = 1 area. Enter 10 to make a 10×10 ft template = 1 area. (default: 15)
- **Enable Area Overlay**: Toggle the overlay on/off (default: enabled)
- **Visibility Mode**: Choose when to show the area measurement (default: "Always Visible")
  - **Always Visible**: Area measurements always visible on all templates
  - **Only While Editing Templates**: Area measurements only visible when the template measurement tool is active
- **Rounding Mode**: How to round area values when they are not whole numbers (default: "Floor (round down)")
  - **Round (nearest)**: Standard rounding to the nearest value (1 decimal place)
  - **Floor (round down)**: Always rounds down (1 decimal place)
  - **Ceil (round up)**: Always rounds up (1 decimal place)
  - **Trunc (remove decimal)**: Removes the decimal part entirely, showing only whole numbers (e.g., 2.9 becomes 2)
- **Text Color**: CSS color for the overlay text (default: #FFFFFF white)
- **Font Size**: Size of the overlay text in pixels (default: 24px)

## Usage

1. Configure your settings:
   - **To make a 15×15 ft template = 1 area:** Set "Side Length per Area" to **15**
   - **To make a 10×10 ft template = 1 area:** Set "Side Length per Area" to **10**
2. Place any template on the canvas (circle, cone, rectangle, or ray)
3. The module automatically calculates and displays the area units

### Example

**Configuration:**

- Side Length per Area: **15** (this makes 15 × 15 ft = 1 area)
- Area Label: "area"

**Result:**

- 15×15 ft template → displays "1 area"
- 30×30 ft template → displays "4 areas" (because 30×30 = 4 times 15×15)
- 45×45 ft template → displays "9 areas" (because 45×45 = 9 times 15×15)

## How It Works

The module:

1. Hooks into Foundry's template rendering
2. Calculates the template's area in square units (based on your scene's grid distance setting)
3. Squares your configured side length to get the area per unit (e.g., 15 ft → 225 square ft)
4. Divides the template area by this value and displays the result

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
