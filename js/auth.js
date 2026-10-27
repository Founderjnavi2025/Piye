// ============================================================
// PIYE — Login & Registrasi
// ============================================================

function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', async function () {
  // Jika sudah login, langsung arahkan ke tujuan yang sesuai
  var { data: { session } } = await supabaseClient.auth.getSession();
  if (session && session.user) {
    await redirectAfterLogin();
    return;
  }

  $('btn-login').addEventListener('click', handleLogin);
  $('btn-register').addEventListener('click', handleRegister);

  $('login-password').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') handleLogin();
  });
});

// Arahkan user ke halaman yang tepat setelah login
async function redirectAfterLogin() {
  var result = await checkIsAdmin();
  if (result.isAdmin) {
    window.location.replace('admin.html');
  } else {
    window.location.replace('chat.html');
  }
}

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
    msg.textContent = '';
    await redirectAfterLogin();
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
