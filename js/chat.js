// ============================================================
// PIYE — Halaman Pengguna (placeholder chat)
// ============================================================

function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', async function () {
  var auth = await requireAuth();
  if (!auth) return; // sudah redirect ke index.html

  // Tampilkan info user
  $('chat-user-email').textContent = auth.user.email || '—';

  // Tampilkan link ke panel admin hanya jika benar-benar admin
  // (link hanya kosmetik; proteksi sebenarnya ada di admin.html via requireAdmin)
  var
