# TabVault Privacy Policy

TabVault is designed with a strict local-first architecture.

## Data Collection
TabVault **does not** collect, transmit, sell, or share any browsing history, tab URLs, session notes, or personal data.

## Storage
All saved sessions, tags, notes, and tab metadata are stored exclusively on your local device using the `chrome.storage.local` API. No external servers, analytics SDKs, or telemetry endpoints are contacted.

## Permissions Justification
- **`tabs`**: Required to read tab URLs, titles, favicons, and pinned states when saving or restoring a session.
- **`storage`**: Required to persist saved sessions locally via `chrome.storage.local`.
- **`contextMenus`**: Required to provide the right-click "Save this tab to TabVault session" menu action.
- **`favicon`**: Required to show site icons in a session's tab list. Icons are read from Chrome's local favicon cache, so no request is sent to the site.
