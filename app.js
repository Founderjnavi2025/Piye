
// ============================================================
// PIYE — Admin Kamus CSV
// ============================================================

// ---------- State ----------
var currentUser = null;
var isAdmin = false;
var previewRows = [];
var previewStats = { total: 0, valid: 0, invalid: 0 };
var cancelImport = false;
var currentImportId = null;
var isImporting = false;

// ---------- Helper DOM ----------
function $(id) { return document.getElementById(id); }

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Inisialisasi ----------
document.addEventListener('DOMContentLoaded', function () {
  initAuth();
  bindEvents();
});

async function initAuth() {
  var { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await handleAfterLogin();
  } else {
    showSection('section-login');
  }
}

function bindEvents() {
  // Auth
  $('btn-login').addEventListener('click', handleLogin);
  $('btn-register').addEventListener('click', handleRegister);
  $('btn-logout-1').addEventListener('click', handleLogout);
  $('btn-logout-2').addEventListener('click', handleLogout);
  // BARU: tombol logout di halaman chat
  $('btn-logout-chat').addEventListener('click', handleLogout);

  // Template
  $('btn-download-template').addEventListener('click', downloadTemplate);

  // File
  $('file-input').addEventListener('change', handleFileSelect);

  // Impor
  $('btn-start-import').addEventListener('click', startImport);
  $('btn-cancel-preview').addEventListener('click', cancelPreview);
  $('btn-cancel-import').addEventListener('click', function () {
    if (isImporting) {
      cancelImport = true;
      $('btn-cancel-import').disabled = true;
      $('btn-cancel-import').textContent = 'Membatalkan...';
    }
  });
  $('btn-new-import').addEventListener('click', resetImportUI);

  // Riwayat
  $('btn-refresh-history').addEventListener('click', loadHistory);

  // Kelola
  $('btn-search-dict').addEventListener('click', searchDictionary);
  $('search-dict').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') searchDictionary();
  });

  // Tab
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      $('panel-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'history') loadHistory();
    });
  });
}

// ---------- Navigasi ----------
function showSection(id) {
  document.querySelectorAll('.section').forEach(function (s) { s.classList.remove('active'); });
  $(id).classList.add('active');
}

// ============================================================
// AUTH
// ============================================================

async function handleLogin() {
  var email = $('login-email').value.trim();
  var password = $('login-password').value;
  var msg = $('login-message');

  if (!email || !password) {
    msg.className = 'message error';
    msg.textContent = 'Email dan password wajib diisi.';
    return;
  }

  msg.className = 'message';
  msg.textContent = 'Memproses...';
  $('btn-login').disabled = true;

  try {
    var { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      msg.className = 'message error';
      msg.textContent = error.message;
      return;
    }

    currentUser = data.user;
    msg.textContent = '';
    await handleAfterLogin();
  } catch (err) {
    msg.className = 'message error';
    msg.textContent = 'Terjadi kesalahan: ' + err.message;
  } finally {
    $('btn-login').disabled = false;
  }
}

async function handleRegister() {
  var email = $('login-email').value.trim();
  var password = $('login-password').value;
  var msg = $('login-message');

  if (!email || !password) {
    msg.className = 'message error';
    msg.textContent = 'Email dan password wajib diisi.';
    return;
  }
  if (password.length < 6) {
    msg.className = 'message error';
    msg.textContent = 'Password minimal 6 karakter.';
    return;
  }

  msg.className = 'message';
  msg.textContent = 'Mendaftar...';
  $('btn-register').disabled = true;

  try {
    var { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });

    if (error) {
      msg.className = 'message error';
      msg.textContent = error.message;
      return;
    }

    msg.className = 'message success';
    msg.textContent = 'Pendaftaran berhasil. Cek email untuk konfirmasi (jika diaktifkan), lalu login.';
  } catch (err) {
    msg.className = 'message error';
    msg.textContent = 'Terjadi kesalahan: ' + err.message;
  } finally {
    $('btn-register').disabled = false;
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  isAdmin = false;
  resetImportUI();
  showSection('section-login');
  $('login-password').value = '';
  $('login-message').textContent = '';
  // Bersihkan juga state chat
  if ($('chat-user-email')) $('chat-user-email').textContent = '—';
}

// ============================================================
// DIUBAH: Arahkan admin ke dashboard, user biasa ke chat
// ============================================================
async function handleAfterLogin() {
  var result = await checkIsAdmin();
  isAdmin = result.isAdmin;

  if (isAdmin) {
    showSection('section-admin');
  } else {
    // BARU: pengguna biasa masuk ke halaman chat, bukan "Akses Ditolak"
    $('chat-user-email').textContent = currentUser ? currentUser.email : '—';
    showSection('section-chat');
  }
}

// ============================================================
// TEMPLATE CSV
// ============================================================

function downloadTemplate() {
  var csv = 'source_lang,target_lang,source_text,target_text\n' +
            'id,en,halo,hello\n' +
            'id,en,terima kasih,thank you\n' +
            'en,id,good morning,selamat pagi\n';
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'template_kamus_piye.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// PARSER CSV (mendukung tanda kutip, koma dalam teks, baris baru)
// ============================================================

function parseCSVFull(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  var rows = [];
  var currentRow = [];
  var currentField = '';
  var inQuotes = false;
  var i = 0;
  var len = text.length;

  while (i < len) {
    var ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
      } else if (ch === '\r') {
        i++;
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 0 && !(currentRow.length === 1 && currentRow[0] === '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    if (!(currentRow.length === 1 && currentRow[0] === '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// ============================================================
// FILE SELECT & VALIDASI
// ============================================================

async function handleFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;

  $('file-label-text').textContent = file.name;
  $('file-info').textContent = 'Membaca file...';
  $('preview-area').classList.add('hidden');
  $('summary-area').classList.add('hidden');

  if (file.size > 50 * 1024 * 1024) {
    $('file-info').textContent = '';
    alert('File terlalu besar. Maksimal 50MB.');
    $('file-input').value = '';
    $('file-label-text').textContent = 'Ketuk untuk memilih file';
    return;
  }

  var text;
  try {
    text = await file.text();
  } catch (err) {
    $('file-info').textContent = '';
    alert('Gagal membaca file: ' + err.message);
    return;
  }

  var rawRows = parseCSVFull(text);

  if (rawRows.length < 2) {
    $('file-info').textContent = 'File kosong atau hanya berisi header.';
    return;
  }

  var header = rawRows[0].map(function (h) { return h.trim().toLowerCase(); });
  var expected = ['source_lang', 'target_lang', 'source_text', 'target_text'];
  var headerOk = expected.every(function (h, idx) { return header[idx] === h; });

  if (!headerOk) {
    $('file-info').textContent = '';
    alert('Header CSV tidak valid.\nHarus: source_lang,target_lang,source_text,target_text\nDitemukan: ' + rawRows[0].join(','));
    return;
  }

  var valid = [];
  var invalid = 0;
  var seenKeys = {};

  for (var i = 1; i < rawRows.length; i++) {
    var cols = rawRows[i];

    if (cols.length === 1 && cols[0].trim() === '') continue;

    if (cols.length !== 4) { invalid++; continue; }

    var sl = cols[0].trim().toLowerCase();
    var tl = cols[1].trim().toLowerCase();
    var st = cols[2].trim();
    var tt = cols[3].trim();

    if (!sl || !tl || !st || !tt) { invalid++; continue; }
    if (sl === tl) { invalid++; continue; }

    var key = sl + '|' + tl + '|' + st;
    if (seenKeys[key]) { invalid++; continue; }
    seenKeys[key] = true;

    valid.push({
      source_lang: sl,
      target_lang: tl,
      source_text: st,
      target_text: tt
    });
  }

  previewRows = valid;
  previewStats = {
    total: rawRows.length - 1,
    valid: valid.length,
    invalid: invalid
  };

  renderPreview(valid.slice(0, 10));
  $('preview-summary').textContent =
    'Total baris data: ' + previewStats.total +
    ' | Valid: ' + previewStats.valid +
    ' | Ditolak/duplikat internal: ' + previewStats.invalid;

  $('preview-area').classList.remove('hidden');
  $('file-info').textContent = 'File: ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
}

function renderPreview(rows) {
  var table = $('preview-table');
  var html = '<tr><th>source_lang</th><th>target_lang</th><th>source_text</th><th>target_text</th></tr>';
  rows.forEach(function (r) {
    html += '<tr><td>' + esc(r.source_lang) + '</td><td>' + esc(r.target_lang) +
            '</td><td>' + esc(r.source_text) + '</td><td>' + esc(r.target_text) + '</td></tr>';
  });
  table.innerHTML = html;
}

function cancelPreview() {
  previewRows = [];
  previewStats = { total: 0, valid: 0, invalid: 0 };
  $('preview-area').classList.add('hidden');
  $('file-input').value = '';
  $('file-label-text').textContent = 'Ketuk untuk memilih file';
  $('file-info').textContent = '';
}

// ============================================================
// IMPOR BATCH
// ============================================================

var BATCH_SIZE = 500;

async function startImport() {
  if (previewRows.length === 0 || isImporting) return;

  var total = previewRows.length;

  if (total > 5000) {
    if (!confirm('Anda akan mengimpor ' + total + ' baris. Proses ini mungkin memakan waktu. Lanjutkan?')) {
      return;
    }
  }

  isImporting = true;
  cancelImport = false;

  $('preview-area').classList.add('hidden');
  $('progress-area').classList.remove('hidden');
  $('btn-cancel-import').disabled = false;
  $('btn-cancel-import').textContent = 'Batalkan Impor';
  $('progress-bar').value = 0;
  $('progress-text').textContent = '0%';
  $('progress-detail').textContent = '';

  var imported = 0;
  var failed = 0;
  var processed = 0;

  var fileInput = $('file-input');
  var filename = fileInput.files[0] ? fileInput.files[0].name : 'unknown.csv';
  var fileHash = await computeFileHash(fileInput.files[0]);

  var { data: histData, error: histError } = await supabaseClient
    .from('import_history')
    .insert({
      admin_id: currentUser.id,
      filename: filename,
      file_hash: fileHash,
      total_rows: total,
      status: 'processing'
    })
    .select()
    .single();

  if (histError) {
    alert('Gagal membuat riwayat impor: ' + histError.message);
    isImporting = false;
    $('progress-area').classList.add('hidden');
    return;
  }

  currentImportId = histData.id;

  for (var i = 0; i < total; i += BATCH_SIZE) {
    if (cancelImport) break;

    var batch = previewRows.slice(i, i + BATCH_SIZE);

    var payload = batch.map(function (r) {
      return {
        source_lang: r.source_lang,
        target_lang: r.target_lang,
        source_text: r.source_text,
        target_text: r.target_text
      };
    });

    var { data: upsertData, error: upsertError } = await supabaseClient
      .from('dictionary')
      .upsert(payload, {
        onConflict: 'source_lang,target_lang,source_text',
        ignoreDuplicates: false
      })
      .select('id');

    if (upsertError) {
      failed += batch.length;
      console.error('Batch gagal (baris ' + (i + 1) + '-' + (i + batch.length) + '):', upsertError.message);
    } else {
      imported += (upsertData ? upsertData.length : batch.length);
    }

    processed += batch.length;

    var pct = Math.round((processed / total) * 100);
    $('progress-bar').value = pct;
    $('progress-text').textContent = pct + '% — ' + processed + ' / ' + total + ' baris';
    $('progress-detail').textContent = 'Berhasil diproses: ' + imported + ' | Gagal: ' + failed;

    await supabaseClient
      .from('import_history')
      .update({
        processed_rows: processed,
        imported_rows: imported,
        rejected_rows: failed,
        duplicate_rows: 0
      })
      .eq('id', currentImportId);

    if (cancelImport) break;
  }

  var finalStatus;
  if (cancelImport) {
    finalStatus = 'cancelled';
  } else if (failed > 0) {
    finalStatus = 'failed';
  } else {
    finalStatus = 'completed';
  }

  var errorMsg = null;
  if (failed > 0) {
    errorMsg = failed + ' baris gagal diimpor (lihat console untuk detail).';
  }

  await supabaseClient
    .from('import_history')
    .update({
      status: finalStatus,
      processed_rows: processed,
      imported_rows: imported,
      rejected_rows: failed,
      duplicate_rows: 0,
      error_message: errorMsg,
      completed_at: new Date().toISOString()
    })
    .eq('id', currentImportId);

  isImporting = false;
  $('progress-area').classList.add('hidden');
  $('summary-area').classList.remove('hidden');

  var summaryHtml =
    '<p><strong>Total baris:</strong> ' + total + '</p>' +
    '<p><strong>Berhasil diproses:</strong> ' + imported + '</p>' +
    '<p><strong>Gagal:</strong> ' + failed + '</p>' +
    '<p><strong>Status:</strong> ' + finalStatus + '</p>';

  if (finalStatus === 'cancelled') {
    summaryHtml += '<p class="message error">Impor dibatalkan oleh pengguna. Sebagian data mungkin sudah masuk.</p>';
  } else if (failed > 0) {
    summaryHtml += '<p class="message error">Beberapa baris gagal. Periksa console browser untuk detail error.</p>';
  }

  $('summary-content').innerHTML = summaryHtml;
}

async function computeFileHash(file) {
  if (!file) return null;
  try {
    var buffer = await file.arrayBuffer();
    var hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (err) {
    console.warn('Gagal menghitung hash:', err);
    return null;
  }
}

function resetImportUI() {
  previewRows = [];
  previewStats = { total: 0, valid: 0, invalid: 0 };
  cancelImport = false;
  isImporting = false;
  currentImportId = null;

  $('file-input').value = '';
  $('file-label-text').textContent = 'Ketuk untuk memilih file';
  $('file-info').textContent = '';
  $('preview-area').classList.add('hidden');
  $('progress-area').classList.add('hidden');
  $('summary-area').classList.add('hidden');
  $('progress-bar').value = 0;
  $('progress-text').textContent = '';
  $('progress-detail').textContent = '';
  $('btn-cancel-import').disabled = false;
  $('btn-cancel-import').textContent = 'Batalkan Impor';
}

// ============================================================
// RIWAYAT IMPOR
// ============================================================

async function loadHistory() {
  var container = $('history-list');
  container.innerHTML = '<p class="info">Memuat...</p>';

  var { data, error } = await supabaseClient
    .from('import_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    container.innerHTML = '<p class="message error">Gagal memuat: ' + esc(error.message) + '</p>';
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = '<p class="info">Belum ada riwayat impor.</p>';
    return;
  }

  container.innerHTML = data.map(function (h) {
    var statusClass = 'status-' + (h.status || 'pending');
    var html = '<div class="history-item">' +
      '<span class="status ' + statusClass + '">' + esc(h.status) + '</span> — ' +
      '<strong>' + esc(h.filename || '(tanpa nama)') + '</strong><br>' +
      'Total: ' + (h.total_rows || 0) +
      ' | Diproses: ' + (h.processed_rows || 0) +
      ' | Berhasil: ' + (h.imported_rows || 0) +
      ' | Gagal: ' + (h.rejected_rows || 0) + '<br>' +
      '<span class="info small">' + new Date(h.created_at).toLocaleString('id-ID') + '</span>';

    if (h.error_message) {
      html += '<br><span class="message error small">' + esc(h.error_message) + '</span>';
    }
    if (h.completed_at) {
      html += '<br><span class="info small">Selesai: ' + new Date(h.completed_at).toLocaleString('id-ID') + '</span>';
    }
    html += '</div>';
    return html;
  }).join('');
}

// ============================================================
// KELOLA KAMUS (PENCARIAN)
// ============================================================

async function searchDictionary() {
  var q = $('search-dict').value.trim();
  var container = $('dict-results');

  if (!q) {
    container.innerHTML = '<p class="info">Masukkan kata kunci pencarian.</p>';
    return;
  }

  container.innerHTML = '<p class="info">Mencari...</p>';

  var { data, error } = await supabaseClient
    .from('dictionary')
    .select('id, source_lang, target_lang, source_text, target_text')
    .ilike('source_text', '%' + q + '%')
    .limit(20);

  if (error) {
    container.innerHTML = '<p class="message error">' + esc(error.message) + '</p>';
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = '<p class="info">Tidak ditemukan hasil untuk "' + esc(q) + '".</p>';
    return;
  }

  container.innerHTML = data.map(function (d) {
    return '<div class="history-item">' +
      '<span class="info small">' + esc(d.source_lang) + ' → ' + esc(d.target_lang) + '</span><br>' +
      '<strong>' + esc(d.source_text) + '</strong> = ' + esc(d.target_text) +
      '</div>';
  }).join('');
}
