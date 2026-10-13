/* ============================================
   CONSTANTS
   ============================================ */
const API_BASE = "https://api.jolpi.ca/ergast/f1";
const OPENF1_BASE = "https://api.openf1.org/v1";
const SEASON = 2026;

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_PREFIX = "hguf_";

const SESSION_LABELS = {
  fp1: "FP1",
  fp2: "FP2",
  fp3: "FP3",
  sprintQuali: "Sprint Quali",
  sprint: "Sprint",
  quali: "Qualifying",
  gp: "Grand Prix"
};

const TEAM_LOGOS = {
  mercedes: "images/teams/mercedes.png",
  ferrari: "images/teams/ferrari.png",
  red_bull: "images/teams/redbull.png",
  mclaren: "images/teams/mclaren.png",
  alpine: "images/teams/alpine.png",
  rb: "images/teams/racingbulls.png",
  racing_bulls: "images/teams/racingbulls.png",
  haas: "images/teams/haas.png",
  williams: "images/teams/williams.png",
  sauber: "images/teams/audi.png",
  audi: "images/teams/audi.png",
  aston_martin: "images/teams/astonmartin.png",
  cadillac: "images/teams/cadillac.png"
};

const TRACK_SVG_MAP = {
  "bahrain":       "Sakhir (Bahrain).svg",
  "saudi":         "Jeddah.svg",
  "australian":    "Melbourne.svg",
  "azerbaijan":    "Baku (Azerbaijan).svg",
  "miami":         "Miami.svg",
  "emilia":        "Imola.svg",
  "monaco":        "Monaco.svg",
  "spanish":       "Catalunya.svg",
  "canadian":      "Montreal.svg",
  "british":       "Silverstone.svg",
  "austrian":      "Austria.svg",
  "french":        "Paul Ricard.svg",
  "hungarian":     "Hungaroring.svg",
  "belgian":       "Spa.svg",
  "dutch":         "Zandvoort.svg",
  "italian":       "Monza.svg",
  "singapore":     "Singapore.svg",
  "japanese":      "Suzuka.svg",
  "qatar":         "Losail.svg",
  "united states": "Texas.svg",
  "mexican":       "Mexico.svg",
  "brazilian":     "Brazil.svg",
  "las vegas":     "Las Vegas.svg",
  "abu dhabi":     "Abu Dhabi.svg",
  "portuguese":    "Portimao.svg",
  "chinese":       "Shanghai.svg"
};

const TEAM_COLORS = {
  mercedes: "#00d2be",
  ferrari: "#e10600",
  red_bull: "#1e41ff",
  mclaren: "#ff8700",
  alpine: "#0090ff",
  rb: "#6692ff",
  racing_bulls: "#6692ff",
  haas: "#b6babd",
  williams: "#005aff",
  sauber: "#52e252",
  audi: "#52e252",
  aston_martin: "#006f62",
  cadillac: "#b8860b"
};

let allRaces = [];
let allDrivers = [];
let allConstructors = [];
let currentFilter = "all";
let countdownTimer = null;

let tracksData = {};
let tracksCalendar = { 2026: [], 2027: [] };
let currentTrackSeason = 2026;

let liveState = {
  session: null,
  race: null,
  drivers: [],
  locations: null,
  timeRange: { start: 0, end: 0 },
  currentTime: 0,
  isPlaying: false,
  speed: 1,
  animationId: null
};

/* ============================================
   CACHE
   ============================================ */
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.t) return null;
    if (Date.now() - parsed.t > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return parsed.v;
  } catch { return null; }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {}
}

/* ============================================
   UTILITIES
   ============================================ */
function toISO(dateStr, timeStr) {
  if (!dateStr) return null;
  return `${dateStr}T${timeStr || "00:00:00Z"}`;
}

function formatLocal(iso) {
  if (!iso) return "TBA";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "TBA";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function getLastSessionTime(race) {
  const times = Object.values(race.sessions).filter(Boolean)
    .map(iso => new Date(iso).getTime()).filter(t => !isNaN(t));
  return times.length ? Math.max(...times) : null;
}

function isRacePast(race) {
  const last = getLastSessionTime(race);
  return last !== null && last < Date.now();
}

function isRaceUpcoming(race) {
  const last = getLastSessionTime(race);
  return last === null || last >= Date.now();
}

function getNextSession(race) {
  const now = Date.now();
  let next = null, nextISO = null;
  Object.entries(race.sessions).forEach(([key, iso]) => {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return;
    if (t > now && (!next || t < new Date(nextISO).getTime())) {
      next = key; nextISO = iso;
    }
  });
  return next ? { key: next, iso: nextISO } : null;
}

function getNextRaceWithUpcomingSession(races) {
  let best = null;
  races.forEach(race => {
    const session = getNextSession(race);
    if (!session) return;
    const t = new Date(session.iso).getTime();
    if (!best || t < new Date(best.iso).getTime()) {
      best = { race, session, iso: session.iso };
    }
  });
  return best;
}

function renderCountdown(targetISO) {
  const target = new Date(targetISO).getTime();
  const diff = target - Date.now();
  if (isNaN(target)) return "TBA";
  if (diff <= 0) return "Session started";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function getFlagEmoji(country) {
  const map = {
    "Australia":"🇦🇺","China":"🇨🇳","Japan":"🇯🇵","Bahrain":"🇧🇭","Saudi Arabia":"🇸🇦",
    "USA":"🇺🇸","United States":"🇺🇸","Italy":"🇮🇹","Monaco":"🇲🇨","Spain":"🇪🇸",
    "Canada":"🇨🇦","Austria":"🇦🇹","UK":"🇬🇧","United Kingdom":"🇬🇧","Great Britain":"🇬🇧",
    "Hungary":"🇭🇺","Belgium":"🇧🇪","Netherlands":"🇳🇱","Azerbaijan":"🇦🇿","Singapore":"🇸🇬",
    "Mexico":"🇲🇽","Brazil":"🇧🇷","Las Vegas":"🇺🇸","Qatar":"🇶🇦","UAE":"🇦🇪",
    "United Arab Emirates":"🇦🇪","Abu Dhabi":"🇦🇪","Portugal":"🇵🇹"
  };
  return map[country] || "🏁";
}

function getTeamLogo(constructorId) {
  return TEAM_LOGOS[constructorId] || "";
}

function getTeamColor(constructorId) {
  return TEAM_COLORS[constructorId] || "#e10600";
}

/* ============================================
   FETCH — STANDINGS
   ============================================ */
async function fetchDriverStandings() {
  const cached = cacheGet(`standings_${SEASON}`);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/${SEASON}/driverstandings/?format=json`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();
    const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
    if (!list || list.length === 0) return [];
    const normalized = list.map(s => ({
      position: Number(s.position),
      points: Number(s.points),
      wins: Number(s.wins),
      driverId: s.Driver?.driverId || "",
      firstName: s.Driver?.givenName || "",
      lastName: s.Driver?.familyName || "",
      code: s.Driver?.code || "",
      constructorId: s.Constructors?.[0]?.constructorId || "",
      constructorName: s.Constructors?.[0]?.name || ""
    }));
    cacheSet(`standings_${SEASON}`, normalized);
    return normalized;
  } catch (err) {
    console.error("❌ Driver standings:", err);
    return [];
  }
}

async function fetchConstructorStandings() {
  const cached = cacheGet(`constructors_${SEASON}`);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/${SEASON}/constructorstandings/?format=json`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();
    const list = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings;
    if (!list || list.length === 0) return [];
    const normalized = list.map(s => ({
      position: Number(s.position),
      points: Number(s.points),
      wins: Number(s.wins),
      constructorId: s.Constructor?.constructorId || "",
      constructorName: s.Constructor?.name || ""
    }));
    cacheSet(`constructors_${SEASON}`, normalized);
    return normalized;
  } catch (err) {
    console.error("❌ Constructor standings:", err);
    return [];
  }
}

async function fetchRaceResults(round) {
  const cached = cacheGet(`results_${SEASON}_${round}`);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/${SEASON}/${round}/results/?format=json`);
    if (!res.ok) return [];
    const json = await res.json();
    const results = json?.MRData?.RaceTable?.Races?.[0]?.Results;
    if (!results) return [];
    const podium = results.slice(0, 3).map(r => ({
      position: Number(r.position),
      driverId: r.Driver?.driverId || "",
      firstName: r.Driver?.givenName || "",
      lastName: r.Driver?.familyName || "",
      code: r.Driver?.code || "",
      constructorId: r.Constructors?.[0]?.constructorId || "",
      constructorName: r.Constructors?.[0]?.name || ""
    }));
    cacheSet(`results_${SEASON}_${round}`, podium);
    return podium;
  } catch { return []; }
}

async function fetchAllResults(races) {
  const pastRaces = races.filter(isRacePast);
  if (pastRaces.length === 0) return {};
  const results = await Promise.all(pastRaces.map(async race => {
    const podium = await fetchRaceResults(race.round);
    return { round: race.round, podium };
  }));
  const map = {};
  results.forEach(r => { map[r.round] = r.podium; });
  return map;
}

async function fetchRaceCalendar() {
  const cached = cacheGet(`calendar_${SEASON}`);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/${SEASON}/races/?format=json`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();
    const raw = json?.MRData?.RaceTable?.Races;
    if (!raw || raw.length === 0) throw new Error("Empty calendar");
    const normalized = raw.map(r => {
      const isSprint = Boolean(r.Sprint);
      const sDate = (key) => {
        const s = r[key];
        return s ? toISO(s.date, s.time) : null;
      };
      return {
        round: Number(r.round),
        name: r.raceName,
        circuit: r.Circuit?.circuitName || "Unknown Circuit",
        country: r.Circuit?.Location?.country || "",
        locality: r.Circuit?.Location?.locality || "",
        isSprint,
        sessions: {
          fp1: sDate("FirstPractice"),
          fp2: sDate("SecondPractice"),
          fp3: sDate("ThirdPractice"),
          sprintQuali: sDate("SprintQualifying"),
          sprint: sDate("Sprint"),
          quali: sDate("Qualifying"),
          gp: sDate("Race") || (r.date && r.time ? toISO(r.date, r.time) : null)
        }
      };
    });
    cacheSet(`calendar_${SEASON}`, normalized);
    return normalized;
  } catch (err) {
    console.error("❌ Calendar:", err);
    return [];
  }
}

/* ============================================
   BUILDERS — STANDINGS
   ============================================ */
function buildStandingsTable(standings) {
  const table = document.createElement("table");
  table.className = "standings-table";
  table.innerHTML = `
    <thead>
      <tr><th>Pos</th><th>Driver</th><th>Pts</th><th>Team</th></tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  standings.forEach(s => {
    const tr = document.createElement("tr");
    if (s.position === 1) tr.classList.add("leader");
    const logo = getTeamLogo(s.constructorId);
    const logoHTML = logo ? `<img src="${logo}" alt="" class="team-logo" onerror="this.style.display='none'">` : "";
    tr.innerHTML = `
      <td>${s.position}</td>
      <td><div class="driver-cell"><span class="team-logo-wrap">${logoHTML}</span><span><strong>${s.code || s.lastName}</strong> ${s.firstName} ${s.lastName}</span></div></td>
      <td>${s.points}</td>
      <td style="color:var(--text-muted);">${s.constructorName}</td>
    `;
    tbody.appendChild(tr);
  });
  return table;
}

function buildConstructorsTable(standings) {
  const table = document.createElement("table");
  table.className = "standings-table";
  table.innerHTML = `
    <thead>
      <tr><th>Pos</th><th>Team</th><th>Pts</th><th>Wins</th></tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");
  standings.forEach(s => {
    const tr = document.createElement("tr");
    if (s.position === 1) tr.classList.add("leader");
    const logo = getTeamLogo(s.constructorId);
    const logoHTML = logo ? `<img src="${logo}" alt="" class="team-logo" onerror="this.style.display='none'">` : "";
    tr.innerHTML = `
      <td>${s.position}</td>
      <td><div class="constructor-cell"><span class="team-logo-wrap">${logoHTML}</span><span>${s.constructorName}</span></div></td>
      <td>${s.points}</td>
      <td style="color:var(--text-muted);">${s.wins}</td>
    `;
    tbody.appendChild(tr);
  });
  return table;
}

function buildPodium(podium) {
  const wrap = document.createElement("div");
  wrap.className = "podium";
  wrap.innerHTML = `<div class="podium-title">Race Podium</div>`;
  const list = document.createElement("div");
  list.className = "podium-list";
  podium.forEach(p => {
    const item = document.createElement("div");
    item.className = `podium-item p${p.position}`;
    const logo = getTeamLogo(p.constructorId);
    const logoHTML = logo ? `<img src="${logo}" alt="" class="team-logo-sm" onerror="this.style.display='none'">` : "";
    item.innerHTML = `
      <div class="podium-pos">P${p.position}</div>
      <div class="podium-driver">${p.code || p.lastName}</div>
      <div class="podium-team">${logoHTML}<span>${p.constructorName}</span></div>
    `;
    list.appendChild(item);
  });
  wrap.appendChild(list);
  return wrap;
}

function buildRaceCard(race, countdownTarget, isNext, isPast, podium) {
  const card = document.createElement("article");
  card.className = "race-card";
  if (race.isSprint) card.classList.add("sprint");
  if (isNext) card.classList.add("next");
  if (isPast) card.classList.add("past");
  card.dataset.round = race.round;

  if (isNext) {
    const badge = document.createElement("span");
    badge.className = "race-card-badge";
    badge.textContent = "Next Up";
    card.appendChild(badge);
  }

  const header = document.createElement("div");
  header.className = "race-header";
  header.innerHTML = `
    <span class="race-round">Round ${race.round}</span>
    <span class="race-flag">${getFlagEmoji(race.country)}</span>
  `;

  const name = document.createElement("h2");
  name.className = "race-name";
  name.textContent = race.name;
  if (race.isSprint) {
    const badge = document.createElement("span");
    badge.className = "sprint-badge";
    badge.textContent = "Sprint";
    name.appendChild(badge);
  }

  const circuit = document.createElement("p");
  circuit.className = "race-circuit";
  circuit.textContent = `${race.circuit}${race.locality ? " — " + race.locality : ""}`;

  const list = document.createElement("div");
  list.className = "session-list";
  const now = Date.now();

  Object.keys(SESSION_LABELS).forEach(key => {
    const iso = race.sessions[key];
    if (!iso) return;
    const t = new Date(iso).getTime();
    const isDone = !isNaN(t) && t < now;
    const row = document.createElement("div");
    row.className = "session-row";
    if (key === "gp") row.classList.add("gp");
    if (isDone) row.classList.add("done");
    row.innerHTML = `
      <span class="session-label">${SESSION_LABELS[key]}</span>
      <span class="session-time">${formatLocal(iso)}</span>
    `;
    list.appendChild(row);
  });

  card.appendChild(header);
  card.appendChild(name);
  card.appendChild(circuit);
  card.appendChild(list);

  if (podium && podium.length > 0) card.appendChild(buildPodium(podium));

  if (countdownTarget && countdownTarget.round === race.round) {
    const box = document.createElement("div");
    box.className = "countdown-box";
    box.innerHTML = `
      <span class="countdown-label">Next: ${SESSION_LABELS[countdownTarget.sessionKey]}</span>
      <span class="countdown-value" data-countdown-target="${countdownTarget.iso}">—</span>
    `;
    card.appendChild(box);
  }

  return card;
}

function startCountdownTicker() {
  if (countdownTimer) clearInterval(countdownTimer);
  const els = document.querySelectorAll("[data-countdown-target]");
  if (els.length === 0) return;
  const tick = () => els.forEach(el => {
    el.textContent = renderCountdown(el.dataset.countdownTarget);
  });
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ============================================
   RENDER
   ============================================ */
function applyFilter(races, filter) {
  if (filter === "upcoming") return races.filter(isRaceUpcoming);
  if (filter === "past") return races.filter(isRacePast);
  return races;
}

function renderRaces() {
  const container = document.getElementById("race-container");
  if (!container) return;
  container.innerHTML = "";

  const filtered = applyFilter(allRaces, currentFilter);
  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-state">No races match this filter.</p>`;
    return;
  }

  const upcoming = getNextRaceWithUpcomingSession(allRaces);
  const nextRound = upcoming ? upcoming.race.round : null;
  const countdownTarget = upcoming
    ? { round: upcoming.race.round, sessionKey: upcoming.session.key, iso: upcoming.session.iso }
    : null;

  filtered.forEach((race, index) => {
    const isNext = race.round === nextRound && currentFilter !== "past";
    const isPast = isRacePast(race);
    const podium = window.F1_RESULTS?.[race.round] || null;
    const card = buildRaceCard(race, countdownTarget, isNext, isPast, podium);
    card.style.animationDelay = `${Math.min(index * 40, 400)}ms`;
    container.appendChild(card);
  });

  startCountdownTicker();
}

function renderStandings(standings) {
  const container = document.getElementById("standings-container");
  if (!container) return;
  if (!standings || standings.length === 0) {
    container.innerHTML = `<p class="empty-state">Standings unavailable.</p>`;
    return;
  }
  container.innerHTML = "";
  container.appendChild(buildStandingsTable(standings));
}

function renderConstructors(standings) {
  const container = document.getElementById("constructors-container");
  if (!container) return;
  if (!standings || standings.length === 0) {
    container.innerHTML = `<p class="empty-state">Constructor standings unavailable.</p>`;
    return;
  }
  container.innerHTML = "";
  container.appendChild(buildConstructorsTable(standings));
}

function renderHome() {
  const upcoming = getNextRaceWithUpcomingSession(allRaces);

  const nextVal = document.getElementById("home-next-race-value");
  const nextSub = document.getElementById("home-next-race-sub");
  const nextCd = document.getElementById("home-next-race-countdown");
  if (upcoming && nextVal && nextSub && nextCd) {
    nextVal.textContent = upcoming.race.name;
    nextSub.textContent = `${SESSION_LABELS[upcoming.session.key]} · ${formatLocal(upcoming.session.iso)}`;
    nextCd.dataset.countdownTarget = upcoming.session.iso;
    nextCd.textContent = renderCountdown(upcoming.session.iso);
  }

  const dlVal = document.getElementById("home-driver-leader-value");
  const dlSub = document.getElementById("home-driver-leader-sub");
  const dl = allDrivers[0];
  if (dlVal && dlSub) {
    if (dl) {
      dlVal.textContent = `${dl.firstName} ${dl.lastName}`;
      dlSub.textContent = `${dl.points} pts · ${dl.constructorName}`;
    } else {
      dlVal.textContent = "—";
      dlSub.textContent = "Standings unavailable";
    }
  }

  const tlVal = document.getElementById("home-team-leader-value");
  const tlSub = document.getElementById("home-team-leader-sub");
  const tl = allConstructors[0];
  if (tlVal && tlSub) {
    if (tl) {
      tlVal.textContent = tl.constructorName;
      tlSub.textContent = `${tl.points} pts · ${tl.wins} wins`;
    } else {
      tlVal.textContent = "—";
      tlSub.textContent = "Standings unavailable";
    }
  }

  const rcVal = document.getElementById("home-races-count-value");
  const rcSub = document.getElementById("home-races-count-sub");
  if (rcVal && rcSub && allRaces.length > 0) {
    const completed = allRaces.filter(isRacePast).length;
    rcVal.textContent = `${completed}/${allRaces.length}`;
    rcSub.textContent = `${allRaces.length - completed} races remaining`;
  }
}

/* ============================================
   TRACKS
   ============================================ */
async function fetchTracksData() {
  const cached = cacheGet("tracks_data");
  if (cached) return cached;
  try {
    const res = await fetch("tracks-data.json");
    if (!res.ok) throw new Error(`tracks-data.json ${res.status}`);
    const json = await res.json();
    cacheSet("tracks_data", json);
    return json;
  } catch (err) {
    console.error("❌ tracks-data.json:", err);
    return {};
  }
}

async function fetchTrackCalendar(season) {
  const cached = cacheGet(`tracks_calendar_${season}`);
  if (cached) return cached;
  try {
    const res = await fetch(`${API_BASE}/${season}/races/?format=json`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = await res.json();
    const raw = json?.MRData?.RaceTable?.Races;
    if (!raw || raw.length === 0) return [];
    const normalized = raw.map(r => ({
      round: Number(r.round),
      name: r.raceName,
      circuitId: r.Circuit?.circuitId || "",
      circuitName: r.Circuit?.circuitName || "Unknown",
      country: r.Circuit?.Location?.country || "",
      locality: r.Circuit?.Location?.locality || "",
      date: r.date || null
    }));
    cacheSet(`tracks_calendar_${season}`, normalized);
    return normalized;
  } catch (err) {
    console.error(`❌ Track calendar ${season}:`, err);
    return [];
  }
}

function findTrackKey(race) {
  const combined = `${race.name} ${race.circuitId || ""} ${race.circuitName || ""}`.toLowerCase();
  for (const key of Object.keys(TRACK_SVG_MAP)) {
    if (combined.includes(key)) return key;
  }
  if (combined.includes("bahrain") || combined.includes("sakhir")) return "bahrain";
  if (combined.includes("jeddah") || combined.includes("saudi")) return "saudi";
  if (combined.includes("melbourne") || combined.includes("albert park")) return "australian";
  if (combined.includes("baku") || combined.includes("azerbaijan")) return "azerbaijan";
  if (combined.includes("miami")) return "miami";
  if (combined.includes("imola") || combined.includes("emilia")) return "emilia";
  if (combined.includes("monaco") || combined.includes("monte carlo")) return "monaco";
  if (combined.includes("catalunya") || combined.includes("spain") || combined.includes("barcelona")) return "spanish";
  if (combined.includes("montreal") || combined.includes("canada")) return "canadian";
  if (combined.includes("silverstone") || combined.includes("british")) return "british";
  if (combined.includes("austria") || combined.includes("spielberg")) return "austrian";
  if (combined.includes("paul ricard") || combined.includes("french")) return "french";
  if (combined.includes("hungaroring") || combined.includes("hungary")) return "hungarian";
  if (combined.includes("spa") || combined.includes("belgian")) return "belgian";
  if (combined.includes("zandvoort") || combined.includes("dutch")) return "dutch";
  if (combined.includes("monza") || combined.includes("italian")) return "italian";
  if (combined.includes("singapore") || combined.includes("marina bay")) return "singapore";
  if (combined.includes("suzuka") || combined.includes("japanese")) return "japanese";
  if (combined.includes("losail") || combined.includes("qatar")) return "qatar";
  if (combined.includes("texas") || combined.includes("austin")) return "united states";
  if (combined.includes("mexico") || combined.includes("rodriguez")) return "mexican";
  if (combined.includes("brazil") || combined.includes("interlagos")) return "brazilian";
  if (combined.includes("las vegas")) return "las vegas";
  if (combined.includes("abu dhabi") || combined.includes("yas marina")) return "abu dhabi";
  if (combined.includes("portimao") || combined.includes("portugal")) return "portuguese";
  if (combined.includes("shanghai") || combined.includes("china")) return "chinese";
  return null;
}

function buildTrackCard(race, stats) {
  const key = findTrackKey(race);
  const svgFile = key ? TRACK_SVG_MAP[key] : null;
  const svgPath = svgFile ? `images/tracks/${svgFile}` : null;

  const card = document.createElement("article");
  card.className = "track-card";

  const round = document.createElement("div");
  round.className = "track-round";
  round.textContent = `Round ${race.round}`;

  const name = document.createElement("h3");
  name.className = "track-name";
  name.textContent = race.name;

  const location = document.createElement("div");
  location.className = "track-location";
  location.innerHTML = `<span class="track-flag">${getFlagEmoji(race.country)}</span><span>${race.circuitName}${race.locality ? " · " + race.locality : ""}</span>`;

  card.appendChild(round);
  card.appendChild(name);
  card.appendChild(location);

  const mapDiv = document.createElement("div");
  mapDiv.className = "track-map";
  if (svgPath) {
    const img = document.createElement("img");
    img.src = svgPath;
    img.alt = `${race.name} layout`;
    img.onerror = () => { mapDiv.innerHTML = `<p class="empty-state">Track image not found</p>`; };
    mapDiv.appendChild(img);
  } else {
    mapDiv.innerHTML = `<p class="empty-state">No SVG mapped</p>`;
  }
  card.appendChild(mapDiv);

  if (stats) {
    const statsRow = document.createElement("div");
    statsRow.className = "track-stats";
    if (stats.length) statsRow.innerHTML += `<div class="track-stat"><span class="track-stat-label">Length</span><span class="track-stat-value">${stats.length}</span></div>`;
    if (stats.laps) statsRow.innerHTML += `<div class="track-stat"><span class="track-stat-label">Laps</span><span class="track-stat-value">${stats.laps}</span></div>`;
    if (stats.lapRecord) statsRow.innerHTML += `<div class="track-stat"><span class="track-stat-label">Lap Record</span><span class="track-stat-value">${stats.lapRecord}</span></div>`;
    if (stats.turns) statsRow.innerHTML += `<div class="track-stat"><span class="track-stat-label">Turns</span><span class="track-stat-value">${stats.turns}</span></div>`;
    card.appendChild(statsRow);

    if (stats.highlights && stats.highlights.length > 0) {
      const hl = document.createElement("div");
      hl.className = "track-highlights";
      stats.highlights.forEach(h => {
        const item = document.createElement("div");
        item.className = "track-highlight";
        item.innerHTML = `<span class="track-highlight-dot ${h.color}"></span><span>${h.label}</span>`;
        hl.appendChild(item);
      });
      card.appendChild(hl);
    }
  }

  return card;
}

function renderTrackCards(season) {
  const container = document.getElementById("tracks-container");
  if (!container) return;
  container.innerHTML = "";

  const races = tracksCalendar[season] || [];
  if (races.length === 0) {
    container.innerHTML = `<p class="empty-state">No circuit data available for ${season}.</p>`;
    return;
  }

  races.forEach((race, index) => {
    const key = findTrackKey(race);
    const stats = key ? tracksData[key] : null;
    const card = buildTrackCard(race, stats);
    card.style.animationDelay = `${Math.min(index * 30, 400)}ms`;
    container.appendChild(card);
  });
}

function setupSeasonToggle() {
  const toggle = document.getElementById("seasonToggle");
  if (!toggle) return;
  toggle.querySelectorAll(".season-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const season = Number(btn.dataset.season);
      if (season === currentTrackSeason) return;
      currentTrackSeason = season;
      toggle.querySelectorAll(".season-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderTrackCards(season);
    });
  });
}

async function initTracks() {
  const container = document.getElementById("tracks-container");
  if (!container) return;
  container.innerHTML = `<p class="empty-state">Loading circuits...</p>`;

  tracksData = await fetchTracksData();
  const [cal2026, cal2027] = await Promise.all([
    fetchTrackCalendar(2026),
    fetchTrackCalendar(2027)
  ]);
  tracksCalendar[2026] = cal2026;
  tracksCalendar[2027] = cal2027;

  const btn2027 = document.querySelector('.season-btn[data-season="2027"]');
  if (btn2027) btn2027.hidden = !(cal2027 && cal2027.length > 0);

  currentTrackSeason = 2026;
  const btn2026 = document.querySelector('.season-btn[data-season="2026"]');
  if (btn2026) btn2026.classList.add("active");

  renderTrackCards(2026);
  setupSeasonToggle();
}

/* ============================================
   LIVE MODULE — OPENF1 + JOLPI INTEGRATION
   ============================================ */

async function fetchLatestRaceFromJolpi() {
  const cached = cacheGet("live_latest_race");
  if (cached) {
    console.log("⚡ Latest race loaded from cache");
    return cached;
  }

  try {
    console.log("📡 Fetching latest race from Jolpi...");
    const res = await fetch(`${API_BASE}/current/last/results.json`);
    if (!res.ok) throw new Error(`Jolpi ${res.status}`);
    const json = await res.json();
    const race = json?.MRData?.RaceTable?.Races?.[0];
    if (!race) throw new Error("No latest race found");

    const normalized = {
      season: String(race.season || ""),
      round: String(race.round || ""),
      raceName: race.raceName || "Grand Prix",
      circuitName: race.Circuit?.circuitName || "Unknown Circuit",
      circuitId: race.Circuit?.circuitId || "",
      country: race.Circuit?.Location?.country || "",
      locality: race.Circuit?.Location?.locality || "",
      date: race.date || "",
      results: (race.Results || []).map(r => ({
        position: Number(r.position),
        positionText: r.positionText || String(r.position),
        points: Number(r.points || 0),
        grid: Number(r.grid || 0),
        laps: Number(r.laps || 0),
        status: r.status || "",
        driverNumber: r.Driver?.permanentNumber || "",
        driverId: r.Driver?.driverId || "",
        firstName: r.Driver?.givenName || "",
        lastName: r.Driver?.familyName || "",
        code: r.Driver?.code || "",
        constructorId: r.Constructors?.[0]?.constructorId || "",
        constructorName: r.Constructors?.[0]?.name || "",
        time: r.Time?.time || null,
        fastestLap: r.FastestLap ? {
          rank: Number(r.FastestLap.rank || 0),
          lap: Number(r.FastestLap.lap || 0),
          time: r.FastestLap.Time?.time || null,
          avgSpeed: r.FastestLap.AverageSpeed?.speed || null
        } : null
      }))
    };

    cacheSet("live_latest_race", normalized);
    console.log(`✅ Latest race: ${normalized.raceName} (Round ${normalized.round})`);
    return normalized;
  } catch (err) {
    console.error("❌ Latest race from Jolpi:", err);
    return null;
  }
}

async function fetchOpenF1Session(year, round) {
  const cacheKey = `live_session_${year}_${round}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log(`⚡ OpenF1 session ${year}/${round} from cache`);
    return cached;
  }

  try {
    console.log(`📡 Fetching OpenF1 session: ${year} round ${round}...`);
    const res = await fetch(`${OPENF1_BASE}/sessions?year=${year}&round=${round}`);
    if (!res.ok) throw new Error(`OpenF1 ${res.status}`);
    const sessions = await res.json();
    if (!Array.isArray(sessions) || sessions.length === 0) {
      console.warn(`⚠️ No OpenF1 session for ${year}/${round}`);
      return null;
    }
    const raceSession = sessions.find(s => s.session_name === "Race") || sessions[0];
    console.log(`✅ OpenF1 session found: key ${raceSession.session_key}`);
    cacheSet(cacheKey, raceSession);
    return raceSession;
  } catch (err) {
    console.error("❌ OpenF1 session:", err);
    return null;
  }
}

async function fetchOpenF1Drivers(sessionKey) {
  const cacheKey = `live_drivers_${sessionKey}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${OPENF1_BASE}/drivers?session_key=${sessionKey}`);
    if (!res.ok) throw new Error(`OpenF1 ${res.status}`);
    const drivers = await res.json();
    cacheSet(cacheKey, drivers);
    return drivers;
  } catch (err) {
    console.error("❌ OpenF1 drivers:", err);
    return [];
  }
}

async function fetchOpenF1Locations(sessionKey) {
  const cacheKey = `live_locations_${sessionKey}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log(`⚡ Locations from cache (${Object.keys(cached.data || {}).length} drivers)`);
    return cached;
  }

  try {
    console.log("📡 Fetching OpenF1 locations (this may take a while)...");
    const res = await fetch(`${OPENF1_BASE}/location?session_key=${sessionKey}`);
    if (!res.ok) throw new Error(`OpenF1 ${res.status}`);
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const grouped = {};
    raw.forEach(point => {
      const drv = point.driver_number;
      if (!drv) return;
      if (!grouped[drv]) grouped[drv] = [];
      grouped[drv].push({
        x: point.x,
        y: point.y,
        t: new Date(point.date).getTime()
      });
    });

    Object.values(grouped).forEach(arr => arr.sort((a, b) => a.t - b.t));

    let minT = Infinity, maxT = -Infinity;
    Object.values(grouped).forEach(arr => {
      if (arr.length) {
        if (arr[0].t < minT) minT = arr[0].t;
        if (arr[arr.length - 1].t > maxT) maxT = arr[arr.length - 1].t;
      }
    });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    raw.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const result = {
      data: grouped,
      timeRange: { start: minT, end: maxT },
      bounds: { minX, maxX, minY, maxY }
    };

    console.log(`✅ Locations fetched: ${Object.keys(grouped).length} drivers, ${raw.length} points`);
    cacheSet(cacheKey, result);
    return result;
  } catch (err) {
    console.error("❌ OpenF1 locations:", err);
    return null;
  }
}

function findClosestPoint(points, targetTime) {
  if (!points || points.length === 0) return null;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].t < targetTime) lo = mid + 1;
    else hi = mid;
  }
  const after = points[lo];
  const before = points[Math.max(0, lo - 1)];
  if (!before) return after;
  if (!after) return before;
  return Math.abs(after.t - targetTime) < Math.abs(before.t - targetTime) ? after : before;
}

function renderLiveSessionHeader(race) {
  const nameEl = document.getElementById("liveRaceName");
  const typeEl = document.getElementById("liveSessionType");
  const badge = document.getElementById("liveBadge");
  const footer = document.getElementById("liveFooterRaceInfo");

  if (nameEl) nameEl.textContent = race.raceName;
  if (typeEl) typeEl.textContent = "Race · Replay";
  if (badge) {
    badge.textContent = "REPLAY";
    badge.classList.add("historical");
  }
  if (footer) {
    footer.textContent = `${race.season} · Round ${race.round} · ${race.circuitName} · ${race.date}`;
  }

  const meta = document.getElementById("liveLeaderboardMeta");
  if (meta) meta.textContent = `${race.results.length} drivers · ${race.results.reduce((s, r) => s + r.laps, 0)} total laps`;
}

function renderLiveLeaderboard(results) {
  const tbody = document.getElementById("liveTableBody");
  if (!tbody) return;

  if (!results || results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="live-empty">No race results available</td></tr>`;
    return;
  }

  tbody.innerHTML = results.map(r => {
    const posClass = r.position === 1 ? "leader" : "";
    const teamColor = getTeamColor(r.constructorId);
    const tyreChar = "M";

    return `
      <tr class="${posClass}">
        <td><span class="pos-badge">${r.position}</span></td>
        <td>
          <span class="driver-code" style="color:${teamColor}">${r.code || r.lastName.substring(0,3).toUpperCase()}</span>
          <span class="driver-name">${r.firstName} ${r.lastName}</span>
        </td>
        <td>${r.position === 1 ? "—" : (r.time || (r.positionText === "R" ? "DNF" : "—"))}</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td>${r.fastestLap?.time || "—"}</td>
        <td><span class="tyre-badge medium">${tyreChar}</span></td>
      </tr>
    `;
  }).join("");
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function mapCoord(x, y, bounds, svgW, svgH, padding) {
  const { minX, maxX, minY, maxY } = bounds;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scaleX = (svgW - padding * 2) / rangeX;
  const scaleY = (svgH - padding * 2) / rangeY;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (svgW - rangeX * scale) / 2;
  const offsetY = (svgH - rangeY * scale) / 2;
  return {
    cx: (x - minX) * scale + offsetX,
    cy: svgH - ((y - minY) * scale + offsetY)
  };
}

function drawTrackOutline(svg, points, bounds, svgW, svgH) {
  const pathData = points.map((p, i) => {
    const { cx, cy } = mapCoord(p.x, p.y, bounds, svgW, svgH, 60);
    return `${i === 0 ? "M" : "L"}${cx.toFixed(2)},${cy.toFixed(2)}`;
  }).join(" ");

  const outer = createSvgEl("path", { d: pathData, class: "track-path" });
  svg.appendChild(outer);
  const inner = createSvgEl("path", { d: pathData, class: "track-path-inner" });
  svg.appendChild(inner);
}

function drawCarDots(svg, driverPositions, drivers, bounds, svgW, svgH) {
  svg.querySelectorAll(".car-dot").forEach(el => el.remove());

  driverPositions.forEach(({ driver, point }) => {
    const { cx, cy } = mapCoord(point.x, point.y, bounds, svgW, svgH, 60);
    const teamColor = "#e10600";
    const driverTeam = driver.team_name?.toLowerCase().replace(/\s+/g, "_") || "";
    const color = getTeamColor(driverTeam) || teamColor;

    const group = createSvgEl("g", {
      class: "car-dot",
      "data-driver": driver.driver_number
    });

    const bgWidth = 34;
    const bgHeight = 14;
    const bg = createSvgEl("rect", {
      x: cx - bgWidth / 2,
      y: cy - 18,
      width: bgWidth,
      height: bgHeight,
      rx: 2,
      fill: "rgba(0,0,0,0.85)",
      stroke: color,
      "stroke-width": 1
    });
    group.appendChild(bg);

    const label = createSvgEl("text", {
      x: cx,
      y: cy - 8,
      "text-anchor": "middle",
      class: "car-dot-label",
      fill: color,
      "font-family": "'JetBrains Mono', monospace",
      "font-size": "9",
      "font-weight": "700"
    });
    label.textContent = driver.name_acronym || `#${driver.driver_number}`;
    group.appendChild(label);

    const dot = createSvgEl("circle", {
      cx, cy,
      r: 6,
      fill: color,
      stroke: "#fff",
      "stroke-width": 1.5
    });
    dot.setAttribute("style", `filter: drop-shadow(0 0 6px ${color});`);
    group.appendChild(dot);

    svg.appendChild(group);
  });
}

function renderLiveFrame(time) {
  const { drivers, locations } = liveState;
  if (!locations || !locations.data) return;

  const svg = document.querySelector(".live-track-canvas svg");
  if (!svg) return;

  const svgW = 800;
  const svgH = 600;
  const bounds = locations.bounds;

  const driverPositions = [];
  Object.entries(locations.data).forEach(([driverNum, points]) => {
    const point = findClosestPoint(points, time);
    if (!point) return;
    const driver = drivers.find(d => String(d.driver_number) === String(driverNum));
    if (!driver) return;
    driverPositions.push({ driver, point });
  });

  drawCarDots(svg, driverPositions, drivers, bounds, svgW, svgH);
}

function startLivePlayback() {
  if (liveState.isPlaying) return;
  liveState.isPlaying = true;

  const playBtn = document.getElementById("livePlayBtn");
  if (playBtn) {
    playBtn.classList.add("playing");
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>`;
  }

  let lastFrame = performance.now();

  const loop = (now) => {
    if (!liveState.isPlaying) return;

    const delta = (now - lastFrame) * liveState.speed;
    lastFrame = now;

    liveState.currentTime += delta;

    if (liveState.currentTime >= liveState.timeRange.end) {
      liveState.currentTime = liveState.timeRange.end;
      stopLivePlayback();
      return;
    }

    renderLiveFrame(liveState.currentTime);
    updateLapCounter();

    liveState.animationId = requestAnimationFrame(loop);
  };

  liveState.animationId = requestAnimationFrame(loop);
}

function stopLivePlayback() {
  liveState.isPlaying = false;
  if (liveState.animationId) {
    cancelAnimationFrame(liveState.animationId);
    liveState.animationId = null;
  }
  const playBtn = document.getElementById("livePlayBtn");
  if (playBtn) {
    playBtn.classList.remove("playing");
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg>`;
  }
}

function toggleLivePlayback() {
  if (liveState.isPlaying) stopLivePlayback();
  else startLivePlayback();
}

function updateLapCounter() {
  const elapsed = liveState.currentTime - liveState.timeRange.start;
  const approxLapTime = 90000;
  const totalLaps = liveState.race?.results?.[0]?.laps || 60;
  const lap = Math.min(Math.floor(elapsed / approxLapTime) + 1, totalLaps);
  const el = document.getElementById("liveLapCounter");
  if (el) el.textContent = `Lap ${lap} / ${totalLaps}`;
}

async function initLive() {
  const canvas = document.getElementById("liveTrackCanvas");
  if (!canvas) return;

  const race = await fetchLatestRaceFromJolpi();
  if (!race) {
    canvas.innerHTML = `<div class="live-loading"><span>⚠️ Could not fetch race data</span></div>`;
    return;
  }

  liveState.race = race;
  renderLiveSessionHeader(race);
  renderLiveLeaderboard(race.results);

  const session = await fetchOpenF1Session(race.season, race.round);
  if (!session) {
    canvas.innerHTML = `<div class="live-loading"><span>⚠️ No OpenF1 position data available for this race</span></div>`;
    return;
  }

  liveState.session = session;

  const drivers = await fetchOpenF1Drivers(session.session_key);
  liveState.drivers = drivers;

  const locations = await fetchOpenF1Locations(session.session_key);
  if (!locations || !locations.data || Object.keys(locations.data).length === 0) {
    canvas.innerHTML = `<div class="live-loading"><span>⚠️ No location data available</span></div>`;
    return;
  }

  liveState.locations = locations;
  liveState.timeRange = locations.timeRange;
  liveState.currentTime = locations.timeRange.start;

  canvas.innerHTML = "";
  const svg = createSvgEl("svg", {
    viewBox: "0 0 800 600",
    preserveAspectRatio: "xMidYMid meet"
  });
  svg.style.width = "100%";
  svg.style.height = "100%";
  canvas.appendChild(svg);

  let bestDriver = null, bestCount = 0;
  Object.entries(locations.data).forEach(([drv, pts]) => {
    if (pts.length > bestCount) {
      bestCount = pts.length;
      bestDriver = pts;
    }
  });

  if (bestDriver) {
    drawTrackOutline(svg, bestDriver, locations.bounds, 800, 600);
  }

  renderLiveFrame(liveState.currentTime);

  const playBtn = document.getElementById("livePlayBtn");
  if (playBtn) playBtn.addEventListener("click", toggleLivePlayback);

  const speedBtn = document.getElementById("liveSpeedBtn");
  if (speedBtn) {
    speedBtn.addEventListener("click", () => {
      const speeds = [1, 2, 4, 8];
      const idx = speeds.indexOf(liveState.speed);
      liveState.speed = speeds[(idx + 1) % speeds.length];
      speedBtn.textContent = `${liveState.speed}x`;
    });
  }

  setTimeout(startLivePlayback, 1000);
}

/* ============================================
   TAB SWITCHING
   ============================================ */
function switchTab(tab) {
  if (!tab) return;

  document.querySelectorAll(".top-link").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".mobile-link").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById(`${tab}-tab`);
  if (panel) panel.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
  closeMobileNav();

  if (tab === "calendar") setTimeout(scrollToNextRace, 300);
  setTimeout(setupScrollReveal, 100);

  if (tab === "live" && !liveState.session) {
    initLive();
  }
}

function setupTabs() {
  document.querySelectorAll(".top-link").forEach(b => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });
  document.querySelectorAll(".mobile-link").forEach(b => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach(b => {
    b.addEventListener("click", () => switchTab(b.dataset.goto));
  });
}

/* ============================================
   MOBILE NAV
   ============================================ */
function setupMobileNav() {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mobileNav");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    btn.classList.toggle("open", open);
  });
}

function closeMobileNav() {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mobileNav");
  if (nav) nav.classList.remove("open");
  if (btn) btn.classList.remove("open");
}

/* ============================================
   NAV SCROLL
   ============================================ */
function setupNavScroll() {
  const nav = document.getElementById("topNav");
  if (!nav) return;
  const update = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

/* ============================================
   SCROLL REVEAL
   ============================================ */
let revealObserver = null;
function setupScrollReveal() {
  const els = document.querySelectorAll("[data-reveal]");
  if (!els.length) return;
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add("revealed");
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  els.forEach(el => revealObserver.observe(el));
}

/* ============================================
   FILTERS
   ============================================ */
function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderRaces();
    });
  });
}

function scrollToNextRace() {
  const next = document.querySelector(".race-card.next");
  if (next && currentFilter === "all") {
    next.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ============================================
   INIT
   ============================================ */
async function init() {
  setupNavScroll();
  setupMobileNav();
  setupTabs();
  setupScrollReveal();

  const container = document.getElementById("race-container");
  if (container) {
    container.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `;
  }

  const [races, standings, constructors] = await Promise.all([
    fetchRaceCalendar(),
    fetchDriverStandings(),
    fetchConstructorStandings()
  ]);

  allRaces = races;
  allDrivers = standings;
  allConstructors = constructors;
  window.F1_RACES = races;
  window.F1_RESULTS = {};

  if (container && races.length === 0) {
    container.innerHTML = `<p class="empty-state" style="color:var(--red);">Failed to load calendar.</p>`;
  } else if (races.length > 0) {
    renderRaces();
    setupFilters();

    const results = await fetchAllResults(races);
    window.F1_RESULTS = results;
    renderRaces();

    setTimeout(scrollToNextRace, 500);
  }

  renderStandings(standings);
  renderConstructors(constructors);
  renderHome();

  startCountdownTicker();
  await initTracks();

  setTimeout(setupScrollReveal, 200);
}

init();