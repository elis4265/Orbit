// ── State ──────────────────────────────────────────────────────────────
let currentWorkspace = null;
let tasks = [];
let draggedTaskId = null;
let draggedVersion = null;

// ── Guard ───────────────────────────────────────────────────────────────
if (!localStorage.getItem("taskflow_token")) {
  window.location.href = "index.html";
}

// ── Init ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const user = await API.getMe();
    document.getElementById("user-email").textContent = user.email;
    document.getElementById("user-avatar").textContent = user.email[0].toUpperCase();

    const workspaces = await API.getWorkspaces();

    if (workspaces.length === 0) {
      showWsModal();
      return;
    }

    populateWorkspaceSelect(workspaces);
    currentWorkspace = workspaces[0];
    await loadBoard();
  } catch (err) {
    showToast("Failed to load. Is the backend running?", "error");
  }
}

function populateWorkspaceSelect(workspaces) {
  const sel = document.getElementById("workspace-select");
  sel.innerHTML = "";
  workspaces.forEach((ws) => {
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = ws.name;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", async () => {
    currentWorkspace = { id: sel.value };
    await loadBoard();
  });
}

async function loadBoard() {
  try {
    tasks = await API.getTasks(currentWorkspace.id);
    renderBoard();
  } catch {
    showToast("Could not load tasks.", "error");
  }
}

// ── Render ──────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: "todo",        label: "To Do",       cls: "col-todo" },
  { key: "in_progress", label: "In Progress",  cls: "col-progress" },
  { key: "done",        label: "Done",         cls: "col-done" },
];

function renderBoard() {
  const area = document.getElementById("board-area");
  area.innerHTML = "";

  COLUMNS.forEach((col) => {
    const colTasks = tasks.filter((t) => t.status === col.key);
    area.appendChild(buildColumn(col, colTasks));
  });
}

function buildColumn(col, colTasks) {
  const wrap = document.createElement("div");
  wrap.className = `column ${col.cls}`;
  wrap.dataset.status = col.key;

  // Header
  const header = document.createElement("div");
  header.className = "column-header";
  header.innerHTML = `
    <div class="column-dot"></div>
    <span class="column-title">${col.label}</span>
    <span class="column-count">${colTasks.length}</span>
  `;
  wrap.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "column-body";
  body.dataset.status = col.key;

  if (colTasks.length === 0) {
    body.innerHTML = `<div class="column-empty"><div class="column-empty-icon">○</div><span>Nothing here yet</span></div>`;
  } else {
    colTasks.forEach((t) => body.appendChild(buildCard(t)));
  }

  // Drag-over events on body
  body.addEventListener("dragover", onDragOver);
  body.addEventListener("dragleave", onDragLeave);
  body.addEventListener("drop", onDrop);

  wrap.appendChild(body);

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "column-add-btn";
  addBtn.innerHTML = `<span style="font-size:16px;line-height:1;">+</span> Add task`;
  addBtn.addEventListener("click", () => openTaskModal(col.key));
  wrap.appendChild(addBtn);

  return wrap;
}

function buildCard(task) {
  const card = document.createElement("div");
  card.className = "task-card";
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.dataset.version = task.version;
  card.dataset.status = task.status;

  const subtaskCount = (task.sub_tasks || []).length;
  const subtaskBadge = subtaskCount > 0
    ? `<span class="subtask-badge">☑ ${subtaskCount}</span>`
    : "";

  card.innerHTML = `
    <div class="task-card-title">${escHtml(task.title)}</div>
    ${task.description ? `<div class="task-card-desc">${escHtml(task.description)}</div>` : ""}
    <div class="task-card-footer">
      <div class="task-card-meta">${subtaskBadge}</div>
      <button class="task-delete-btn" title="Delete task">✕</button>
    </div>
  `;

  card.addEventListener("dragstart", onDragStart);
  card.addEventListener("dragend", onDragEnd);
  card.querySelector(".task-delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  return card;
}

// ── Drag & Drop ──────────────────────────────────────────────────────────
function onDragStart(e) {
  draggedTaskId = this.dataset.taskId;
  draggedVersion = parseInt(this.dataset.version, 10);
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragEnd() {
  this.classList.remove("dragging");
  document.querySelectorAll(".column").forEach((c) => c.classList.remove("drag-over"));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  this.closest(".column").classList.add("drag-over");
}

function onDragLeave(e) {
  if (!this.contains(e.relatedTarget)) {
    this.closest(".column").classList.remove("drag-over");
  }
}

async function onDrop(e) {
  e.preventDefault();
  const column = this.closest(".column");
  column.classList.remove("drag-over");

  const newStatus = column.dataset.status;
  const task = tasks.find((t) => t.id === draggedTaskId);
  if (!task || task.status === newStatus) return;

  try {
    const updated = await API.updateTask(currentWorkspace.id, draggedTaskId, {
      status: newStatus,
      version: draggedVersion,
    });
    // Patch local state so we don't reload everything
    const idx = tasks.findIndex((t) => t.id === draggedTaskId);
    if (idx !== -1) tasks[idx] = updated;
    renderBoard();
    showToast("Task moved.", "success");
  } catch (err) {
    if (err.status === 409) {
      showToast("Version conflict — reloading board.", "error");
      await loadBoard();
    } else {
      showToast("Failed to move task.", "error");
    }
  }
}

// ── Create task ──────────────────────────────────────────────────────────
let pendingStatus = "todo";

function openTaskModal(status = "todo") {
  pendingStatus = status;
  document.getElementById("task-status").value = status;
  document.getElementById("task-title").value = "";
  document.getElementById("task-desc").value = "";
  document.getElementById("task-modal").classList.add("open");
  setTimeout(() => document.getElementById("task-title").focus(), 50);
}

function closeTaskModal() {
  document.getElementById("task-modal").classList.remove("open");
}

document.getElementById("modal-close").addEventListener("click", closeTaskModal);
document.getElementById("modal-cancel").addEventListener("click", closeTaskModal);
document.getElementById("task-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeTaskModal();
});

document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Creating…";

  try {
    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-desc").value.trim() || null;
    const status = document.getElementById("task-status").value;

    const task = await API.createTask(currentWorkspace.id, { title, description, status });
    tasks.push(task);
    renderBoard();
    closeTaskModal();
    showToast("Task created.", "success");
  } catch (err) {
    showToast(err.detail || "Failed to create task.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Task";
  }
});

// ── Delete task ──────────────────────────────────────────────────────────
async function deleteTask(taskId) {
  try {
    await API.deleteTask(currentWorkspace.id, taskId);
    tasks = tasks.filter((t) => t.id !== taskId);
    renderBoard();
    showToast("Task deleted.", "success");
  } catch {
    showToast("Failed to delete task.", "error");
  }
}

// ── Workspace creation ────────────────────────────────────────────────────
function showWsModal() {
  document.getElementById("board-area").innerHTML = `
    <div class="workspace-prompt">
      <h2>No workspaces yet</h2>
      <p>Create your first workspace to start organising tasks.</p>
    </div>
  `;
  document.getElementById("ws-modal").classList.add("open");
}

document.getElementById("ws-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("ws-name").value.trim();
  try {
    const ws = await API.createWorkspace(name);
    currentWorkspace = ws;
    document.getElementById("ws-modal").classList.remove("open");
    const sel = document.getElementById("workspace-select");
    const opt = document.createElement("option");
    opt.value = ws.id;
    opt.textContent = ws.name;
    sel.appendChild(opt);
    await loadBoard();
  } catch (err) {
    showToast(err.detail || "Failed to create workspace.", "error");
  }
});

// ── Logout ────────────────────────────────────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("taskflow_token");
  window.location.href = "index.html";
});

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ── Utils ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
