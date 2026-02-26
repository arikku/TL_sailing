/**
 * TL Ocean Solo Race core settings:
 * W/H = map width/height in characters.
 */
const W = 160;
const H = 45;
const BOAT_CLEAR_STEP_MS = 30_000;
const BOAT_FRONT_STEP_MS = 20_000;
const WEATHER_STEP_MS = 15_000;
const WEATHER_FRONT_WIDTH = 16;
const SPARKLE_RATE = 7;
const MAX_CATCHUP_MS = 2 * 60 * 60 * 1000;
const STORAGE_KEY = "tl-ocean-solo-race-v1";

const TITLE = "TL Ocean Solo Race";
const HELP = "Arrow keys steer | A = Anchor | R = Reset";
const APHORISMS = [
  "The sea remembers nothing.",
  "You are alone, but not lonely.",
  "Time loosens its grip.",
  "No wake lasts forever.",
  "The map is only a suggestion.",
  "The ocean is older than your doubts.",
  "The wind asks no questions.",
  "Some journeys leave no trace.",
  "Between islands, there is space to think.",
  "The compass points, but you decide.",
  "Still water carries distant stories.",
  "The sea does not hurry.",
  "What you seek may not be land.",
  "Even solitude has tides.",
  "A calm sea does not mean a small journey.",
  "You cannot sail yesterday's wind.",
  "Direction is a choice, not a guarantee.",
  "The longest distances are often internal.",
  "To drift is also a form of travel.",
  "The map changes. The sea remains.",
  "Not all voyages require arrival.",
  "Patience is a sailor’s true compass.",
  "Silence is the widest ocean.",
];
const MIN_QUESTION_MARKS = 5;
const MAX_QUESTION_MARKS = 8;
const INTRO_TEXT = [
  "TL OCEAN SOLO RACE",
  "",
  "> Inspired by historic solo ocean races.",
  "> A single sailor.",
  "> A changing world.",
  "",
  "No crowds.",
  "No timers.",
  "No pressure.",
  "",
  "Each reset generates a new archipelago.",
  "Each voyage stands alone.",
  "",
  "Navigate with patience.",
  "Anchor when needed.",
  "Sail at your own rhythm.",
  "",
  "Press START SAILING to begin.",
];

const DIRS = {
  N: { dx: 0, dy: -1, glyph: "▲" },
  E: { dx: 1, dy: 0, glyph: "▶" },
  S: { dx: 0, dy: 1, glyph: "▼" },
  W: { dx: -1, dy: 0, glyph: "◀" },
};

const screen = document.getElementById("screen");
let notice = "";
let noticeUntil = 0;
let resetConfirmUntil = 0;

function nowMs() {
  return Date.now();
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function centered(text, width) {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text + " ".repeat(width - text.length - left);
}

function fitLine(text, width) {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function escapeHtml(ch) {
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  return ch;
}

function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createSeaGrid() {
  return Array.from({ length: H }, () => Array(W).fill("."));
}

function generateIslands(seed) {
  const grid = createSeaGrid();
  const rng = mulberry32(hashStringToInt(String(seed)));
  const islandCount = randomInt(rng, 9, 12);

  for (let i = 0; i < islandCount; i += 1) {
    const cx = randomInt(rng, 8, W - 9);
    const cy = randomInt(rng, 6, H - 7);
    const blobs = randomInt(rng, 2, 5);

    for (let b = 0; b < blobs; b += 1) {
      const ox = randomInt(rng, -10, 10);
      const oy = randomInt(rng, -6, 6);
      const bx = clamp(cx + ox, 2, W - 3);
      const by = clamp(cy + oy, 2, H - 3);
      const rx = randomInt(rng, 4, 12);
      const ry = randomInt(rng, 2, 7);

      const minX = clamp(bx - rx, 0, W - 1);
      const maxX = clamp(bx + rx, 0, W - 1);
      const minY = clamp(by - ry, 0, H - 1);
      const maxY = clamp(by + ry, 0, H - 1);

      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const nx = (x - bx) / rx;
          const ny = (y - by) / ry;
          if (nx * nx + ny * ny <= 1) {
            grid[y][x] = "#";
          }
        }
      }
    }
  }

  return grid;
}

function findWaterStart(map) {
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);

  if (map[cy][cx] === ".") {
    return { x: cx, y: cy };
  }

  const maxR = Math.max(W, H);
  for (let r = 1; r <= maxR; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (map[y][x] === ".") {
          return { x, y };
        }
      }
    }
  }

  return { x: 0, y: 0 };
}

function generateQuestionMarks(map, start, seed) {
  const rng = mulberry32(hashStringToInt(`qmarks:${seed}`));
  const count = randomInt(rng, MIN_QUESTION_MARKS, MAX_QUESTION_MARKS);
  const waterTiles = [];

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (map[y][x] !== ".") continue;
      if (x === start.x && y === start.y) continue;
      waterTiles.push({ x, y });
    }
  }

  shuffleInPlace(waterTiles, rng);
  const selectedTiles = waterTiles.slice(0, Math.min(count, waterTiles.length));

  const aphorisms = [...APHORISMS];
  shuffleInPlace(aphorisms, rng);

  return selectedTiles.map((tile, i) => ({
    x: tile.x,
    y: tile.y,
    aphorism: aphorisms[i],
  }));
}

function generateWeatherMask(seed) {
  const rng = mulberry32(hashStringToInt(`weather:${seed}`));
  const mask = Array.from({ length: H }, () => Array(WEATHER_FRONT_WIDTH).fill(false));
  const minThickness = Math.max(3, Math.floor(WEATHER_FRONT_WIDTH * 0.4));
  const maxThickness = Math.max(minThickness, Math.floor(WEATHER_FRONT_WIDTH * 0.8));
  let center = randomInt(rng, 0, WEATHER_FRONT_WIDTH - 1);
  let thickness = randomInt(rng, minThickness, maxThickness);

  for (let y = 0; y < H; y += 1) {
    center = clamp(center + randomInt(rng, -1, 1), 0, WEATHER_FRONT_WIDTH - 1);
    thickness = clamp(thickness + randomInt(rng, -1, 1), minThickness, maxThickness);

    const half = Math.floor(thickness / 2);
    const startX = clamp(center - half, 0, WEATHER_FRONT_WIDTH - 1);
    const endX = clamp(center + (thickness - half - 1), 0, WEATHER_FRONT_WIDTH - 1);

    for (let x = startX; x <= endX; x += 1) {
      mask[y][x] = true;
    }
  }

  const holeCount = Math.max(8, Math.floor((H * WEATHER_FRONT_WIDTH) / 18));
  for (let i = 0; i < holeCount; i += 1) {
    const holeX = randomInt(rng, 0, WEATHER_FRONT_WIDTH - 1);
    const holeY = randomInt(rng, 0, H - 1);
    const holeW = randomInt(rng, 2, 3);
    const holeH = randomInt(rng, 1, 2);

    for (let dy = 0; dy < holeH; dy += 1) {
      for (let dx = 0; dx < holeW; dx += 1) {
        const x = holeX + dx;
        const y = holeY + dy;
        if (x >= 0 && x < WEATHER_FRONT_WIDTH && y >= 0 && y < H) {
          mask[y][x] = false;
        }
      }
    }
  }

  const smoothed = Array.from({ length: H }, () => Array(WEATHER_FRONT_WIDTH).fill(false));
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < WEATHER_FRONT_WIDTH; x += 1) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= H || nx < 0 || nx >= WEATHER_FRONT_WIDTH) continue;
          if (mask[ny][nx]) neighbors += 1;
        }
      }
      smoothed[y][x] = neighbors >= 4;
    }
  }

  return smoothed;
}

function weatherCoversTile(state, x, y) {
  const wrappedLocalX = ((x - state.frontOffsetX) % W + W) % W;
  if (wrappedLocalX >= WEATHER_FRONT_WIDTH) return false;
  return Boolean(state.weatherMask[y]?.[wrappedLocalX]);
}

function isBoatInWeatherFront(state) {
  return weatherCoversTile(state, state.boat.x, state.boat.y);
}

function consumeQuestionMarkAt(state, x, y) {
  const idx = state.questionMarks.findIndex((qm) => qm.x === x && qm.y === y);
  if (idx < 0) return;
  const [picked] = state.questionMarks.splice(idx, 1);
  state.foundReflections += 1;
  state.activeAphorism = picked.aphorism;
  state.aphorismVisible = true;
}

function splitAphorism(text, maxLineLength = 20) {
  if (!text || text.length <= maxLineLength) return [text || ""];

  const midpoint = Math.floor(text.length / 2);
  let splitIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 1; i < text.length - 1; i += 1) {
    if (text[i] !== " ") continue;
    const left = text.slice(0, i).trim();
    const right = text.slice(i + 1).trim();
    if (!left || !right) continue;
    const distance = Math.abs(i - midpoint);
    if (distance < bestDistance) {
      splitIndex = i;
      bestDistance = distance;
    }
  }

  if (splitIndex < 0) {
    return [text.slice(0, maxLineLength), text.slice(maxLineLength)];
  }

  return [text.slice(0, splitIndex).trim(), text.slice(splitIndex + 1).trim()];
}

function forwardBlocked(state) {
  const dir = DIRS[state.boat.dir];
  let nx = state.boat.x + dir.dx;
  const ny = state.boat.y + dir.dy;

  if (ny < 0 || ny >= H) return true;
  if (nx < 0) nx = W - 1;
  if (nx >= W) nx = 0;

  return state.map[ny][nx] === "#";
}

function tryMoveOneCell(state) {
  if (state.boat.anchored) return false;
  const dir = DIRS[state.boat.dir];
  let nx = state.boat.x + dir.dx;
  const ny = state.boat.y + dir.dy;

  if (ny < 0 || ny >= H) return false;
  if (nx < 0) nx = W - 1;
  if (nx >= W) nx = 0;

  if (state.map[ny][nx] === "#") return false;

  if (state.aphorismVisible) {
    state.aphorismVisible = false;
    state.activeAphorism = null;
  }

  state.boat.x = nx;
  state.boat.y = ny;
  consumeQuestionMarkAt(state, nx, ny);
  return true;
}

function saveState(state) {
  const payload = {
    seed: state.seed,
    boat: state.boat,
    nextBoatMoveAt: state.nextBoatMoveAt,
    nextWeatherMoveAt: state.nextWeatherMoveAt,
    frontOffsetX: state.frontOffsetX,
    questionMarks: state.questionMarks,
    foundReflections: state.foundReflections,
    totalReflections: state.totalReflections,
    activeAphorism: state.activeAphorism,
    aphorismVisible: state.aphorismVisible,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function newGame(seed) {
  const map = generateIslands(seed);
  const start = findWaterStart(map);
  const weatherMask = generateWeatherMask(seed);
  const weatherRng = mulberry32(hashStringToInt(`weather-start:${seed}`));
  const startFrontOffsetX = randomInt(weatherRng, 0, W - 1);
  const now = nowMs();
  const questionMarks = generateQuestionMarks(map, start, seed);
  return {
    seed,
    map,
    boat: {
      x: start.x,
      y: start.y,
      dir: "E",
      anchored: false,
    },
    nextBoatMoveAt: now + BOAT_CLEAR_STEP_MS,
    nextWeatherMoveAt: now + WEATHER_STEP_MS,
    weatherMask,
    frontOffsetX: startFrontOffsetX,
    sparkles: [],
    questionMarks,
    foundReflections: 0,
    totalReflections: questionMarks.length,
    activeAphorism: null,
    aphorismVisible: false,
    lastFrameMs: performance.now(),
  };
}

function loadGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = Math.floor(nowMs() % 1_000_000_000);
    return newGame(seed);
  }

  try {
    const saved = JSON.parse(raw);
    const map = generateIslands(saved.seed);
    const fallbackStart = findWaterStart(map);
    const bx = clamp(saved?.boat?.x ?? fallbackStart.x, 0, W - 1);
    const by = clamp(saved?.boat?.y ?? fallbackStart.y, 0, H - 1);
    const dir = DIRS[saved?.boat?.dir] ? saved.boat.dir : "E";
    const anchored = Boolean(saved?.boat?.anchored);

    const state = {
      seed: saved.seed,
      map,
      boat: { x: bx, y: by, dir, anchored },
      nextBoatMoveAt: Number(saved.nextBoatMoveAt) || (Number(saved.lastTickMs) || nowMs()) + BOAT_CLEAR_STEP_MS,
      nextWeatherMoveAt: Number(saved.nextWeatherMoveAt) || (Number(saved.lastTickMs) || nowMs()) + WEATHER_STEP_MS,
      weatherMask: generateWeatherMask(saved.seed),
      frontOffsetX: clamp(Number(saved.frontOffsetX) || randomInt(mulberry32(hashStringToInt(`weather-start:${saved.seed}`)), 0, W - 1), 0, W - 1),
      sparkles: [],
      questionMarks: Array.isArray(saved.questionMarks) ? saved.questionMarks : [],
      foundReflections: Number(saved.foundReflections) || 0,
      totalReflections: Number(saved.totalReflections) || 0,
      activeAphorism: typeof saved.activeAphorism === "string" ? saved.activeAphorism : null,
      aphorismVisible: Boolean(saved.aphorismVisible),
      lastFrameMs: performance.now(),
    };

    if (state.map[state.boat.y][state.boat.x] === "#") {
      const start = findWaterStart(map);
      state.boat.x = start.x;
      state.boat.y = start.y;
    }

    const validAphorisms = new Set(APHORISMS);
    state.questionMarks = state.questionMarks.filter((qm) => {
      if (!qm || typeof qm.x !== "number" || typeof qm.y !== "number") return false;
      if (qm.x < 0 || qm.y < 0 || qm.x >= W || qm.y >= H) return false;
      if (map[qm.y][qm.x] !== ".") return false;
      if (!validAphorisms.has(qm.aphorism)) return false;
      return true;
    });

    if (state.questionMarks.length === 0) {
      state.questionMarks = generateQuestionMarks(map, state.boat, state.seed);
      state.foundReflections = 0;
      state.totalReflections = state.questionMarks.length;
      state.activeAphorism = null;
      state.aphorismVisible = false;
    } else {
      const fallbackTotal = state.questionMarks.length + state.foundReflections;
      state.totalReflections = clamp(state.totalReflections || fallbackTotal, state.questionMarks.length, MAX_QUESTION_MARKS);
      state.foundReflections = clamp(state.foundReflections, 0, state.totalReflections - state.questionMarks.length);
    }

    if (!state.aphorismVisible) {
      state.activeAphorism = null;
    }

    return state;
  } catch {
    const seed = Math.floor(nowMs() % 1_000_000_000);
    return newGame(seed);
  }
}

function processLiveTicks(state) {
  const now = nowMs();
  const weatherElapsed = Math.max(0, Math.min(now - state.nextWeatherMoveAt, MAX_CATCHUP_MS));
  const weatherSteps = now >= state.nextWeatherMoveAt ? Math.floor(weatherElapsed / WEATHER_STEP_MS) + 1 : 0;
  let stateChanged = false;

  if (weatherSteps > 0) {
    state.frontOffsetX = (state.frontOffsetX + weatherSteps) % W;
    state.nextWeatherMoveAt += weatherSteps * WEATHER_STEP_MS;
    stateChanged = true;
  }

  if (now >= state.nextBoatMoveAt) {
    if (!state.boat.anchored && !forwardBlocked(state)) {
      tryMoveOneCell(state);
    }
    const boatInterval = isBoatInWeatherFront(state) ? BOAT_FRONT_STEP_MS : BOAT_CLEAR_STEP_MS;
    state.nextBoatMoveAt = now + boatInterval;
    stateChanged = true;
  }

  if (stateChanged) saveState(state);
}

function maybeAddSparkles(state, dtMs) {
  const chance = (SPARKLE_RATE * dtMs) / 1000;
  const rng = Math.random;
  const count = Math.floor(chance) + (rng() < chance % 1 ? 1 : 0);

  for (let i = 0; i < count; i += 1) {
    const x = randomInt(rng, 0, W - 1);
    const y = randomInt(rng, 0, H - 1);
    if (state.map[y][x] !== ".") continue;
    if (x === state.boat.x && y === state.boat.y) continue;

    state.sparkles.push({
      x,
      y,
      ch: rng() < 0.5 ? "*" : "+",
      expiresAt: performance.now() + randomInt(rng, 200, 800),
    });
  }
}

function pruneSparkles(state, nowPerf) {
  state.sparkles = state.sparkles.filter((s) => s.expiresAt > nowPerf);
}

function render(state) {
  const sparkleMap = new Map();
  for (const s of state.sparkles) {
    sparkleMap.set(`${s.x},${s.y}`, s.ch);
  }

  const questionMarkMap = new Map();
  for (const q of state.questionMarks) {
    questionMarkMap.set(`${q.x},${q.y}`, q);
  }

  const lines = [];
  lines.push(`─`.repeat(W));
  lines.push(centered(TITLE, W));

  for (let y = 0; y < H; y += 1) {
    const rowCells = [];
    for (let x = 0; x < W; x += 1) {
      const hasQuestionMark = questionMarkMap.has(`${x},${y}`);

      const isWater = state.map[y][x] === ".";
      const sparkle = sparkleMap.get(`${x},${y}`);
      let cell = sparkle && isWater ? sparkle : escapeHtml(state.map[y][x]);

      if (isWater && weatherCoversTile(state, x, y)) {
        cell = ",";
      }

      if (hasQuestionMark) {
        cell = "?";
      }

      if (x === state.boat.x && y === state.boat.y) {
        rowCells.push(`<span class="boat">${DIRS[state.boat.dir].glyph}</span>`);
        continue;
      }

      rowCells.push(cell);
    }
    lines.push(rowCells.join(""));
  }

  if (state.aphorismVisible && state.activeAphorism) {
    const aphorismLines = splitAphorism(state.activeAphorism, 20).slice(0, 2);
    let startY = state.boat.y - aphorismLines.length;
    if (startY < 0) {
      startY = state.boat.y + 1;
    }
    startY = clamp(startY, 0, H - aphorismLines.length);

    for (let i = 0; i < aphorismLines.length; i += 1) {
      const text = aphorismLines[i];
      const y = startY + i;
      let startX = Math.floor(state.boat.x - text.length / 2);
      startX = clamp(startX, 0, W - text.length);

      const rowIndex = y + 2;
      const rowChars = lines[rowIndex].split("");
      for (let c = 0; c < text.length; c += 1) {
        rowChars[startX + c] = escapeHtml(text[c]);
      }
      lines[rowIndex] = rowChars.join("");
    }
  }

  const mode = state.boat.anchored ? "ANCHORED" : "SAILING";
  const wx = isBoatInWeatherFront(state) ? "FRONT" : "CLEAR";
  const extra = noticeUntil > nowMs() && notice ? ` | ${notice}` : "";
  const status = `DIR:${state.boat.dir} POS:${state.boat.x},${state.boat.y} ${mode} WX:${wx} SEED:${state.seed} Reflections:${state.foundReflections}/${state.totalReflections}${extra}`;

  lines.push(fitLine(status, W));
  lines.push(fitLine(HELP, W));
  lines.push(`─`.repeat(W));

  screen.innerHTML = lines.join("\n");
}

function renderIntro() {
  const lines = [];
  lines.push(centered(TITLE, W));

  const buttonLabel = "[ START SAILING ]";
  const hintLabel = "Press Enter / Space / S";
  const contentWidth = Math.max(...INTRO_TEXT.map((line) => line.length), buttonLabel.length, hintLabel.length);
  const blockWidth = contentWidth;
  const blockHeight = INTRO_TEXT.length + 2;
  const leftPad = Math.floor((W - blockWidth) / 2);
  const topPad = Math.floor((H - blockHeight) / 2);

  for (let y = 0; y < H; y += 1) {
    let row = " ".repeat(W);

    if (y >= topPad && y < topPad + blockHeight) {
      const localY = y - topPad;
      const contentRow = localY;
      let inner = " ".repeat(blockWidth);
      const textIndex = contentRow;

      if (textIndex >= 0 && textIndex < INTRO_TEXT.length) {
        inner = centered(INTRO_TEXT[textIndex], blockWidth);
      }

      if (contentRow === INTRO_TEXT.length) {
        const buttonPadLeft = Math.floor((blockWidth - buttonLabel.length) / 2);
        const buttonPadRight = blockWidth - buttonLabel.length - buttonPadLeft;
        inner = `${" ".repeat(buttonPadLeft)}<span class="intro-start" role="button" tabindex="0" aria-label="Start Sailing" data-start="true">${buttonLabel}</span>${" ".repeat(buttonPadRight)}`;
      }

      if (contentRow === INTRO_TEXT.length + 1) {
        inner = centered(hintLabel, blockWidth);
      }

      row = `${" ".repeat(leftPad)}${inner}${" ".repeat(W - leftPad - blockWidth)}`;
    }

    lines.push(row);
  }

  screen.innerHTML = lines.join("\n");
}

function setNotice(text, ms = 1800) {
  notice = text;
  noticeUntil = nowMs() + ms;
}

let gameState = "intro";
let game = loadGame();

function startSailing() {
  if (gameState !== "intro") return;
  const seed = Math.floor(nowMs() % 1_000_000_000);
  game = newGame(seed);
  saveState(game);
  notice = "";
  noticeUntil = 0;
  resetConfirmUntil = 0;
  gameState = "playing";
}

screen.addEventListener("click", (e) => {
  const target = e.target;
  if (target instanceof HTMLElement && target.dataset.start === "true") {
    startSailing();
  }
});

window.addEventListener("keydown", (e) => {
  if (gameState === "intro") {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.key === "s" || e.key === "S") {
      e.preventDefault();
      startSailing();
    }
    return;
  }

  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    if (e.key === "ArrowUp") game.boat.dir = "N";
    if (e.key === "ArrowRight") game.boat.dir = "E";
    if (e.key === "ArrowDown") game.boat.dir = "S";
    if (e.key === "ArrowLeft") game.boat.dir = "W";
    saveState(game);
    return;
  }

  if (e.key === "a" || e.key === "A") {
    game.boat.anchored = !game.boat.anchored;
    setNotice(game.boat.anchored ? "Anchor dropped" : "Anchor raised");
    saveState(game);
    return;
  }

  if (e.key === "r" || e.key === "R") {
    const now = nowMs();
    if (now <= resetConfirmUntil) {
      const newSeed = Math.floor(now % 1_000_000_000);
      game = newGame(newSeed);
      setNotice("Game reset", 2200);
      saveState(game);
      resetConfirmUntil = 0;
    } else {
      resetConfirmUntil = now + 2000;
      setNotice("Press R again to confirm reset", 2000);
    }
  }
});

function frame(nowPerf) {
  const dt = nowPerf - game.lastFrameMs;
  game.lastFrameMs = nowPerf;

  if (gameState === "playing") {
    processLiveTicks(game);
    maybeAddSparkles(game, dt);
    pruneSparkles(game, nowPerf);
    render(game);
  } else {
    renderIntro();
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
