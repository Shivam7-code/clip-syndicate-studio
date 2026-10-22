document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('go');
  const err = document.getElementById('err');
  btn.disabled = true;
  err.textContent = '';
  try {
    const input = document.getElementById('passcode') || document.getElementById('password');
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: input.value, passcode: input.value }),
    });
    if (res.ok) {
      localStorage.setItem('cs_authed', '1');
      return location.replace('/');
    }
    err.textContent = (await res.json().catch(() => ({}))).error || 'Sign-in failed.';
  } catch {
    err.textContent = 'Network error. Try again.';
  } finally {
    btn.disabled = false;
  }
});
