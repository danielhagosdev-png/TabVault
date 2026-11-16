const STORAGE_KEY = 'tabvault_sessions';
const MENU_ROOT_ID = 'tabvault-save-tab-root';
const MENU_CREATE_ID = 'tabvault-create-from-tab';
const MENU_SEPARATOR_ID = 'tabvault-separator';
const MENU_URL_PATTERNS = ['http://*/*', 'https://*/*'];
const BADGE_COLOR = '#2563EB';
const BADGE_FLASH_MS = 1200;

let badgeFlashActive = false;
let menuRebuildQueue = Promise.resolve();

async function getSessions() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
}

// The storage.onChanged listener below refreshes the badge and context menus,
// so writing to storage is all that is needed here.
async function saveSessions(sessions) {
  await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
}

async function setBadge(text) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
}

async function updateBadge(count) {
  if (badgeFlashActive) return;
  await setBadge(count > 0 ? String(count) : '');
}

function isSaveableUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function sortPinnedFirst(tabs) {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

function createSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function toSavedTab(tab) {
  return {
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: isSaveableUrl(tab.favIconUrl) ? tab.favIconUrl : '',
    pinned: Boolean(tab.pinned),
  };
}

function buildDefaultTitle(tabs) {
  if (!tabs.length) return 'Empty Session';
  const active = tabs.find((t) => t.active) || tabs[0];
  try {
    const host = new URL(active.url).hostname.replace(/^www\./, '');
    return `${host} (${tabs.length} tabs)`;
  } catch {
    return `Session (${tabs.length} tabs)`;
  }
}

async function quickSaveCurrentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const saveableTabs = tabs.filter((t) => isSaveableUrl(t.url));
  if (saveableTabs.length === 0) return;

  const now = new Date().toISOString();
  const newSession = {
    id: createSessionId(),
    title: buildDefaultTitle(saveableTabs),
    tags: ['quick-save'],
    notes: 'Captured via keyboard shortcut.',
    createdAt: now,
    updatedAt: now,
    tabs: sortPinnedFirst(saveableTabs.map(toSavedTab)),
  };

  const sessions = await getSessions();
  badgeFlashActive = true;
  try {
    await saveSessions([newSession, ...sessions]);
    await setBadge('OK');
  } catch (err) {
    badgeFlashActive = false;
    throw err;
  }
  setTimeout(async () => {
    badgeFlashActive = false;
    await updateBadge((await getSessions()).length);
  }, BADGE_FLASH_MS);
}

function createMenuItem(properties) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(
      { contexts: ['page'], documentUrlPatterns: MENU_URL_PATTERNS, ...properties },
      () => {
        void chrome.runtime.lastError;
        resolve();
      }
    );
  });
}

// Rebuilds run one at a time so overlapping storage updates cannot create
// duplicate menu ids.
function rebuildContextMenus(sessionsOverride) {
  menuRebuildQueue = menuRebuildQueue
    .then(() => buildContextMenus(sessionsOverride))
    .catch(() => {});
  return menuRebuildQueue;
}

async function buildContextMenus(sessionsOverride) {
  const sessions = sessionsOverride ?? (await getSessions());
  await chrome.contextMenus.removeAll();

  await createMenuItem({
    id: MENU_ROOT_ID,
    title: 'Save this tab to TabVault session',
  });

  await createMenuItem({
    id: MENU_CREATE_ID,
    parentId: MENU_ROOT_ID,
    title: 'New session from this tab',
  });
  if (sessions.length === 0) return;

  await createMenuItem({
    id: MENU_SEPARATOR_ID,
    parentId: MENU_ROOT_ID,
    type: 'separator',
  });

  for (const session of sessions.slice(0, 10)) {
    await createMenuItem({
      id: `tabvault-add:${session.id}`,
      parentId: MENU_ROOT_ID,
      title: `${session.title || 'Untitled session'} (${(session.tabs || []).length})`,
    });
  }
}

async function syncBadgeAndMenus() {
  const sessions = await getSessions();
  await updateBadge(sessions.length);
  await rebuildContextMenus(sessions);
}

chrome.runtime.onInstalled.addListener(syncBadgeAndMenus);
chrome.runtime.onStartup.addListener(syncBadgeAndMenus);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[STORAGE_KEY]) {
    const next = Array.isArray(changes[STORAGE_KEY].newValue)
      ? changes[STORAGE_KEY].newValue
      : [];
    updateBadge(next.length);
    rebuildContextMenus(next);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'save-current-session') {
    quickSaveCurrentWindow();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !isSaveableUrl(tab.url)) return;
  const sessions = await getSessions();

  if (info.menuItemId === MENU_CREATE_ID) {
    const now = new Date().toISOString();
    const created = {
      id: createSessionId(),
      title: tab.title || 'Saved Tab',
      tags: ['tab'],
      notes: '',
      createdAt: now,
      updatedAt: now,
      tabs: [toSavedTab(tab)],
    };
    await saveSessions([created, ...sessions]);
    return;
  }

  if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('tabvault-add:')) {
    const sessionId = info.menuItemId.replace('tabvault-add:', '');
    const now = new Date().toISOString();
    const updated = sessions.map((s) => {
      if (s.id !== sessionId) return s;
      const existing = s.tabs || [];
      if (existing.some((t) => t.url === tab.url)) return s;
      return {
        ...s,
        updatedAt: now,
        tabs: sortPinnedFirst([...existing, toSavedTab(tab)]),
      };
    });
    await saveSessions(updated);
  }
});
