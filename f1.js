const API_BASE = "https://api.jolpi.ca/ergast/f1";
const SEASON = 2026;

const CACHE_TTL = 60 * 60 * 1000;
const CACHE_PREFIX = "hguf_";

const MANUAL_OVERRIDES = [];

const SESSION_LABELS = {
  fp1: "FP1",
  fp2: "FP2",
  fp3: "FP3",
  sprintQuali: "Sprint Quali",
  sprint: "Sprint",
  quali: "Qualifying",
  gp: "Grand Prix"
};

const TEAM_COLORS = {
  mercedes: "#00d2be",
  ferrari: "#dc0000",
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

let allRaces = [];
let allDrivers = [];
let allConstructors = [];
let currentFilter = "all";
let countdownTimer = null;

let tracksData = {};
let tracksCalendar = { 2026: [], 2027: [] };
let currentTrackSeason = 2026;

/* ============================================
   CACHE HELPERS
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
  } catch {
    return null;
  }
}

function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {}
}

/* ============================================
   UTILITIES
   ============================================ */
function mergeOverrides(race) {
  const override = MANUAL_OVERRIDES.find(o => o.round === race.round);
  if (!override) return race;
  return { ...race, sessions: { ...race.sessions, ...override.sessions } };
}

function toISO(dateStr, timeStr) {
  if (!dateStr) return null;
  const time = timeStr || "00:00:00Z";
  return `${dateStr}T${time}`;
}

/* ============================================
   API FETCHES
   ============================================ */
async function fetchDriverStandings() {
  const cached = cacheGet(`standings_${SEASON}`);
  if (cached) {
    console.log("⚡ Driver standings loaded from cache");
    return cached;
  }

  try {
    console.log("📡 Fetching driver standings from API...");
    const res = await fetch(`${API_BASE}/${SEASON}/driverstandings/?format=json`);
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);

    const json = await res.json();
    const standingsList = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;

    if (!standingsList || standingsList.length === 0) {
      console.warn("⚠️ API returned empty driver standings");
      return [];
    }

    const normalized = standingsList.map(s => ({
      position: Number(s.position),
      points: Number(s.points),
      wins: Number(s.wins),
      driverId: s.Driver?.driverId || "",
      firstName: s.Driver?.givenName || "",
      lastName: s.Driver?.familyName || "",
      code: s.Driver?.code || "",
      nationality: s.Driver?.nationality || "",
      constructorId: s.Constructors?.[0]?.constructorId || "",
      constructorName: s.Constructors?.[0]?.name || ""
    }));

    console.log(`✅ Driver standings fetched (${normalized.length} drivers)`);
    cacheSet(`standings_${SEASON}`, normalized);
    return normalized;
  } catch (err) {
    console.error("❌ Failed to fetch driver standings:", err);
    const stale = localStorage.getItem(CACHE_PREFIX + `standings_${SEASON}`);
    if (stale) {
      try {
        console.warn("↩️ Using stale cached driver standings");
        return JSON.parse(stale).v;
      } catch {}
    }
    return [];
  }
}

async function fetchConstructorStandings() {
  const cached = cacheGet(`constructors_${SEASON}`);
  if (cached) {
    console.log("⚡ Constructor standings loaded from cache");
    return cached;
  }

  try {
    console.log("📡 Fetching constructor standings from API...");
    const res = await fetch(`${API_BASE}/${SEASON}/constructorstandings/?format=json`);
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);

    const json = await res.json();
    const standingsList = json?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings;

    if (!standingsList || standingsList.length === 0) {
      console.warn("⚠️ API returned empty constructor standings");
      return [];
    }

    const normalized = standingsList.map(s => ({
      position: Number(s.position),
      points: Number(s.points),
      wins: Number(s.wins),
      constructorId: s.Constructor?.constructorId || "",
      constructorName: s.Constructor?.name || "",
      nationality: s.Constructor?.nationality || ""
    }));

    console.log(`✅ Constructor standings fetched (${normalized.length} teams)`);
    cacheSet(`constructors_${SEASON}`, normalized);
    return normalized;
  } catch (err) {
    console.error("❌ Failed to fetch constructor standings:", err);
    const stale = localStorage.getItem(CACHE_PREFIX + `constructors_${SEASON}`);
    if (stale) {
      try {
        console.warn("↩️ Using stale cached constructor standings");
        return JSON.parse(stale).v;
      } catch {}
    }
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
  } catch {
    return [];
  }
}

async function fetchAllResults(races) {
  const pastRaces = races.filter(isRacePast);
  if (pastRaces.length === 0) return {};

  const missing = pastRaces.filter(r => !cacheGet(`results_${SEASON}_${r.round}`));

  if (missing.length === 0) {
    console.log("⚡ All results loaded from cache");
  } else {
    console.log(`📡 Fetching results for ${missing.length} race(s)...`);
  }

  const results = await Promise.all(
    pastRaces.map(async race => {
      const podium = await fetchRaceResults(race.round);
      return { round: race.round, podium };
    })
  );

  const map = {};
  results.forEach(r => { map[r.round] = r.podium; });
  console.log("✅ Results ready");
  return map;
}

async function fetchRaceCalendar() {
  const cached = cacheGet(`calendar_${SEASON}`);
  if (cached) {
    console.log("⚡ Calendar loaded from cache");
    return cached;
  }

  try {
    console.log("📡 Fetching calendar from API...");

    const res = await fetch(`${API_BASE}/${SEASON}/races/?format=json`);
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);

    const json = await res.json();
    const rawRaces = json?.MRData?.RaceTable?.Races;

    if (!rawRaces || rawRaces.length === 0) throw new Error("API returned an empty calendar");

    const normalized = rawRaces.map(r => {
      const isSprint = Boolean(r.Sprint);
      const sessionDate = (key) => {
        const s = r[key];
        return s ? toISO(s.date, s.time) : null;
      };

      const raceDate = r.date && r.time ? toISO(r.date, r.time) : null;

      return {
        round: Number(r.round),
        name: r.raceName,
        circuit: r.Circuit?.circuitName || "Unknown Circuit",
        country: r.Circuit?.Location?.country || "",
        locality: r.Circuit?.Location?.locality || "",
        isSprint,
        sessions: {
          fp1: sessionDate("FirstPractice"),
          fp2: sessionDate("SecondPractice"),
          fp3: sessionDate("ThirdPractice"),
          sprintQuali: sessionDate("SprintQualifying"),
          sprint: sessionDate("Sprint"),
          quali: sessionDate("Qualifying"),
          gp: sessionDate("Race") || raceDate
        }
      };
    });

    const finalRaces = normalized.map(mergeOverrides);
    console.log(`✅ Fetched ${finalRaces.length} races`);
    cacheSet(`calendar_${SEASON}`, finalRaces);
    return finalRaces;
  } catch (err) {
    console.error("❌ Failed to fetch calendar:", err);
    const stale = localStorage.getItem(CACHE_PREFIX + `calendar_${SEASON}`);
    if (stale) {
      try {
        console.warn("↩️ Using stale cached calendar");
        return JSON.parse(stale).v;
      } catch {}
    }
    return [];
  }
}

/* ============================================
   HELPERS
   ============================================ */
function formatLocal(iso) {
  if (!iso) return "TBA";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "TBA";

  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getLastSessionTime(race) {
  const times = Object.values(race.sessions)
    .filter(Boolean)
    .map(iso => new Date(iso).getTime())
    .filter(t => !isNaN(t));
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
  let next = null;
  let nextISO = null;

  Object.entries(race.sessions).forEach(([key, iso]) => {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (isNaN(t)) return;
    if (t > now && (!next || t < new Date(nextISO).getTime())) {
      next = key;
      nextISO = iso;
    }
  });

  if (!next) return null;
  return { key: next, iso: nextISO };
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
    "Australia": "🇦🇺",
    "China": "🇨🇳",
    "Japan": "🇯🇵",
    "Bahrain": "🇧🇭",
    "Saudi Arabia": "🇸🇦",
    "USA": "🇺🇸",
    "United States": "🇺🇸",
    "Italy": "🇮🇹",
    "Monaco": "🇲🇨",
    "Spain": "🇪🇸",
    "Canada": "🇨🇦",
    "Austria": "🇦🇹",
    "UK": "🇬🇧",
    "United Kingdom": "🇬🇧",
    "Great Britain": "🇬🇧",
    "Hungary": "🇭🇺",
    "Belgium": "🇧🇪",
    "Netherlands": "🇳🇱",
    "Azerbaijan": "🇦🇿",
    "Singapore": "🇸🇬",
    "Mexico": "🇲🇽",
    "Brazil": "🇧🇷",
    "Las Vegas": "🇺🇸",
    "Qatar": "🇶🇦",
    "UAE": "🇦🇪",
    "United Arab Emirates": "🇦🇪",
    "Abu Dhabi": "🇦🇪",
    "Portugal": "🇵🇹"
  };
  return map[country] || "🏁";
}

function getTeamLogo(constructorId) {
  return TEAM_LOGOS[constructorId] || "";
}

/* ============================================
   BUILDERS — STANDINGS
   ============================================ */
function buildStandingsTable(standings) {
  const table = document.createElement("table");
  table.className = "standings-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Pos</th>
      <th>Driver</th>
      <th>Pts</th>
      <th>Team</th>
    </tr>
  `;

  const tbody = document.createElement("tbody");

  standings.forEach(s => {
    const tr = document.createElement("tr");
    if (s.position === 1) tr.classList.add("leader");

    const logo = getTeamLogo(s.constructorId);
    const logoHTML = logo
      ? `<img src="${logo}" alt="${s.constructorName}" class="team-logo" onerror="this.style.display='none'">`
      : "";

    tr.innerHTML = `
      <td>${s.position}</td>
      <td>
        <div class="driver-cell">
          <span class="team-logo-wrap">${logoHTML}</span>
          <span><strong>${s.code || s.lastName}</strong> ${s.firstName} ${s.lastName}</span>
        </div>
      </td>
      <td>${s.points}</td>
      <td style="color: var(--text-muted);">${s.constructorName}</td>
    `;

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

function buildConstructorsTable(standings) {
  const table = document.createElement("table");
  table.className = "standings-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Pos</th>
      <th>Team</th>
      <th>Pts</th>
      <th>Wins</th>
    </tr>
  `;

  const tbody = document.createElement("tbody");

  standings.forEach(s => {
    const tr = document.createElement("tr");
    if (s.position === 1) tr.classList.add("leader");

    const logo = getTeamLogo(s.constructorId);
    const logoHTML = logo
      ? `<img src="${logo}" alt="${s.constructorName}" class="team-logo" onerror="this.style.display='none'">`
      : "";

    tr.innerHTML = `
      <td>${s.position}</td>
      <td>
        <div class="constructor-cell">
          <span class="team-logo-wrap">${logoHTML}</span>
          <span>${s.constructorName}</span>
        </div>
      </td>
      <td>${s.points}</td>
      <td style="color: var(--text-muted);">${s.wins}</td>
    `;

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  return table;
}

/* ============================================
   BUILDERS — RACE CARDS
   ============================================ */
function buildPodium(podium) {
  const wrapper = document.createElement("div");
  wrapper.className = "podium";

  const title = document.createElement("div");
  title.className = "podium-title";
  title.textContent = "Race Podium";
  wrapper.appendChild(title);

  const list = document.createElement("div");
  list.className = "podium-list";

  podium.forEach(p => {
    const item = document.createElement("div");
    item.className = `podium-item p${p.position}`;

    const logo = getTeamLogo(p.constructorId);
    const logoHTML = logo
      ? `<img src="${logo}" alt="${p.constructorName}" class="team-logo-sm" onerror="this.style.display='none'">`
      : "";

    item.innerHTML = `
      <div class="podium-pos">P${p.position}</div>
      <div class="podium-driver">${p.code || p.lastName}</div>
      <div class="podium-team">${logoHTML}<span>${p.constructorName}</span></div>
    `;

    list.appendChild(item);
  });

  wrapper.appendChild(list);
  return wrapper;
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

  const roundEl = document.createElement("span");
  roundEl.className = "race-round";
  roundEl.textContent = `Round ${race.round}`;

  const flagEl = document.createElement("span");
  flagEl.className = "race-flag";
  flagEl.textContent = getFlagEmoji(race.country);

  header.appendChild(roundEl);
  header.appendChild(flagEl);

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

    const sessionTime = new Date(iso).getTime();
    const isDone = !isNaN(sessionTime) && sessionTime < now;

    const row = document.createElement("div");
    row.className = "session-row";
    if (key === "gp") row.classList.add("gp");
    if (isDone) row.classList.add("done");

    const label = document.createElement("span");
    label.className = "session-label";
    label.textContent = SESSION_LABELS[key];

    const time = document.createElement("span");
    time.className = "session-time";
    time.textContent = formatLocal(iso);

    row.appendChild(label);
    row.appendChild(time);
    list.appendChild(row);
  });

  card.appendChild(header);
  card.appendChild(name);
  card.appendChild(circuit);
  card.appendChild(list);

  if (podium && podium.length > 0) {
    card.appendChild(buildPodium(podium));
  }

  if (countdownTarget && countdownTarget.round === race.round) {
    const box = document.createElement("div");
    box.className = "countdown-box";

    const label = document.createElement("div");
    label.className = "countdown-label";
    label.textContent = `Next: ${SESSION_LABELS[countdownTarget.sessionKey]}`;

    const value = document.createElement("div");
    value.className = "countdown-value";
    value.dataset.countdownTarget = countdownTarget.iso;
    value.textContent = "—";

    box.appendChild(label);
    box.appendChild(value);
    card.appendChild(box);
  }

  return card;
}

function startCountdownTicker() {
  if (countdownTimer) clearInterval(countdownTimer);

  const elements = document.querySelectorAll("[data-countdown-target]");
  if (elements.length === 0) return;

  const tick = () => {
    elements.forEach(el => {
      el.textContent = renderCountdown(el.dataset.countdownTarget);
    });
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ============================================
   RENDER — RACES / STANDINGS / HOME
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
    container.innerHTML = `<p class="empty-state">Standings unavailable. Retrying next load.</p>`;
    return;
  }

  container.innerHTML = "";
  container.appendChild(buildStandingsTable(standings));
}

function renderConstructors(standings) {
  const container = document.getElementById("constructors-container");
  if (!container) return;

  if (!standings || standings.length === 0) {
    container.innerHTML = `<p class="empty-state">Constructor standings unavailable. Retrying next load.</p>`;
    return;
  }

  container.innerHTML = "";
  container.appendChild(buildConstructorsTable(standings));
}

function renderHome() {
  const upcoming = getNextRaceWithUpcomingSession(allRaces);

  const nextRaceValue = document.getElementById("home-next-race-value");
  const nextRaceSub = document.getElementById("home-next-race-sub");
  const nextRaceCd = document.getElementById("home-next-race-countdown");

  if (upcoming) {
    nextRaceValue.textContent = upcoming.race.name;
    nextRaceSub.textContent = `${SESSION_LABELS[upcoming.session.key]} · ${formatLocal(upcoming.session.iso)}`;
    nextRaceCd.dataset.countdownTarget = upcoming.session.iso;
    nextRaceCd.textContent = renderCountdown(upcoming.session.iso);
  } else {
    nextRaceValue.textContent = "Season complete";
    nextRaceSub.textContent = "No upcoming sessions";
    nextRaceCd.dataset.countdownTarget = "";
    nextRaceCd.textContent = "—";
  }

  const driverLeaderValue = document.getElementById("home-driver-leader-value");
  const driverLeaderSub = document.getElementById("home-driver-leader-sub");
  const driverLeader = allDrivers[0];

  if (driverLeader) {
    driverLeaderValue.textContent = `${driverLeader.code || driverLeader.lastName} · ${driverLeader.firstName} ${driverLeader.lastName}`;
    driverLeaderSub.textContent = `${driverLeader.points} pts · ${driverLeader.constructorName}`;
  } else {
    driverLeaderValue.textContent = "—";
    driverLeaderSub.textContent = "Standings unavailable";
  }

  const teamLeaderValue = document.getElementById("home-team-leader-value");
  const teamLeaderSub = document.getElementById("home-team-leader-sub");
  const teamLeader = allConstructors[0];

  if (teamLeader) {
    teamLeaderValue.textContent = teamLeader.constructorName;
    teamLeaderSub.textContent = `${teamLeader.points} pts · ${teamLeader.wins} wins`;
  } else {
    teamLeaderValue.textContent = "—";
    teamLeaderSub.textContent = "Standings unavailable";
  }

  const racesCountValue = document.getElementById("home-races-count-value");
  const racesCountSub = document.getElementById("home-races-count-sub");

  if (allRaces.length > 0) {
    const completed = allRaces.filter(isRacePast).length;
    racesCountValue.textContent = `${allRaces.length}`;
    racesCountSub.textContent = `${completed} completed · ${allRaces.length - completed} remaining`;
  } else {
    racesCountValue.textContent = "—";
    racesCountSub.textContent = "Calendar unavailable";
  }
}

/* ============================================
   TRACKS MODULE
   ============================================ */
async function fetchTracksData() {
  const cached = cacheGet("tracks_data");
  if (cached) {
    console.log("⚡ Track stats loaded from cache");
    return cached;
  }

  try {
    console.log("📡 Fetching tracks-data.json...");
    const res = await fetch("tracks-data.json");
    if (!res.ok) throw new Error(`tracks-data.json not found: ${res.status}`);
    const json = await res.json();
    console.log(`✅ Track stats loaded (${Object.keys(json).length} circuits)`);
    cacheSet("tracks_data", json);
    return json;
  } catch (err) {
    console.error("❌ Failed to load tracks-data.json:", err);
    return {};
  }
}

async function fetchTrackCalendar(season) {
  const cached = cacheGet(`tracks_calendar_${season}`);
  if (cached) {
    console.log(`⚡ Track calendar ${season} loaded from cache`);
    return cached;
  }

  try {
    console.log(`📡 Fetching ${season} calendar for tracks...`);
    const res = await fetch(`${API_BASE}/${season}/races/?format=json`);
    if (!res.ok) throw new Error(`API request failed: ${res.status}`);

    const json = await res.json();
    const rawRaces = json?.MRData?.RaceTable?.Races;

    if (!rawRaces || rawRaces.length === 0) {
      console.warn(`⚠️ API returned empty ${season} calendar`);
      return [];
    }

    const normalized = rawRaces.map(r => ({
      round: Number(r.round),
      name: r.raceName,
      circuitId: r.Circuit?.circuitId || "",
      circuitName: r.Circuit?.circuitName || "Unknown",
      country: r.Circuit?.Location?.country || "",
      locality: r.Circuit?.Location?.locality || "",
      date: r.date || null
    }));

    console.log(`✅ Track calendar ${season} fetched (${normalized.length} races)`);
    cacheSet(`tracks_calendar_${season}`, normalized);
    return normalized;
  } catch (err) {
    console.error(`❌ Failed to fetch ${season} track calendar:`, err);
    return [];
  }
}

function findTrackKey(race) {
  const combined = `${race.name} ${race.circuitId} ${race.circuitName}`.toLowerCase();

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
  if (combined.includes("montreal") || combined.includes("canada") || combined.includes("villeneuve")) return "canadian";
  if (combined.includes("silverstone") || combined.includes("british")) return "british";
  if (combined.includes("austria") || combined.includes("spielberg") || combined.includes("red bull ring")) return "austrian";
  if (combined.includes("paul ricard") || combined.includes("french")) return "french";
  if (combined.includes("hungaroring") || combined.includes("hungary")) return "hungarian";
  if (combined.includes("spa") || combined.includes("belgian")) return "belgian";
  if (combined.includes("zandvoort") || combined.includes("dutch")) return "dutch";
  if (combined.includes("monza") || combined.includes("italian")) return "italian";
  if (combined.includes("singapore") || combined.includes("marina bay")) return "singapore";
  if (combined.includes("suzuka") || combined.includes("japanese")) return "japanese";
  if (combined.includes("losail") || combined.includes("qatar")) return "qatar";
  if (combined.includes("texas") || combined.includes("austin") || combined.includes("cota")) return "united states";
  if (combined.includes("mexico") || combined.includes("rodriguez")) return "mexican";
  if (combined.includes("brazil") || combined.includes("interlagos") || combined.includes("sao paulo")) return "brazilian";
  if (combined.includes("las vegas")) return "las vegas";
  if (combined.includes("abu dhabi") || combined.includes("yas marina")) return "abu dhabi";
  if (combined.includes("portimao") || combined.includes("portugal") || combined.includes("algarve")) return "portuguese";
  if (combined.includes("shanghai") || combined.includes("china")) return "chinese";

  return null;
}

function buildTrackCard(race, stats) {
  const trackKey = findTrackKey(race);
  const svgFile = trackKey ? TRACK_SVG_MAP[trackKey] : null;
  const svgPath = svgFile ? `images/tracks/${svgFile}` : null;

  const card = document.createElement("article");
  card.className = "track-card";

  const mapDiv = document.createElement("div");
  mapDiv.className = "track-map";

  if (svgPath) {
    const img = document.createElement("img");
    img.src = svgPath;
    img.alt = `${race.name} layout`;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.filter = "drop-shadow(0 0 8px rgba(225, 6, 0, 0.45))";
    img.onerror = () => {
      mapDiv.innerHTML = `<span style="color: var(--text-muted); font-size: 0.7rem; text-align: center; font-family: var(--font-mono);">Track image not found<br>${svgFile}</span>`;
    };
    mapDiv.appendChild(img);
  } else {
    mapDiv.innerHTML = `<span style="color: var(--text-muted); font-size: 0.7rem; text-align: center; font-family: var(--font-mono);">No SVG mapped<br>${race.circuitName}</span>`;
  }

  const details = document.createElement("div");
  details.className = "track-details";

  const round = document.createElement("div");
  round.className = "track-round";
  round.textContent = `Round ${race.round}`;

  const name = document.createElement("h3");
  name.className = "track-name";
  name.textContent = race.name;

  const location = document.createElement("div");
  location.className = "track-location";
  location.innerHTML = `<span class="track-flag">${getFlagEmoji(race.country)}</span><span>${race.circuitName}${race.locality ? " · " + race.locality : ""}</span>`;

  details.appendChild(round);
  details.appendChild(name);
  details.appendChild(location);

  if (stats) {
    const statsRow = document.createElement("div");
    statsRow.className = "track-stats";

    if (stats.length) {
      statsRow.innerHTML += `
        <div class="track-stat">
          <span class="track-stat-label">Length</span>
          <span class="track-stat-value">${stats.length}</span>
        </div>
      `;
    }
    if (stats.laps) {
      statsRow.innerHTML += `
        <div class="track-stat">
          <span class="track-stat-label">Laps</span>
          <span class="track-stat-value">${stats.laps}</span>
        </div>
      `;
    }
    if (stats.lapRecord) {
      statsRow.innerHTML += `
        <div class="track-stat">
          <span class="track-stat-label">Lap Record</span>
          <span class="track-stat-value">${stats.lapRecord}</span>
        </div>
      `;
    }
    if (stats.turns) {
      statsRow.innerHTML += `
        <div class="track-stat">
          <span class="track-stat-label">Turns</span>
          <span class="track-stat-value">${stats.turns}</span>
        </div>
      `;
    }

    details.appendChild(statsRow);

    if (stats.highlights && stats.highlights.length > 0) {
      const highlights = document.createElement("div");
      highlights.className = "track-highlights";
      stats.highlights.forEach(h => {
        const item = document.createElement("div");
        item.className = "track-highlight";
        item.innerHTML = `<span class="track-highlight-dot ${h.color}"></span><span>${h.label}</span>`;
        highlights.appendChild(item);
      });
      details.appendChild(highlights);
    }
  }

  card.appendChild(mapDiv);
  card.appendChild(details);
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
    const trackKey = findTrackKey(race);
    const stats = trackKey ? tracksData[trackKey] : null;
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
  if (btn2027) {
    if (cal2027 && cal2027.length > 0) {
      btn2027.hidden = false;
      console.log(`✅ 2027 calendar available (${cal2027.length} races) — showing tab`);
    } else {
      btn2027.hidden = true;
      console.log("ℹ️ 2027 calendar not available — keeping tab hidden");
    }
  }

  currentTrackSeason = 2026;
  const btn2026 = document.querySelector('.season-btn[data-season="2026"]');
  if (btn2026) btn2026.classList.add("active");

  renderTrackCards(2026);
  setupSeasonToggle();
}

/* ============================================
   TAB SWITCHING (TOP NAV + MOBILE NAV + FOOTER)
   ============================================ */
function switchTab(tab) {
  if (!tab) return;

  // Update active states sa lahat ng nav types
  document.querySelectorAll(".top-link").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".mobile-link").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  // Show target panel
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  const panel = document.getElementById(`${tab}-tab`);
  if (panel) panel.classList.add("active");

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Close mobile nav if open
  closeMobileNav();

  // Calendar scroll
  if (tab === "calendar") {
    setTimeout(scrollToNextRace, 300);
  }

  // Re-trigger scroll reveal
  setTimeout(setupScrollReveal, 100);
}

function setupTabs() {
  // Top nav links
  document.querySelectorAll(".top-link").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Mobile nav links
  document.querySelectorAll(".mobile-link").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Footer links
  document.querySelectorAll(".footer-link").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Hero action buttons ([data-goto])
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
}

/* ============================================
   MOBILE NAV TOGGLE
   ============================================ */
function setupMobileNav() {
  const menuBtn = document.getElementById("menuBtn");
  const mobileNav = document.getElementById("mobileNav");

  if (!menuBtn || !mobileNav) return;

  menuBtn.addEventListener("click", () => {
    const isOpen = mobileNav.classList.toggle("open");
    menuBtn.classList.toggle("open", isOpen);
  });
}

function closeMobileNav() {
  const menuBtn = document.getElementById("menuBtn");
  const mobileNav = document.getElementById("mobileNav");

  if (mobileNav) mobileNav.classList.remove("open");
  if (menuBtn) menuBtn.classList.remove("open");
}

/* ============================================
   TOP NAV SCROLL STATE
   ============================================ */
function setupNavScroll() {
  const nav = document.getElementById("topNav");
  if (!nav) return;

  const updateNav = () => {
    if (window.scrollY > 40) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  };

  updateNav();
  window.addEventListener("scroll", updateNav, { passive: true });
}

/* ============================================
   SCROLL REVEAL
   ============================================ */
let revealObserver = null;

function setupScrollReveal() {
  const elements = document.querySelectorAll("[data-reveal]");
  if (!elements.length) return;

  if (revealObserver) revealObserver.disconnect();

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -50px 0px"
  });

  elements.forEach(el => revealObserver.observe(el));
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

/* ============================================
   SCROLL TO NEXT RACE
   ============================================ */
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
  // Setup nav & reveal
  setupNavScroll();
  setupMobileNav();
  setupTabs();
  setupScrollReveal();

  // Race calendar skeleton
  const container = document.getElementById("race-container");
  if (container) {
    container.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `;
  }

  // Fetch all data
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
    container.innerHTML = `<p class="empty-state" style="color:var(--red);">Failed to load calendar. Check console.</p>`;
  } else if (races.length > 0) {
    renderRaces();
    setupFilters();

    const results = await fetchAllResults(races);
    window.F1_RESULTS = results;
    renderRaces();

    setTimeout(scrollToNextRace, 500);
  }

  // Render standings & constructors
  renderStandings(standings);
  renderConstructors(constructors);
  renderHome();

  // Start ticker
  startCountdownTicker();

  // Tracks module
  await initTracks();

  // Re-run reveal after everything is rendered
  setTimeout(setupScrollReveal, 200);
}

init();