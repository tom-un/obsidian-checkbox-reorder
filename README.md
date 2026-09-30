# Auto Sort Checked Items

![Auto Sort Checked Items demo](example.gif)

An [Obsidian](https://obsidian.md) plugin that replicates Apple Notes' "Automatically sort checked items" behavior: when you check off a to-do item, it automatically moves to the bottom of the list so your focus stays on what's left to do.

## Features

- ✅ **Auto-reorder** — Checked items slide to the bottom of their checkbox group
- 🪆 **Nesting-aware** — Items with sub-items move as a group, and indented items reorder within their own level
- ↕️ **Move whole TODO branches** — Move an item up or down together with all of its indented sub-items
- ✨ **Smooth animation** — A ghost of the checked row visually slides to its new position
- ↩️ **Clean undo** — Cmd/Ctrl+Z undoes both the check and the move in one step

## Moving TODO items

Obsidian's built-in **Move line up** and **Move line down** commands only move one line. This plugin adds:

- **Auto Sort Checked Items: Move TODO item up with sub-items**
- **Auto Sort Checked Items: Move TODO item down with sub-items**

Assign hotkeys to these commands in **Settings → Hotkeys**. Put the cursor on a checkbox item and the command will swap that item, including every indented line beneath it, with the adjacent checkbox item at the same indentation level.

![Hotkey assignments for moving TODO items with their sub-items](hotkeys.png)

## Installation

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/tom-un/obsidian-checkbox-reorder/releases)
2. Create a folder called `checkbox-reorder` in your vault's `.obsidian/plugins/` directory
3. Place both files inside it
4. In Obsidian, go to **Settings → Community Plugins** and enable "Checkbox Reorder"

### From source

```bash
git clone https://github.com/tom-un/obsidian-checkbox-reorder.git
cd obsidian-checkbox-reorder
npm install
npm run build
```

Then copy the folder (or symlink it) into your vault's `.obsidian/plugins/` directory.

## Development

```bash
npm run dev    # Watch mode — rebuilds on file changes
npm test       # Run unit tests
npm run build  # Production build
```

## License

MIT
