/**
 * TL Ocean Solo Race core settings:
 * W/H = map width/height in characters, STEP_MS = boat movement step interval,
 * SPARKLE_RATE = expected sparkles per second over water.
 */
const W = 160;
const H = 45;
const STEP_MS = 30_000;
const SPARKLE_RATE = 7;
const MAX_CATCHUP_MS = 2 * 60 * 60 * 1000;
const STORAGE_KEY = "tl-ocean-solo-race-v1";

const TITLE = "TL Ocean Solo Race";
const HELP = "Arrow keys steer | A = Anchor | R = Reset";
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

function forwardBlocked(state) {
  const dir = DIRS[state.boat.dir];
  const nx = state.boat.x + dir.dx;
  const ny = state.boat.y + dir.dy;
  if (nx < 0 || ny < 0 || nx >= W || ny >= H) return true;
  return state.map[ny][nx] === "#";
}

function tryMoveOneCell(state) {
  if (state.boat.anchored) return false;
  const dir = DIRS[state.boat.dir];
  const nx = state.boat.x + dir.dx;
  const ny = state.boat.y + dir.dy;
  if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
  if (state.map[ny][nx] === "#") return false;
  state.boat.x = nx;
  state.boat.y = ny;
  return true;
}

function saveState(state) {
  const payload = {
    seed: state.seed,
    boat: state.boat,
    lastTickMs: state.lastTickMs,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function newGame(seed) {
  const map = generateIslands(seed);
  const start = findWaterStart(map);
  return {
    seed,
    map,
    boat: {
      x: start.x,
      y: start.y,
      dir: "E",
      anchored: false,
    },
    lastTickMs: nowMs(),
    sparkles: [],
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
      lastTickMs: Number(saved.lastTickMs) || nowMs(),
      sparkles: [],
      lastFrameMs: performance.now(),
    };

    if (state.map[state.boat.y][state.boat.x] === "#") {
      const start = findWaterStart(map);
      state.boat.x = start.x;
      state.boat.y = start.y;
    }

    return state;
  } catch {
    const seed = Math.floor(nowMs() % 1_000_000_000);
    return newGame(seed);
  }
}

function applyCatchUp(state) {
  const now = nowMs();
  let elapsed = now - state.lastTickMs;
  if (elapsed <= 0) return;

  elapsed = Math.min(elapsed, MAX_CATCHUP_MS);
  const steps = Math.floor(elapsed / STEP_MS);
  if (steps <= 0) return;

  if (state.boat.anchored) {
    state.lastTickMs += steps * STEP_MS;
    return;
  }

  if (forwardBlocked(state)) {
    state.lastTickMs += steps * STEP_MS;
    return;
  }

  for (let i = 0; i < steps; i += 1) {
    const moved = tryMoveOneCell(state);
    if (!moved) break;
  }

  state.lastTickMs += steps * STEP_MS;
}

function processLiveTicks(state) {
  const now = nowMs();
  let elapsed = now - state.lastTickMs;
  if (elapsed < STEP_MS) return;

  const steps = Math.floor(elapsed / STEP_MS);
  if (steps <= 0) return;

  if (state.boat.anchored || forwardBlocked(state)) {
    state.lastTickMs += steps * STEP_MS;
    saveState(state);
    return;
  }

  for (let i = 0; i < steps; i += 1) {
    tryMoveOneCell(state);
  }
  state.lastTickMs += steps * STEP_MS;
  saveState(state);
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

  const lines = [];
  lines.push(`┌${"─".repeat(W)}┐`);
  lines.push(`│${centered(TITLE, W)}│`);

  for (let y = 0; y < H; y += 1) {
    let row = "";
    for (let x = 0; x < W; x += 1) {
      if (x === state.boat.x && y === state.boat.y) {
        row += `<span class="boat">${DIRS[state.boat.dir].glyph}</span>`;
        continue;
      }
      const sparkle = sparkleMap.get(`${x},${y}`);
      if (sparkle && state.map[y][x] === ".") {
        row += sparkle;
      } else {
        row += escapeHtml(state.map[y][x]);
      }
    }
    lines.push(`│${row}│`);
  }

  const mode = state.boat.anchored ? "ANCHORED" : "SAILING";
  const extra = noticeUntil > nowMs() && notice ? ` | ${notice}` : "";
  const status = `DIR:${state.boat.dir} POS:${state.boat.x},${state.boat.y} ${mode} SEED:${state.seed}${extra}`;

  lines.push(`│${fitLine(status, W)}│`);
  lines.push(`│${fitLine(HELP, W)}│`);
  lines.push(`└${"─".repeat(W)}┘`);

  screen.innerHTML = lines.join("\n");
}

function renderIntro() {
  const lines = [];
  lines.push(`┌${"─".repeat(W)}┐`);
  lines.push(`│${centered(TITLE, W)}│`);

  const buttonLabel = "[ START SAILING ]";
  const hintLabel = "Press Enter / Space / S";
  const contentWidth = Math.max(...INTRO_TEXT.map((line) => line.length), buttonLabel.length, hintLabel.length);
  const windowWidth = contentWidth + 4;
  const windowHeight = INTRO_TEXT.length + 6;
  const leftPad = Math.floor((W - windowWidth) / 2);
  const topPad = Math.floor((H - windowHeight) / 2);

  for (let y = 0; y < H; y += 1) {
    let row = " ".repeat(W);

    if (y >= topPad && y < topPad + windowHeight) {
      const localY = y - topPad;
      if (localY === 0 || localY === windowHeight - 1) {
        row = `${" ".repeat(leftPad)}+${"-".repeat(windowWidth - 2)}+${" ".repeat(W - leftPad - windowWidth)}`;
      } else {
        const contentRow = localY - 1;
        let inner = " ".repeat(windowWidth - 2);
        const textIndex = contentRow - 1;

        if (textIndex >= 0 && textIndex < INTRO_TEXT.length) {
          inner = centered(INTRO_TEXT[textIndex], windowWidth - 2);
        }

        if (contentRow === INTRO_TEXT.length + 2) {
          const buttonPadLeft = Math.floor((windowWidth - 2 - buttonLabel.length) / 2);
          const buttonPadRight = windowWidth - 2 - buttonLabel.length - buttonPadLeft;
          inner = `${" ".repeat(buttonPadLeft)}<span class="intro-start" role="button" tabindex="0" aria-label="Start Sailing" data-start="true">${buttonLabel}</span>${" ".repeat(buttonPadRight)}`;
        }

        if (contentRow === INTRO_TEXT.length + 3) {
          inner = centered(hintLabel, windowWidth - 2);
        }

        row = `${" ".repeat(leftPad)}|${inner}|${" ".repeat(W - leftPad - windowWidth)}`;
      }
    }

    lines.push(`│${row}│`);
  }

  lines.push(`│${fitLine("", W)}│`);
  lines.push(`│${fitLine("", W)}│`);
  lines.push(`└${"─".repeat(W)}┘`);

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
