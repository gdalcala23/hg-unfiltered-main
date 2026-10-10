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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const START_DATE = "2026-02-23T00:00:00Z";

let counterTimer = null;
let firestoreReady = false;

const notesData = {
  "for-guile": [],
  "for-hera": []
};

const boardState = {
  "for-guile": { search: "", sort: "recent", editingId: null },
  "for-hera": { search: "", sort: "recent", editingId: null }
};

let photosData = [];
let highlightsData = [];
let pendingFile = null;
let currentGalleryTab = "posts";
let activeMenuPhotoId = null;
let activeHighlightId = null;
let pendingDeleteAction = null;

function updateCounter() {
  const start = new Date(START_DATE).getTime();
  const now = Date.now();
  const diff = now - start;

  const valueEl = document.getElementById("us-counter-value");
  const subEl = document.getElementById("us-counter-sub");
  if (!valueEl || !subEl) return;

  if (isNaN(start)) {
    valueEl.textContent = "—";
    subEl.textContent = "set START_DATE in us.js";
    return;
  }

  if (diff < 0) {
    valueEl.textContent = "—";
    subEl.textContent = "counting starts on Feb 23, 2026";
    return;
  }

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
    if (typeof value === "object" && typeof value.toDate === "function") {
      d = value.toDate();
    } else {
      d = new Date(value);
    }
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    }) + " · " + d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

/* ---------- Notes ---------- */
function applyFilters(notes, state) {
  let list = [...notes];

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(n =>
      (n.title || "").toLowerCase().includes(q) ||
      (n.text || "").toLowerCase().includes(q)
    );
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
  if (note.title) {
    titleText.textContent = note.title;
  } else {
    titleText.textContent = "A note";
    titleText.style.opacity = "0.5";
  }
  title.appendChild(titleText);

  const date = document.createElement("div");
  date.className = "note-item-date";
  let dateLabel = formatDate(note.date);
  if (note.edited && note.editedAt) {
    dateLabel = `edited · ${formatDate(note.editedAt)}`;
  }
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

  if (!firestoreReady && notes.length === 0) {
    list.innerHTML = `<div class="note-empty">Connecting to shared notes...</div>`;
    return;
  }

  if (notes.length === 0) {
    list.innerHTML = `<div class="note-empty">No notes yet — be the first to write one.</div>`;
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = `<div class="note-empty">No notes match your search.</div>`;
    return;
  }

  list.innerHTML = "";
  filtered.forEach(note => {
    list.appendChild(buildNoteCard(boardId, note, state));
  });
}

async function addNote(boardId, title, text) {
  try {
    await addDoc(collection(db, "notes_" + boardId), {
      title: title.trim(),
      text: text.trim(),
      date: serverTimestamp(),
      edited: false,
      editedAt: null,
      pinned: false
    });
  } catch (err) {
    console.error("addNote failed:", err);
    alert("Failed to save note. Check your connection.");
  }
}

async function updateNote(boardId, noteId, title, text) {
  try {
    const ref = doc(db, "notes_" + boardId, noteId);
    await updateDoc(ref, {
      title: title.trim(),
      text: text.trim(),
      edited: true,
      editedAt: serverTimestamp()
    });
    boardState[boardId].editingId = null;
    resetForm(boardId);
  } catch (err) {
    console.error("updateNote failed:", err);
  }
}

async function deleteNote(boardId, noteId) {
  try {
    await deleteDoc(doc(db, "notes_" + boardId, noteId));
    if (boardState[boardId].editingId === noteId) {
      boardState[boardId].editingId = null;
      resetForm(boardId);
    }
  } catch (err) {
    console.error("deleteNote failed:", err);
  }
}

async function togglePin(boardId, noteId) {
  const note = notesData[boardId].find(n => n.id === noteId);
  if (!note) return;
  try {
    await updateDoc(doc(db, "notes_" + boardId, noteId), {
      pinned: !note.pinned
    });
  } catch (err) {
    console.error("togglePin failed:", err);
  }
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
  const titleInput = form.querySelector(".note-title-input");
  const textInput = form.querySelector(".note-textarea");
  const submitBtn = form.querySelector(".note-submit");
  const cancelBtn = form.querySelector(".note-cancel-btn");

  titleInput.value = "";
  textInput.value = "";
  submitBtn.textContent = "Add Note";
  cancelBtn.hidden = true;
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

    if (!text.trim()) {
      textInput.focus();
      return;
    }

    const editingId = boardState[boardId].editingId;
    if (editingId) {
      updateNote(boardId, editingId, title, text);
    } else {
      addNote(boardId, title, text);
      titleInput.value = "";
      textInput.value = "";
      textInput.focus();
    }
  });

  cancelBtn.addEventListener("click", () => {
    boardState[boardId].editingId = null;
    resetForm(boardId);
    renderBoard(boardId);
  });

  textInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  const board = document.querySelector(`.note-board[data-board="${boardId}"]`);
  const searchInput = board.querySelector(".note-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      boardState[boardId].search = searchInput.value;
      renderBoard(boardId);
    });
  }

  const filterBtns = board.querySelectorAll(".note-filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      boardState[boardId].sort = btn.dataset.sort;
      renderBoard(boardId);
    });
  });
}

function subscribeToBoard(boardId) {
  const colRef = collection(db, "notes_" + boardId);
  onSnapshot(
    colRef,
    snapshot => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      notesData[boardId] = items;
      renderBoard(boardId);
    },
    err => {
      console.error(`Firestore subscription failed (${boardId}):`, err);
      const list = document.getElementById(`list-${boardId}`);
      if (list) {
        list.innerHTML = `<div class="note-empty">Could not connect to shared notes.</div>`;
      }
    }
  );
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
  addBtn.innerHTML = `
    <div class="ig-highlight-circle ig-highlight-add">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </div>
    <span class="ig-highlight-label">New</span>
  `;
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
    } else {
      circle.classList.add("ig-highlight-empty");
    }

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
  const colRef = collection(db, "highlights");
  onSnapshot(
    colRef,
    snapshot => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      highlightsData = items;
      renderHighlights();
      if (activeHighlightId) {
        renderHighlightViewer();
      }
    },
    err => {
      console.error("Highlights subscription failed:", err);
    }
  );
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
  if (!name) {
    input.focus();
    return;
  }

  const btn = document.getElementById("ig-hl-create");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    await addDoc(collection(db, "highlights"), {
      name,
      createdAt: serverTimestamp(),
      photos: [],
      coverUrl: null
    });
    closeHighlightModal();
  } catch (err) {
    console.error("createHighlight failed:", err);
    alert("Could not create highlight.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Highlight";
  }
}

/* ---------- Highlight Viewer ---------- */
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
  if (!hl) {
    closeHighlightViewer();
    return;
  }

  const title = document.getElementById("ig-viewer-title");
  title.textContent = hl.name;

  const grid = document.getElementById("ig-viewer-grid");
  grid.innerHTML = "";

  const photos = hl.photos || [];

  if (photos.length === 0) {
    grid.innerHTML = `
      <div class="ig-viewer-empty">
        <div class="ig-viewer-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <p class="ig-viewer-empty-title">No photos yet</p>
        <p class="ig-viewer-empty-sub">Tap the menu at the top-right to add photos.</p>
      </div>
    `;
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
    img.onerror = () => {
      img.style.display = "none";
      const fallback = document.createElement("div");
      fallback.className = "ig-cell-fallback";
      fallback.textContent = "⚠️";
      cell.appendChild(fallback);
    };

    const del = document.createElement("button");
    del.type = "button";
    del.className = "ig-viewer-cell-delete";
    del.title = "Remove photo";
    del.setAttribute("aria-label", "Remove photo");
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener("click", e => {
      e.stopPropagation();
      deletePhotoFromHighlight(hl.id, p.id);
    });

    cell.appendChild(img);
    cell.appendChild(del);
    grid.appendChild(cell);
  });
}

async function deletePhotoFromHighlight(hlId, photoId) {
  const hl = highlightsData.find(h => h.id === hlId);
  if (!hl) return;

  const photos = hl.photos || [];
  const newPhotos = photos.filter(p => p.id !== photoId);
  const newCover = photos[0]?.id === photoId
    ? (newPhotos[0]?.url || null)
    : hl.coverUrl;

  try {
    await updateDoc(doc(db, "highlights", hlId), {
      photos: newPhotos,
      coverUrl: newCover
    });
  } catch (err) {
    console.error("deletePhotoFromHighlight failed:", err);
  }
}

async function deleteHighlight(hlId) {
  const hl = highlightsData.find(h => h.id === hlId);
  if (!hl) return;

  try {
    await deleteDoc(doc(db, "highlights", hlId));
    closeHighlightViewer();
  } catch (err) {
    console.error("deleteHighlight failed:", err);
  }
}

async function addPhotoToHighlight(hlId, file) {
  const hl = highlightsData.find(h => h.id === hlId);
  if (!hl) return;

  const btn = document.getElementById("ig-viewer-add");
  if (btn) {
    btn.disabled = true;
  }

  try {
    const url = await uploadToImgBB(file);

    const newPhoto = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      url,
      date: new Date().toISOString()
    };

    const photos = [...(hl.photos || []), newPhoto];
    const newCover = hl.coverUrl || url;

    await updateDoc(doc(db, "highlights", hlId), {
      photos,
      coverUrl: newCover
    });
  } catch (err) {
    console.error("addPhotoToHighlight failed:", err);
    alert("Could not add photo. Try again.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---------- Gallery (Posts) ---------- */
async function uploadToImgBB(file) {
  const form = new FormData();
  form.append("image", file);

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: "POST",
    body: form
  });

  if (!res.ok) throw new Error(`ImgBB upload failed: ${res.status}`);
  const json = await res.json();
  if (!json?.data?.url) throw new Error("ImgBB returned no URL");
  return json.data.url;
}

function buildPhotoCell(photo) {
  const cell = document.createElement("div");
  cell.className = "ig-cell";
  cell.dataset.id = photo.id;

  const img = document.createElement("img");
  img.src = photo.url;
  img.alt = photo.caption || "Photo";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.crossOrigin = "anonymous";
  img.onerror = () => {
    console.warn("Image failed to load:", photo.url);
    img.style.display = "none";
    const fallback = document.createElement("div");
    fallback.className = "ig-cell-fallback";
    fallback.textContent = "⚠️ Image unavailable";
    cell.appendChild(fallback);
  };

  const overlay = document.createElement("div");
  overlay.className = "ig-cell-overlay";

  if (photo.caption) {
    const cap = document.createElement("div");
    cap.className = "ig-cell-caption";
    cap.textContent = photo.caption;
    overlay.appendChild(cap);
  }

  const actions = document.createElement("div");
  actions.className = "ig-cell-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "ig-cell-action ig-cell-save" + (photo.saved ? " saved" : "");
  saveBtn.title = photo.saved ? "Unsave" : "Save";
  saveBtn.setAttribute("aria-label", photo.saved ? "Unsave" : "Save");
  saveBtn.innerHTML = photo.saved
    ? `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  saveBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleSave(photo.id, !photo.saved);
  });

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "ig-cell-action ig-cell-menu";
  menuBtn.title = "More";
  menuBtn.setAttribute("aria-label", "More options");
  menuBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
  menuBtn.addEventListener("click", e => {
    e.stopPropagation();
    openPhotoMenu(photo.id);
  });

  actions.appendChild(saveBtn);
  actions.appendChild(menuBtn);
  overlay.appendChild(actions);

  cell.appendChild(img);
  cell.appendChild(overlay);

  return cell;
}

function renderGallery() {
  const grid = document.getElementById("ig-grid");
  const count = document.getElementById("ig-post-count");
  if (!grid) return;

  const visible = currentGalleryTab === "saved"
    ? photosData.filter(p => p.saved)
    : photosData;

  if (count) count.textContent = photosData.length;

  if (visible.length === 0) {
    if (currentGalleryTab === "saved") {
      grid.innerHTML = `
        <div class="ig-empty">
          <div class="ig-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p class="ig-empty-title">No saved photos yet</p>
          <p class="ig-empty-sub">Tap the bookmark icon on any photo to save it here.</p>
        </div>
      `;
    } else {
      grid.innerHTML = `
        <div class="ig-empty" id="ig-empty">
          <div class="ig-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <p class="ig-empty-title">No photos yet</p>
          <p class="ig-empty-sub">Start by adding your first moment together.</p>
          <button type="button" class="ig-empty-btn" id="ig-empty-add">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Add your first photo</span>
          </button>
        </div>
      `;
      const addBtn = grid.querySelector("#ig-empty-add");
      if (addBtn) addBtn.addEventListener("click", () => document.getElementById("ig-file-input").click());
    }
    return;
  }

  grid.innerHTML = "";

  const sorted = [...visible].sort((a, b) => {
    const ta = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date || 0).getTime();
    const tb = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date || 0).getTime();
    return tb - ta;
  });

  sorted.forEach(photo => {
    grid.appendChild(buildPhotoCell(photo));
  });
}

function subscribeToPhotos() {
  const colRef = collection(db, "photos");
  onSnapshot(
    colRef,
    snapshot => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      photosData = items;
      renderGallery();
    },
    err => {
      console.error("Photos subscription failed:", err);
      const grid = document.getElementById("ig-grid");
      if (grid) {
        grid.innerHTML = `<div class="ig-empty"><p class="ig-empty-title">Could not load photos.</p></div>`;
      }
    }
  );
}

function openModal(file) {
  pendingFile = file;
  const modal = document.getElementById("ig-modal");
  const previewImg = document.getElementById("ig-modal-preview-img");
  const captionInput = document.getElementById("ig-caption-input");

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

  btn.disabled = true;
  btn.textContent = "Uploading...";

  try {
    const url = await uploadToImgBB(pendingFile);

    await addDoc(collection(db, "photos"), {
      url,
      caption,
      date: serverTimestamp(),
      saved: false
    });

    closeModal();
  } catch (err) {
    console.error("Share failed:", err);
    alert("Upload failed. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Share";
  }
}

async function toggleSave(photoId, save) {
  try {
    await updateDoc(doc(db, "photos", photoId), { saved: save });
  } catch (err) {
    console.error("toggleSave failed:", err);
  }
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
  } else {
    closeConfirm();
  }
}

/* ---------- Photo menu (Posts) ---------- */
function openPhotoMenu(photoId) {
  activeMenuPhotoId = photoId;
  const menu = document.getElementById("ig-menu");
  menu.hidden = false;
}

function closePhotoMenu() {
  activeMenuPhotoId = null;
  const menu = document.getElementById("ig-menu");
  menu.hidden = true;
}

function menuDownload() {
  if (!activeMenuPhotoId) return;
  const photo = photosData.find(p => p.id === activeMenuPhotoId);
  closePhotoMenu();
  if (!photo) return;
  window.open(photo.url, "_blank", "noopener,noreferrer");
}

function menuDelete() {
  if (!activeMenuPhotoId) return;
  const id = activeMenuPhotoId;
  closePhotoMenu();
  openConfirm(
    "Delete photo?",
    "This will remove the photo from the gallery. This can't be undone.",
    () => deleteDoc(doc(db, "photos", id))
  );
}

/* ---------- Setup functions ---------- */
function setupHighlights() {
  const modal = document.getElementById("ig-hl-modal");
  if (!modal) return;

  modal.querySelectorAll("[data-close-hl]").forEach(el => {
    el.addEventListener("click", closeHighlightModal);
  });

  const createBtn = document.getElementById("ig-hl-create");
  if (createBtn) createBtn.addEventListener("click", createHighlight);

  const nameInput = document.getElementById("ig-hl-name");
  const counter = document.getElementById("ig-hl-counter");

  if (nameInput) {
    nameInput.addEventListener("input", () => {
      if (counter) counter.textContent = nameInput.value.length;
    });

    nameInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        createHighlight();
      }
    });
  }
}

function setupHighlightViewer() {
  const viewer = document.getElementById("ig-viewer");
  if (!viewer) return;

  viewer.querySelectorAll("[data-close-viewer]").forEach(el => {
    el.addEventListener("click", closeHighlightViewer);
  });

  const menuBtn = document.getElementById("ig-viewer-menu-btn");
  const menu = document.getElementById("ig-viewer-menu");

  if (menuBtn && menu) {
    menuBtn.addEventListener("click", e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });

    document.addEventListener("click", e => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) {
        menu.hidden = true;
      }
    });
  }

  const addBtn = document.getElementById("ig-viewer-add");
  const fileInput = document.getElementById("ig-hl-file-input");

  if (addBtn && fileInput) {
    addBtn.addEventListener("click", () => {
      menu.hidden = true;
      fileInput.click();
    });

    fileInput.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file && activeHighlightId) {
        addPhotoToHighlight(activeHighlightId, file);
      }
      fileInput.value = "";
    });
  }

  const deleteHlBtn = document.getElementById("ig-viewer-delete");
  if (deleteHlBtn) {
    deleteHlBtn.addEventListener("click", () => {
      if (!activeHighlightId) return;
      menu.hidden = true;
      const id = activeHighlightId;
      openConfirm(
        "Delete highlight?",
        "This will remove the entire highlight and all its photos. This can't be undone.",
        () => deleteHighlight(id)
      );
    });
  }
}

function setupPhotoMenu() {
  const menu = document.getElementById("ig-menu");
  if (!menu) return;

  menu.querySelectorAll("[data-close-menu]").forEach(el => {
    el.addEventListener("click", closePhotoMenu);
  });

  const dlBtn = document.getElementById("ig-menu-download");
  const delBtn = document.getElementById("ig-menu-delete");

  if (dlBtn) dlBtn.addEventListener("click", menuDownload);
  if (delBtn) delBtn.addEventListener("click", menuDelete);
}

function setupGalleryUpload() {
  const fab = document.getElementById("ig-fab");
  const fileInput = document.getElementById("ig-file-input");
  const modal = document.getElementById("ig-modal");
  const postBtn = document.getElementById("ig-post-btn");
  const confirm = document.getElementById("ig-confirm");
  const confirmDeleteBtn = document.getElementById("ig-confirm-delete");

  fab.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (file) openModal(file);
    fileInput.value = "";
  });

  modal.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", closeModal);
  });

  confirm.querySelectorAll("[data-close-confirm]").forEach(el => {
    el.addEventListener("click", closeConfirm);
  });

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

function setupUsTabs() {
  const navItems = document.querySelectorAll(".us-nav-item[data-tab]");
  const panels = document.querySelectorAll(".us-panel");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const tab = item.dataset.tab;

      navItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      panels.forEach(p => p.classList.remove("active"));
      const panel = document.getElementById(`us-${tab}-panel`);
      if (panel) panel.classList.add("active");
    });
  });
}

function init() {
  setupUsTabs();
  setupGalleryTabs();
  setupBoard("for-guile");
  setupBoard("for-hera");
  setupGalleryUpload();
  setupHighlights();
  setupHighlightViewer();
  setupPhotoMenu();
  subscribeToBoard("for-guile");
  subscribeToBoard("for-hera");
  subscribeToPhotos();
  subscribeToHighlights();
  firestoreReady = true;
  startCounter();
}

init();