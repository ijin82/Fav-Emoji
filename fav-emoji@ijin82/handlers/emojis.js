import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class EmojiCatalog {
    constructor() {
        this._emojis = [];
        this._byGroup = new Map();
    }

    initialize(extensionPath) {
        try {
            const filePath = GLib.build_filenamev([extensionPath, 'data', 'emojis.json']);
            const file = Gio.File.new_for_path(filePath);
            const [, contents] = file.load_contents(null);
            const decoder = new TextDecoder('utf-8');
            const jsonText = decoder.decode(contents);
            this._emojis = JSON.parse(jsonText);

            // Index by group for instant lookups
            this._byGroup.clear();
            for (const item of this._emojis) {
                if (!this._byGroup.has(item.group)) {
                    this._byGroup.set(item.group, []);
                }
                this._byGroup.get(item.group).push(item);
            }
        } catch (error) {
            console.error('Fav-Emoji: Failed to load emojis.json:', error);
        }
    }

    getByGroup(groupName) {
        const list = this._byGroup.get(groupName) || [];
        // Only return base emojis without skin tone variations in default catalog view
        return list.filter(item => !item.skin_tone);
    }

    search(query) {
        if (!query || !query.trim()) {
            return [];
        }

        const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (words.length === 0) return [];

        const matches = [];
        for (const item of this._emojis) {
            if (item.skin_tone) continue; // skip skin tone variants in search to avoid clutter

            const desc = item.description.toLowerCase();
            let allMatch = true;
            let score = 0;

            for (const word of words) {
                const idx = desc.indexOf(word);
                if (idx === -1) {
                    allMatch = false;
                    break;
                }
                // Prefix match bonus
                if (idx === 0 || desc[idx - 1] === ' ') {
                    score += 10;
                } else {
                    score += 1;
                }
            }

            if (allMatch) {
                matches.push({ item, score });
            }
        }

        // Sort by relevance score descending
        matches.sort((a, b) => b.score - a.score);
        return matches.map(m => m.item);
    }
}
