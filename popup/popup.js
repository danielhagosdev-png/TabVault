const STORAGE_KEY = 'tabvault_sessions';

const elements = {
  tabCount: document.getElementById('window-tab-count'),
  saveForm: document.getElementById('save-form'),
  titleInput: document.getElementById('session-title'),
  tagsInput: document.getElementById('session-tags'),
  notesInput: document.getElementById('session-notes'),
  groupBox: document.getElementById('group-suggestions'),
  searchInput: document.getElementById('search-input'),
  list: document.getElementById('sessions-list'),
  exportBtn: document.getElementById('export-btn'),
  importInput: document.getElementById('import-input'),
  status: document.getElementById('status'),
  shortcutKey: document.getElementById('shortcut-key'),
  importBtn: document.getElementById('import-btn'),
  closeAfterSave: document.getElementById('close-after-save'),
};

let currentWindowTabs = [];
let allSessions = [];
let selectedDomainFilter = 'all';
let statusTimer = null;
let windowTabCount = 0;
let editingSessionId = null;
const expandedSessionIds = new Set();

function showStatus(message, isError = false, action = null) {
  clearTimeout(statusTimer);

  const text = document.createElement('span');
  text.textContent = message;
  elements.status.replaceChildren(text);

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-link';
    button.textContent = action.label;
    button.addEventListener('click', action.onAction);
    elements.status.append(button);
  }

  elements.status.classList.toggle('status-error', isError);
  elements.status.hidden = false;
  statusTimer = setTimeout(
    () => {
      elements.status.hidden = true;
    },
    action ? 7000 : 4000
  );
}

function isSaveableUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function createSessionId(prefix = 'sess') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function extractHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'other';
  }
}

function parseTags(raw) {
  const seen = new Set();
  for (const part of String(raw || '').split(/[,\s]+/)) {
    const clean = part.trim().replace(/^#+/, '').toLowerCase();
    if (clean) seen.add(clean);
  }
  return Array.from(seen);
}

function sortPinnedFirst(tabs) {
  return [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];
}

function toSavedTab(tab) {
  return {
    url: tab.url,
    title: typeof tab.title === 'string' && tab.title ? tab.title : tab.url,
    favIconUrl: isSaveableUrl(tab.favIconUrl) ? tab.favIconUrl : '',
    pinned: Boolean(tab.pinned),
  };
}

function normalizeTab(raw) {
  if (!raw || typeof raw !== 'object' || !isSaveableUrl(raw.url)) return null;
  return toSavedTab(raw);
}

// Returns a well-formed session, or null when the input has no usable tabs.
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tabs)) return null;
  const tabs = raw.tabs.map(normalizeTab).filter(Boolean);
  if (tabs.length === 0) return null;

  const now = new Date().toISOString();
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : `${extractHost(tabs[0].url)} (${tabs.length} tabs)`;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createSessionId('imp'),
    title,
    tags: Array.isArray(raw.tags) ? parseTags(raw.tags.join(',')) : [],
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    tabs: sortPinnedFirst(tabs),
  };
}

async function loadCurrentTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  windowTabCount = tabs.length;
  currentWindowTabs = tabs
    .filter((t) => isSaveableUrl(t.url))
    .map((t) => ({ id: t.id, ...toSavedTab(t) }));
  elements.tabCount.textContent = `${currentWindowTabs.length} open`;
  renderDomainSuggestions();
}

function createScopeOption(value, text, checked) {
  const label = document.createElement('label');
  label.className = 'group-option';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'domainScope';
  radio.value = value;
  radio.checked = checked;
  radio.addEventListener('change', () => {
    selectedDomainFilter = value;
  });

  label.append(radio, ` ${text}`);
  return label;
}

function renderDomainSuggestions() {
  selectedDomainFilter = 'all';
  elements.groupBox.replaceChildren();

  const byHost = new Map();
  for (const tab of currentWindowTabs) {
    const host = extractHost(tab.url);
    const list = byHost.get(host) || [];
    list.push(tab);
    byHost.set(host, list);
  }

  const clusters = Array.from(byHost.entries()).filter(([, list]) => list.length >= 2);
  if (clusters.length === 0) {
    elements.groupBox.hidden = true;
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'group-title';
  heading.textContent = 'Tabs to save';

  elements.groupBox.append(
    heading,
    createScopeOption('all', `All tabs in window (${currentWindowTabs.length})`, true)
  );
  for (const [host, list] of clusters) {
    elements.groupBox.append(createScopeOption(host, `Only ${host} (${list.length} tabs)`, false));
  }
  elements.groupBox.hidden = false;
}

async function loadSessions() {
  const data = await chrome.storage.local.get([STORAGE_KEY]);
  allSessions = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  renderSessions();
}

async function persistSessions(next) {
  allSessions = next;
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  renderSessions();
}

async function restoreSession(session, inNewWindow) {
  const ordered = sortPinnedFirst(
    (session.tabs || []).filter((t) => t && isSaveableUrl(t.url))
  );
  if (ordered.length === 0) {
    showStatus('This session has no tabs that can be reopened.', true);
    return;
  }

  try {
    if (inNewWindow) {
      const win = await chrome.windows.create({ url: ordered.map((t) => t.url) });
      if (win && Array.isArray(win.tabs)) {
        for (let i = 0; i < ordered.length; i++) {
          if (ordered[i].pinned && win.tabs[i]) {
            await chrome.tabs.update(win.tabs[i].id, { pinned: true });
          }
        }
      }
    } else {
      for (const tab of ordered) {
        await chrome.tabs.create({ url: tab.url, pinned: Boolean(tab.pinned), active: false });
      }
    }
  } catch (err) {
    showStatus(`Could not restore session: ${err.message}`, true);
  }
}

function updateSession(id, changes) {
  const updatedAt = new Date().toISOString();
  return persistSessions(
    allSessions.map((s) => (s.id === id ? { ...s, ...changes, updatedAt } : s))
  );
}

async function deleteSession(session) {
  const index = allSessions.findIndex((s) => s.id === session.id);
  if (index === -1) return;

  await persistSessions(allSessions.filter((s) => s.id !== session.id));
  showStatus(`Deleted "${session.title || 'Untitled session'}".`, false, {
    label: 'Undo',
    onAction: async () => {
      if (allSessions.some((s) => s.id === session.id)) return;
      const restored = [...allSessions];
      restored.splice(Math.min(index, restored.length), 0, session);
      await persistSessions(restored);
      showStatus('Session restored.');
    },
  });
}

function formatDate(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Served from Chrome's local favicon cache, so no request reaches the site.
function faviconUrl(pageUrl) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '16');
  return url.toString();
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function matchesQuery(session, q) {
  if (!q) return true;
  const tags = session.tags || [];
  const matches = (value) => String(value || '').toLowerCase().includes(q);

  if (q.startsWith('#')) {
    const tag = q.slice(1);
    return tags.some((t) => String(t).toLowerCase().includes(tag));
  }
  return (
    matches(session.title) ||
    matches(session.notes) ||
    tags.some((t) => matches(t)) ||
    (session.tabs || []).some((t) => t && (matches(t.title) || matches(t.url)))
  );
}

function renderTabRow(session, tab, canRemove) {
  const row = document.createElement('li');
  row.className = 'tab-row';

  if (isSaveableUrl(tab.url)) {
    const icon = document.createElement('img');
    icon.className = 'tab-icon';
    icon.alt = '';
    icon.width = 16;
    icon.height = 16;
    icon.addEventListener('error', () => icon.remove());
    icon.src = faviconUrl(tab.url);
    row.append(icon);
  }

  const label = tab.title || tab.url || 'Untitled tab';
  const link = createButton(label, 'tab-link', () => {
    if (isSaveableUrl(tab.url)) chrome.tabs.create({ url: tab.url });
  });
  link.title = tab.url || '';
  row.append(link);

  if (tab.pinned) {
    const pin = document.createElement('span');
    pin.className = 'tab-pin';
    pin.textContent = 'pinned';
    row.append(pin);
  }

  if (canRemove) {
    const remove = createButton('×', 'tab-remove', () =>
      updateSession(session.id, { tabs: session.tabs.filter((t) => t !== tab) })
    );
    remove.title = 'Remove from session';
    remove.setAttribute('aria-label', `Remove ${label} from session`);
    row.append(remove);
  }

  return row;
}

function renderEditForm(session) {
  const form = document.createElement('form');
  form.className = 'edit-form';

  const title = document.createElement('input');
  title.type = 'text';
  title.value = session.title || '';
  title.setAttribute('aria-label', 'Session title');

  const tags = document.createElement('input');
  tags.type = 'text';
  tags.value = (session.tags || []).join(', ');
  tags.placeholder = 'Tags';
  tags.setAttribute('aria-label', 'Tags');

  const notes = document.createElement('textarea');
  notes.rows = 2;
  notes.value = session.notes || '';
  notes.placeholder = 'Notes';
  notes.setAttribute('aria-label', 'Context notes');

  const actions = document.createElement('div');
  actions.className = 'session-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn-primary';
  save.textContent = 'Save changes';
  actions.append(
    save,
    createButton('Cancel', 'btn-ghost', () => {
      editingSessionId = null;
      renderSessions();
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    editingSessionId = null;
    await updateSession(session.id, {
      title: title.value.trim() || session.title,
      tags: parseTags(tags.value),
      notes: notes.value.trim(),
    });
  });

  form.append(title, tags, notes, actions);
  return form;
}

function renderSessionCard(session) {
  const card = document.createElement('article');
  card.className = 'session-item';

  if (editingSessionId === session.id) {
    card.append(renderEditForm(session));
    return card;
  }

  const head = document.createElement('div');
  head.className = 'session-head';
  const heading = document.createElement('h2');
  heading.className = 'session-title';
  heading.textContent = session.title || 'Untitled session';
  const date = document.createElement('span');
  date.className = 'session-date';
  date.textContent = formatDate(session.createdAt);
  head.append(heading, date);
  card.append(head);

  const tags = session.tags || [];
  if (tags.length > 0) {
    const tagRow = document.createElement('div');
    tagRow.className = 'session-tags';
    for (const tag of tags) {
      const chip = createButton(`#${tag}`, 'tag-chip', () => {
        elements.searchInput.value = `#${tag}`;
        renderSessions();
      });
      chip.title = `Show sessions tagged #${tag}`;
      tagRow.append(chip);
    }
    card.append(tagRow);
  }

  if (session.notes) {
    const notes = document.createElement('p');
    notes.className = 'session-notes';
    notes.textContent = session.notes;
    card.append(notes);
  }

  const tabs = (session.tabs || []).filter(Boolean);
  const pinnedCount = tabs.filter((t) => t.pinned).length;

  const details = document.createElement('details');
  details.className = 'session-tabs';
  details.open = expandedSessionIds.has(session.id);
  details.addEventListener('toggle', () => {
    if (details.open) expandedSessionIds.add(session.id);
    else expandedSessionIds.delete(session.id);
  });

  const summary = document.createElement('summary');
  summary.textContent = [pluralize(tabs.length, 'tab'), pinnedCount ? `${pinnedCount} pinned` : null]
    .filter(Boolean)
    .join(' · ');

  const tabList = document.createElement('ul');
  tabList.className = 'tab-list';
  for (const tab of tabs) {
    tabList.append(renderTabRow(session, tab, tabs.length > 1));
  }
  details.append(summary, tabList);
  card.append(details);

  const actions = document.createElement('div');
  actions.className = 'session-actions';
  actions.append(
    createButton('New Window', 'btn-ghost', () => restoreSession(session, true)),
    createButton('Same Window', 'btn-ghost', () => restoreSession(session, false)),
    createButton('Edit', 'btn-ghost', () => {
      editingSessionId = session.id;
      renderSessions();
      elements.list.querySelector('.edit-form input')?.focus();
    }),
    createButton('Delete', 'btn-ghost btn-danger', () => deleteSession(session))
  );
  card.append(actions);

  return card;
}

function renderSessions() {
  const q = elements.searchInput.value.trim().toLowerCase();
  const filtered = allSessions.filter((s) => matchesQuery(s, q));

  elements.list.replaceChildren();
  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent =
      allSessions.length === 0
        ? 'No saved sessions yet. Save your current window above.'
        : 'No saved sessions match your search.';
    elements.list.append(empty);
    return;
  }

  for (const session of filtered) {
    elements.list.append(renderSessionCard(session));
  }
}

async function closeTabs(tabIds) {
  try {
    // Keep the window alive when every tab in it is being closed.
    if (tabIds.length >= windowTabCount) {
      await chrome.tabs.create({ active: false });
    }
    await chrome.tabs.remove(tabIds);
    await loadCurrentTabs();
  } catch (err) {
    showStatus(`Session saved, but the tabs could not be closed: ${err.message}`, true);
  }
}

elements.saveForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const tabsToSave =
    selectedDomainFilter === 'all'
      ? currentWindowTabs
      : currentWindowTabs.filter((t) => extractHost(t.url) === selectedDomainFilter);

  if (tabsToSave.length === 0) {
    showStatus('No web pages to save in this window.', true);
    return;
  }

  const fallbackHost = extractHost(tabsToSave[0].url);
  const title = elements.titleInput.value.trim() || `${fallbackHost} (${tabsToSave.length} tabs)`;
  const now = new Date().toISOString();

  const newSession = {
    id: createSessionId(),
    title,
    tags: parseTags(elements.tagsInput.value),
    notes: elements.notesInput.value.trim(),
    createdAt: now,
    updatedAt: now,
    tabs: sortPinnedFirst(tabsToSave.map(toSavedTab)),
  };

  elements.titleInput.value = '';
  elements.tagsInput.value = '';
  elements.notesInput.value = '';
  await persistSessions([newSession, ...allSessions]);
  showStatus(`Saved "${title}" (${pluralize(tabsToSave.length, 'tab')}).`);

  if (elements.closeAfterSave.checked) {
    await closeTabs(tabsToSave.map((t) => t.id));
  }
});

elements.searchInput.addEventListener('input', renderSessions);

elements.exportBtn.addEventListener('click', () => {
  const payload = JSON.stringify(
    { schema: 'tabvault.sessions.v1', exportedAt: new Date().toISOString(), sessions: allSessions },
    null,
    2
  );
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabvault-sessions-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

elements.importBtn.addEventListener('click', () => elements.importInput.click());

elements.importInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = Array.isArray(parsed) ? parsed : parsed?.sessions;
    if (!Array.isArray(incoming)) {
      showStatus('Import failed: no sessions found in this file.', true);
      return;
    }

    const byId = new Map(allSessions.map((s) => [s.id, s]));
    let imported = 0;
    for (const item of incoming) {
      const session = normalizeSession(item);
      if (!session) continue;
      byId.set(session.id, session);
      imported += 1;
    }

    if (imported === 0) {
      showStatus('Import failed: no valid sessions found in this file.', true);
      return;
    }

    await persistSessions(Array.from(byId.values()));
    const skipped = incoming.length - imported;
    showStatus(
      `Imported ${imported} session${imported === 1 ? '' : 's'}` +
        (skipped ? `, skipped ${skipped} invalid.` : '.')
    );
  } catch (err) {
    showStatus(
      err instanceof SyntaxError
        ? 'Import failed: the file is not valid JSON.'
        : `Import failed: ${err.message}`,
      true
    );
  } finally {
    elements.importInput.value = '';
  }
});

async function loadShortcutHint() {
  const commands = await chrome.commands.getAll();
  const command = commands.find((c) => c.name === 'save-current-session');
  elements.shortcutKey.textContent = command?.shortcut || 'not set';
}

loadCurrentTabs();
loadSessions();
loadShortcutHint().catch(() => {});
