// Redirect if already logged in
if (localStorage.getItem("taskflow_token")) {
  window.location.href = "board.html";
}

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${tab}`).classList.add("active");
  });
});

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add("show");
}
function hideError(id) {
  document.getElementById(id).classList.remove("show");
}

// Login
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError("login-error");
  const btn = e.target.querySelector("button[type=submit]");
  btn.textContent = "Signing in…";
  btn.disabled = true;

  try {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const data = await API.login(email, password);
    localStorage.setItem("taskflow_token", data.access_token);
    window.location.href = "board.html";
  } catch (err) {
    showError("login-error", err.detail || "Login failed. Check your credentials.");
    btn.textContent = "Sign In";
    btn.disabled = false;
  }
});

// Register
document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError("register-error");
  const btn = e.target.querySelector("button[type=submit]");
  btn.textContent = "Creating account…";
  btn.disabled = true;

  try {
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    await API.register(email, password);
    // Auto-login after register
    const data = await API.login(email, password);
    localStorage.setItem("taskflow_token", data.access_token);
    window.location.href = "board.html";
  } catch (err) {
    showError("register-error", err.detail || "Registration failed.");
    btn.textContent = "Create Account";
    btn.disabled = false;
  }
});
