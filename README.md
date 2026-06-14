# Auto Sort Checked Items

An [Obsidian](https://obsidian.md) plugin that replicates Apple Notes' "Automatically sort checked items" behavior: when you check off a to-do item, it automatically moves to the bottom of the list so your focus stays on what's left to do.

## Features

- ✅ **Auto-reorder** — Checked items slide to the bottom of their checkbox group
- 🪆 **Nesting-aware** — Items with sub-items move as a group, and indented items reorder within their own level
- ↩️ **Clean undo** — Cmd/Ctrl+Z undoes both the check and the move in one step

## Demo

Before checking "Buy groceries":

```markdown
- [ ] Buy groceries
- [ ] Call dentist
- [ ] Finish report
- [x] Send email
```

After:

```markdown
- [ ] Call dentist
- [ ] Finish report
- [x] Buy groceries
- [x] Send email
```

Nested lists work too — checking a parent moves it along with all its children:

```markdown
- [ ] Project A
  - [ ] Task 1
  - [ ] Task 2
- [ ] Project B
```

Check "Project A" →

```markdown
- [ ] Project B
- [x] Project A
  - [ ] Task 1
  - [ ] Task 2
```

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
npm run build  # Production build
```

## License

MIT
