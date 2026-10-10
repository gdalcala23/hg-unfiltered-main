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
const BURGER_START = "2024-10-04T00:00:00Z";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let photosData = [];
let pendingFile = null;
let pendingDeleteId = null;
let counterTimer = null;

/* ---------- MinesBurger state ---------- */
const MB_SIZE = 16;
const MB_MINES = 40;

const mbState = {
  board: [],
  revealed: [],
  flagged: [],
  explodedIndex: null,
  started: false,
  gameOver: false,
  won: false,
  flagsUsed: 0,
  timerStart: null,
  timerInterval: null
};

/* ---------- Match 3 state ---------- */
const MM_ICONS = ["🐟", "🍗", "🥛", "🐾", "🧶", "🎣", "🐭", "🐈", "🐱", "🌙", "⭐", "🌸"];
const MM_PAIRS = 12;
const MM_COLS = 6;

const mmState = {
  cards: [],
  flipped: [],
  matched: [],
  moves: 0,
  playing: false,
  checking: false,
  timerStart: null,
  timerInterval: null,
  duration: 120
};

/* ---------- Age counter ---------- */
function updateBurgerAge() {
  const start = new Date(BURGER_START).getTime();
  const now = Date.now();
  const diff = now - start;

  const counterEl = document.getElementById("burgerCounter");
  const ageShortEl = document.getElementById("burgerAgeShort");
  if (!counterEl) return;

  if (diff < 0) {
    counterEl.textContent = "—";
    return;
  }

  const startDate = new Date(BURGER_START);
  const nowDate = new Date();

  let years = nowDate.getFullYear() - startDate.getFullYear();
  let months = nowDate.getMonth() - startDate.getMonth();
  let days = nowDate.getDate() - startDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  counterEl.textContent = `${years} year${years !== 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""}, ${days} day${days !== 1 ? "s" : ""}`;

  if (ageShortEl) {
    ageShortEl.textContent = `${years}y ${months}m`;
  }
}

function startAgeCounter() {
  if (counterTimer) clearInterval(counterTimer);
  updateBurgerAge();
  counterTimer = setInterval(updateBurgerAge, 60000);
}

function setChaosLevel() {
  const el = document.getElementById("chaosLevel");
  if (!el) return;
  const hour = new Date().getHours();

  if (hour >= 2 && hour < 6) {
    el.textContent = "Zoomies ⚡";
  } else if (hour >= 6 && hour < 12) {
    el.textContent = "High 🌪️";
  } else if (hour >= 12 && hour < 18) {
    el.textContent = "Medium 🐾";
  } else {
    el.textContent = "Low 😴";
  }
}

/* ---------- Image upload ---------- */
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

/* ---------- Photo cell ---------- */
function buildBurgerCell(photo) {
  const cell = document.createElement("div");
  cell.className = "burger-cell";
  cell.dataset.id = photo.id;

  const img = document.createElement("img");
  img.src = photo.url;
  img.alt = photo.caption || "Burger photo";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.crossOrigin = "anonymous";
  img.onerror = () => {
    img.style.display = "none";
    const fallback = document.createElement("div");
    fallback.className = "burger-cell-fallback";
    fallback.textContent = "⚠️";
    cell.appendChild(fallback);
  };

  const overlay = document.createElement("div");
  overlay.className = "burger-cell-overlay";

  const actions = document.createElement("div");
  actions.className = "burger-cell-actions";

  const likeBtn = document.createElement("button");
  likeBtn.type = "button";
  likeBtn.className = "burger-cell-action burger-cell-like" + (photo.liked ? " liked" : "");
  likeBtn.title = photo.liked ? "Unlike" : "Like";
  likeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
  likeBtn.addEventListener("click", e => {
    e.stopPropagation();
    toggleLike(photo.id, !photo.liked);
    spawnBurst(e.clientX, e.clientY, photo.liked ? "💔" : "🧡");
  });

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "burger-cell-action burger-cell-delete";
  delBtn.title = "Delete";
  delBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
  delBtn.addEventListener("click", e => {
    e.stopPropagation();
    openConfirm(photo.id);
  });

  actions.appendChild(likeBtn);
  actions.appendChild(delBtn);

  const meta = document.createElement("div");
  meta.className = "burger-cell-meta";

  if (photo.likes && photo.likes > 0) {
    const likeCount = document.createElement("span");
    likeCount.className = "burger-like-count";
    likeCount.textContent = `🧡 ${photo.likes}`;
    meta.appendChild(likeCount);
  }

  overlay.appendChild(actions);

  if (photo.caption) {
    const cap = document.createElement("div");
    cap.className = "burger-cell-caption";
    cap.textContent = photo.caption;
    overlay.appendChild(cap);
  }

  overlay.appendChild(meta);

  cell.appendChild(img);
  cell.appendChild(overlay);

  return cell;
}

function renderBurgerGallery() {
  const grid = document.getElementById("burgerGrid");
  const count = document.getElementById("burgerPhotoCount");
  const likeTotal = document.getElementById("burgerLikeCount");
  if (!grid) return;

  if (count) count.textContent = photosData.length;
  if (likeTotal) {
    const total = photosData.reduce((sum, p) => sum + (p.likes || 0), 0);
    likeTotal.textContent = total;
  }

  if (photosData.length === 0) {
    grid.innerHTML = `
      <div class="burger-empty">
        <div class="burger-empty-icon">🐱</div>
        <p class="burger-empty-title">No photos of Burger yet</p>
        <p class="burger-empty-sub">Start by adding your favorite moment of our orange baby.</p>
        <button type="button" class="burger-empty-btn" id="burgerEmptyAdd">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add first photo</span>
        </button>
      </div>
    `;
    const emptyAdd = grid.querySelector("#burgerEmptyAdd");
    if (emptyAdd) {
      emptyAdd.addEventListener("click", () => document.getElementById("burgerFileInput").click());
    }
    return;
  }

  grid.innerHTML = "";

  const sorted = [...photosData].sort((a, b) => {
    const ta = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date || 0).getTime();
    const tb = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date || 0).getTime();
    return tb - ta;
  });

  sorted.forEach(photo => {
    grid.appendChild(buildBurgerCell(photo));
  });
}

function subscribeToPhotos() {
  const colRef = collection(db, "burger_photos");
  onSnapshot(
    colRef,
    snapshot => {
      const items = [];
      snapshot.forEach(docSnap => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      photosData = items;
      renderBurgerGallery();
    },
    err => {
      console.error("Burger photos subscription failed:", err);
      const grid = document.getElementById("burgerGrid");
      if (grid) {
        grid.innerHTML = `<div class="burger-empty"><div class="burger-empty-icon">😿</div><p class="burger-empty-title">Could not load photos</p></div>`;
      }
    }
  );
}

async function toggleLike(photoId, liked) {
  const photo = photosData.find(p => p.id === photoId);
  if (!photo) return;

  const newLikes = liked ? (photo.likes || 0) + 1 : Math.max(0, (photo.likes || 0) - 1);

  try {
    await updateDoc(doc(db, "burger_photos", photoId), {
      liked,
      likes: newLikes
    });
  } catch (err) {
    console.error("toggleLike failed:", err);
  }
}

/* ---------- Photo Modal ---------- */
function openModal(file) {
  pendingFile = file;
  const modal = document.getElementById("burgerModal");
  const previewImg = document.getElementById("burgerModalPreview");
  const captionInput = document.getElementById("burgerCaptionInput");

  const url = URL.createObjectURL(file);
  previewImg.src = url;
  previewImg.onload = () => URL.revokeObjectURL(url);

  captionInput.value = "";
  modal.hidden = false;
  setTimeout(() => captionInput.focus(), 100);
}

function closeModal() {
  const modal = document.getElementById("burgerModal");
  modal.hidden = true;
  pendingFile = null;
}

async function sharePost() {
  if (!pendingFile) return;

  const btn = document.getElementById("burgerPostBtn");
  const caption = document.getElementById("burgerCaptionInput").value.trim();

  btn.disabled = true;
  btn.textContent = "Uploading...";

  try {
    const url = await uploadToImgBB(pendingFile);

    await addDoc(collection(db, "burger_photos"), {
      url,
      caption,
      date: serverTimestamp(),
      likes: 0,
      liked: false
    });

    closeModal();
  } catch (err) {
    console.error("Share failed:", err);
    alert("Upload failed. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Share 🐾";
  }
}

function openConfirm(photoId) {
  pendingDeleteId = photoId;
  const confirm = document.getElementById("burgerConfirm");
  confirm.hidden = false;
}

function closeConfirm() {
  pendingDeleteId = null;
  const confirm = document.getElementById("burgerConfirm");
  confirm.hidden = true;
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  const id = pendingDeleteId;
  closeConfirm();

  try {
    await deleteDoc(doc(db, "burger_photos", id));
    spawnBurst(window.innerWidth / 2, window.innerHeight / 2, "✨");
  } catch (err) {
    console.error("Delete failed:", err);
  }
}

/* ---------- Cursor cat + emoji burst ---------- */
function setupCursorCat() {
  const cursorCat = document.getElementById("cursorCat");
  if (!cursorCat) return;

  const isTouch = window.matchMedia("(hover: none)").matches;
  if (isTouch) {
    cursorCat.style.display = "none";
    return;
  }

  let mouseX = 0;
  let mouseY = 0;
  let catX = 0;
  let catY = 0;
  let raf = null;

  document.addEventListener("mousemove", e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!raf) loop();
  });

  function loop() {
    catX += (mouseX - catX) * 0.12;
    catY += (mouseY - catY) * 0.12;
    cursorCat.style.left = catX + "px";
    cursorCat.style.top = catY + "px";

    if (Math.abs(mouseX - catX) > 0.5 || Math.abs(mouseY - catY) > 0.5) {
      raf = requestAnimationFrame(loop);
    } else {
      raf = null;
    }
  }
}

function spawnBurst(x, y, emoji) {
  const layer = document.getElementById("emojiBurstLayer");
  if (!layer) return;

  const el = document.createElement("div");
  el.className = "emoji-burst";
  el.textContent = emoji;
  el.style.left = x + "px";
  el.style.top = y + "px";
  layer.appendChild(el);

  setTimeout(() => el.remove(), 1000);
}

function setupClickBurst() {
  const emojis = ["🐾", "🐱", "🧡", "💜", "✨", "🐟"];

  document.addEventListener("click", e => {
    if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input") || e.target.closest("textarea") || e.target.closest("select")) {
      return;
    }
    if (e.target.closest(".mb-board")) return;
    if (e.target.closest(".mm-board")) return;
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    spawnBurst(e.clientX, e.clientY, emoji);
  });
}

/* ---------- Setup: Upload ---------- */
function setupUpload() {
  const fab = document.getElementById("burgerFab");
  const fileInput = document.getElementById("burgerFileInput");
  const modal = document.getElementById("burgerModal");
  const postBtn = document.getElementById("burgerPostBtn");
  const confirm = document.getElementById("burgerConfirm");
  const confirmDeleteBtn = document.getElementById("burgerConfirmDelete");

  if (fab && fileInput) {
    fab.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) openModal(file);
      fileInput.value = "";
    });
  }

  if (modal) {
    modal.querySelectorAll("[data-close-modal]").forEach(el => {
      el.addEventListener("click", closeModal);
    });
  }

  if (confirm) {
    confirm.querySelectorAll("[data-close-confirm]").forEach(el => {
      el.addEventListener("click", closeConfirm);
    });
  }

  if (postBtn) postBtn.addEventListener("click", sharePost);
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDelete);
}

/* ---------- Setup: Sidebar nav ---------- */
function setupSidebarNav() {
  const navItems = document.querySelectorAll(".burger-nav-item[data-section]");
  const sections = document.querySelectorAll(".burger-section");
  const layout = document.querySelector(".burger-layout");
  const overlay = document.getElementById("burgerOverlay");
  const hamburger = document.getElementById("burgerHamburger");

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const target = item.dataset.section;

      navItems.forEach(n => n.classList.remove("active"));
      item.classList.add("active");

      sections.forEach(s => s.classList.remove("active"));
      const section = document.getElementById(`burger-${target}-section`);
      if (section) section.classList.add("active");

      closeMobileNav();
    });
  });

  if (hamburger) {
    hamburger.addEventListener("click", () => {
      const isOpen = layout.classList.toggle("nav-open");
      document.body.classList.toggle("burger-nav-open", isOpen);
      if (overlay) overlay.classList.toggle("active", isOpen);
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeMobileNav);
  }

  function closeMobileNav() {
    if (!layout) return;
    layout.classList.remove("nav-open");
    document.body.classList.remove("burger-nav-open");
    if (overlay) overlay.classList.remove("active");
  }
}

/* ---------- MinesBurger ---------- */
function mbIndex(r, c) {
  return r * MB_SIZE + c;
}

function mbInBounds(r, c) {
  return r >= 0 && r < MB_SIZE && c >= 0 && c < MB_SIZE;
}

function mbNeighbors(r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (mbInBounds(nr, nc)) out.push([nr, nc]);
    }
  }
  return out;
}

function mbCreateBoard() {
  const total = MB_SIZE * MB_SIZE;
  const board = Array(total).fill(0);

  let placed = 0;
  while (placed < MB_MINES) {
    const idx = Math.floor(Math.random() * total);
    if (board[idx] !== -1) {
      board[idx] = -1;
      placed++;
    }
  }

  for (let r = 0; r < MB_SIZE; r++) {
    for (let c = 0; c < MB_SIZE; c++) {
      if (board[mbIndex(r, c)] === -1) continue;
      let count = 0;
      mbNeighbors(r, c).forEach(([nr, nc]) => {
        if (board[mbIndex(nr, nc)] === -1) count++;
      });
      board[mbIndex(r, c)] = count;
    }
  }

  return board;
}

function mbReset() {
  mbState.board = mbCreateBoard();
  mbState.revealed = Array(MB_SIZE * MB_SIZE).fill(false);
  mbState.flagged = Array(MB_SIZE * MB_SIZE).fill(false);
  mbState.explodedIndex = null;
  mbState.started = false;
  mbState.gameOver = false;
  mbState.won = false;
  mbState.flagsUsed = 0;

  if (mbState.timerInterval) clearInterval(mbState.timerInterval);
  mbState.timerInterval = null;
  mbState.timerStart = null;

  const timerEl = document.getElementById("mbTimer");
  if (timerEl) timerEl.textContent = "0:00";

  const minesLeftEl = document.getElementById("mbMinesLeft");
  if (minesLeftEl) minesLeftEl.textContent = MB_MINES;

  const modal = document.getElementById("mbEndModal");
  if (modal) modal.hidden = true;

  mbRender();
}

function mbFormatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mbStartTimer() {
  if (mbState.timerInterval) return;
  mbState.timerStart = Date.now();
  mbState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - mbState.timerStart) / 1000);
    const timerEl = document.getElementById("mbTimer");
    if (timerEl) timerEl.textContent = mbFormatTime(elapsed);
  }, 1000);
}

function mbStopTimer() {
  if (mbState.timerInterval) {
    clearInterval(mbState.timerInterval);
    mbState.timerInterval = null;
  }
}

function mbGetElapsed() {
  if (!mbState.timerStart) return 0;
  return Math.floor((Date.now() - mbState.timerStart) / 1000);
}

function mbRender() {
  const boardEl = document.getElementById("mbBoard");
  if (!boardEl) return;

  boardEl.innerHTML = "";

  for (let r = 0; r < MB_SIZE; r++) {
    for (let c = 0; c < MB_SIZE; c++) {
      const idx = mbIndex(r, c);
      const cell = document.createElement("div");
      cell.className = "mb-cell";
      cell.dataset.idx = idx;

      if (mbState.revealed[idx]) {
        cell.classList.add("mb-cell-open");
        const val = mbState.board[idx];
        if (val === -1) {
          cell.classList.add("mb-cell-mine");
          if (idx === mbState.explodedIndex) {
            cell.classList.add("mb-cell-exploded");
          }
          cell.textContent = "🐟";
        } else if (val > 0) {
          cell.textContent = val;
          cell.classList.add(`mb-cell-num-${val}`);
        } else {
          cell.textContent = "";
        }
      } else if (mbState.flagged[idx]) {
        cell.classList.add("mb-cell-flag");
        cell.textContent = "🚩";
      } else {
        if (mbState.gameOver && !mbState.won && mbState.board[idx] === -1) {
          cell.classList.add("mb-cell-mine");
          cell.textContent = "🐟";
        }
        if (mbState.gameOver && !mbState.won && mbState.flagged[idx] && mbState.board[idx] !== -1) {
          cell.classList.add("mb-cell-wrong");
          cell.textContent = "❌";
        }
      }

      cell.addEventListener("click", () => mbHandleClick(idx));
      cell.addEventListener("contextmenu", e => {
        e.preventDefault();
        mbHandleFlag(idx);
      });

      let pressTimer = null;
      cell.addEventListener("touchstart", () => {
        pressTimer = setTimeout(() => {
          pressTimer = null;
          mbHandleFlag(idx);
        }, 450);
      }, { passive: true });

      cell.addEventListener("touchend", () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });

      cell.addEventListener("touchmove", () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });

      boardEl.appendChild(cell);
    }
  }

  const minesLeftEl = document.getElementById("mbMinesLeft");
  if (minesLeftEl) {
    minesLeftEl.textContent = Math.max(0, MB_MINES - mbState.flagsUsed);
  }
}

function mbHandleClick(idx) {
  if (mbState.gameOver) return;
  if (mbState.flagged[idx]) return;
  if (mbState.revealed[idx]) return;

  if (!mbState.started) {
    mbState.started = true;
    mbStartTimer();
  }

  const val = mbState.board[idx];

  if (val === -1) {
    mbState.revealed[idx] = true;
    mbState.explodedIndex = idx;
    mbState.gameOver = true;
    mbStopTimer();
    mbRender();
    mbShowEnd(false);
    return;
  }

  mbFloodReveal(idx);
  mbRender();
  mbCheckWin();
}

function mbFloodReveal(startIdx) {
  const stack = [startIdx];

  while (stack.length > 0) {
    const idx = stack.pop();
    if (mbState.revealed[idx]) continue;
    if (mbState.flagged[idx]) continue;

    mbState.revealed[idx] = true;
    const val = mbState.board[idx];

    if (val === 0) {
      const r = Math.floor(idx / MB_SIZE);
      const c = idx % MB_SIZE;
      mbNeighbors(r, c).forEach(([nr, nc]) => {
        const nIdx = mbIndex(nr, nc);
        if (!mbState.revealed[nIdx] && !mbState.flagged[nIdx]) {
          stack.push(nIdx);
        }
      });
    }
  }
}

function mbHandleFlag(idx) {
  if (mbState.gameOver) return;
  if (mbState.revealed[idx]) return;

  if (mbState.flagged[idx]) {
    mbState.flagged[idx] = false;
    mbState.flagsUsed = Math.max(0, mbState.flagsUsed - 1);
  } else {
    if (mbState.flagsUsed >= MB_MINES) return;
    mbState.flagged[idx] = true;
    mbState.flagsUsed++;
  }

  if (!mbState.started) {
    mbState.started = true;
    mbStartTimer();
  }

  mbRender();
  mbCheckWin();
}

function mbCheckWin() {
  let allSafeRevealed = true;

  for (let i = 0; i < mbState.board.length; i++) {
    if (mbState.board[i] !== -1 && !mbState.revealed[i]) {
      allSafeRevealed = false;
      break;
    }
  }

  if (allSafeRevealed) {
    mbState.gameOver = true;
    mbState.won = true;
    mbStopTimer();
    mbRender();
    mbShowEnd(true);
  }
}

function mbShowEnd(won) {
  const modal = document.getElementById("mbEndModal");
  const emoji = document.getElementById("mbEndEmoji");
  const title = document.getElementById("mbEndTitle");
  const sub = document.getElementById("mbEndSub");
  const timeEl = document.getElementById("mbEndTime");

  if (!modal) return;

  const elapsed = mbGetElapsed();

  if (won) {
    emoji.textContent = "🎉";
    title.textContent = "You win!";
    sub.textContent = "Burger is proud of you 🧡";
    spawnBurst(window.innerWidth / 2, window.innerHeight / 2, "🎉");
    spawnBurst(window.innerWidth / 2 - 60, window.innerHeight / 2, "🐟");
    spawnBurst(window.innerWidth / 2 + 60, window.innerHeight / 2, "🧡");
  } else {
    emoji.textContent = "🐟";
    title.textContent = "Caught by a fish!";
    sub.textContent = "Burger says: try again 🐾";
  }

  if (timeEl) timeEl.textContent = mbFormatTime(elapsed);

  modal.hidden = false;
}

function setupMinesBurger() {
  const resetBtn = document.getElementById("mbReset");
  const endRestart = document.getElementById("mbEndRestart");
  const endModal = document.getElementById("mbEndModal");

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      mbReset();
    });
  }

  if (endRestart) {
    endRestart.addEventListener("click", () => {
      if (endModal) endModal.hidden = true;
      mbReset();
    });
  }

  mbReset();
}

/* ---------- Match 3 ---------- */
function mmShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mmBuildDeck() {
  const chosen = mmShuffle(MM_ICONS).slice(0, MM_PAIRS);
  const deck = [];
  chosen.forEach((icon, i) => {
    deck.push({ id: `${i}-a`, icon, pairId: i });
    deck.push({ id: `${i}-b`, icon, pairId: i });
  });
  return mmShuffle(deck);
}

function mmFormatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mmReset() {
  if (mmState.timerInterval) clearInterval(mmState.timerInterval);
  mmState.timerInterval = null;
  mmState.timerStart = null;

  const durationSelect = document.getElementById("mmDifficulty");
  mmState.duration = Number(durationSelect?.value || 120);

  mmState.cards = mmBuildDeck();
  mmState.flipped = [];
  mmState.matched = [];
  mmState.moves = 0;
  mmState.playing = false;
  mmState.checking = false;

  const timerEl = document.getElementById("mmTimer");
  if (timerEl) {
    timerEl.textContent = mmFormatTime(mmState.duration);
    timerEl.classList.remove("warning");
  }

  const movesEl = document.getElementById("mmMoves");
  if (movesEl) movesEl.textContent = "0";

  const modal = document.getElementById("mmEndModal");
  if (modal) modal.hidden = true;

  const startBtn = document.getElementById("mmStart");
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = "Start 🐾";
  }

  mmRender();
}

function mmStart() {
  if (mmState.playing) return;

  const durationSelect = document.getElementById("mmDifficulty");
  mmState.duration = Number(durationSelect?.value || 120);

  mmState.playing = true;
  mmState.timerStart = Date.now();

  const startBtn = document.getElementById("mmStart");
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "Playing...";
  }

  mmState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - mmState.timerStart) / 1000);
    const remaining = Math.max(0, mmState.duration - elapsed);
    const timerEl = document.getElementById("mmTimer");
    if (timerEl) {
      timerEl.textContent = mmFormatTime(remaining);
      if (remaining <= 15) {
        timerEl.classList.add("warning");
      } else {
        timerEl.classList.remove("warning");
      }
    }
    if (remaining <= 0) {
      mmStopGame(false);
    }
  }, 1000);
}

function mmStopGame(won) {
  if (mmState.timerInterval) {
    clearInterval(mmState.timerInterval);
    mmState.timerInterval = null;
  }
  mmState.playing = false;

  const elapsed = mmState.timerStart
    ? Math.floor((Date.now() - mmState.timerStart) / 1000)
    : 0;

  const startBtn = document.getElementById("mmStart");
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = "Play again 🐾";
  }

  mmShowEnd(won, elapsed);
}

function mmShowEnd(won, elapsed) {
  const modal = document.getElementById("mmEndModal");
  const emoji = document.getElementById("mmEndEmoji");
  const title = document.getElementById("mmEndTitle");
  const sub = document.getElementById("mmEndSub");
  const timeEl = document.getElementById("mmEndTime");
  const movesEl = document.getElementById("mmEndMoves");

  if (!modal) return;

  if (won) {
    emoji.textContent = "🎉";
    title.textContent = "You win!";
    sub.textContent = "Burger is proud of you 🧡";
    spawnBurst(window.innerWidth / 2, window.innerHeight / 2, "🎉");
    spawnBurst(window.innerWidth / 2 - 60, window.innerHeight / 2, "🧡");
    spawnBurst(window.innerWidth / 2 + 60, window.innerHeight / 2, "🐾");
  } else {
    emoji.textContent = "⏰";
    title.textContent = "Time's up!";
    sub.textContent = "Burger says: try again 🐾";
  }

  if (timeEl) timeEl.textContent = mmFormatTime(elapsed);
  if (movesEl) movesEl.textContent = mmState.moves;

  modal.hidden = false;
}

function mmRender() {
  const boardEl = document.getElementById("mmBoard");
  if (!boardEl) return;

  boardEl.innerHTML = "";

  mmState.cards.forEach((card, idx) => {
    const cardEl = document.createElement("div");
    cardEl.className = "mm-card";
    cardEl.dataset.idx = idx;

    if (mmState.flipped.includes(idx) || mmState.matched.includes(idx)) {
      cardEl.classList.add("flipped");
    }
    if (mmState.matched.includes(idx)) {
      cardEl.classList.add("matched");
    }

    const front = document.createElement("div");
    front.className = "mm-card-face mm-card-front";
    front.textContent = "🐾";

    const back = document.createElement("div");
    back.className = "mm-card-face mm-card-back";
    back.textContent = card.icon;

    cardEl.appendChild(front);
    cardEl.appendChild(back);

    cardEl.addEventListener("click", () => mmHandleClick(idx));

    boardEl.appendChild(cardEl);
  });
}

function mmHandleClick(idx) {
  if (!mmState.playing) {
    spawnBurst(window.innerWidth / 2, window.innerHeight / 2, "🐾");
    return;
  }
  if (mmState.checking) return;
  if (mmState.flipped.includes(idx)) return;
  if (mmState.matched.includes(idx)) return;
  if (mmState.flipped.length >= 2) return;

  mmState.flipped.push(idx);
  mmRender();

  if (mmState.flipped.length === 2) {
    mmState.moves++;
    const movesEl = document.getElementById("mmMoves");
    if (movesEl) movesEl.textContent = mmState.moves;

    mmState.checking = true;

    const [a, b] = mmState.flipped;
    const cardA = mmState.cards[a];
    const cardB = mmState.cards[b];

    if (cardA.pairId === cardB.pairId) {
      setTimeout(() => {
        mmState.matched.push(a, b);
        mmState.flipped = [];
        mmState.checking = false;
        mmRender();

        if (mmState.matched.length === mmState.cards.length) {
          mmStopGame(true);
        }
      }, 500);
    } else {
      setTimeout(() => {
        mmState.flipped = [];
        mmState.checking = false;
        mmRender();
      }, 900);
    }
  }
}

function setupMatch3() {
  const resetBtn = document.getElementById("mmReset");
  const startBtn = document.getElementById("mmStart");
  const endRestart = document.getElementById("mmEndRestart");
  const endModal = document.getElementById("mmEndModal");
  const difficulty = document.getElementById("mmDifficulty");

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (mmState.playing) return;
      mmReset();
      mmStart();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      mmReset();
    });
  }

  if (endRestart) {
    endRestart.addEventListener("click", () => {
      if (endModal) endModal.hidden = true;
      mmReset();
    });
  }

  if (difficulty) {
    difficulty.addEventListener("change", () => {
      if (!mmState.playing) {
        mmState.duration = Number(difficulty.value);
        const timerEl = document.getElementById("mmTimer");
        if (timerEl) timerEl.textContent = mmFormatTime(mmState.duration);
      }
    });
  }

  mmReset();
}

/* ---------- Init ---------- */
function init() {
  startAgeCounter();
  setChaosLevel();
  setupCursorCat();
  setupClickBurst();
  setupUpload();
  setupSidebarNav();
  setupMinesBurger();
  setupMatch3();
  subscribeToPhotos();
}

init();