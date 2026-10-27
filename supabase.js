// ============================================================
// PIYE — Konfigurasi Supabase
// JANGAN gunakan service_role key di browser!
// ============================================================

const SUPABASE_URL = 'https://ovxmajovtrruojcnxbyr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_06a469aYdOfwAoHaMfE_1g_6bSaVn4t';

// Pastikan library Supabase sudah dimuat sebelum file ini.
if (typeof supabase === 'undefined') {
  throw new Error(
    'Library Supabase belum dimuat. Periksa urutan script di HTML.'
  );
}

var supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ============================================================
// Helper: cek apakah pengguna adalah admin melalui RPC
// ============================================================
async function checkIsAdmin() {
  try {
    var { data, error } = await supabaseClient.rpc('is_app_admin');

    if (error) {
      console.error('RPC is_app_admin error:', error.message);
      return {
        isAdmin: false,
        error: error.message
      };
    }

    return {
      isAdmin: data === true,
      error: null
    };
  } catch (err) {
    console.error('checkIsAdmin exception:', err);

    return {
      isAdmin: false,
      error: 'Gagal memeriksa status admin.'
    };
  }
}

// ============================================================
// Helper: ambil sesi pengguna
// Mengembalikan { session, user } atau null.
// ============================================================
async function getCurrentAuth() {
  try {
    var { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error('Gagal mengambil sesi:', error.message);
      return null;
    }

    var session = data ? data.session : null;

    if (!session || !session.user) {
      return null;
    }

    return {
      session: session,
      user: session.user
    };
  } catch (err) {
    console.error('getCurrentAuth exception:', err);
    return null;
  }
}

// ============================================================
// Helper: redirect ke login jika belum login
// Digunakan oleh admin.html dan chat.html.
// ============================================================
async function requireAuth() {
  var auth = await getCurrentAuth();

  if (!auth) {
    window.location.replace('index.html');
    return null;
  }

  return auth;
}

// ============================================================
// Helper: redirect ke login jika belum login
// Nama alternatif sesuai permintaan refactor.
// ============================================================
async function redirectIfUnauthenticated() {
  return await requireAuth();
}

// ============================================================
// Helper: proteksi halaman admin
// Jika bukan admin, arahkan ke chat.html.
// Jika pemeriksaan admin gagal karena error, jangan beri akses.
// ============================================================
async function requireAdmin() {
  var auth = await requireAuth();

  if (!auth) {
    return null;
  }

  var result = await checkIsAdmin();

  if (result.error) {
    console.error('Status admin tidak dapat diverifikasi.');

    // Gagal memverifikasi bukan berarti pengguna pasti bukan admin.
    // Jangan berikan akses admin ketika pemeriksaan gagal.
    window.location.replace('index.html');
    return null;
  }

  if (!result.isAdmin) {
    window.location.replace('chat.html');
    return null;
  }

  return {
    session: auth.session,
    user: auth.user,
    isAdmin: true
  };
}

// ============================================================
// Helper: redirect jika bukan admin
// Nama alternatif sesuai permintaan refactor.
// ============================================================
async function redirectIfNotAdmin() {
  return await requireAdmin();
}

// ============================================================
// Helper: logout global
// Digunakan di semua halaman.
// ============================================================
async function logoutAndRedirect() {
  try {
    var { error } = await supabaseClient.auth.signOut();

    if (error) {
      console.error('Signout error:', error.message);
    }
  } catch (err) {
    console.error('Signout exception:', err);
  }

  window.location.replace('index.html');
}
