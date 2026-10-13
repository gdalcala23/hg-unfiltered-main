import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7TyKlbWrZgWbx4K-GaBD7QtbSFdw0u1c",
  authDomain: "hg-unfiltered-2319.firebaseapp.com",
  projectId: "hg-unfiltered-2319",
  storageBucket: "hg-unfiltered-2319.firebasestorage.app",
  messagingSenderId: "687718060527",
  appId: "1:687718060527:web:86e726a2ac2bcda0a0661a"
};

const IMGBB_API_KEY = "6d0a9fd961aa31573cfd6d51a3c549e1";
const START_DATE = "2026-02-23T00:00:00Z";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let counterTimer = null;
let firestoreReady = false;

const notesData = { "for-guile": [], "for-hera": [] };
const boardState = {
  "for-guile": { search: "", sort: "recent", editingId: null },
  "for-hera": { search: "", sort: "recent", editingId: null }
};

let photosData = [];
let oursData = [];
let highlightsData = [];
let memoriesData = [];
let pendingFile = null;
let pendingModalTarget = "posts";
let currentGalleryTab = "posts";
let activeMenuPhotoId = null;
let activeHighlightId = null;
let activeMemoryId = null;
let pendingDeleteAction = null;
let memoryDraftPhotos = [];
let memoryEditingPhotos = [];

/* ---------- Counter ---------- */
function updateCounter() {
  const start = new Date(START_DATE).getTime();
  const now = Date.now();
  const diff = now - start;
  const valueEl = document.getElementById("us-counter-value");
  const subEl = document.getElementById("us-counter-sub");
  if (!valueEl || !subEl) return;
  if (isNaN(start)) { valueEl.textContent = "—"; subEl.textContent = "set START_DATE in us.js"; return; }
  if (diff < 0) { valueEl.textContent = "—"; subEl.textContent = "counting starts on Feb 23, 2026"; return; }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  valueEl.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  subEl.textContent = `since February 23, 2026`;
}

function startCounter() {
  if (counterTimer) clearInterval(counterTimer);
  updateCounter();
  counterTimer = setInterval(updateCounter, 1000);
}

function formatDate(value) {
  try {
    let d;
    if (!value) return "";
    if (typeof value === "object" && typeof value.toDate === "function") { d = value.toDate(); }
    else { d = new Date(value); }
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatDateOnly(value) {
  try {
    if (!value) return "";
    let d;
    if (typeof value === "object" && typeof value.toDate === "function") { d = value.toDate(); }
    else { d = new Date(value); }
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

/* ---------- Notes ---------- */
function applyFilters(notes, state) {
  let list = [...notes];
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(n => (n.title || "").toLowerCase().includes(q) || (n.text || "").toLowerCase().includes(q));
  }
  list.sort((a, b) => {
    const pinnedA = a.pinned ? 1 : 0;
    const pinnedB = b.pinned ? 1 : 0;
    if (pinnedA !== pinnedB) return pinnedB - pinnedA;
    const ta = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date || 0).getTime();
    const tb = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date || 0).getTime();
    return state.sort === "oldest" ? ta - tb : tb - ta;
  });
  return list;
}

function buildNoteCard(boardId, note, state) {
  const item = document.createElement("div");
  item.className = "note-item";
  item.dataset.id = note.id;
  if (note.pinned) item.classList.add("pinned");
  if (state.editingId === note.id) item.classList.add("editing");

  const header = document.createElement("div");
  header.className = "note-item-header";

  const title = document.createElement("div");
  title.className = "note-item-title";

  if (note.pinned) {
    const pinFlag = document.createElement("span");
    pinFlag.className = "note-pin-flag";
    pinFlag.textContent = "★";
    title.appendChild(pinFlag);
  }

  const titleText = document.createElement("span");
  if (note.title) { titleText.textContent = note.title; }
  else { titleText.textContent = "A whisper"; titleText.style.opacity = "0.5"; }
  title.appendChild(titleText);

  const date = document.createElement("div");
  date.className = "note-item-date";
  let dateLabel = formatDate(note.date);
  if (note.edited && note.editedAt) { dateLabel = `edited · ${formatDate(note.editedAt)}`; }
  date.textContent = dateLabel;

  header.appendChild(title);
  header.appendChild(date);

  const text = document.createElement("div");
  text.className = "note-item-text";
  text.textContent = note.text;

  const actions = document.createElement("div");
  actions.className = "note-item-actions";

  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "note-action-btn pin" + (note.pinned ? " active" : "");
  pinBtn.title = note.pinned ? "Unpin" : "Pin";
  pinBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M5 17h14l-2-7V4a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v6l-2 7z"/></svg>`;
  pinBtn.addEventListener("click", () => togglePin(boardId, note.id));

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "note-action-btn edit";
  editBtn.title = "Edit";
  editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12"/></svg>`;
  editBtn.addEventListener("click", () => startEdit(boardId, note.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "note-action-btn delete";
  deleteBtn.title = "Delete";
  deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
  deleteBtn.addEventListener("click", () => deleteNote(boardId, note.id));

  actions.appendChild(pinBtn);
  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  item.appendChild(header);
  item.appendChild(text);
  item.appendChild(actions);

  return item;
}

function renderBoard(boardId) {
  const list = document.getElementById(`list-${boardId}`);
  const count = document.getElementById(`count-${boardId}`);
  if (!list || !count) return;
  const notes = notesData[boardId];
  const state = boardState[boardId];
  const filtered = applyFilters(notes, state);
  count.textContent = notes.length;
  if (!firestoreReady && notes.length === 0) { list.innerHTML = `<div class="note-empty">Connecting to shared whispers...</div>`; return; }
  if (notes.length === 0) { list.innerHTML = `<div class="note-empty">No whispers yet — be the first to write one.</div>`; return; }
  if (filtered.length === 0) { list.innerHTML = `<div class="note-empty">No whispers match your search.</div>`; return; }
  list.innerHTML = "";
  filtered.forEach(note => { list.appendChild(buildNoteCard(boardId, note, state)); });
}

async function addNote(boardId, title, text) {
  try {
    await addDoc(collection(db, "notes_" + boardId), { title: title.trim(), text: text.trim(), date: serverTimestamp(), edited: false, editedAt: null, pinned: false });
  } catch (err) { console.error("addNote failed:", err); alert("Failed to save whisper. Check your connection."); }
}

async function updateNote(boardId, noteId, title, text) {
  try {
    await updateDoc(doc(db, "notes_" + boardId, noteId), { title: title.trim(), text: text.trim(), edited: true, editedAt: serverTimestamp() });
    boardState[boardId].editingId = null;
    resetForm(boardId);
  } catch (err) { console.error("updateNote failed:", err); }
}

async function deleteNote(boardId, noteId) {
  try {
    await deleteDoc(doc(db, "notes_" + boardId, noteId));
    if (boardState[boardId].editingId === noteId) { boardState[boardId].editingId = null; resetForm(boardId); }
  } catch (err) { console.error("deleteNote failed:", err); }
}

async function togglePin(boardId, noteId) {
  const note = notesData[boardId].find(n => n.id === noteId);
  if (!note) return;
  try { await updateDoc(doc(db, "notes_" + boardId, noteId), { pinned: !note.pinned }); } catch (err) { console.error("togglePin failed:", err); }
}

function startEdit(boardId, noteId) {
  const note = notesData[boardId].find(n => n.id === noteId);
  if (!note) return;
  boardState[boardId].editingId = noteId;
  const form = document.getElementById(`form-${boardId}`);
  const titleInput = form.querySelector(".note-title-input");
  const textInput = form.querySelector(".note-textarea");
  const submitBtn = form.querySelector(".note-submit");
  const cancelBtn = form.querySelector(".note-cancel-btn");
  titleInput.value = note.title || "";
  textInput.value = note.text || "";
  submitBtn.textContent = "Save Changes";
  cancelBtn.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  textInput.focus();
  renderBoard(boardId);
}

function resetForm(boardId) {
  const form = document.getElementById(`form-${boardId}`);
  if (!form) return;
  form.querySelector(".note-title-input").value = "";
  form.querySelector(".note-textarea").value = "";
  form.querySelector(".note-submit").textContent = "Add Whisper";
  form.querySelector(".note-cancel-btn").hidden = true;
}

function setupBoard(boardId) {
  const form = document.getElementById(`form-${boardId}`);
  if (!form) return;
  const titleInput = form.querySelector(".note-title-input");
  const textInput = form.querySelector(".note-textarea");
  const cancelBtn = form.querySelector(".note-cancel-btn");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const title = titleInput.value;
    const text = textInput.value;
    if (!text.trim()) { textInput.focus(); return; }
    const editingId = boardState[boardId].editingId;
    if (editingId) { updateNote(boardId, editingId, title, text); }
    else { addNote(boardId, title, text); titleInput.value = ""; textInput.value = ""; textInput.focus(); }
  });
  cancelBtn.addEventListener("click", () => { boardState[boardId].editingId = null; resetForm(boardId); renderBoard(boardId); });
  textInput.addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); } });
  const board = document.querySelector(`.note-board[data-board="${boardId}"]`);
  const searchInput = board.querySelector(".note-search-input");
  if (searchInput) { searchInput.addEventListener("input", () => { boardState[boardId].search = searchInput.value; renderBoard(boardId); }); }
  const filterBtns = board.querySelectorAll(".note-filter-btn");
  filterBtns.forEach(btn => { btn.addEventListener("click", () => { filterBtns.forEach(b => b.classList.remove("active")); btn.classList.add("active"); boardState[boardId].sort = btn.dataset.sort; renderBoard(boardId); }); });
}

function subscribeToBoard(boardId) {
  onSnapshot(collection(db, "notes_" + boardId), snapshot => {
    const items = [];
    snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
    notesData[boardId] = items;
    renderBoard(boardId);
  }, err => {
    console.error(`Firestore subscription failed (${boardId}):`, err);
    const list = document.getElementById(`list-${boardId}`);
    if (list) list.innerHTML = `<div class="note-empty">Could not connect to shared whispers.</div>`;
  });
}

/* ---------- ImgBB ---------- */
async function uploadToImgBB(file) {
  if (!file) throw new Error("No file provided");

  const MAX_SIZE = 32 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 32 MB)`);
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff", "image/heic", "image/heif"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Unsupported format: ${file.type}`);
  }

  const form = new FormData();
  form.append("image", file);
  form.append("name", `hg_${Date.now()}`);

  const url = `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      body: form,
    });
  } catch (networkErr) {
    console.error("❌ Network error:", networkErr);
    throw new Error("Network error — check your connection or ad blocker");
  }

  let json;
  try {
    json = await res.json();
  } catch (parseErr) {
    console.error("❌ Response parse error:", parseErr);
    const text = await res.text().catch(() => "");
    throw new Error(`Invalid response from ImgBB (status ${res.status}): ${text.slice(0, 100)}`);
  }

  // ✅ FIX: ImgBB uses `success: true` and `status: 200`, NOT `status_code`
  if (!res.ok || json?.success !== true || !json?.data?.url) {
    const errMsg = json?.error?.message || `HTTP ${res.status}`;
    console.error("❌ ImgBB error:", json);
    throw new Error(`ImgBB: ${errMsg}`);
  }

  console.log("✅ Uploaded:", json.data.url);
  return {
    url: json.data.url,
    deleteUrl: json.data.delete_url || null,
  };
}

function extractDeleteHash(deleteUrl) {
  if (!deleteUrl) return null;
  const parts = deleteUrl.split("/");
  return parts[parts.length - 1] || null;
}

async function deleteFromImgBB(deleteUrl) {
  const hash = extractDeleteHash(deleteUrl);
  if (!hash) return false;
  try {
    const res = await fetch(`https://api.imgbb.com/1/delete/${hash}?key=${IMGBB_API_KEY}`, { method: "POST" });
    if (!res.ok) { console.warn("ImgBB delete failed:", res.status); return false; }
    return true;
  } catch (err) { console.warn("ImgBB delete error:", err); return false; }
}

/* ---------- Highlights ---------- */
function renderHighlights() {
  const container = document.getElementById("ig-highlights");
  if (!container) return;
  container.innerHTML = "";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "ig-highlight";
  addBtn.setAttribute("aria-label", "New highlight");
  addBtn.innerHTML = `<div class="ig-highlight-circle ig-highlight-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></div><span class="ig-highlight-label">New</span>`;
  addBtn.addEventListener("click", openHighlightModal);
  container.appendChild(addBtn);
  const sorted = [...highlightsData].sort((a, b) => {
    const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return ta - tb;
  });
  sorted.forEach(hl => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ig-highlight";
    btn.setAttribute("aria-label", hl.name);
    const circle = document.createElement("div");
    circle.className = "ig-highlight-circle";
    if (hl.coverUrl) {
      circle.classList.add("ig-highlight-cover");
      const img = document.createElement("img");
      img.src = hl.coverUrl;
      img.alt = hl.name;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.crossOrigin = "anonymous";
      circle.appendChild(img);
    } else { circle.classList.add("ig-highlight-empty"); }
    const label = document.createElement("span");
    label.className = "ig-highlight-label";
    label.textContent = hl.name;
    btn.appendChild(circle);
    btn.appendChild(label);
    btn.addEventListener("click", () => openHighlightViewer(hl.id));
    container.appendChild(btn);
  });
}

function subscribeToHighlights() {
  onSnapshot(collection(db, "highlights"), snapshot => {
    const items = [];
    snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
    highlightsData = items;
    renderHighlights();
    if (activeHighlightId) renderHighlightViewer();
  }, err => { console.error("Highlights subscription failed:", err); });
}

function openHighlightModal() {
  const modal = document.getElementById("ig-hl-modal");
  const input = document.getElementById("ig-hl-name");
  const counter = document.getElementById("ig-hl-counter");
  if (!modal) return;
  input.value = "";
  if (counter) counter.textContent = "0";
  modal.hidden = false;
  setTimeout(() => input.focus(), 150);
}

function closeHighlightModal() {
  const modal = document.getElementById("ig-hl-modal");
  if (!modal) return;
  modal.hidden = true;
}

async function createHighlight() {
  const input = document.getElementById("ig-hl-name");
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  const btn = document.getElementById("ig-hl-create");
  btn.disabled = true;
  btn.textContent = "Creating...";
  try {
    await addDoc(collection(db, "highlights"), { name, createdAt: serverTimestamp(), photos: [], coverUrl: null });
    closeHighlightModal();
  } catch (err) { console.error("createHighlight failed:", err); alert("Could not create highlight."); }
  finally { btn.disabled = false; btn.textContent = "Create Highlight"; }
}

function openHighlightViewer(hlId) {
  activeHighlightId = hlId;
  renderHighlightViewer();
  const viewer = document.getElementById("ig-viewer");
  viewer.hidden = false;
}

function closeHighlightViewer() {
  activeHighlightId = null;
  const viewer = document.getElementById("ig-viewer");
  viewer.hidden = true;
  const menu = document.getElementById("ig-viewer-menu");
  if (menu) menu.hidden = true;
}

function renderHighlightViewer() {
  const hl = highlightsData.find(h => h.id === activeHighlightId);
  if (!hl) { closeHighlightViewer(); return; }
  const title = document.getElementById("ig-viewer-title");
  title.textContent = hl.name;
  const grid = document.getElementById("ig-viewer-grid");
  grid.innerHTML = "";
  const photos = hl.photos || [];
  if (photos.length === 0) {
    grid.innerHTML = `<div class="ig-viewer-empty"><div class="ig-viewer-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg></div><p class="ig-viewer-empty-title">No photos yet</p><p class="ig-viewer-empty-sub">Tap the menu at the top-right to add photos.</p></div>`;
    return;
  }
  photos.forEach(p => {
    const cell = document.createElement("div");
    cell.className = "ig-viewer-cell";
    const img = document.createElement("img");
    img.src = p.url;
    img.alt = p.caption || hl.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.crossOrigin = "anonymous";
    img.onerror = () => { img.style.display = "none"; const fallback = document.createElement("div"); fallback.className = "ig-cell-fallback"; fallback.textContent = "⚠️"; cell.appendChild(fallback); };
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ig-viewer-cell-delete";
    del.title = "Remove photo";
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener("click", e => { e.stopPropagation(); deletePhotoFromHighlight(hl.id, p.id); });
    cell.appendChild(img);
    cell.appendChild(del);
    grid.appendChild(cell);
  });
}

async function deletePhotoFromHighlight(hlId, photoId) {
  const hl = highlightsData.find(h => h.id === hlId);
  if (!hl) return;
  const photos = hl.photos || [];
  const target = photos.find(p => p.id === photoId);
  if (target?.deleteUrl) { await deleteFromImgBB(target.deleteUrl); }
  const newPhotos = photos.filter(p => p.id !== photoId);
  const newCover = photos[0]?.id === photoId ? (newPhotos[0]?.url || null) : hl.coverUrl;
  try { await updateDoc(doc(db, "highlights", hlId), { photos: newPhotos, coverUrl: newCover }); } catch (err) { console.error("deletePhotoFromHighlight failed:", err); }
}

async function deleteHighlight(hlId) {
  const hl = highlightsData.find(h => h.id === hlId);
  if (!hl) return;
  const photos = hl.photos || [];
  for (const p of photos) { if (p.deleteUrl) { await deleteFromImgBB(p.deleteUrl); } }
  try { await deleteDoc(doc(db, "highlights", hlId)); closeHighlightViewer(); } catch (err) { console.error("deleteHighlight failed:", err); }
}

async function addPhotoToHighlight(hlId, file) {
  const hl = highlightsData.find(h => h.id === hlId);
  if (!hl) return;
  const btn = document.getElementById("ig-viewer-add");
  if (btn) btn.disabled = true;
  try {
    const uploaded = await uploadToImgBB(file);
    const newPhoto = { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, url: uploaded.url, deleteUrl: uploaded.deleteUrl, date: new Date().toISOString() };
    const photos = [...(hl.photos || []), newPhoto];
    const newCover = hl.coverUrl || uploaded.url;
    await updateDoc(doc(db, "highlights", hlId), { photos, coverUrl: newCover });
  } catch (err) { console.error("addPhotoToHighlight failed:", err); alert("Could not add photo. Try again."); }
  finally { if (btn) btn.disabled = false; }
}

/* ---------- Gallery ---------- */
function buildPhotoCell(photo, source) {
  const cell = document.createElement("div");
  cell.className = "ig-cell";
  cell.dataset.id = photo.id;
  const img = document.createElement("img");
  img.src = photo.url;
  img.alt = photo.caption || "Photo";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.crossOrigin = "anonymous";
  img.onerror = () => { img.style.display = "none"; const fallback = document.createElement("div"); fallback.className = "ig-cell-fallback"; fallback.textContent = "⚠️"; cell.appendChild(fallback); };
  const overlay = document.createElement("div");
  overlay.className = "ig-cell-overlay";
  if (photo.caption) { const cap = document.createElement("div"); cap.className = "ig-cell-caption"; cap.textContent = photo.caption; overlay.appendChild(cap); }
  const actions = document.createElement("div");
  actions.className = "ig-cell-actions";
  if (source === "posts") {
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ig-cell-action ig-cell-save" + (photo.saved ? " saved" : "");
    saveBtn.title = photo.saved ? "Unsave" : "Save";
    saveBtn.innerHTML = photo.saved
      ? `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
    saveBtn.addEventListener("click", e => { e.stopPropagation(); toggleSave(photo.id, !photo.saved); });
    actions.appendChild(saveBtn);
  }
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "ig-cell-action ig-cell-delete";
  delBtn.title = "Delete";
  delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.addEventListener("click", e => { e.stopPropagation(); openDeleteConfirm(photo.id, source); });
  actions.appendChild(delBtn);
  overlay.appendChild(actions);
  cell.appendChild(img);
  cell.appendChild(overlay);
  return cell;
}

function renderGallery() {
  const postsGrid = document.getElementById("ig-grid");
  const oursGrid = document.getElementById("ig-ours-grid");
  const count = document.getElementById("ig-post-count");
  if (!postsGrid || !oursGrid) return;
  if (count) count.textContent = photosData.length;
  const isSavedTab = currentGalleryTab === "saved";
  const isOursTab = currentGalleryTab === "ours";
  postsGrid.hidden = isOursTab;
  oursGrid.hidden = !isOursTab;
  const activeGrid = isOursTab ? oursGrid : postsGrid;
  const sourceData = isOursTab ? oursData : isSavedTab ? photosData.filter(p => p.saved) : photosData;
  if (sourceData.length === 0) {
    if (isSavedTab) {
      activeGrid.innerHTML = `<div class="ig-empty"><p class="ig-empty-title">No saved photos yet</p><p class="ig-empty-sub">Tap the bookmark icon on any photo to save it here.</p></div>`;
    } else if (isOursTab) {
      activeGrid.innerHTML = `<div class="ig-empty"><p class="ig-empty-title">No "ours" photos yet</p><p class="ig-empty-sub">Add the first one — a photo just for us.</p><button type="button" class="ig-empty-btn" id="ig-ours-empty-add">Add photo</button></div>`;
      const btn = activeGrid.querySelector("#ig-ours-empty-add");
      if (btn) btn.addEventListener("click", () => document.getElementById("ig-ours-file-input").click());
    } else {
      activeGrid.innerHTML = `<div class="ig-empty"><p class="ig-empty-title">No photos yet</p><p class="ig-empty-sub">Start by adding your first moment together.</p><button type="button" class="ig-empty-btn" id="ig-empty-add">Add your first photo</button></div>`;
      const btn = activeGrid.querySelector("#ig-empty-add");
      if (btn) btn.addEventListener("click", () => document.getElementById("ig-file-input").click());
    }
    return;
  }
  activeGrid.innerHTML = "";
  const sorted = [...sourceData].sort((a, b) => {
    const ta = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date || 0).getTime();
    const tb = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date || 0).getTime();
    return tb - ta;
  });
  sorted.forEach(photo => { activeGrid.appendChild(buildPhotoCell(photo, isOursTab ? "ours" : "posts")); });
}

function subscribeToPhotos() {
  onSnapshot(collection(db, "photos"), snapshot => {
    const items = [];
    snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
    photosData = items;
    renderGallery();
  }, err => { console.error("Photos subscription failed:", err); });
}

function subscribeToOursPhotos() {
  onSnapshot(collection(db, "us_photos"), snapshot => {
    const items = [];
    snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
    oursData = items;
    renderGallery();
  }, err => { console.error("Ours photos subscription failed:", err); });
}

function openModal(file, target) {
  pendingFile = file;
  pendingModalTarget = target || "posts";
  const modal = document.getElementById("ig-modal");
  const previewImg = document.getElementById("ig-modal-preview-img");
  const captionInput = document.getElementById("ig-caption-input");
  const titleEl = modal.querySelector(".ig-modal-header h3");
  if (titleEl) titleEl.textContent = pendingModalTarget === "ours" ? "New Us Photo" : "New Post";
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);
  captionInput.value = "";
  modal.hidden = false;
  setTimeout(() => captionInput.focus(), 100);
}

function closeModal() {
  const modal = document.getElementById("ig-modal");
  modal.hidden = true;
  pendingFile = null;
}

async function sharePost() {
  if (!pendingFile) return;

  const btn = document.getElementById("ig-post-btn");
  const caption = document.getElementById("ig-caption-input").value.trim();
  const collectionName = pendingModalTarget === "ours" ? "us_photos" : "photos";

  btn.disabled = true;
  btn.textContent = "Uploading...";

  try {
    console.log("📤 Starting upload:", {
      name: pendingFile.name,
      size: `${(pendingFile.size / 1024 / 1024).toFixed(2)} MB`,
      type: pendingFile.type,
    });

    const uploaded = await uploadToImgBB(pendingFile);
    console.log("✅ ImgBB upload OK:", uploaded.url);

    await addDoc(collection(db, collectionName), {
      url: uploaded.url,
      deleteUrl: uploaded.deleteUrl,
      caption,
      date: serverTimestamp(),
      saved: false,
    });

    console.log("✅ Firestore doc created");
    closeModal();

  } catch (err) {
    console.error("❌ Share failed:", err);
    alert(`Upload failed:\n\n${err.message}\n\nCheck browser console (F12) for details.`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Share";
  }
}

async function toggleSave(photoId, save) {
  try { await updateDoc(doc(db, "photos", photoId), { saved: save }); } catch (err) { console.error("toggleSave failed:", err); }
}

function openConfirm(title, desc, onConfirm) {
  const confirm = document.getElementById("ig-confirm");
  const titleEl = document.getElementById("ig-confirm-title");
  const descEl = document.getElementById("ig-confirm-desc");
  titleEl.textContent = title;
  descEl.textContent = desc;
  pendingDeleteAction = onConfirm;
  confirm.hidden = false;
}

function closeConfirm() {
  const confirm = document.getElementById("ig-confirm");
  confirm.hidden = true;
  pendingDeleteAction = null;
}

async function confirmDelete() {
  if (typeof pendingDeleteAction === "function") {
    const fn = pendingDeleteAction;
    closeConfirm();
    try { await fn(); } catch (err) { console.error(err); }
  } else { closeConfirm(); }
}

function openDeleteConfirm(photoId, source) {
  const collectionName = source === "ours" ? "us_photos" : "photos";
  const photo = source === "ours" ? oursData.find(p => p.id === photoId) : photosData.find(p => p.id === photoId);
  openConfirm(
    "Delete photo?",
    source === "ours" ? "This will remove the photo from our shared gallery. This can't be undone." : "This will remove the photo from the gallery. This can't be undone.",
    async () => {
      if (photo?.deleteUrl) { await deleteFromImgBB(photo.deleteUrl); }
      await deleteDoc(doc(db, collectionName, photoId));
    }
  );
}

/* ---------- Memories ---------- */
function renderMemories() {
  const timeline = document.getElementById("mem-timeline");
  const count = document.getElementById("mem-count");
  if (!timeline) return;
  if (count) count.textContent = memoriesData.length;

  if (!firestoreReady && memoriesData.length === 0) {
    timeline.innerHTML = `<div class="mem-empty">Connecting to memories...</div>`;
    return;
  }
  if (memoriesData.length === 0) {
    timeline.innerHTML = `
      <div class="mem-empty">
        <div class="mem-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12h20"/>
            <path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/>
            <path d="M5 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>
          </svg>
        </div>
        <p class="mem-empty-title">No memories yet</p>
        <p class="mem-empty-sub">Add your first memory — a trip, a date, a moment.</p>
        <button type="button" class="mem-empty-btn" id="mem-empty-add">Add first memory</button>
      </div>
    `;
    const btn = timeline.querySelector("#mem-empty-add");
    if (btn) btn.addEventListener("click", () => openMemoryModal());
    return;
  }

  const sorted = [...memoriesData].sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return ta - tb;
  });

  timeline.innerHTML = "";

  const path = document.createElement("div");
  path.className = "mem-path";
  timeline.appendChild(path);

  sorted.forEach((mem, idx) => {
    const card = document.createElement("div");
    card.className = "mem-card" + (idx % 2 === 0 ? " left" : " right");
    card.dataset.id = mem.id;

    const dot = document.createElement("div");
    dot.className = "mem-dot";
    dot.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;
    card.appendChild(dot);

    const ticket = document.createElement("div");
    ticket.className = "mem-ticket";

    const top = document.createElement("div");
    top.className = "mem-ticket-top";

    const flightNo = document.createElement("div");
    flightNo.className = "mem-flight-no";
    flightNo.textContent = `MEM-${String(idx + 1).padStart(3, "0")}`;

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "mem-ticket-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "mem-action-btn";
    editBtn.title = "Edit";
    editBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12"/></svg>`;
    editBtn.addEventListener("click", e => { e.stopPropagation(); openMemoryModal(mem.id); });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "mem-action-btn mem-action-delete";
    delBtn.title = "Delete";
    delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
    delBtn.addEventListener("click", e => { e.stopPropagation(); openDeleteMemoryConfirm(mem.id); });

    actionsWrap.appendChild(editBtn);
    actionsWrap.appendChild(delBtn);

    top.appendChild(flightNo);
    top.appendChild(actionsWrap);

    const route = document.createElement("div");
    route.className = "mem-route";

    const from = document.createElement("div");
    from.className = "mem-route-point";
    from.innerHTML = `<span class="mem-route-code">HG</span><span class="mem-route-label">Home</span>`;

    const arrow = document.createElement("div");
    arrow.className = "mem-route-arrow";
    arrow.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

    const to = document.createElement("div");
    to.className = "mem-route-point mem-route-to";
    to.innerHTML = `<span class="mem-route-code">${(mem.location || "??").slice(0, 3).toUpperCase()}</span><span class="mem-route-label">${mem.location || "Somewhere"}</span>`;

    route.appendChild(from);
    route.appendChild(arrow);
    route.appendChild(to);

    const divider = document.createElement("div");
    divider.className = "mem-divider";

    const body = document.createElement("div");
    body.className = "mem-ticket-body";

    const dateEl = document.createElement("div");
    dateEl.className = "mem-date";
    dateEl.textContent = formatDateOnly(mem.date);

    const titleEl = document.createElement("h3");
    titleEl.className = "mem-title";
    titleEl.textContent = mem.title || "Untitled memory";

    body.appendChild(dateEl);
    body.appendChild(titleEl);

    if (mem.description) {
      const desc = document.createElement("p");
      desc.className = "mem-desc";
      desc.textContent = mem.description;
      body.appendChild(desc);
    }

    if (mem.photos && mem.photos.length > 0) {
      const grid = document.createElement("div");
      grid.className = "mem-photo-grid";
      const visible = mem.photos.slice(0, 4);
      visible.forEach((p, i) => {
        const img = document.createElement("img");
        img.src = p.url;
        img.alt = mem.title || "Memory photo";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.crossOrigin = "anonymous";
        img.className = "mem-photo";
        img.addEventListener("click", e => { e.stopPropagation(); openMemoryViewer(mem.id, i); });
        grid.appendChild(img);
      });
      if (mem.photos.length > 4) {
        const more = document.createElement("div");
        more.className = "mem-photo-more";
        more.textContent = `+${mem.photos.length - 4}`;
        more.addEventListener("click", e => { e.stopPropagation(); openMemoryViewer(mem.id, 4); });
        grid.appendChild(more);
      }
      body.appendChild(grid);
    }

    const barcode = document.createElement("div");
    barcode.className = "mem-barcode";
    for (let i = 0; i < 28; i++) {
      const bar = document.createElement("span");
      bar.style.width = (Math.random() > 0.5 ? 1 : 2) + "px";
      barcode.appendChild(bar);
    }

    ticket.appendChild(top);
    ticket.appendChild(route);
    ticket.appendChild(divider);
    ticket.appendChild(body);
    ticket.appendChild(barcode);
    card.appendChild(ticket);
    timeline.appendChild(card);
  });
}

function subscribeToMemories() {
  onSnapshot(collection(db, "memories"), snapshot => {
    const items = [];
    snapshot.forEach(docSnap => { items.push({ id: docSnap.id, ...docSnap.data() }); });
    memoriesData = items;
    renderMemories();
  }, err => { console.error("Memories subscription failed:", err); });
}

function openMemoryModal(memId) {
  const modal = document.getElementById("mem-modal");
  const title = document.getElementById("mem-modal-title");
  const titleInput = document.getElementById("mem-input-title");
  const dateInput = document.getElementById("mem-input-date");
  const locationInput = document.getElementById("mem-input-location");
  const descInput = document.getElementById("mem-input-desc");
  const fileInput = document.getElementById("mem-input-files");
  const preview = document.getElementById("mem-photo-preview");
  const submitBtn = document.getElementById("mem-modal-submit");
  if (!modal) return;

  memoryDraftPhotos = [];
  memoryEditingPhotos = [];

  if (memId) {
    const mem = memoriesData.find(m => m.id === memId);
    if (!mem) return;
    activeMemoryId = memId;
    title.textContent = "Edit Memory";
    submitBtn.textContent = "Save Changes";
    titleInput.value = mem.title || "";
    dateInput.value = mem.date ? new Date(mem.date).toISOString().slice(0, 10) : "";
    locationInput.value = mem.location || "";
    descInput.value = mem.description || "";
    memoryEditingPhotos = [...(mem.photos || [])];
  } else {
    activeMemoryId = null;
    title.textContent = "New Memory";
    submitBtn.textContent = "Save Memory";
    titleInput.value = "";
    dateInput.value = new Date().toISOString().slice(0, 10);
    locationInput.value = "";
    descInput.value = "";
    memoryEditingPhotos = [];
  }

  fileInput.value = "";
  renderMemoryPhotoPreview(preview);
  modal.hidden = false;
  setTimeout(() => titleInput.focus(), 150);
}

function renderMemoryPhotoPreview(container) {
  if (!container) return;
  container.innerHTML = "";
  memoryEditingPhotos.forEach((p, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "mem-preview-item";
    const img = document.createElement("img");
    img.src = p.url;
    img.alt = "Preview";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "mem-preview-del";
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener("click", () => {
      const removed = memoryEditingPhotos.splice(idx, 1)[0];
      if (removed?.isNew) {
        memoryDraftPhotos = memoryDraftPhotos.filter(f => f !== removed.file);
      }
      renderMemoryPhotoPreview(container);
    });
    wrap.appendChild(img);
    wrap.appendChild(del);
    container.appendChild(wrap);
  });
}

function closeMemoryModal() {
  const modal = document.getElementById("mem-modal");
  if (!modal) return;
  modal.hidden = true;
  activeMemoryId = null;
  memoryDraftPhotos = [];
  memoryEditingPhotos = [];
}

async function saveMemory() {
  const titleInput = document.getElementById("mem-input-title");
  const dateInput = document.getElementById("mem-input-date");
  const locationInput = document.getElementById("mem-input-location");
  const descInput = document.getElementById("mem-input-desc");
  const submitBtn = document.getElementById("mem-modal-submit");
  const preview = document.getElementById("mem-photo-preview");

  const title = titleInput.value.trim();
  const date = dateInput.value;
  const location = locationInput.value.trim();
  const description = descInput.value.trim();

  if (!title && !description && memoryEditingPhotos.length === 0 && memoryDraftPhotos.length === 0) {
    titleInput.focus();
    return;
  }

  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Saving...";

  try {
    const uploadedPhotos = [];
    for (const file of memoryDraftPhotos) {
      const uploaded = await uploadToImgBB(file);
      uploadedPhotos.push({
        id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url: uploaded.url,
        deleteUrl: uploaded.deleteUrl,
        date: new Date().toISOString()
      });
    }

    const finalPhotos = memoryEditingPhotos.filter(p => !p.isNew).concat(uploadedPhotos);

    const payload = {
      title,
      date: date || null,
      location,
      description,
      photos: finalPhotos,
      updatedAt: serverTimestamp()
    };

    if (activeMemoryId) {
      await updateDoc(doc(db, "memories", activeMemoryId), payload);
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "memories"), payload);
    }

    closeMemoryModal();
  } catch (err) {
    console.error("saveMemory failed:", err);
    alert("Could not save memory. Try again.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    renderMemoryPhotoPreview(preview);
  }
}

function openDeleteMemoryConfirm(memId) {
  const mem = memoriesData.find(m => m.id === memId);
  if (!mem) return;
  openConfirm(
    "Delete memory?",
    "This will remove the memory and all its photos. This can't be undone.",
    async () => {
      const photos = mem.photos || [];
      for (const p of photos) { if (p.deleteUrl) { await deleteFromImgBB(p.deleteUrl); } }
      await deleteDoc(doc(db, "memories", memId));
    }
  );
}

/* ---------- Memory Viewer ---------- */
function openMemoryViewer(memId, startIndex) {
  const mem = memoriesData.find(m => m.id === memId);
  if (!mem || !mem.photos || mem.photos.length === 0) return;
  activeMemoryId = memId;
  const viewer = document.getElementById("mem-viewer");
  const img = document.getElementById("mem-viewer-img");
  const titleEl = document.getElementById("mem-viewer-title");
  const counter = document.getElementById("mem-viewer-counter");
  if (!viewer) return;

  let current = startIndex || 0;

  const update = () => {
    img.src = mem.photos[current].url;
    titleEl.textContent = mem.title || "Memory";
    counter.textContent = `${current + 1} / ${mem.photos.length}`;
  };

  const prevBtn = document.getElementById("mem-viewer-prev");
  const nextBtn = document.getElementById("mem-viewer-next");

  prevBtn.onclick = e => { e?.stopPropagation(); current = (current - 1 + mem.photos.length) % mem.photos.length; update(); };
  nextBtn.onclick = e => { e?.stopPropagation(); current = (current + 1) % mem.photos.length; update(); };

  update();
  viewer.hidden = false;
}

function closeMemoryViewer() {
  const viewer = document.getElementById("mem-viewer");
  if (!viewer) return;
  viewer.hidden = true;
}

/* ---------- Setup functions ---------- */
function setupHighlights() {
  const modal = document.getElementById("ig-hl-modal");
  if (!modal) return;
  modal.querySelectorAll("[data-close-hl]").forEach(el => { el.addEventListener("click", closeHighlightModal); });
  const createBtn = document.getElementById("ig-hl-create");
  if (createBtn) createBtn.addEventListener("click", createHighlight);
  const nameInput = document.getElementById("ig-hl-name");
  const counter = document.getElementById("ig-hl-counter");
  if (nameInput) {
    nameInput.addEventListener("input", () => { if (counter) counter.textContent = nameInput.value.length; });
    nameInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); createHighlight(); } });
  }
}

function setupHighlightViewer() {
  const viewer = document.getElementById("ig-viewer");
  if (!viewer) return;
  viewer.querySelectorAll("[data-close-viewer]").forEach(el => { el.addEventListener("click", closeHighlightViewer); });
  const menuBtn = document.getElementById("ig-viewer-menu-btn");
  const menu = document.getElementById("ig-viewer-menu");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener("click", e => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) menu.hidden = true;
    });
  }
  const addBtn = document.getElementById("ig-viewer-add");
  const fileInput = document.getElementById("ig-hl-file-input");
  if (addBtn && fileInput) {
    addBtn.addEventListener("click", () => { menu.hidden = true; fileInput.click(); });
    fileInput.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file && activeHighlightId) addPhotoToHighlight(activeHighlightId, file);
      fileInput.value = "";
    });
  }
  const deleteHlBtn = document.getElementById("ig-viewer-delete");
  if (deleteHlBtn) {
    deleteHlBtn.addEventListener("click", () => {
      if (!activeHighlightId) return;
      menu.hidden = true;
      const id = activeHighlightId;
      openConfirm("Delete highlight?", "This will remove the entire highlight and all its photos. This can't be undone.", () => deleteHighlight(id));
    });
  }
}

function setupGalleryUpload() {
  const fab = document.getElementById("ig-fab");
  const fileInput = document.getElementById("ig-file-input");
  const oursInput = document.getElementById("ig-ours-file-input");
  const modal = document.getElementById("ig-modal");
  const postBtn = document.getElementById("ig-post-btn");
  const confirm = document.getElementById("ig-confirm");
  const confirmDeleteBtn = document.getElementById("ig-confirm-delete");
  if (!fab || !fileInput || !modal || !postBtn) return;

  fab.addEventListener("click", () => {
    if (currentGalleryTab === "ours") oursInput.click();
    else fileInput.click();
  });

  fileInput.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) openModal(file, "posts");
    fileInput.value = "";
  });

  oursInput.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) openModal(file, "ours");
    oursInput.value = "";
  });

  modal.querySelectorAll("[data-close-modal]").forEach(el => { el.addEventListener("click", closeModal); });
  confirm.querySelectorAll("[data-close-confirm]").forEach(el => { el.addEventListener("click", closeConfirm); });
  postBtn.addEventListener("click", sharePost);
  confirmDeleteBtn.addEventListener("click", confirmDelete);
}

function setupGalleryTabs() {
  const tabs = document.querySelectorAll(".ig-tab[data-ig-tab]");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentGalleryTab = tab.dataset.igTab;
      renderGallery();
    });
  });
}

function setupMemories() {
  const addBtn = document.getElementById("mem-add-btn");
  if (addBtn) addBtn.addEventListener("click", () => openMemoryModal());

  const modal = document.getElementById("mem-modal");
  if (!modal) return;

  modal.querySelectorAll("[data-close-mem]").forEach(el => { el.addEventListener("click", closeMemoryModal); });

  const fileInput = document.getElementById("mem-input-files");
  const preview = document.getElementById("mem-photo-preview");
  const addPhotoBtn = document.getElementById("mem-add-photo-btn");

  if (addPhotoBtn && fileInput) {
    addPhotoBtn.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", e => {
      const files = Array.from(e.target.files || []);
      files.forEach(file => {
        memoryDraftPhotos.push(file);
        memoryEditingPhotos.push({ id: `draft_${Date.now()}_${Math.random()}`, url: URL.createObjectURL(file), isNew: true, file });
      });
      renderMemoryPhotoPreview(preview);
      fileInput.value = "";
    });
  }

  const submitBtn = document.getElementById("mem-modal-submit");
  if (submitBtn) submitBtn.addEventListener("click", saveMemory);

  const viewer = document.getElementById("mem-viewer");
  if (viewer) {
    viewer.querySelectorAll("[data-close-mem-viewer]").forEach(el => { el.addEventListener("click", closeMemoryViewer); });
    document.addEventListener("keydown", e => {
      if (viewer.hidden) return;
      if (e.key === "Escape") closeMemoryViewer();
    });
  }
}

/* ---------- Theme Toggle ---------- */
function setupTheme() {
  const toggle = document.getElementById("theme-toggle");
  const root = document.documentElement;

  const saved = localStorage.getItem("hg-theme");
  if (saved === "dark" || saved === "light") {
    root.setAttribute("data-theme", saved);
  } else {
    root.setAttribute("data-theme", "light");
  }

  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("hg-theme", next);
  });
}

/* ---------- Top Nav Tabs ---------- */
function setupTopNav() {
  const navItems = document.querySelectorAll(".us-topnav-item[data-tab]");
  const panels = document.querySelectorAll(".us-panel");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const tab = item.dataset.tab;
      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      panels.forEach(p => p.classList.remove("active"));
      const panel = document.getElementById(`us-${tab}-panel`);
      if (panel) panel.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------- Chapter Links (for [data-goto]) ---------- */
function setupChapterLinks() {
  const links = document.querySelectorAll("[data-goto]");
  const navItems = document.querySelectorAll(".us-topnav-item[data-tab]");
  const panels = document.querySelectorAll(".us-panel");

  links.forEach(link => {
    link.addEventListener("click", () => {
      const target = link.dataset.goto;
      navItems.forEach(i => i.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));

      const navBtn = document.querySelector(`.us-topnav-item[data-tab="${target}"]`);
      if (navBtn) navBtn.classList.add("active");

      const panel = document.getElementById(`us-${target}-panel`);
      if (panel) panel.classList.add("active");

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------- Topbar Scroll State ---------- */
function setupTopbarScroll() {
  const topbar = document.querySelector(".us-topbar");
  if (!topbar) return;

  const update = () => {
    if (window.scrollY > 40) topbar.classList.add("scrolled");
    else topbar.classList.remove("scrolled");
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
}

/* ---------- Parallax Hero ---------- */
function setupParallax() {
  const hero = document.querySelector(".parallax-hero");
  if (!hero) return;

  const layers = hero.querySelectorAll(".parallax-layer");
  if (!layers.length) return;

  let ticking = false;

  const update = () => {
    const rect = hero.getBoundingClientRect();
    const scrolled = -rect.top;
    if (scrolled < -window.innerHeight || scrolled > window.innerHeight) {
      ticking = false;
      return;
    }
    layers.forEach(layer => {
      const speed = parseFloat(layer.dataset.speed) || 0.3;
      const y = scrolled * speed;
      layer.style.transform = `translate3d(0, ${y}px, 0) scale(1.05)`;
    });
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(update);
      ticking = true;
    }
  };

  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
}

/* ---------- Scroll Reveal ---------- */
function setupScrollReveal() {
  const elements = document.querySelectorAll(".reveal");
  if (!elements.length) return;

  if (!("IntersectionObserver" in window)) {
    elements.forEach(el => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const delay = parseInt(entry.target.dataset.delay || "0", 10);
        setTimeout(() => entry.target.classList.add("is-visible"), delay);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -80px 0px" });

  elements.forEach(el => observer.observe(el));
}

/* ---------- Init ---------- */
function init() {
  setupTheme();
  setupTopNav();
  setupChapterLinks();
  setupTopbarScroll();
  setupParallax();
  setupScrollReveal();
  setupGalleryTabs();
  setupBoard("for-guile");
  setupBoard("for-hera");
  setupGalleryUpload();
  setupHighlights();
  setupHighlightViewer();
  setupMemories();
  subscribeToBoard("for-guile");
  subscribeToBoard("for-hera");
  subscribeToPhotos();
  subscribeToOursPhotos();
  subscribeToHighlights();
  subscribeToMemories();
  firestoreReady = true;
  startCounter();
}

init();