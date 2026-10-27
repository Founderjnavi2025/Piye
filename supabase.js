// ============================================================
// PIYE — Konfigurasi Supabase
// ============================================================

// Konfigurasi proyek Supabase
const SUPABASE_URL = 'https://ovxmajovtrruojcnxbyr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_06a469aYdOfwAoHaMfE_1g_6bSaVn4t';

// Buat klien Supabase
var supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ============================================================
// Helper: Periksa apakah pengguna yang login adalah admin.
// Memanggil RPC public.is_app_admin() yang sudah ada di database.
//
// Hasil:
// { isAdmin: true/false, error: null/pesan error }
// ============================================================
async function checkIsAdmin() {
  try {
    const { data, error } = await supabaseClient.rpc('is_app_admin');

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
