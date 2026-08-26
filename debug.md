# FAV-EMOJI DEBUG

I will be working on a better MD file later, for now, I will be droping here
some useful commands I used to debug this extension.

### Reset extension

`gnome-extensions reset fav-emoji@ijin82`

### enable extension

`gnome-extensions enable fav-emoji@ijin82`

### Start a new debug session

Build and Debug:
`make debug`

#### OR

First, build the extension:
`make`

Then, run an virtual wayland session (Gnome 48 and earlier):
`dbus-run-session -- gnome-shell --nested --wayland`

Or, run an virtual wayland session (Gnome 49 and later):
`dbus-run-session gnome-shell --devkit --wayland`

### Symbolic link

`ln -s ~/Projects/Fav-Emoji/fav-emoji@ijin82/ ~/.local/share/gnome-shell/extensions/fav-emoji@ijin82`

### Running Fav-Emoji on Debug mode

Update the extension version at the `metadata.json`, then run: `make debug`.

As simple as that! 🎉

### Useful docs

- [GJS](https://gjs-docs.gnome.org/) GJS Documentation
- [GJS Settings](https://gjs-docs.gnome.org/gio20~2.0/gio.settings) GJS Settings
  Documentation
- [GJS Guide](https://gjs.guide/guides/) GJS Extensions Guide
- [Adwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/index.html)
  Gnome Adw documentation
