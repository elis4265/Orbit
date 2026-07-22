const API_URL = "http://localhost:8000/api/v1";

function getToken() {
  return localStorage.getItem("taskflow_token");
}

async function request(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (res.status === 401) {
    localStorage.removeItem("taskflow_token");
    window.location.href = "index.html";
    return;
  }

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw { status: res.status, detail: data.detail || "Something went wrong" };
  return data;
}

const API = {
  login: (email, password) =>
    request("POST", "/auth/login", null).then(() => {}).catch(() => {}).then(() => {
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
      return fetch(`${API_URL}/auth/login`, {
        method: "POST",
        body: form,
      }).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw { status: res.status, detail: data.detail || "Login failed" };
        return data;
      });
    }),

  register: (email, password) =>
    request("POST", "/auth/register", { email, password }),

  getMe: () => request("GET", "/auth/me"),

  getWorkspaces: () => request("GET", "/workspaces"),
  createWorkspace: (name) => request("POST", "/workspaces", { name }),

  getTasks: (workspaceId) => request("GET", `/workspaces/${workspaceId}/tasks`),
  createTask: (workspaceId, data) => request("POST", `/workspaces/${workspaceId}/tasks`, data),
  updateTask: (workspaceId, taskId, data) =>
    request("PATCH", `/workspaces/${workspaceId}/tasks/${taskId}`, data),
  deleteTask: (workspaceId, taskId) =>
    request("DELETE", `/workspaces/${workspaceId}/tasks/${taskId}`),
};

// Fix login — OAuth2 needs form encoding, not JSON
API.login = async (email, password) => {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);
  const res = await fetch(`${API_URL}/auth/login`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, detail: data.detail || "Invalid credentials" };
  return data;
};
