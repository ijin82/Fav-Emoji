# Fav-Emoji 🌟

**Fav-Emoji** is a fast, minimalistic GNOME Shell extension designed for quick composition and instant copying/pasting of your favorite emojis directly from the top panel.

Unlike standard bulky emoji pickers with thousands of icons at once, **Fav-Emoji** focuses on speed and ergonomics: you customize up to 50 of your most frequently used emojis, click to compose any combination in a dedicated accumulator text entry, and instantly copy or auto-paste it into the active application.

---

## Features ✨

- 🚀 **Quick Top Panel Access**: Compact icon in the top panel or customizable global shortcut (<kbd>Super</kbd>+<kbd>.</kbd> by default).
- ✍️ **Effortless Composition**: The text accumulator field opens clean and automatically focused. Click any emoji in the grid to append it.
- 📋 **One-Click Copy & Auto-Paste**:
  - **Copy** button or <kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd> copies text to the clipboard and closes the popup menu.
  - Optional **"Paste immediately after copy"** automatically simulates paste into the focused window.
  - **Clear** button resets the composed string.
- 🎨 **Modern Settings Window (Libadwaita / GTK4)**:
  - **9-Category Catalog & Instant Search**: Full catalog of 3900+ emojis with large 30px icons, searchable by name and keywords.
  - **Smart Toggle Selection**: Currently selected emojis are highlighted with a blue border; clicking again removes them from favorites.
  - **Drag & Drop Reordering**: Rearrange favorite emojis by dragging items directly with the mouse.
  - **Bidirectional Real-Time Sync**: Edit or reorder the entire emoji set as plain text in the "Emoji List" field with instant synchronization.
  - **Interactive Shortcut Recorder**: Click and press any combination (e.g. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>.</kbd>) to bind shortcuts.
  - Configurable grid columns and emoji font size.

---

## Installation & Build 📦

### Build from source:

```bash
# 1. Clone the repository
git clone https://github.com/ijin82/Fav-Emoji.git
cd Fav-Emoji

# 2. Build the extension package
make build

# 3. Install to current user
make install
```

### Local development setup (symlink):

```bash
ln -s "$(pwd)/fav-emoji@ijin82" ~/.local/share/gnome-shell/extensions/fav-emoji@ijin82
gnome-extensions enable fav-emoji@ijin82
```

To open preferences:
```bash
gnome-extensions prefs fav-emoji@ijin82
```

---

## Debugging & Testing 🧪

- Test inside an isolated nested GNOME Shell session (Wayland):
  ```bash
  dbus-run-session gnome-shell --nested --wayland
  ```
- View live extension logs:
  ```bash
  journalctl /usr/bin/gnome-shell -b -f -o cat
  ```

---

## Acknowledgments & Credits 🤝

**Fav-Emoji** is created by Ilya Rogozhin ([@ijin82](https://github.com/ijin82)) based on the **[Emoji Copy](https://github.com/felipeftn/emoji-copy)** project.

Special thanks to:
- **[FelipeFTN](https://github.com/felipeftn)** — creator of the original *Emoji Copy* extension, whose ideas, codebase, and inspiration laid the groundwork for this extension.
- **[maoschanz](https://github.com/maoschanz)** — author of the original *emoji-selector-for-gnome*.
- All open-source GNOME community contributors and translators.

---

## License 📄

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](./LICENSE) file for details.
