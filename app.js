/**
 * PIYE — app.js
 * Logika frontend: routing view, rendering tiga lapisan pesan, interaksi UI.
 * Bergantung pada supabase.js (global: window.PIYE_API).
 */

'use strict';

/* =========================================================
 * STATE
 * ========================================================= */
const AppState = {
  user: null,
  profile: null,
  conversations: [],
  activeConversation: null,
  activePeer: null,
  messages: [],
  friends: [],
  friendRequests: [],
  subscriptions: [],
  layers: { original: true, reading: false, translation: true },
  configMissing: false,
};

/* =========================================================
 * DOM SHORTCUTS
 * ========================================================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* =========================================================
 * TOAST
 * ========================================================= */
let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

/* =========================================================
 * HELPERS
 * ========================================================= */
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const diff = (now - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}
function avatarStyle(profile, el) {
  if (profile?.avatar_url) {
    el.style.backgroundImage = `url("${profile.avatar_url}")`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = initials(profile?.display_name || profile?.username);
  }
}

/* =========================================================
 * SPLASH & INIT
 * ========================================================= */
async function init() {
  // Populate language selects
  const langs = window.PIYE_API?.LANGUAGES || [];
  ['#register-language', '#settings-language'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = '';
    langs.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.label;
      el.appendChild(opt);
    });
  });

  // Suggest language from browser
  const suggested = window.PIYE_API?.suggestLanguage?.() || 'id';
  if ($('#register-language')) $('#register-language').value = suggested;

  // Config check
  if (!window.PIYE_API || !window.PIYE_API.isConfigured()) {
    AppState.configMissing = true;
    $('#config-warning').classList.remove('hidden');
    hideSplash();
    showAuthScreen();
    // disable auth buttons? Keep enabled but with clear error
    return;
  }

  // Check existing session
  try {
    const { data } = await window.PIYE_API.getSession();
    if (data?.session?.user) {
      await loadProfileAndEnter();
    } else {
      hideSplash();
      showAuthScreen();
    }
  } catch (e) {
    console.error('init session error', e);
    hideSplash();
    showAuthScreen();
  }

  // Listen auth changes
  window.PIYE_API.onAuthChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      if (!AppState.user) await loadProfileAndEnter();
    } else if (event === 'SIGNED_OUT') {
      teardown();
      showAuthScreen();
    }
  });
}

function hideSplash() {
  const s = $('#splash');
  if (!s) return;
  s.style.opacity = '0';
  setTimeout(() => s.classList.add('hidden'), 400);
}

function showAuthScreen() {
  $('#auth-screen').classList.remove('hidden');
  $('#app-screen').classList.add('hidden');
}

function showAppScreen() {
  $('#auth-screen').classList.add('hidden');
  $('#app-screen').classList.remove('hidden');
}

async function loadProfileAndEnter() {
  try {
    const session = await window.PIYE_API.getSession();
    AppState.user = session.data.session.user;
    let profile = await window.PIYE_API.getProfile(AppState.user.id);
    if (!profile) {
      // First-time profile via trigger should exist; fallback
      profile = {
        id: AppState.user.id,
        username: 'user_' + AppState.user.id.slice(0, 6),
        display_name: AppState.user.email?.split('@')[0] || 'Pengguna',
        language: window.PIYE_API.suggestLanguage(),
        avatar_url: null,
      };
      await window.PIYE_API.upsertProfile(profile).catch(() => {});
    }
    AppState.profile = profile;

    // Apply defaults
    AppState.layers.translation = true;
    AppState.layers.original = true;
    AppState.layers.reading = false;

    renderMe();
    showAppScreen();
    hideSplash();

    await Promise.all([
      loadConversations(),
      loadFriends(),
      loadFriendRequests(),
    ]);
    subscribeRealtime();
  } catch (e) {
    console.error('loadProfileAndEnter', e);
    showToast('Gagal memuat profil: ' + (e.message || e), 'error');
    hideSplash();
    showAuthScreen();
  }
}

function teardown() {
  AppState.user = null;
  AppState.profile = null;
  AppState.activeConversation = null;
  AppState.activePeer = null;
  AppState.messages = [];
  AppState.conversations = [];
  AppState.friends = [];
  AppState.friendRequests = [];
  window.PIYE_API?.unsubscribeAll?.();
  AppState.subscriptions = [];
  $('#messages').innerHTML = '';
  $('#chat-active').classList.add('hidden');
  $('#chat-welcome').classList.remove('hidden');
}

/* =========================================================
 * AUTH UI
 * ========================================================= */
function switchAuthTab(tab) {
  $$('.auth-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('#login-form').classList.toggle('hidden', tab !== 'login');
  $('#register-form').classList.toggle('hidden', tab !== 'register');
}

async function handleLogin(e) {
  e.preventDefault();
  if (AppState.configMissing) return showToast('Supabase belum dikonfigurasi.', 'error');
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const btn = $('#login-submit');
  btn.disabled = true;
  try {
    await window.PIYE_API.signInWithPassword(email, password);
    // onAuthChange will handle
  } catch (err) {
    showToast(err.message || 'Gagal masuk.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  if (AppState.configMissing) return showToast('Supabase belum dikonfigurasi.', 'error');
  const displayName = $('#register-name').value.trim();
  const username = $('#register-username').value.trim().toLowerCase();
  const email = $('#register-email').value.trim();
  const password = $('#register-password').value;
  const language = $('#register-language').value;

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return showToast('Username hanya huruf kecil, angka, underscore (3–20).', 'error');
  }

  const btn = $('#register-submit');
  btn.disabled = true;
  try {
    const usernameAvailable = await window.PIYE_API.isUsernameAvailable(username);
    if (!usernameAvailable) {
      showToast('Username sudah dipakai.', 'error');
      return;
    }
    await window.PIYE_API.signUp(email, password, { displayName, username, language });
    showToast('Registrasi berhasil. Cek email untuk verifikasi.', 'success');
    switchAuthTab('login');
  } catch (err) {
    showToast(err.message || 'Gagal mendaftar.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleForgot() {
  if (AppState.configMissing) return showToast('Supabase belum dikonfigurasi.', 'error');
  const email = $('#login-email').value.trim();
  if (!email) return showToast('Isi email dulu.', 'error');
  try {
    await window.PIYE_API.resetPassword(email);
    showToast('Link reset password dikirim ke email.', 'success');
  } catch (err) {
    showToast(err.message || 'Gagal mengirim reset password.', 'error');
  }
}

async function handleGoogle() {
  if (AppState.configMissing) return showToast('Supabase belum dikonfigurasi.', 'error');
  try {
    await window.PIYE_API.signInWithGoogle();
  } catch (err) {
    showToast(
      'Google OAuth belum tersedia. Pastikan provider Google diaktifkan di Supabase dan redirect URL sudah benar. ' +
        (err.message || ''),
      'error'
    );
  }
}

async function handleLogout() {
  try {
    await window.PIYE_API.signOut();
    teardown();
    showAuthScreen();
  } catch (err) {
    showToast('Gagal keluar: ' + (err.message || err), 'error');
  }
}

/* =========================================================
 * RENDER PROFILE
 * ========================================================= */
function renderMe() {
  const p = AppState.profile;
  if (!p) return;
  $('#me-name').textContent = p.display_name || p.username;
  $('#me-username').textContent = '@' + (p.username || '');
  avatarStyle(p, $('#me-avatar'));
}

/* =========================================================
 * SIDEBAR: CONVERSATIONS
 * ========================================================= */
async function loadConversations() {
  try {
    const list = await window.PIYE_API.getConversations();
    AppState.conversations = list || [];
    renderChatList();
  } catch (e) {
    console.error('loadConversations', e);
    showToast('Gagal memuat percakapan.', 'error');
  }
}

function renderChatList() {
  const ul = $('#chat-list');
  ul.innerHTML = '';
  const convs = AppState.conversations;
  if (!convs.length) {
    $('#sidebar-empty').classList.remove('hidden');
    return;
  }
  $('#sidebar-empty').classList.add('hidden');
  convs.forEach((c) => {
    const peer = c.peer || {};
    const li = document.createElement('li');
    li.dataset.id = c.id;
    if (AppState.activeConversation?.id === c.id) li.classList.add('active');

    const av = document.createElement('div');
    av.className = 'avatar';
    avatarStyle(peer, av);

    const body = document.createElement('div');
    body.className = 'item-body';
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = peer.display_name || peer.username || 'Pengguna';
    const sub = document.createElement('div');
    sub.className = 'item-sub';
    sub.textContent = c.last_message_preview || 'Belum ada pesan';
    body.appendChild(title);
    body.appendChild(sub);

    li.appendChild(av);
    li.appendChild(body);
    li.addEventListener('click', () => openConversation(c));
    ul.appendChild(li);
  });
}

/* =========================================================
 * SIDEBAR: FRIENDS & REQUESTS
 * ========================================================= */
async function loadFriends() {
  try {
    const list = await window.PIYE_API.getFriends();
    AppState.friends = list || [];
    renderFriends();
  } catch (e) {
    console.error('loadFriends', e);
  }
}

function renderFriends() {
  const ul = $('#friends-list');
  ul.innerHTML = '';
  if (!AppState.friends.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Belum ada teman. Cari pengguna untuk berteman.';
    ul.appendChild(li);
    return;
  }
  AppState.friends.forEach((f) => {
    const li = document.createElement('li');
    const av = document.createElement('div');
    av.className = 'avatar sm';
    avatarStyle(f, av);
    const body = document.createElement('div');
    body.className = 'item-body';
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = f.display_name || f.username;
    const sub = document.createElement('div');
    sub.className = 'item-sub';
    sub.textContent = '@' + f.username;
    body.appendChild(title);
    body.appendChild(sub);
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const btn = document.createElement('button');
    btn.className = 'mini-btn';
    btn.textContent = 'Chat';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      startConversationWith(f);
    });
    actions.appendChild(btn);
    li.appendChild(av);
    li.appendChild(body);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

async function loadFriendRequests() {
  try {
    const list = await window.PIYE_API.getFriendRequests();
    AppState.friendRequests = list || [];
    renderRequests();
  } catch (e) {
    console.error('loadFriendRequests', e);
  }
}

function renderRequests() {
  const ul = $('#requests-list');
  ul.innerHTML = '';
  if (!AppState.friendRequests.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Tidak ada permintaan pertemanan.';
    ul.appendChild(li);
    return;
  }
  AppState.friendRequests.forEach((r) => {
    const requester = r.requester || {};
    const li = document.createElement('li');
    const av = document.createElement('div');
    av.className = 'avatar sm';
    avatarStyle(requester, av);
    const body = document.createElement('div');
    body.className = 'item-body';
    const title = document.createElement('div');
    title.className = 'item-title';
    title.textContent = requester.display_name || requester.username;
    const sub = document.createElement('div');
    sub.className = 'item-sub';
    sub.textContent = '@' + requester.username;
    body.appendChild(title);
    body.appendChild(sub);
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const accept = document.createElement('button');
    accept.className = 'mini-btn accept';
    accept.textContent = '✓';
    accept.title = 'Terima';
    accept.addEventListener('click', async () => {
      try {
        await window.PIYE_API.respondToFriendRequest(r.id, true);
        await Promise.all([loadFriends(), loadFriendRequests()]);
        showToast('Permintaan diterima.', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    });
    const reject = document.createElement('button');
    reject.className = 'mini-btn reject';
    reject.textContent = '✕';
    reject.title = 'Tolak';
    reject.addEventListener('click', async () => {
      try {
        await window.PIYE_API.respondToFriendRequest(r.id, false);
        await loadFriendRequests();
        showToast('Permintaan ditolak.');
      } catch (e) { showToast(e.message, 'error'); }
    });
    actions.appendChild(accept);
    actions.appendChild(reject);
    li.appendChild(av);
    li.appendChild(body);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

/* =========================================================
 * OPEN CONVERSATION
 * ========================================================= */
async function openConversation(conv) {
  AppState.activeConversation = conv;
  AppState.activePeer = conv.peer || null;
  AppState.messages = [];

  $('#chat-welcome').classList.add('hidden');
  $('#chat-active').classList.remove('hidden');
  $('#app-screen').classList.add('chat-open');

  // Header
  const peer = AppState.activePeer;
  $('#peer-name').textContent = peer?.display_name || peer?.username || 'Pengguna';
  $('#peer-status').textContent = '@' + (peer?.username || '');
  avatarStyle(peer, $('#peer-avatar'));

  // Reset layer checkboxes
  syncLayerUI();

  renderChatList();
  await loadMessages(conv.id);
  subscribeToMessages(conv.id);
  markConversationRead(conv.id);
}

async function startConversationWith(user) {
  try {
    const conv = await window.PIYE_API.getOrCreateConversation(user.id);
    await loadConversations();
    const full = AppState.conversations.find((c) => c.id === conv.id);
    if (full) openConversation(full);
    else openConversation({ id: conv.id, peer: user });
    closeSearchModal();
  } catch (e) {
    showToast('Gagal memulai percakapan: ' + (e.message || e), 'error');
  }
}

function closeChatMobile() {
  $('#app-screen').classList.remove('chat-open');
  AppState.activeConversation = null;
  AppState.activePeer = null;
  $('#chat-active').classList.add('hidden');
  $('#chat-welcome').classList.remove('hidden');
  renderChatList();
}

/* =========================================================
 * MESSAGES
 * ========================================================= */
async function loadMessages(conversationId) {
  try {
    const msgs = await window.PIYE_API.getMessages(conversationId, AppState.profile.language);
    AppState.messages = msgs || [];
    renderMessages();
  } catch (e) {
    console.error('loadMessages', e);
    showToast('Gagal memuat pesan: ' + (e.message || e), 'error');
  }
}

function renderMessages() {
  const container = $('#messages');
  container.innerHTML = '';
  if (!AppState.messages.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.margin = 'auto';
    empty.textContent = 'Belum ada pesan. Mulai percakapan!';
    container.appendChild(empty);
    return;
  }
  AppState.messages.forEach((m) => {
    container.appendChild(renderBubble(m));
  });
  container.scrollTop = container.scrollHeight;
}

function renderBubble(m) {
  const mine = m.sender_id === AppState.user.id;
  const row = document.createElement('div');
  row.className = 'bubble-row' + (mine ? ' mine' : '');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  // Layer 1: Original
  if (AppState.layers.original) {
    const orig = document.createElement('div');
    orig.className = 'bubble-original';
    orig.textContent = m.original_text; // textContent = safe
    bubble.appendChild(orig);
  }

  // Layer 2: Reading guide
  if (AppState.layers.reading && m.reading_guide) {
    const rg = document.createElement('div');
    rg.className = 'bubble-reading';
    rg.textContent = m.reading_guide;
    bubble.appendChild(rg);
  }

  // Layer 3: Translation
  if (AppState.layers.translation) {
    const trans = m.translation;
    if (trans && trans.translated_text && trans.target_language === AppState.profile.language) {
      const tWrap = document.createElement('div');
      tWrap.className = 'bubble-translation';
      const tag = document.createElement('span');
      tag.className = 'lang-tag';
      tag.textContent = trans.target_language;
      const txt = document.createElement('span');
      txt.textContent = trans.translated_text;
      tWrap.appendChild(tag);
      tWrap.appendChild(txt);
      bubble.appendChild(tWrap);
    } else if (m.translation_status === 'unavailable') {
      const tWrap = document.createElement('div');
      tWrap.className = 'bubble-translation';
      tWrap.textContent = 'Terjemahan belum tersedia.';
      bubble.appendChild(tWrap);
    } else if (m.translation_status === 'pending') {
      const pend = document.createElement('div');
      pend.className = 'bubble-pending';
      pend.textContent = 'Menerjemahkan…';
      bubble.appendChild(pend);
    }
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'bubble-actions';
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Salin';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(m.original_text).then(
      () => showToast('Teks asli disalin.', 'success'),
      () => showToast('Gagal menyalin.', 'error')
    );
  });
  actions.appendChild(copyBtn);
  if (m.translation?.translated_text) {
    const copyTrans = document.createElement('button');
    copyTrans.textContent = 'Salin terjemahan';
    copyTrans.addEventListener('click', () => {
      navigator.clipboard.writeText(m.translation.translated_text).then(
        () => showToast('Terjemahan disalin.', 'success'),
        () => showToast('Gagal menyalin.', 'error')
      );
    });
    actions.appendChild(copyTrans);
  }
  bubble.appendChild(actions);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'bubble-meta';
  const time = document.createElement('span');
  time.textContent = timeLabel(m.created_at);
  meta.appendChild(time);
  if (mine) {
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = m.read_at ? '✓✓' : '✓';
    status.title = m.read_at ? 'Dibaca' : 'Terkirim';
    meta.appendChild(status);
  }
  bubble.appendChild(meta);

  row.appendChild(bubble);
  return row;
}

async function sendMessage() {
  const input = $('#composer-input');
  const text = input.value.trim();
  if (!text) return;
  if (!AppState.activeConversation) return;

  const sendBtn = $('#send-btn');
  sendBtn.disabled = true;
  input.value = '';
  autoResize(input);

  const convId = AppState.activeConversation.id;
  const sourceLang = AppState.profile.language;

  try {
    // Optimistic bubble
    const tempId = 'tmp_' + Date.now();
    const optimistic = {
      id: tempId,
      sender_id: AppState.user.id,
      original_text: text,
      reading_guide: null,
      translation: null,
      translation_status: 'pending',
      created_at: new Date().toISOString(),
      read_at: null,
    };
    AppState.messages.push(optimistic);
    renderMessages();

    const saved = await window.PIYE_API.sendMessage(convId, text, sourceLang);
    // Replace optimistic with saved
    AppState.messages = AppState.messages.filter((m) => m.id !== tempId);
    if (saved) AppState.messages.push(saved);
    renderMessages();

    // Refresh conversations preview
    loadConversations();

    // Fire translation (non-blocking)
    tryTranslationForMessage(saved, sourceLang).catch((e) => console.warn('translate err', e));
  } catch (err) {
    showToast('Gagal mengirim: ' + (err.message || err), 'error');
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

async function tryTranslationForMessage(message, sourceLang) {
  if (!message || !message.id) return;
  const targetLang = AppState.profile.language;
  if (sourceLang === targetLang) return;

  try {
    // Generate reading guide
    let readingGuide = null;
    try {
      readingGuide = await window.PIYE_API.generateReadingGuide(message.original_text, sourceLang);
    } catch (e) { /* ignore */ }

    // Translate
    const translated = await window.PIYE_API.translateMessage(
      message.original_text,
      sourceLang,
      targetLang
    );

    await window.PIYE_API.saveTranslation(message.id, targetLang, translated, readingGuide, sourceLang);

    // Update local
    const idx = AppState.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      AppState.messages[idx].reading_guide = readingGuide;
      AppState.messages[idx].translation_status = 'done';
      AppState.messages[idx].translation = {
        target_language: targetLang,
        translated_text: translated,
      };
      renderMessages();
    }
  } catch (err) {
    console.warn('Translation failed:', err);
    const idx = AppState.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      AppState.messages[idx].translation_status = 'unavailable';
      renderMessages();
    }
  }
}

/* =========================================================
 * LAYER CONTROLS
 * ========================================================= */
function syncLayerUI() {
  $('#layer-original').checked = AppState.layers.original;
  $('#layer-reading').checked = AppState.layers.reading;
  $('#layer-translation').checked = AppState.layers.translation;
  renderMessages();
}

function toggleLayerControls() {
  const el = $('#layer-controls');
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

/* =========================================================
 * REALTIME
 * ========================================================= */
function subscribeRealtime() {
  if (!AppState.user) return;
  try {
    const sub = window.PIYE_API.subscribeToUserChannels({
      onNewMessage: (msg) => handleIncomingMessage(msg),
      onReadReceipt: () => {},
      onFriendRequest: () => loadFriendRequests(),
      onFriendshipChange: () => { loadFriends(); loadFriendRequests(); },
      onConversationChange: () => loadConversations(),
    });
    AppState.subscriptions.push(sub);
  } catch (e) {
    console.error('subscribeRealtime', e);
  }
}

function subscribeToMessages(conversationId) {
  try {
    const sub = window.PIYE_API.subscribeToConversationMessages(conversationId, (msg) => {
      handleIncomingMessage(msg);
    });
    AppState.subscriptions.push(sub);
  } catch (e) {
    console.error('subscribeToMessages', e);
  }
}

async function handleIncomingMessage(msg) {
  if (!msg || !msg.conversation_id) return;
  // If active conversation, append
  if (AppState.activeConversation?.id === msg.conversation_id) {
    // Avoid duplicates
    if (AppState.messages.some((m) => m.id === msg.id)) return;
    // Fetch translation for receiving user's language
    const enriched = await enrichIncomingMessage(msg);
    AppState.messages.push(enriched);
    renderMessages();
    // Mark read
    markConversationRead(msg.conversation_id);
  }
  // Update conversation preview
  loadConversations();
}

async function enrichIncomingMessage(msg) {
  try {
    const full = await window.PIYE_API.getMessageWithTranslation(msg.id, AppState.profile.language);
    if (full) return full;
  } catch (e) { /* ignore */ }
  return { ...msg, translation: null, translation_status: 'pending' };
}

async function markConversationRead(conversationId) {
  try {
    await window.PIYE_API.markConversationRead(conversationId);
  } catch (e) { /* ignore */ }
}

/* =========================================================
 * SEARCH MODAL
 * ========================================================= */
function openSearchModal() {
  $('#search-modal').classList.remove('hidden');
  $('#modal-search-input').value = '';
  $('#modal-search-results').innerHTML = '';
  $('#modal-search-status').textContent = '';
  setTimeout(() => $('#modal-search-input').focus(), 50);
}
function closeSearchModal() {
  $('#search-modal').classList.add('hidden');
}

let searchDebounce = null;
async function performUserSearch(q) {
  const status = $('#modal-search-status');
  const list = $('#modal-search-results');
  if (!q || q.length < 2) {
    list.innerHTML = '';
    status.textContent = 'Ketik minimal 2 karakter.';
    return;
  }
  status.textContent = 'Mencari...';
  try {
    const results = await window.PIYE_API.searchUsers(q);
    list.innerHTML = '';
    if (!results.length) {
      status.textContent = 'Tidak ada pengguna ditemukan.';
      return;
    }
    status.textContent = `${results.length} pengguna ditemukan.`;
    results.forEach((u) => {
      if (u.id === AppState.user.id) return;
      const li = document.createElement('li');
      const av = document.createElement('div');
      av.className = 'avatar sm';
      avatarStyle(u, av);
      const body = document.createElement('div');
      body.className = 'item-body';
      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = u.display_name || u.username;
      const sub = document.createElement('div');
      sub.className = 'item-sub';
      sub.textContent = '@' + u.username;
      body.appendChild(title);
      body.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'item-actions';
      const isFriend = AppState.friends.some((f) => f.id === u.id);
      const btn = document.createElement('button');
      btn.className = 'mini-btn';
      btn.textContent = isFriend ? 'Chat' : 'Tambah';
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (isFriend) {
          startConversationWith(u);
        } else {
          try {
            await window.PIYE_API.sendFriendRequest(u.id);
            showToast('Permintaan pertemanan dikirim.', 'success');
          } catch (e) {
            showToast(e.message || 'Gagal mengirim permintaan.', 'error');
          }
        }
      });
      actions.appendChild(btn);

      li.appendChild(av);
      li.appendChild(body);
      li.appendChild(actions);
      li.addEventListener('click', () => {
        if (isFriend) startConversationWith(u);
      });
      list.appendChild(li);
    });
  } catch (e) {
    status.textContent = 'Gagal mencari: ' + (e.message || e);
  }
}

/* =========================================================
 * SETTINGS
 * ========================================================= */
function openSettings() {
  const p = AppState.profile;
  if (!p) return;
  $('#settings-name').value = p.display_name || '';
  $('#settings-username').value = p.username || '';
  $('#settings-avatar').value = p.avatar_url || '';
  $('#settings-language').value = p.language || 'id';
  $('#settings-modal').classList.remove('hidden');
}
function closeSettings() {
  $('#settings-modal').classList.add('hidden');
}

async function saveSettings() {
  const name = $('#settings-name').value.trim();
  const username = $('#settings-username').value.trim().toLowerCase();
  const avatar = $('#settings-avatar').value.trim();
  const lang = $('#settings-language').value;
  if (!name) return showToast('Nama tidak boleh kosong.', 'error');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return showToast('Username tidak valid (3–20, huruf kecil/angka/underscore).', 'error');
  }
  try {
    await window.PIYE_API.updateProfile({
      display_name: name,
      username,
      avatar_url: avatar || null,
      language: lang,
    });
    AppState.profile = { ...AppState.profile, display_name: name, username, avatar_url: avatar || null, language: lang };
    renderMe();
    closeSettings();
    showToast('Pengaturan disimpan.', 'success');
    // Re-translate messages to new language
    if (AppState.activeConversation) {
      await loadMessages(AppState.activeConversation.id);
    }
  } catch (e) {
    showToast('Gagal menyimpan: ' + (e.message || e), 'error');
  }
}

/* =========================================================
 * COMPOSER AUTO-RESIZE
 * ========================================================= */
function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 140) + 'px';
}

/* =========================================================
 * EVENT BINDINGS
 * ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  // Auth tabs
  $$('.auth-tab').forEach((t) => t.addEventListener('click', () => switchAuthTab(t.dataset.tab)));
  $('#login-form').addEventListener('submit', handleLogin);
  $('#register-form').addEventListener('submit', handleRegister);
  $('#btn-forgot').addEventListener('click', handleForgot);
  $('#btn-google').addEventListener('click', handleGoogle);

  // Sidebar
  $('#btn-logout').addEventListener('click', handleLogout);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-new-chat').addEventListener('click', openSearchModal);
  $('#search-users').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (q.length >= 2) {
      openSearchModal();
      $('#modal-search-input').value = q;
      performUserSearch(q);
    }
  });
  $$('.side-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.side-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      $('#chat-list').classList.toggle('hidden', view !== 'chats');
      $('#friends-list').classList.toggle('hidden', view !== 'friends');
      $('#requests-list').classList.toggle('hidden', view !== 'requests');
      $('#sidebar-empty').classList.toggle('hidden', view !== 'chats' || AppState.conversations.length > 0);
    });
  });

  // Chat
  $('#btn-chat-back').addEventListener('click', closeChatMobile);
  $('#btn-toggle-layers').addEventListener('click', toggleLayerControls);
  $('#layer-original').addEventListener('change', (e) => { AppState.layers.original = e.target.checked; renderMessages(); });
  $('#layer-reading').addEventListener('change', (e) => { AppState.layers.reading = e.target.checked; renderMessages(); });
  $('#layer-translation').addEventListener('change', (e) => { AppState.layers.translation = e.target.checked; renderMessages(); });

  // Composer
  const composer = $('#composer');
  const input = $('#composer-input');
  composer.addEventListener('submit', (e) => { e.preventDefault(); sendMessage(); });
  input.addEventListener('input', () => autoResize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Settings modal
  $('#btn-close-settings').addEventListener('click', closeSettings);
  $('#btn-save-settings').addEventListener('click', saveSettings);

  // Search modal
  $('#btn-close-search').addEventListener('click', closeSearchModal);
  $('#modal-search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    searchDebounce = setTimeout(() => performUserSearch(q), 350);
  });

  // Close modals on backdrop click
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // Start
  init();
});
