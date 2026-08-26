/*
    Fav-Emoji GNOME Shell Extension
    Minimalistic Favorite Emoji Picker with text accumulator, copy and clear actions.
*/

import St from "gi://St";
import Meta from "gi://Meta";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import Shell from "gi://Shell";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import {
  Extension,
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
const PRIMARY_CLIPBOARD_TYPE = St.ClipboardType.PRIMARY;

const VirtualKeyboard = (() => {
  let virtualKeyboard;
  return () => {
    if (!virtualKeyboard) {
      virtualKeyboard = Clutter.get_default_backend()
        .get_default_seat()
        .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    }
    return virtualKeyboard;
  };
})();

export default class FavEmoji extends Extension {
  async enable() {
    this.initTranslations();
    this.signaux = [];
    this.timeoutSourceId = null;
    this._pasteHackTimeoutId = null;
    this._settings = this.getSettings();

    this.super_btn = new PanelMenu.Button(0.0, _("Fav-Emoji"), false);
    const box = new St.BoxLayout();
    const icon = new St.Icon({
      icon_name: "face-cool-symbolic",
      style_class: "system-status-icon emotes-icon",
    });
    box.add_child(icon);
    this.super_btn.add_child(box);
    this.super_btn.visible = this._settings.get_boolean("always-show");

    // Remove any stale indicator from a previous enable/disable cycle
    const existingIndicator = Main.panel.statusArea[this.uuid];
    if (existingIndicator) {
      existingIndicator.destroy();
    }

    Main.panel.addToStatusArea(this.uuid, this.super_btn, 0, "right");

    this.super_btn.menu.connect(
      "open-state-changed",
      this._onOpenStateChanged.bind(this),
    );

    // Build the popup menu UI
    this._buildMenuLayout();

    if (this._settings.get_boolean("active-keybind")) {
      this._bindShortcut();
    }

    // Connect settings changes
    this.signaux.push(
      this._settings.connect("changed::favorite-emojis", () => {
        this._rebuildFavoritesGrid();
      }),
      this._settings.connect("changed::nbcols", () => {
        this._rebuildFavoritesGrid();
      }),
      this._settings.connect("changed::emojisize", () => {
        this._rebuildFavoritesGrid();
      }),
      this._settings.connect("changed::always-show", () => {
        this.super_btn.visible = this._settings.get_boolean("always-show");
      }),
      this._settings.connect("changed::active-keybind", (s) => {
        Main.wm.removeKeybinding("emoji-keybind");
        if (s.get_boolean("active-keybind")) {
          this._bindShortcut();
        }
      }),
    );
  }

  disable() {
    if (this._settings.get_boolean("active-keybind")) {
      Main.wm.removeKeybinding("emoji-keybind");
    }

    for (const signalId of this.signaux) {
      this._settings.disconnect(signalId);
    }
    this.signaux = [];

    if (this.timeoutSourceId) {
      GLib.Source.remove(this.timeoutSourceId);
      this.timeoutSourceId = null;
    }

    if (this._pasteHackTimeoutId) {
      GLib.Source.remove(this._pasteHackTimeoutId);
      this._pasteHackTimeoutId = null;
    }

    if (this.super_btn) {
      this.super_btn.destroy();
      this.super_btn = null;
    }

    this._settings = null;
    this.textEntry = null;
    this.favoritesSection = null;
  }

  _buildMenuLayout() {
    // 1. Actions Row (Clear & Copy)
    const actionsMenuItem = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
      style_class: "fav-emoji-actions-menuitem",
    });

    const actionsBox = new St.BoxLayout({
      style_class: "fav-emoji-actions-box",
      x_expand: true,
      x_align: Clutter.ActorAlign.FILL,
    });

    // Clear button
    const clearBox = new St.BoxLayout({
      x_align: Clutter.ActorAlign.CENTER,
    });
    clearBox.add_child(new St.Icon({
      icon_name: "edit-clear-symbolic",
      icon_size: 16,
      style_class: "fav-emoji-btn-icon",
    }));
    clearBox.add_child(new St.Label({
      text: _("Clear"),
      style_class: "fav-emoji-btn-label",
    }));

    this.clearBtn = new St.Button({
      style_class: "button fav-emoji-action-btn fav-emoji-clear-btn",
      can_focus: true,
      track_hover: true,
      x_expand: true,
      child: clearBox,
    });
    this.clearBtn.connect("clicked", () => this._onClearClicked());

    // Copy button
    const copyBox = new St.BoxLayout({
      x_align: Clutter.ActorAlign.CENTER,
    });
    copyBox.add_child(new St.Icon({
      icon_name: "edit-copy-symbolic",
      icon_size: 16,
      style_class: "fav-emoji-btn-icon",
    }));
    copyBox.add_child(new St.Label({
      text: _("Copy"),
      style_class: "fav-emoji-btn-label",
    }));

    this.copyBtn = new St.Button({
      style_class: "button suggested-action fav-emoji-action-btn fav-emoji-copy-btn",
      can_focus: true,
      track_hover: true,
      x_expand: true,
      child: copyBox,
    });
    this.copyBtn.connect("clicked", () => this._onCopyClicked());

    actionsBox.add_child(this.clearBtn);
    actionsBox.add_child(this.copyBtn);
    actionsMenuItem.add_child(actionsBox);
    this.super_btn.menu.addMenuItem(actionsMenuItem);

    // 2. Text Input Entry
    const entryMenuItem = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
      style_class: "fav-emoji-entry-menuitem",
    });

    this.textEntry = new St.Entry({
      name: "favEmojiEntry",
      style_class: "fav-emoji-entry",
      can_focus: true,
      hint_text: _("Click emojis to compose..."),
      track_hover: true,
      x_expand: true,
    });

    const clutterText = this.textEntry.get_clutter_text();
    clutterText.connect("key-press-event", (actor, event) => {
      const symbol = event.get_key_symbol();
      if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
        this._onCopyClicked();
        return Clutter.EVENT_STOP;
      }
      if (symbol === Clutter.KEY_Escape) {
        this.super_btn.menu.close();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });

    entryMenuItem.add_child(this.textEntry);
    this.super_btn.menu.addMenuItem(entryMenuItem);

    // 3. Favorites Grid Section
    this.favoritesSection = new PopupMenu.PopupMenuSection();
    this.super_btn.menu.addMenuItem(this.favoritesSection);

    this._rebuildFavoritesGrid();
  }

  _rebuildFavoritesGrid() {
    if (!this.favoritesSection) return;
    this.favoritesSection.removeAll();

    let rawFavorites = this._settings.get_strv("favorite-emojis");
    if (!rawFavorites || rawFavorites.length === 0) {
      rawFavorites = ['👍','❤️','😀','😂','🤣','🚀','🤝','🤔','😮','😍','🥰','😘','🤮','🔥','🎉','🙏','👏','💯','👀','😎'];
    }

    // Limit to max 50 items
    const favorites = rawFavorites.slice(0, 50);
    const nbCols = Math.max(1, this._settings.get_int("nbcols") || 10);
    const emojiSize = Math.max(16, this._settings.get_int("emojisize") || 28);

    let currentRowBox = null;
    let currentMenuItem = null;

    favorites.forEach((emoji, index) => {
      if (index % nbCols === 0) {
        currentMenuItem = new PopupMenu.PopupBaseMenuItem({
          reactive: false,
          can_focus: false,
          style_class: "fav-emoji-row-menuitem",
        });
        currentRowBox = new St.BoxLayout({
          style_class: "fav-emoji-row-box",
          x_expand: true,
        });
        currentMenuItem.add_child(currentRowBox);
        this.favoritesSection.addMenuItem(currentMenuItem);
      }

      const emojiBtn = new St.Button({
        label: emoji,
        style_class: "fav-emoji-btn",
        can_focus: true,
        track_hover: true,
        style: `font-size: ${emojiSize}px;`,
      });

      emojiBtn.connect("clicked", () => {
        this._appendEmoji(emoji);
      });

      emojiBtn.connect("key-press-event", (actor, event) => {
        const symbol = event.get_key_symbol();
        const state = typeof event.get_state === 'function' ? event.get_state() : 0;
        const isCtrl = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (isCtrl && (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter)) {
          this._onCopyClicked();
          return Clutter.EVENT_STOP;
        }

        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter || symbol === Clutter.KEY_space) {
          this._appendEmoji(emoji);
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      currentRowBox.add_child(emojiBtn);
    });
  }

  _appendEmoji(emoji) {
    if (!this.textEntry) return;
    const clutterText = this.textEntry.get_clutter_text();
    const currentText = clutterText.get_text() || "";
    const newText = currentText + emoji;
    this.textEntry.set_text(newText);
    clutterText.set_cursor_position(newText.length);
  }

  _onClearClicked() {
    if (!this.textEntry) return;
    this.textEntry.set_text("");
    global.stage.set_key_focus(this.textEntry.get_clutter_text());
  }

  _onCopyClicked() {
    if (!this.textEntry) return;
    const text = this.textEntry.get_text();

    if (text && text.length > 0) {
      const clipboard = St.Clipboard.get_default();
      clipboard.set_text(CLIPBOARD_TYPE, text);
      clipboard.set_text(PRIMARY_CLIPBOARD_TYPE, text);

      if (this._settings.get_boolean("paste-on-select")) {
        this._triggerPasteHack();
      }
    }

    this.super_btn.menu.close();
  }

  _triggerPasteHack() {
    if (this._pasteHackTimeoutId) {
      GLib.Source.remove(this._pasteHackTimeoutId);
      this._pasteHackTimeoutId = null;
    }

    this._pasteHackTimeoutId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      100,
      () => {
        const keyboard = VirtualKeyboard();
        keyboard.notify_keyval(
          Clutter.get_current_event_time(),
          Clutter.KEY_Shift_L,
          Clutter.KeyState.PRESSED,
        );
        keyboard.notify_keyval(
          Clutter.get_current_event_time(),
          Clutter.KEY_Insert,
          Clutter.KeyState.PRESSED,
        );
        keyboard.notify_keyval(
          Clutter.get_current_event_time(),
          Clutter.KEY_Insert,
          Clutter.KeyState.RELEASED,
        );
        keyboard.notify_keyval(
          Clutter.get_current_event_time(),
          Clutter.KEY_Shift_L,
          Clutter.KeyState.RELEASED,
        );
        this._pasteHackTimeoutId = null;
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  _onOpenStateChanged(_, open) {
    this.super_btn.visible = open || this._settings.get_boolean("always-show");

    if (open && this.textEntry) {
      // Clear the text accumulator when opening the menu
      this.textEntry.set_text("");

      // Focus the entry
      this.timeoutSourceId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        20,
        () => {
          if (this.textEntry) {
            global.stage.set_key_focus(this.textEntry.get_clutter_text());
          }
          this.timeoutSourceId = null;
          return GLib.SOURCE_REMOVE;
        },
      );
    }
  }

  _bindShortcut() {
    Main.wm.addKeybinding(
      "emoji-keybind",
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.ALL,
      this.toggle.bind(this),
    );
  }

  toggle() {
    this.super_btn.menu.toggle();
  }

  get_super_btn() {
    return this.super_btn;
  }
}
