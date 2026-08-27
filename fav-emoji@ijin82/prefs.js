import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { EmojiCatalog } from './handlers/emojis.js';

const DEFAULT_FAVORITES = [
    '👋','❤️','👍','😀','😂','🤣','🚀','🎉','🤝','🤔',
    '😮','😍','🥰','😘','🤮','🔥','🙏','👏','💯','👀',
    '😎','✊','💩','🤗','🖕','😫','🤦‍♂️','🌟'
];

export default class FavEmojiPrefs extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        this.initTranslations();
        window._settings = this.getSettings();
        this._window = window;

        // Custom CSS for 30px large emoji buttons and draggable chips
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_string(`
            .emoji-picker-btn {
                font-size: 30px;
                min-width: 48px;
                min-height: 48px;
                padding: 4px;
                border-radius: 8px;
                border: 2px solid transparent;
            }
            .emoji-picker-btn:hover {
                background-color: rgba(255, 255, 255, 0.12);
            }
            .emoji-picker-btn.selected {
                background-color: rgba(53, 132, 228, 0.32);
                border: 2px solid #3584e4;
            }
            .emoji-picker-btn.selected:hover {
                background-color: rgba(230, 50, 50, 0.25);
                border-color: #ff6b6b;
            }
            .emoji-chip-box {
                background-color: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 10px;
                padding: 2px 4px;
                transition: all 120ms ease-in-out;
            }
            .emoji-chip-box:hover {
                background-color: rgba(255, 255, 255, 0.14);
                border-color: rgba(255, 255, 255, 0.28);
            }
            .emoji-chip-box:focus-within {
                border-color: #3584e4;
                background-color: rgba(53, 132, 228, 0.25);
                box-shadow: 0 0 0 1px #3584e4;
            }
            .emoji-chip-box.drop-target {
                border: 2px dashed #3584e4;
                background-color: rgba(53, 132, 228, 0.35);
            }
            .emoji-chip-box.dragging {
                opacity: 0.35;
            }
            .emoji-chip-main-btn {
                font-size: 26px;
                padding: 4px 6px;
                background: none;
                border: none;
            }
            .emoji-chip-delete-btn {
                padding: 4px 6px;
                min-width: 24px;
                min-height: 24px;
                border-radius: 6px;
                color: #ff6b6b;
                font-weight: bold;
                font-size: 13px;
                opacity: 0.8;
            }
            .emoji-chip-delete-btn:hover {
                opacity: 1.0;
                background-color: rgba(230, 50, 50, 0.25);
            }
        `);
        Gtk.StyleContext.add_provider_for_display(
            window.get_display(),
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );

        const iconTheme = Gtk.IconTheme.get_for_display(window.get_display());
        const iconsDirectory = this.dir.get_child('icons').get_path();
        iconTheme.add_search_path(iconsDirectory);

        // Initialize Emoji catalog for full view and search
        this.catalog = new EmojiCatalog();
        this.catalog.initialize(this.dir.get_path());

        // Registry for catalog and search buttons to update their selected state
        this._registeredButtons = new Map();

        window.connect('close-request', () => {
            this.catalog = null;
            if (this._registeredButtons) {
                this._registeredButtons.clear();
                this._registeredButtons = null;
            }
            this._window = null;
        });

        // 1. Favorites Page
        this._buildFavoritesPage();

        // 2. Settings Page
        this._buildSettingsPage();
    }

    _registerPickerButton(emoji, btn, description) {
        btn._desc = description || emoji;
        if (!this._registeredButtons.has(emoji)) {
            this._registeredButtons.set(emoji, new Set());
        }
        this._registeredButtons.get(emoji).add(btn);
    }

    _buildFavoritesPage() {
        const favPage = new Adw.PreferencesPage({
            title: _('Favorites'),
            icon_name: 'starred-symbolic',
        });
        this._window.add(favPage);

        // Group: Current favorites management
        const currentGroup = new Adw.PreferencesGroup({
            title: _('Favorite Emojis'),
            description: _('Choose up to 50 emojis to display in the popup menu'),
        });
        favPage.add(currentGroup);

        // Counter and bulk edit row
        const bulkEntryRow = new Adw.EntryRow({
            title: _('Emoji List'),
            show_apply_button: true,
        });
        bulkEntryRow.set_tooltip_text(_('Edit or reorder characters in this line for quick changes'));

        // FlowBox container for visual chips
        const flowBox = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            valign: Gtk.Align.START,
            max_children_per_line: 10,
            min_children_per_line: 4,
            row_spacing: 8,
            column_spacing: 8,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 4,
            margin_end: 4,
        });

        currentGroup.add(bulkEntryRow);

        const chipsGroup = new Adw.PreferencesGroup({
            title: _('Current Favorites'),
            description: _('Drag & Drop to reorder, or edit in the text box above.'),
        });
        favPage.add(chipsGroup);
        chipsGroup.add(flowBox);

        // Robust Unicode regex that correctly handles 2-letter flags, ZWJ sequences, skin tones, keycaps
        const EMOJI_REGEX = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF})?)*|[0-9#*]\uFE0F?\u20E3|\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu;

        // Helper to get array of emojis from text
        const extractEmojis = (text) => {
            if (!text) return [];
            const matches = Array.from(text.matchAll(EMOJI_REGEX)).map(m => m[0]);
            return matches.filter(s => s.length > 0 && s.trim().length > 0);
        };

        let isSyncingBulk = false;

        // Refresh UI function
        const refreshUI = (skipBulkTextUpdate = false) => {
            const currentList = this._window._settings.get_strv('favorite-emojis') || [];
            const count = Math.min(50, currentList.length);
            const favSet = new Set(currentList);

            currentGroup.set_description(_(`Selected: ${count} of 50 max`));

            if (!skipBulkTextUpdate && !isSyncingBulk) {
                isSyncingBulk = true;
                bulkEntryRow.set_text(currentList.join(''));
                bulkEntryRow.select_region(0, 0);
                isSyncingBulk = false;
            }

            // Clear flowBox
            let child = flowBox.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                flowBox.remove(child);
                child = next;
            }

            // Populate flowBox with reorderable chips (emoji + ✕ delete)
            currentList.slice(0, 50).forEach((emoji, idx) => {
                const chipBox = new Gtk.Box({
                    orientation: Gtk.Orientation.HORIZONTAL,
                    spacing: 4,
                    valign: Gtk.Align.CENTER,
                });
                chipBox.set_css_classes(['emoji-chip-box']);

                // Drag Source
                const dragSource = new Gtk.DragSource({
                    actions: Gdk.DragAction.MOVE,
                });
                dragSource.connect('prepare', () => {
                    return Gdk.ContentProvider.new_for_value(String(idx));
                });
                dragSource.connect('drag-begin', () => {
                    chipBox.add_css_class('dragging');
                });
                dragSource.connect('drag-end', () => {
                    chipBox.remove_css_class('dragging');
                });
                chipBox.add_controller(dragSource);

                // Drop Target
                const dropTarget = Gtk.DropTarget.new(GObject.TYPE_STRING, Gdk.DragAction.MOVE);
                dropTarget.connect('enter', () => {
                    chipBox.add_css_class('drop-target');
                    return Gdk.DragAction.MOVE;
                });
                dropTarget.connect('leave', () => {
                    chipBox.remove_css_class('drop-target');
                });
                dropTarget.connect('drop', (target, value) => {
                    chipBox.remove_css_class('drop-target');
                    const sourceIdx = parseInt(value, 10);
                    const targetIdx = idx;
                    if (isNaN(sourceIdx) || sourceIdx === targetIdx) return false;

                    let list = this._window._settings.get_strv('favorite-emojis') || [];
                    if (sourceIdx < 0 || sourceIdx >= list.length) return false;

                    const item = list.splice(sourceIdx, 1)[0];
                    list.splice(targetIdx, 0, item);
                    this._window._settings.set_strv('favorite-emojis', list);
                    refreshUI();
                    return true;
                });
                chipBox.add_controller(dropTarget);

                // Emoji Label
                const emojiLabel = new Gtk.Label({
                    label: emoji,
                });
                emojiLabel.set_css_classes(['emoji-chip-main-btn']);
                emojiLabel.set_tooltip_text(_('Drag to reorder'));
                chipBox.append(emojiLabel);

                // Delete button (✕)
                const delBtn = new Gtk.Button({
                    label: '✕',
                    has_frame: false,
                });
                delBtn.set_css_classes(['emoji-chip-delete-btn']);
                delBtn.set_tooltip_text(_(`Delete «${emoji}» from favorites`));
                delBtn.connect('clicked', () => {
                    const list = [...currentList];
                    list.splice(idx, 1);
                    this._window._settings.set_strv('favorite-emojis', list);
                    refreshUI();
                });
                chipBox.append(delBtn);

                flowBox.append(chipBox);
            });

            // Update all catalog and search buttons selection state
            for (const [emoji, buttons] of this._registeredButtons.entries()) {
                const isSelected = favSet.has(emoji);
                for (const btn of buttons) {
                    if (isSelected) {
                        btn.add_css_class('selected');
                        btn.set_tooltip_text(_(`«${btn._desc || emoji}» (in favorites — click to remove)`));
                    } else {
                        btn.remove_css_class('selected');
                        btn.set_tooltip_text(_(`«${btn._desc || emoji}» (click to add)`));
                    }
                }
            }
        };

        const toggleEmojiInFavorites = (emoji) => {
            let currentList = this._window._settings.get_strv('favorite-emojis') || [];
            if (currentList.includes(emoji)) {
                // Remove if already in favorites
                currentList = currentList.filter(e => e !== emoji);
                this._window._settings.set_strv('favorite-emojis', currentList);
                refreshUI();
            } else {
                // Add if under 50 limit
                if (currentList.length < 50) {
                    currentList.push(emoji);
                    this._window._settings.set_strv('favorite-emojis', currentList);
                    refreshUI();
                }
            }
        };

        // Two-way real-time sync with bulk entry
        const syncFromBulk = () => {
            if (isSyncingBulk) return;
            const input = bulkEntryRow.get_text();
            const newEmojis = extractEmojis(input).slice(0, 50);
            const currentList = this._window._settings.get_strv('favorite-emojis') || [];

            if (currentList.join('') !== newEmojis.join('')) {
                isSyncingBulk = true;
                this._window._settings.set_strv('favorite-emojis', newEmojis);
                refreshUI(true); // skip updating bulkEntryRow text while typing
                isSyncingBulk = false;
            }
        };

        bulkEntryRow.connect('changed', syncFromBulk);
        bulkEntryRow.connect('apply', syncFromBulk);

        // Action buttons row (Reset / Clear)
        const actionsGroup = new Adw.PreferencesGroup();
        favPage.add(actionsGroup);

        const resetRow = new Adw.ActionRow({
            title: _('List Actions'),
        });

        const resetBtn = new Gtk.Button({
            label: _('Default'),
            valign: Gtk.Align.CENTER,
            margin_end: 6,
        });
        resetBtn.connect('clicked', () => {
            this._window._settings.set_strv('favorite-emojis', DEFAULT_FAVORITES);
            refreshUI();
        });

        const clearBtn = new Gtk.Button({
            label: _('Clear All'),
            valign: Gtk.Align.CENTER,
        });
        clearBtn.set_css_classes(['destructive-action']);
        clearBtn.connect('clicked', () => {
            this._window._settings.set_strv('favorite-emojis', []);
            refreshUI();
        });

        resetRow.add_suffix(resetBtn);
        resetRow.add_suffix(clearBtn);
        actionsGroup.add(resetRow);

        // Search in catalog section
        const searchGroup = new Adw.PreferencesGroup({
            title: _('Search Emoji Catalog'),
            description: _('Enter name in English (e.g. smile, cat, pizza, fire) and pick emojis'),
        });
        favPage.add(searchGroup);

        const searchEntryRow = new Adw.EntryRow({
            title: _('Search emojis'),
            show_apply_button: true,
        });
        searchGroup.add(searchEntryRow);

        const searchFlowBox = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            valign: Gtk.Align.START,
            max_children_per_line: 12,
            min_children_per_line: 6,
            row_spacing: 6,
            column_spacing: 6,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 4,
            margin_end: 4,
        });

        const searchRow = new Adw.PreferencesRow({
            child: searchFlowBox,
            visible: false,
        });
        searchGroup.add(searchRow);

        let searchButtons = [];
        const performSearch = () => {
            const query = searchEntryRow.get_text().trim();

            // Unregister old search buttons
            for (const { emoji, btn } of searchButtons) {
                if (this._registeredButtons.has(emoji)) {
                    this._registeredButtons.get(emoji).delete(btn);
                }
            }
            searchButtons = [];

            // Clear previous results
            let child = searchFlowBox.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                searchFlowBox.remove(child);
                child = next;
            }

            if (!query || !this.catalog) {
                searchRow.visible = false;
                return;
            }

            const results = this.catalog.search(query) || [];
            if (results.length === 0) {
                searchRow.visible = false;
                return;
            }

            searchRow.visible = true;
            const currentList = this._window._settings.get_strv('favorite-emojis') || [];
            const favSet = new Set(currentList);
            const seen = new Set();

            results.slice(0, 48).forEach(item => {
                if (seen.has(item.unicode)) return;
                seen.add(item.unicode);

                const btn = new Gtk.Button({
                    label: item.unicode,
                    has_frame: false,
                });
                btn.set_css_classes(['emoji-picker-btn']);
                if (favSet.has(item.unicode)) {
                    btn.add_css_class('selected');
                    btn.set_tooltip_text(_(`«${item.description || item.unicode}» (in favorites — click to remove)`));
                } else {
                    btn.set_tooltip_text(_(`«${item.description || item.unicode}» (click to add)`));
                }

                btn.connect('clicked', () => toggleEmojiInFavorites(item.unicode));
                this._registerPickerButton(item.unicode, btn, item.description);
                searchButtons.push({ emoji: item.unicode, btn });
                searchFlowBox.append(btn);
            });
        };

        searchEntryRow.connect('changed', performSearch);
        searchEntryRow.connect('apply', performSearch);

        // Full Categories Catalog
        const catalogGroup = new Adw.PreferencesGroup({
            title: _('Emoji Catalog by Category'),
            description: _('Click any 30px emoji to add or remove from favorites'),
        });
        favPage.add(catalogGroup);

        const categories = [
            { id: 'Smileys & Emotion', title: _('Smileys and Emotion'), icon: 'face-smile-symbolic' },
            { id: 'People & Body', title: _('People and Body'), icon: 'emoji-people-symbolic' },
            { id: 'Animals & Nature', title: _('Animals and Nature'), icon: 'emoji-nature-symbolic' },
            { id: 'Food & Drink', title: _('Food and Drink'), icon: 'emoji-food-symbolic' },
            { id: 'Travel & Places', title: _('Travel and Places'), icon: 'emoji-travel-symbolic' },
            { id: 'Activities', title: _('Activities'), icon: 'emoji-activities-symbolic' },
            { id: 'Objects', title: _('Objects'), icon: 'emoji-objects-symbolic' },
            { id: 'Symbols', title: _('Symbols'), icon: 'emoji-symbols-symbolic' },
            { id: 'Flags', title: _('Flags'), icon: 'emoji-flags-symbolic' },
        ];

        categories.forEach(cat => {
            const expRow = new Adw.ExpanderRow({
                title: GLib.markup_escape_text(cat.title, -1),
                icon_name: cat.icon,
            });

            const catFlowBox = new Gtk.FlowBox({
                selection_mode: Gtk.SelectionMode.NONE,
                valign: Gtk.Align.START,
                max_children_per_line: 12,
                min_children_per_line: 6,
                row_spacing: 6,
                column_spacing: 6,
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 8,
                margin_end: 8,
            });

            let loaded = false;
            const loadCategoryEmojis = () => {
                if (loaded || !this.catalog) return;
                loaded = true;

                const emojis = this.catalog.getByGroup(cat.id) || [];
                expRow.set_subtitle(`${emojis.length} ${_('emojis')}`);

                const currentList = this._window._settings.get_strv('favorite-emojis') || [];
                const favSet = new Set(currentList);

                emojis.forEach(item => {
                    const btn = new Gtk.Button({
                        label: item.unicode,
                        has_frame: false,
                    });
                    btn.set_css_classes(['emoji-picker-btn']);
                    if (favSet.has(item.unicode)) {
                        btn.add_css_class('selected');
                        btn.set_tooltip_text(_(`«${item.description || item.unicode}» (in favorites — click to remove)`));
                    } else {
                        btn.set_tooltip_text(_(`«${item.description || item.unicode}» (click to add)`));
                    }

                    btn.connect('clicked', () => toggleEmojiInFavorites(item.unicode));
                    this._registerPickerButton(item.unicode, btn, item.description);
                    catFlowBox.append(btn);
                });
            };

            // Lazy load when expanded or pre-load
            expRow.connect('notify::expanded', () => {
                if (expRow.expanded) {
                    loadCategoryEmojis();
                }
            });

            // Initial subtitle
            expRow.set_subtitle(_('Click to expand category'));

            const boxRow = new Adw.PreferencesRow({
                child: catFlowBox,
            });
            expRow.add_row(boxRow);
            catalogGroup.add(expRow);
        });

        // Initialize UI values
        refreshUI();

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            bulkEntryRow.select_region(0, 0);
            return GLib.SOURCE_REMOVE;
        });
    }

    _buildSettingsPage() {
        const settingsPage = new Adw.PreferencesPage({
            title: _('Settings'),
            icon_name: 'preferences-other-symbolic',
        });
        this._window.add(settingsPage);

        // UI & Layout Group
        const layoutGroup = new Adw.PreferencesGroup({
            title: _('Appearance and Behavior'),
        });
        settingsPage.add(layoutGroup);

        // Show Indicator Switch
        const showIndicator = new Adw.SwitchRow({
            title: _('Top Panel Icon'),
            subtitle: _('Display the Fav-Emoji icon in the top panel'),
        });
        layoutGroup.add(showIndicator);

        // Paste on Select / Paste after Copy Switch
        const pasteOnSelect = new Adw.SwitchRow({
            title: _('Paste immediately after copy'),
            subtitle: _('Automatically paste into the active window when clicking Copy or pressing Ctrl+Enter'),
        });
        layoutGroup.add(pasteOnSelect);

        // Number of Columns (nbcols)
        const colsAdjustment = new Gtk.Adjustment({
            lower: 5,
            upper: 20,
            step_increment: 1,
            page_increment: 2,
            value: this._window._settings.get_int('nbcols') || 7,
        });
        const nbColsRow = new Adw.SpinRow({
            title: _('Number of columns in menu'),
            subtitle: _('Number of emoji buttons per row in popup menu'),
            adjustment: colsAdjustment,
        });
        layoutGroup.add(nbColsRow);

        // Emoji Size (emojisize)
        const sizeAdjustment = new Gtk.Adjustment({
            lower: 18,
            upper: 54,
            step_increment: 2,
            page_increment: 4,
            value: this._window._settings.get_int('emojisize') || 28,
        });
        const emojiSizeRow = new Adw.SpinRow({
            title: _('Emoji size in menu (pixels)'),
            subtitle: _('Font size of emoji buttons in the popup menu'),
            adjustment: sizeAdjustment,
        });
        layoutGroup.add(emojiSizeRow);

        // Shortcuts Group
        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Shortcuts'),
        });
        settingsPage.add(shortcutGroup);

        const activeKeybind = new Adw.SwitchRow({
            title: _('Enable shortcut'),
            subtitle: _('Use keyboard shortcut to open the emoji picker'),
        });
        shortcutGroup.add(activeKeybind);

        let currentKeybind = this._window._settings.get_strv('emoji-keybind')[0] || '<Super>period';

        const shortcutRow = new Adw.ActionRow({
            title: _('Menu shortcut'),
            subtitle: _('Click the button to record a new shortcut, or press BackSpace to disable'),
        });

        const shortcutBtn = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            margin_end: 4,
        });

        const updateShortcutLabel = (accel) => {
            if (!accel || accel.length === 0) {
                shortcutBtn.set_label(_('Disabled'));
            } else {
                const [ok, keyval, mods] = Gtk.accelerator_parse(accel);
                if (ok) {
                    shortcutBtn.set_label(Gtk.accelerator_get_label(keyval, mods) || accel);
                } else {
                    shortcutBtn.set_label(accel);
                }
            }
        };
        updateShortcutLabel(currentKeybind);

        let isCapturing = false;
        const keyController = new Gtk.EventControllerKey();
        keyController.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);

        keyController.connect('key-pressed', (ctrl, keyval, keycode, state) => {
            if (!isCapturing) return Gdk.EVENT_PROPAGATE;

            // Clean up state mask: keep primary modifiers only
            const mask = state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.SHIFT_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK);

            // Cancel capture on Escape
            if (keyval === Gdk.KEY_Escape) {
                isCapturing = false;
                shortcutBtn.remove_css_class('suggested-action');
                updateShortcutLabel(currentKeybind);
                return Gdk.EVENT_STOP;
            }

            // Clear shortcut on BackSpace or Delete
            if (keyval === Gdk.KEY_BackSpace || keyval === Gdk.KEY_Delete) {
                isCapturing = false;
                shortcutBtn.remove_css_class('suggested-action');
                currentKeybind = '';
                this._window._settings.set_strv('emoji-keybind', []);
                updateShortcutLabel('');
                return Gdk.EVENT_STOP;
            }

            // Ignore modifier keys pressed alone
            const isModifier = [
                Gdk.KEY_Control_L, Gdk.KEY_Control_R,
                Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
                Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
                Gdk.KEY_Super_L, Gdk.KEY_Super_R,
                Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
                Gdk.KEY_ISO_Level3_Shift
            ].includes(keyval);

            if (isModifier) {
                return Gdk.EVENT_STOP;
            }

            // Format accelerator string
            const accelName = Gtk.accelerator_name(keyval, mask);
            if (accelName && Gtk.accelerator_valid(keyval, mask)) {
                isCapturing = false;
                shortcutBtn.remove_css_class('suggested-action');
                currentKeybind = accelName;
                this._window._settings.set_strv('emoji-keybind', [accelName]);
                updateShortcutLabel(accelName);
                return Gdk.EVENT_STOP;
            }

            return Gdk.EVENT_STOP;
        });

        shortcutBtn.connect('clicked', () => {
            isCapturing = true;
            shortcutBtn.add_css_class('suggested-action');
            shortcutBtn.set_label(_('Press keys...'));
        });

        const resetShortcutBtn = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            has_frame: false,
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Reset to default (Super+Period)'),
        });
        resetShortcutBtn.connect('clicked', () => {
            isCapturing = false;
            shortcutBtn.remove_css_class('suggested-action');
            currentKeybind = '<Super>period';
            this._window._settings.set_strv('emoji-keybind', ['<Super>period']);
            updateShortcutLabel('<Super>period');
        });

        this._window.add_controller(keyController);
        shortcutRow.add_suffix(shortcutBtn);
        shortcutRow.add_suffix(resetShortcutBtn);
        shortcutGroup.add(shortcutRow);

        // Note about Ctrl+Enter
        const ctrlEnterInfoRow = new Adw.ActionRow({
            title: _('Ctrl+Enter or Enter in popup'),
            subtitle: _('Copies composed emojis to clipboard and closes menu (same as Copy button)'),
            icon_name: 'edit-copy-symbolic',
        });
        shortcutGroup.add(ctrlEnterInfoRow);

        // About Group
        const aboutGroup = new Adw.PreferencesGroup();
        settingsPage.add(aboutGroup);

        const aboutButton = new Gtk.Button({
            margin_top: 8,
            margin_bottom: 8,
            child: new Adw.ButtonContent({
                icon_name: 'dialog-information-symbolic',
                label: _('About'),
            }),
        });
        aboutButton.set_css_classes(['accent']);
        aboutButton.connect('clicked', () => { this._openAboutPage(); });

        const aboutRow = new Adw.ActionRow({
            title: _('Information'),
            subtitle: _('Fav-Emoji v1.0'),
        });
        aboutRow.add_suffix(aboutButton);
        aboutGroup.add(aboutRow);

        // Bindings
        this._window._settings.bind('always-show', showIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._window._settings.bind('paste-on-select', pasteOnSelect, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._window._settings.bind('active-keybind', activeKeybind, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._window._settings.bind('nbcols', nbColsRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        this._window._settings.bind('emojisize', emojiSizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    }

    _openAboutPage() {
        const about_window = new Adw.AboutWindow({ transient_for: this._window, modal: true });
        about_window.set_application_icon('emoji-symbols-symbolic');
        about_window.set_application_name(_('Fav-Emoji'));
        about_window.set_version('1.0');
        about_window.set_developer_name('Ilya Rogozhin');
        about_window.set_issue_url('https://github.com/ijin82/Fav-Emoji/issues');
        about_window.set_website('https://github.com/ijin82/Fav-Emoji');
        about_window.set_license_type(Gtk.License.GPL_3_0);
        about_window.set_copyright('© 2026 Fav-Emoji');
        about_window.show();
    }
}
