# TabVault — Tab & Context Saver

**Save a window full of tabs in one click. Get it back in one click.**

TabVault is a Chrome extension for anyone who ends up with 30 tabs open and is afraid to close them. Save the whole window as a named session with tags and a note about what you were doing, close the tabs, and reopen everything later exactly as it was.

- **Easy to use:** one button or one keyboard shortcut. No account, no sign-up, no settings to configure.
- **Quick to set up:** about a minute, with nothing to build or install besides the extension itself.
- **Private:** everything is stored on your own device. TabVault makes no network requests.

## Quick start

1. Click the TabVault icon in the Chrome toolbar.
2. Click **Save Current Window** (or press `Alt+Shift+S` without opening the popup).
3. Close your tabs.
4. When you need them again, open TabVault and click **New Window** on the session.

Title, tags and notes are optional. If you skip them, the session names itself after the site you were on.

## Features

### Save
- **One-click save** of every tab in the current window, with pinned tabs kept in order.
- **Keyboard shortcut:** `Alt+Shift+S` on Windows and Linux, `Cmd+Shift+S` on macOS.
- **Save just one site:** when several tabs share a domain, you can save only those.
- **Close tabs after saving** to free up memory straight away.
- **Right-click any page** to add it to an existing session or start a new one.

### Organise
- **Title, tags and notes** on every session, editable at any time.
- **Search** across session titles, notes, tab titles and URLs.
- **Filter by tag:** click a tag, or type `#tag` in the search box.
- **See what's inside:** expand a session to view its tabs, open a single tab, or remove ones you no longer need.

### Restore and back up
- **Restore** a session into a new window or into the current one.
- **Undo delete**, in case you remove the wrong session.
- **Export and import** your sessions as a JSON file, to back them up or move them to another computer.

### Also included
- A toolbar badge showing how many sessions you have saved.
- Light and dark themes that follow your system setting.

## Setup

TabVault runs straight from the source folder. There is no build step.

1. **Download the code.** Clone this repository, or click **Code → Download ZIP** on GitHub and unzip it.
2. **Open the extensions page.** Type `chrome://extensions` into Chrome's address bar.
3. **Turn on Developer mode** using the toggle in the top-right corner.
4. **Click "Load unpacked"** and choose the project folder (the one that contains `manifest.json`).
5. **Pin it.** Click the puzzle-piece icon in the toolbar and pin **TabVault**.

That's it. Click the icon and save your first session.

**After updating the code,** go back to `chrome://extensions` and click the reload button on the TabVault card.

**Shortcut not working?** Another extension may already use it. You can change it at `chrome://extensions/shortcuts`.

## How to

| I want to… | Do this |
| --- | --- |
| Save every tab in this window | Click **Save Current Window**, or press `Alt+Shift+S` / `Cmd+Shift+S` |
| Save only one site's tabs | Pick the site under **Tabs to save**, then save |
| Save and close the tabs | Tick **Close tabs after saving**, then save |
| Add one page to a session | Right-click the page → **Save this tab to TabVault session** |
| Reopen a session | Click **New Window** or **Same Window** on the session |
| Open just one tab from a session | Expand the session and click the tab |
| Change a title, tags or notes | Click **Edit** on the session |
| Find a session | Type in the search box, or click a tag |
| Back up my sessions | Click **Export** in the popup header |
| Move sessions to another computer | **Export** on one, **Import** on the other |

## Privacy

TabVault collects nothing and sends nothing anywhere. Your sessions stay in Chrome's local storage on your device. See [PRIVACY.md](PRIVACY.md) for what each permission is used for.

## For developers

```
manifest.json        Manifest V3 configuration
background.js        Service worker: keyboard shortcut, context menu, toolbar badge
popup/
  popup.html         Popup markup
  popup.css          Styles (light and dark)
  popup.js           Save, search, edit, restore, import and export
icons/               Toolbar and store icons
```

- Chrome Extensions **Manifest V3**, written in plain JavaScript, HTML and CSS with no dependencies.
- Uses `chrome.tabs`, `chrome.windows`, `chrome.storage`, `chrome.commands` and `chrome.contextMenus`.
- Sessions live in `chrome.storage.local` under a single key. The popup and the service worker both write to it, and the service worker listens for storage changes to keep the badge and the context menu in sync.
- Only `http` and `https` pages are saved. Browser pages such as `chrome://` cannot be reopened by an extension, so they are skipped.

A stored session looks like this:

```json
{
  "id": "sess_1763290000000_k3x9",
  "title": "github.com (12 tabs)",
  "tags": ["auth", "bug-412"],
  "notes": "Token refresh fails after 15 minutes",
  "createdAt": "2026-11-16T12:00:00.000Z",
  "updatedAt": "2026-11-16T12:00:00.000Z",
  "tabs": [
    { "url": "https://github.com/", "title": "GitHub", "favIconUrl": "", "pinned": false }
  ]
}
```

## Roadmap

- Preserve Chrome tab groups (names and colours) on save and restore
- Lazy restore, so large sessions do not load every page at once
- Sort sessions by date or name
- Duplicate-tab detection when saving
- Options page (default restore mode, excluded domains)

## License

[MIT](LICENSE)
