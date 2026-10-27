
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
  var result = await checkIsAdmin();
  if (result.isAdmin) {
    $('link-admin').classList.remove('hidden');
  }

  $('auth-check').classList.remove('active');
  $('chat-content').classList.remove('hidden');

  $('btn-logout').addEventListener('click', logoutAndRedirect);

  // Realtime logout lintas tab: jika sesi berakhir, redirect ke login
  supabaseClient.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      window.location.replace('index.html');
    }
  });
});
