/**
 * PIYE — supabase.js
 * Inisialisasi Supabase, autentikasi, database, realtime, dan adapter translation.
 *
 * KONFIGURASI:
 *   1. Ganti SUPABASE_URL dan SUPABASE_ANON_KEY di bawah.
 *   2. Jangan gunakan service_role key di frontend.
 *   3. Translation provider: secara default PIYE memakai MyMemory API publik
 *      (tanpa API key). Untuk produksi, arahkan ke Supabase Edge Function.
 *      Lihat `PIYE_CONFIG.translateEndpoint` dan `readingGuideEndpoint`.
 */

'use strict';

const PIYE_CONFIG = {
  SUPABASE_URL: 'https://ovxmajovtrruojcnxbyr.supabase.co', // URL project lu
  SUPABASE_ANON_KEY: 'sb_publishable_06a469aYdOfwAoHaMfE_1g_6bSaVn4t', // Publishable key lu

  // Endpoint terjemahan.
  // Kosongkan ('') untuk memakai MyMemory API langsung (publik, rate-limited).
  // Isi dengan URL Supabase Edge Function untuk produksi:
  //   https://<project>.supabase.co/functions/v1/translate
  translateEndpoint: '',
  // Endpoint reading guide. Kosong = fallback lokal (karakter CJK/Arab dasar).
  readingGuideEndpoint: '',
};

/* =========================================================
 * LANGUAGES
 * ========================================================= */
const LANGUAGES = [
  { code: 'id', label: 'Indonesia', tts: 'id-ID' },
  { code: 'en', label: 'English', tts: 'en-US' },
  { code: 'ms', label: 'Bahasa Melayu', tts: 'ms-MY' },
  { code: 'zh', label: '中文 (Mandarin)', tts: 'zh-CN' },
  { code: 'ja', label: '日本語 (Jepang)', tts: 'ja-JP' },
  { code: 'ko', label: '한국어 (Korea)', tts: 'ko-KR' },
  { code: 'ar', label: 'العربية (Arab)', tts: 'ar-SA' },
  { code: 'hi', label: 'हिन्दी (Hindi)', tts: 'hi-IN' },
  { code: 'th', label: 'ไทย (Thailand)', tts: 'th-TH' },
  { code: 'vi', label: 'Tiếng Việt (Vietnam)', tts: 'vi-VN' },
  { code: 'fil', label: 'Filipino', tts: 'fil-PH' },
  { code: 'es', label: 'Español', tts: 'es-ES' },
  { code: 'fr', label: 'Français', tts: 'fr-FR' },
  { code: 'de', label: 'Deutsch', tts: 'de-DE' },
  { code: 'pt', label: 'Português', tts: 'pt-PT' },
  { code: 'ru', label: 'Русский', tts: 'ru-RU' },
  { code: 'tr', label: 'Türkçe', tts: 'tr-TR' },
  { code: 'sw', label: 'Kiswahili', tts: 'sw-KE' },
  { code: 'ha', label: 'Hausa', tts: 'ha-NG' },
  { code: 'yo', label: 'Yorùbá', tts: 'yo-NG' },
  { code: 'ig', label: 'Igbo', tts: 'ig-NG' },
  { code: 'am', label: 'አማርኛ (Amharic)', tts: 'am-ET' },
  { code: 'zu', label: 'isiZulu', tts: 'zu-ZA' },
  { code: 'af', label: 'Afrikaans', tts: 'af-ZA' },
];

/* =========================================================
 * CLIENT
 * ========================================================= */
let supabaseClient = null;
let configured = false;

// FIX: Panggil initClient() agar status dicek saat runtime, bukan hanya baca variabel
function isConfigured() {
  return !!initClient();
}

function initClient() {
  if (configured && supabaseClient) return supabaseClient;
  if (!PIYE_CONFIG.SUPABASE_URL || !PIYE_CONFIG.SUPABASE_ANON_KEY) return null;
  if (PIYE_CONFIG.SUPABASE_URL.includes('YOUR_PROJECT_REF')) return null;
  if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
    console.error('Supabase JS SDK belum dimuat.');
    return null;
  }
  supabaseClient = window.supabase.createClient(
    PIYE_CONFIG.SUPABASE_URL,
    PIYE_CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  configured = true;
  return supabaseClient;
}

/* =========================================================
 * HELPERS
 * ========================================================= */
function client() {
  const c = initClient();
  if (!c) throw new Error('Supabase belum dikonfigurasi. Isi SUPABASE_URL dan SUPABASE_ANON_KEY di supabase.js.');
  return c;
}

function suggestLanguage() {
  const nav = (navigator.language || 'id').toLowerCase();
  const base = nav.split('-')[0];
  const match = LANGUAGES.find((l) => l.code === base);
  return match ? match.code : 'id';
}

/* =========================================================
 * AUTH
 * ========================================================= */
async function signUp(email, password, meta) {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: { data: { display_name: meta.displayName, username: meta.username, language: meta.language } },
  });
  if (error) throw error;
  // The DB trigger `handle_new_user` creates the profile row from metadata.
  return data;
}

async function signInWithPassword(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

async function resetPassword(email) {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

async function getSession() {
  return client().auth.getSession();
}

function onAuthChange(cb) {
  client().auth.onAuthStateChange((event, session) => cb(event, session));
}

/* =========================================================
 * PROFILES
 * ========================================================= */
async function getProfile(userId) {
  const { data, error } = await client()
    .from('profiles')
    .select('id, username, display_name, avatar_url, language, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertProfile(profile) {
  const { data, error } = await client()
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateProfile(patch) {
  const { data: sess } = await client().auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error('Tidak ada sesi.');
  const { data, error } = await client()
    .from('profiles')
    .update(patch)
    .eq('id', uid)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function isUsernameAvailable(username) {
  const { data, error } = await client()
    .from('profiles')
    .select('id')
    .eq('username', username)
    .limit(1);
  if (error) throw error;
  return !data || data.length === 0;
}

async function searchUsers(q) {
  const { data, error } = await client()
    .from('profiles')
    .select('id, username, display_name, avatar_url, language')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20);
  if (error) throw error;
  return data || [];
}

/* =========================================================
 * FRIENDSHIPS
 * ========================================================= */
async function sendFriendRequest(addresseeId) {
  const { data: sess } = await client().auth.getSession();
  const uid = sess.session.user.id;
  if (uid === addresseeId) throw new Error('Tidak bisa menambahkan diri sendiri.');
  const { error } = await client()
    .from('friendships')
    .insert({ requester_id: uid, addressee_id: addresseeId, status: 'pending' });
  if (error) throw error;
}

async function respondToFriendRequest(friendshipId, accept) {
  const { error } = await client()
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
    .eq('id', friendshipId);
  if (error) throw error;
}

async function getFriends() {
  const { data: sess } = await client().auth.getSession();
  const uid = sess.session.user.id;
  const { data, error } = await client()
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
    .eq('status', 'accepted');
  if (error) throw error;
  const ids = (data || []).map((f) => (f.requester_id === uid ? f.addressee_id : f.requester_id));
  if (!ids.length) return [];
  const { data: profiles, error: e2 } = await client()
    .from('profiles')
    .select('id, username, display_name, avatar_url, language')
    .in('id', ids);
  if (e2) throw e2;
  return profiles || [];
}

async function getFriendRequests() {
  const { data: sess } = await client().auth.getSession();
  const uid = sess.session.user.id;
  const { data, error } = await client()
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at')
    .eq('addressee_id', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) return [];
  const ids = data.map((r) => r.requester_id);
  const { data: profiles } = await client()
    .from('profiles')
    .select('id, username, display_name, avatar_url, language')
    .in('id', ids);
  const map = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  return data.map((r) => ({ ...r, requester: map[r.requester_id] }));
}

/* =========================================================
 * CONVERSATIONS
 * ========================================================= */

async function getOrCreateConversation(peerId) {
  const db = client();

  // 1. Pastikan user sudah login
  const { data: sess, error: sessionError } =
    await db.auth.getSession();

  if (sessionError) throw sessionError;

  const uid = sess?.session?.user?.id;

  if (!uid) {
    throw new Error("Lu harus login dulu.");
  }

  if (!peerId || peerId === uid) {
    throw new Error("User tujuan chat tidak valid.");
  }

  // 2. Cari percakapan milik user yang sedang login
  const { data: mine, error: e1 } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", uid);

  if (e1) throw e1;

  const convIds = (mine || []).map(
    (m) => m.conversation_id
  );

  // 3. Periksa apakah sudah ada percakapan bersama
  if (convIds.length > 0) {
    const { data: peerRows, error: e2 } = await db
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", peerId)
      .in("conversation_id", convIds);

    if (e2) throw e2;

    if (peerRows?.length > 0) {
      return { id: peerRows[0].conversation_id };
    }
  }

  // 4. Buat ID percakapan di sisi browser
  const conversationId = crypto.randomUUID();

  // Jangan pakai .select() di sini.
  // User belum menjadi anggota percakapan,
  // sehingga policy SELECT bisa menolak hasilnya.
  const { error: e3 } = await db
    .from("conversations")
    .insert({
      id: conversationId
    });

  if (e3) throw e3;

  // 5. Masukkan user yang login terlebih dahulu
  const { error: e4 } = await db
    .from("conversation_members")
    .insert({
      conversation_id: conversationId,
      user_id: uid
    });

  if (e4) throw e4;

  // 6. Setelah itu, masukkan user tujuan
  const { error: e5 } = await db
    .from("conversation_members")
    .insert({
      conversation_id: conversationId,
      user_id: peerId
    });

  if (e5) throw e5;

  // 7. Kembalikan ID agar bisa dipakai membuka chat
  return { id: conversationId };
}


async function getConversations() {
  const { data: sess } = await client().auth.getSession();
  const uid = sess.session.user.id;

  const { data: memberships, error } = await client()
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', uid);
  if (error) throw error;
  const convIds = (memberships || []).map((m) => m.conversation_id);
  if (!convIds.length) return [];

  // Get peer members
  const { data: peerMembers, error: e2 } = await client()
    .from('conversation_members')
    .select('conversation_id, user_id')
    .in('conversation_id', convIds)
    .neq('user_id', uid);
  if (e2) throw e2;

  const peerIds = [...new Set((peerMembers || []).map((p) => p.user_id))];
  const { data: profiles } = await client()
    .from('profiles')
    .select('id, username, display_name, avatar_url, language')
    .in('id', peerIds.length ? peerIds : ['00000000-0000-0000-0000-000000000000']);
  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  // Last messages
  const { data: lastMsgs } = await client()
    .from('messages')
    .select('conversation_id, original_text, created_at')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false });
  const lastMap = {};
  (lastMsgs || []).forEach((m) => {
    if (!lastMap[m.conversation_id]) lastMap[m.conversation_id] = m;
  });

  return convIds.map((id) => {
    const peerRow = (peerMembers || []).find((p) => p.conversation_id === id);
    const peer = peerRow ? profileMap[peerRow.user_id] : null;
    const last = lastMap[id];
    return {
      id,
      peer,
      last_message_preview: last ? last.original_text.slice(0, 80) : '',
      last_message_at: last?.created_at || null,
    };
  }).sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });
}

/* =========================================================
 * MESSAGES
 * ========================================================= */
async function sendMessage(conversationId, originalText, sourceLanguage) {
  const { data: sess } = await client().auth.getSession();
  const uid = sess.session.user.id;
  const { data, error } = await client()
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: uid,
      original_text: originalText,
      source_language: sourceLanguage,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...data, translation: null, translation_status: 'pending' };
}

async function getMessages(conversationId, targetLanguage) {
  const { data: msgs, error } = await client()
    .from('messages')
    .select('id, conversation_id, sender_id, original_text, source_language, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!msgs?.length) return [];

  const msgIds = msgs.map((m) => m.id);
  const { data: translations } = await client()
    .from('message_translations')
    .select('message_id, target_language, translated_text, reading_guide')
    .in('message_id', msgIds);

  const transMap = {};
  (translations || []).forEach((t) => {
    if (t.target_language === targetLanguage) transMap[t.message_id] = t;
  });

  return msgs.map((m) => {
    const t = transMap[m.id];
    return {
      ...m,
      translation: t ? { target_language: t.target_language, translated_text: t.translated_text } : null,
      reading_guide: t?.reading_guide || null,
      translation_status: t ? 'done' : (m.source_language === targetLanguage ? 'same' : 'unavailable'),
    };
  });
}

async function getMessageWithTranslation(messageId, targetLanguage) {
  const { data: msg, error } = await client()
    .from('messages')
    .select('id, conversation_id, sender_id, original_text, source_language, created_at, read_at')
    .eq('id', messageId)
    .single();
  if (error) throw error;
  const { data: trans } = await client()
    .from('message_translations')
    .select('target_language, translated_text, reading_guide')
    .eq('message_id', messageId)
    .eq('target_language', targetLanguage)
    .maybeSingle();
  return {
    ...msg,
    translation: trans ? { target_language: trans.target_language, translated_text: trans.translated_text } : null,
    reading_guide: trans?.reading_guide || null,
    translation_status: trans ? 'done' : 'unavailable',
  };
}

async function saveTranslation(messageId, targetLanguage, translatedText, readingGuide, sourceLanguage) {
  const { error } = await client()
    .from('message_translations')
    .upsert({
      message_id: messageId,
      target_language: targetLanguage,
      translated_text: translatedText,
      reading_guide: readingGuide,
      source_language: sourceLanguage,
      provider: 'mymemory+heuristic',
    }, { onConflict: 'message_id,target_language' });
  if (error) throw error;
}

async function markConversationRead(conversationId) {
  const { data: sess } = await client().auth.getSession();
  const uid = sess.session.user.id;
  // Insert read receipts for messages not sent by me
  const { data: msgs } = await client()
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .neq('sender_id', uid);
  if (!msgs?.length) return;
  const rows = msgs.map((m) => ({ message_id: m.id, user_id: uid }));
  const { error } = await client()
    .from('message_read_receipts')
    .upsert(rows, { onConflict: 'message_id,user_id' });
  if (error) console.warn('read receipts', error);
}

/* =========================================================
 * REALTIME
 * ========================================================= */
let realtimeChannels = [];

function subscribeToConversationMessages(conversationId, onNew) {
  const ch = client()
    .channel('conv-' + conversationId)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onNew(payload.new))
    .subscribe();
  realtimeChannels.push(ch);
  return ch;
}

function subscribeToUserChannels({ onNewMessage, onReadReceipt, onFriendRequest, onFriendshipChange, onConversationChange }) {
  const ch = client().channel('user-events');

  if (onNewMessage) {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => onNewMessage(payload.new));
  }
  if (onReadReceipt) {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_read_receipts' }, (payload) => onReadReceipt(payload.new));
  }
  if (onFriendRequest || onFriendshipChange) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, (payload) => {
      if (onFriendRequest) onFriendRequest(payload);
      if (onFriendshipChange) onFriendshipChange(payload);
    });
  }
  if (onConversationChange) {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, (payload) => onConversationChange(payload));
  }
  ch.subscribe();
  realtimeChannels.push(ch);
  return ch;
}

async function unsubscribeAll() {
  for (const ch of realtimeChannels) {
    try { await client().removeChannel(ch); } catch (e) { /* ignore */ }
  }
  realtimeChannels = [];
}

/* =========================================================
 * TRANSLATION & READING GUIDE
 * ========================================================= */

// Cache terjemahan in-memory untuk mengurangi request berulang dalam sesi.
const translationCache = new Map(); // key: `${text}|${src}|${tgt}` -> string

async function translateMessage(text, sourceLanguage, targetLanguage) {
  if (!text || !text.trim()) return '';
  if (sourceLanguage === targetLanguage) return text;

  const key = `${text}|${sourceLanguage}|${targetLanguage}`;
  if (translationCache.has(key)) return translationCache.get(key);

  // 1. Try Edge Function if configured
  if (PIYE_CONFIG.translateEndpoint) {
    try {
      const res = await fetch(PIYE_CONFIG.translateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: sourceLanguage, target: targetLanguage }),
      });
      if (res.ok) {
        const json = await res.json();
        const out = json.translated_text || json.translation || json.text;
        if (out) { translationCache.set(key, out); return out; }
      }
    } catch (e) {
      console.warn('Edge translate failed, falling back to MyMemory', e);
    }
  }

  // 2. Public MyMemory API (no key, rate-limited)
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage}|${targetLanguage}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Translation request failed: ' + res.status);
    const json = await res.json();
    const out = json?.responseData?.translatedText;
    if (out && typeof out === 'string' && !/MYMEMORY WARNING/i.test(out)) {
      translationCache.set(key, out);
      return out;
    }
    throw new Error('Translation tidak tersedia dari provider.');
  } catch (e) {
    console.warn('translateMessage error', e);
    throw new Error('Terjemahan belum tersedia.');
  }
}

// Reading guide sederhana untuk beberapa skrip.
// Untuk produksi, gunakan Edge Function dengan library khusus (pinyin, kuroshiro, dll).
async function generateReadingGuide(text, sourceLanguage) {
  if (!text) return null;
  const lang = (sourceLanguage || '').toLowerCase();

  // Edge function override
  if (PIYE_CONFIG.readingGuideEndpoint) {
    try {
      const res = await fetch(PIYE_CONFIG.readingGuideEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: lang }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.reading_guide) return json.reading_guide;
      }
    } catch (e) { /* ignore */ }
  }

  // Fallback: hanya untuk skrip yang dikenal
  if (['zh', 'ja', 'ko', 'ar'].includes(lang) && /[\u3000-\u9fff\uac00-\ud7af\u0600-\u06ff]/.test(text)) {
    // Catatan: tanpa library, kita tidak dapat menghasilkan romanisasi akurat.
    // Kembalikan null agar lapisan disembunyikan, atau string info.
    // Untuk demo fungsional, kita tandai sebagai tidak tersedia.
    return null;
  }
  return null;
}

async function detectLanguage(text) {
  // Deteksi sederhana berbasis range karakter. Untuk produksi gunakan library/edge function.
  if (!text) return 'id';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'id';
}

/* =========================================================
 * EXPORT
 * ========================================================= */
window.PIYE_API = {
  LANGUAGES,
  isConfigured,
  suggestLanguage,
  // auth
  signUp,
  signInWithPassword,
  signInWithGoogle,
  signOut,
  resetPassword,
  getSession,
  onAuthChange,
  // profiles
  getProfile,
  upsertProfile,
  updateProfile,
  isUsernameAvailable,
  searchUsers,
  // friendships
  sendFriendRequest,
  respondToFriendRequest,
  getFriends,
  getFriendRequests,
  // conversations
  getOrCreateConversation,
  getConversations,
  // messages
  sendMessage,
  getMessages,
  getMessageWithTranslation,
  saveTranslation,
  markConversationRead,
  // realtime
  subscribeToConversationMessages,
  subscribeToUserChannels,
  unsubscribeAll,
  // translation
  translateMessage,
  generateReadingGuide,
  detectLanguage,
};
