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

let allRaces = [];
let allDrivers = [];
let allConstructors = [];
let currentFilter = "all";
let countdownTimer = null;

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
    "Abu Dhabi": "🇦🇪"
  };
  return map[country] || "🏁";
}

function getTeamLogo(constructorId) {
  return TEAM_LOGOS[constructorId] || "";
}

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
    badge.textContent = "NEXT UP";
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
    badge.textContent = "SPRINT";
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

function applyFilter(races, filter) {
  if (filter === "upcoming") return races.filter(isRaceUpcoming);
  if (filter === "past") return races.filter(isRacePast);
  return races;
}

function renderRaces() {
  const container = document.getElementById("race-container");
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

function setupHeroActions() {
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.goto;
      const navItem = document.querySelector(`.nav-item[data-tab="${tab}"]`);
      if (navItem) navItem.click();
    });
  });
}

function setupTabs() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById(`${tab}-tab`).classList.add("active");

      if (window.innerWidth <= 860 && typeof closeMobileNav === "function") closeMobileNav();

      if (tab === "calendar") {
        setTimeout(scrollToNextRace, 100);
      }
    });
  });
}

function setupSidebar() {
  const layout = document.getElementById("layout");
  const collapseBtn = document.getElementById("collapseBtn");
  const hamburger = document.getElementById("hamburger");
  const overlay = document.getElementById("overlay");

  const savedState = localStorage.getItem("sidebarCollapsed");
  if (savedState === "true") layout.classList.add("collapsed");

  collapseBtn.addEventListener("click", () => {
    layout.classList.toggle("collapsed");
    localStorage.setItem("sidebarCollapsed", layout.classList.contains("collapsed"));
  });

  hamburger.addEventListener("click", () => {
    const isOpen = layout.classList.toggle("nav-open");
    document.body.classList.toggle("nav-open", isOpen);
    overlay.classList.toggle("active", isOpen);
  });

  overlay.addEventListener("click", closeMobileNav);

  window.closeMobileNav = closeMobileNav;

  function closeMobileNav() {
    layout.classList.remove("nav-open");
    document.body.classList.remove("nav-open");
    overlay.classList.remove("active");
  }
}

function scrollToNextRace() {
  const next = document.querySelector(".race-card.next");
  if (next && currentFilter === "all") {
    next.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

async function init() {
  const container = document.getElementById("race-container");
  container.innerHTML = `
    <div class="skeleton"></div>
    <div class="skeleton"></div>
    <div class="skeleton"></div>
  `;

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

  if (races.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#e10600;">Failed to load calendar. Check console.</p>`;
  } else {
    renderRaces();
    setupFilters();
    setupTabs();
    setupHeroActions();
    setupSidebar();

    const results = await fetchAllResults(races);
    window.F1_RESULTS = results;
    renderRaces();

    setTimeout(scrollToNextRace, 500);
  }

  renderStandings(standings);
  renderConstructors(constructors);
  renderHome();

  startCountdownTicker();
}

init();