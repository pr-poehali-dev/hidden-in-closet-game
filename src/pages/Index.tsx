import { useEffect, useRef, useState, useCallback } from "react";

const TILE = 32;
const COLS = 20;
const ROWS = 15;
const PLAYER_SPEED = 3;
const ENEMY_SPEED = 1.2;
const MAX_HP = 5;
const INVINCIBLE_DURATION = 2000;
const DETECTION_RANGE = 150;

type Vec2 = { x: number; y: number };
type GameState = "menu" | "playing" | "gameover" | "win";

const MAP = [
  "####################",
  "#........#.........#",
  "#.##.###.#.###.##..#",
  "#.#..#.....#...#...#",
  "#.#.##.###.#.###.#.#",
  "#...........C......#",
  "#.##.###.#.###.##..#",
  "#.#..#.....#...#...#",
  "#.#.##C###.#.###.#.#",
  "#........#.........#",
  "#.##.###...###.##..#",
  "#.#..#.....#...#...#",
  "#.#.##.###.#.###.#.#",
  "#........#.........#",
  "####################",
];

function isSolid(col: number, row: number): boolean {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return true;
  return MAP[row][col] === "#";
}

function getClosets(): Vec2[] {
  const closets: Vec2[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAP[r][c] === "C") closets.push({ x: c * TILE, y: r * TILE });
    }
  }
  return closets;
}

function dist(a: Vec2, b: Vec2) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function moveWithCollision(pos: Vec2, dx: number, dy: number, size: number): Vec2 {
  let nx = pos.x + dx;
  let ny = pos.y + dy;
  const half = size / 2;

  const leftC = Math.floor((nx - half) / TILE);
  const rightC = Math.floor((nx + half - 1) / TILE);
  const topR = Math.floor((pos.y - half) / TILE);
  const botR = Math.floor((pos.y + half - 1) / TILE);

  if (isSolid(leftC, topR) || isSolid(rightC, topR) || isSolid(leftC, botR) || isSolid(rightC, botR)) {
    nx = pos.x;
  }

  const leftC2 = Math.floor((nx - half) / TILE);
  const rightC2 = Math.floor((nx + half - 1) / TILE);
  const topR2 = Math.floor((ny - half) / TILE);
  const botR2 = Math.floor((ny + half - 1) / TILE);

  if (isSolid(leftC2, topR2) || isSolid(rightC2, topR2) || isSolid(leftC2, botR2) || isSolid(rightC2, botR2)) {
    ny = pos.y;
  }

  return { x: nx, y: ny };
}

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    player: { x: TILE * 1.5, y: TILE * 1.5 },
    enemy: { x: TILE * 10.5, y: TILE * 7.5 },
    enemyDir: { x: 1, y: 0 },
    enemyPatrolTimer: 0,
    hp: MAX_HP,
    inCloset: false,
    nearCloset: false,
    invincible: false,
    invincibleTimer: 0,
    keys: {} as Record<string, boolean>,
    gameState: "menu" as GameState,
    screamAlpha: 0,
    screamTimer: 0,
    frameCount: 0,
    closets: getClosets(),
    surviveTimer: 0,
    WIN_TIME: 60,
    shake: 0,
  });

  const [uiState, setUiState] = useState<{
    hp: number;
    gameState: GameState;
    inCloset: boolean;
    nearCloset: boolean;
    surviveTimer: number;
    winTime: number;
  }>({ hp: MAX_HP, gameState: "menu", inCloset: false, nearCloset: false, surviveTimer: 0, winTime: 60 });

  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    stateRef.current.keys[e.code] = true;
    const s = stateRef.current;
    if ((e.code === "KeyE" || e.code === "Space") && s.gameState === "playing") {
      if (s.nearCloset && !s.inCloset) {
        s.inCloset = true;
      } else if (s.inCloset) {
        s.inCloset = false;
      }
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    stateRef.current.keys[e.code] = false;
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const startGame = useCallback(() => {
    const s = stateRef.current;
    s.player = { x: TILE * 1.5, y: TILE * 1.5 };
    s.enemy = { x: TILE * 10.5, y: TILE * 7.5 };
    s.enemyDir = { x: 1, y: 0 };
    s.enemyPatrolTimer = 0;
    s.hp = MAX_HP;
    s.inCloset = false;
    s.invincible = false;
    s.invincibleTimer = 0;
    s.screamAlpha = 0;
    s.screamTimer = 0;
    s.frameCount = 0;
    s.surviveTimer = 0;
    s.shake = 0;
    s.gameState = "playing";
    setUiState({ hp: MAX_HP, gameState: "playing", inCloset: false, nearCloset: false, surviveTimer: 0, winTime: s.WIN_TIME });
  }, []);

  const handleCanvasClick = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== "playing") return;
    if (s.nearCloset && !s.inCloset) {
      s.inCloset = true;
    } else if (s.inCloset) {
      s.inCloset = false;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    function drawPixelPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, isHiding: boolean, frame: number, invincible: boolean) {
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (isHiding) {
        ctx.fillStyle = "#33224488";
        ctx.fillRect(px - 6, py - 14, 12, 16);
        return;
      }
      if (invincible && Math.floor(frame / 4) % 2 === 0) return;
      const bob = Math.sin(frame * 0.15) * 1;
      ctx.fillStyle = "#e8d5a3";
      ctx.fillRect(px - 4, py - 14 + bob, 8, 6);
      ctx.fillStyle = "#3399ff";
      ctx.fillRect(px - 5, py - 8 + bob, 10, 8);
      ctx.fillRect(px - 5, py + bob, 4, 6);
      ctx.fillRect(px + 1, py + bob, 4, 6);
      ctx.fillStyle = "#e8d5a3";
      ctx.fillRect(px - 7, py - 7 + bob, 2, 5);
      ctx.fillRect(px + 5, py - 7 + bob, 2, 5);
      ctx.fillStyle = "#222";
      ctx.fillRect(px - 3, py - 12 + bob, 2, 2);
      ctx.fillRect(px + 1, py - 12 + bob, 2, 2);
    }

    function drawPixelEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
      const px = Math.floor(x);
      const py = Math.floor(y);
      const bob = Math.sin(frame * 0.1) * 2;
      ctx.fillStyle = "#cc2200";
      ctx.fillRect(px - 5, py - 18 + bob, 10, 10);
      ctx.fillStyle = "#ff3300";
      ctx.fillRect(px - 2, py - 22 + bob, 4, 4);
      ctx.fillRect(px - 7, py - 20 + bob, 2, 4);
      ctx.fillRect(px + 5, py - 20 + bob, 2, 4);
      ctx.fillStyle = "#882200";
      ctx.fillRect(px - 6, py - 8 + bob, 12, 12);
      ctx.fillStyle = "#661100";
      ctx.fillRect(px - 9, py - 7 + bob, 4, 8);
      ctx.fillRect(px + 5, py - 7 + bob, 4, 8);
      ctx.fillStyle = "#990000";
      ctx.fillRect(px - 6, py + 4 + bob, 5, 7);
      ctx.fillRect(px + 1, py + 4 + bob, 5, 7);
      ctx.fillStyle = "#ffdd00";
      ctx.fillRect(px - 3, py - 16 + bob, 2, 3);
      ctx.fillRect(px + 1, py - 16 + bob, 2, 3);
    }

    function drawCloset(ctx: CanvasRenderingContext2D, x: number, y: number, isNear: boolean) {
      const px = Math.floor(x);
      const py = Math.floor(y);
      ctx.fillStyle = "#5c3d1e";
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = "#3d2910";
      ctx.fillRect(px + 2, py + 2, TILE - 4, 4);
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(px + 4, py + 8, 10, 20);
      ctx.fillRect(px + TILE - 14, py + 8, 10, 20);
      ctx.fillStyle = "#c8a96e";
      ctx.fillRect(px + TILE / 2 - 2, py + 16, 4, 4);
      ctx.fillRect(px + TILE / 2 - 6, py + 17, 2, 2);
      ctx.fillRect(px + TILE / 2 + 4, py + 17, 2, 2);
      if (isNear) {
        ctx.strokeStyle = "#ffdd44";
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = "rgba(255,220,50,0.08)";
        ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      }
    }

    function drawTile(ctx: CanvasRenderingContext2D, col: number, row: number) {
      const x = col * TILE;
      const y = row * TILE;
      const ch = MAP[row][col];
      if (ch === "#") {
        ctx.fillStyle = "#1a0808";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#2d1515";
        ctx.fillRect(x, y, TILE, 2);
        ctx.fillRect(x, y, 2, TILE);
        ctx.fillStyle = "#0f0303";
        ctx.fillRect(x + TILE - 2, y, 2, TILE);
        ctx.fillRect(x, y + TILE - 2, TILE, 2);
      } else {
        const shade = ((col + row) % 2 === 0) ? "#0c0c0e" : "#10101200";
        ctx.fillStyle = shade;
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "#0d0d0f";
        ctx.fillRect(x, y, TILE, 1);
        ctx.fillRect(x, y, 1, TILE);
      }
    }

    function drawLight(ctx: CanvasRenderingContext2D, px: number, py: number, inCloset: boolean, frame: number) {
      const flicker = 0.9 + Math.sin(frame * 0.3) * 0.04 + (Math.random() - 0.5) * 0.06;
      const radius = inCloset ? 35 : 170;
      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius * flicker);
      gradient.addColorStop(0, "rgba(255, 220, 160, 0.3)");
      gradient.addColorStop(0.35, "rgba(220, 160, 80, 0.12)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, radius * flicker, 0, Math.PI * 2);
      ctx.fill();
    }

    function gameLoop(ts: number) {
      const dt = Math.min(ts - (lastTimeRef.current || ts), 50);
      lastTimeRef.current = ts;

      const s = stateRef.current;
      s.frameCount++;

      if (s.gameState !== "playing") {
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      s.surviveTimer += dt / 1000;
      if (s.surviveTimer >= s.WIN_TIME) {
        s.gameState = "win";
        setUiState((u) => ({ ...u, gameState: "win", surviveTimer: s.surviveTimer }));
        rafRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      if (!s.inCloset) {
        let dx = 0, dy = 0;
        if (s.keys["ArrowLeft"] || s.keys["KeyA"]) dx -= PLAYER_SPEED;
        if (s.keys["ArrowRight"] || s.keys["KeyD"]) dx += PLAYER_SPEED;
        if (s.keys["ArrowUp"] || s.keys["KeyW"]) dy -= PLAYER_SPEED;
        if (s.keys["ArrowDown"] || s.keys["KeyS"]) dy += PLAYER_SPEED;
        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
        s.player = moveWithCollision(s.player, dx, dy, 12);
      }

      const closetDist = s.closets.reduce((min, c) => {
        const d = dist(s.player, { x: c.x + TILE / 2, y: c.y + TILE / 2 });
        return d < min ? d : min;
      }, Infinity);
      s.nearCloset = closetDist < TILE * 1.2;

      s.enemyPatrolTimer -= dt;
      if (s.enemyPatrolTimer <= 0) {
        s.enemyPatrolTimer = 700 + Math.random() * 1300;
        const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
        s.enemyDir = dirs[Math.floor(Math.random() * dirs.length)];
      }

      const dToPlayer = dist(s.enemy, s.player);
      let edx = 0, edy = 0;
      if (!s.inCloset && dToPlayer < DETECTION_RANGE) {
        const norm = dToPlayer || 1;
        edx = ((s.player.x - s.enemy.x) / norm) * ENEMY_SPEED * 2;
        edy = ((s.player.y - s.enemy.y) / norm) * ENEMY_SPEED * 2;
      } else {
        edx = s.enemyDir.x * ENEMY_SPEED;
        edy = s.enemyDir.y * ENEMY_SPEED;
      }
      const newEnemy = moveWithCollision(s.enemy, edx, edy, 14);
      if (newEnemy.x === s.enemy.x && newEnemy.y === s.enemy.y) {
        s.enemyPatrolTimer = 0;
      }
      s.enemy = newEnemy;

      if (s.invincible) {
        s.invincibleTimer -= dt;
        if (s.invincibleTimer <= 0) s.invincible = false;
      }

      if (!s.inCloset && !s.invincible && dToPlayer < 18) {
        s.hp -= 1;
        s.invincible = true;
        s.invincibleTimer = INVINCIBLE_DURATION;
        s.screamAlpha = 1;
        s.screamTimer = 600;
        s.shake = 18;
        if (s.hp <= 0) {
          s.gameState = "gameover";
          setUiState((u) => ({ ...u, gameState: "gameover", hp: 0 }));
        } else {
          setUiState((u) => ({ ...u, hp: s.hp }));
        }
      }

      if (s.screamTimer > 0) s.screamTimer -= dt;
      if (s.screamAlpha > 0) s.screamAlpha = Math.max(0, s.screamAlpha - dt / 600);
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 0.06);

      const W = COLS * TILE;
      const H = ROWS * TILE;

      ctx.save();
      if (s.shake > 0) {
        ctx.translate(
          (Math.random() - 0.5) * s.shake,
          (Math.random() - 0.5) * s.shake
        );
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(-20, -20, W + 40, H + 40);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (MAP[r][c] !== "C") drawTile(ctx, c, r);
        }
      }

      for (const cl of s.closets) {
        const nearThis = dist(s.player, { x: cl.x + TILE / 2, y: cl.y + TILE / 2 }) < TILE * 1.2;
        drawCloset(ctx, cl.x, cl.y, nearThis && !s.inCloset);
      }

      if (!s.inCloset) {
        drawPixelEnemy(ctx, s.enemy.x, s.enemy.y, s.frameCount);
      }

      drawPixelPlayer(ctx, s.player.x, s.player.y, s.inCloset, s.frameCount, s.invincible);

      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = "#000000e8";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";

      drawLight(ctx, s.player.x, s.player.y - 4, s.inCloset, s.frameCount);

      if (!s.inCloset) {
        const chaseMode = dToPlayer < DETECTION_RANGE;
        const enemyGrad = ctx.createRadialGradient(s.enemy.x, s.enemy.y, 0, s.enemy.x, s.enemy.y, chaseMode ? 100 : 60);
        enemyGrad.addColorStop(0, chaseMode ? "rgba(255,0,0,0.18)" : "rgba(150,0,0,0.1)");
        enemyGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = enemyGrad;
        ctx.beginPath();
        ctx.arc(s.enemy.x, s.enemy.y, chaseMode ? 100 : 60, 0, Math.PI * 2);
        ctx.fill();
      }

      if (s.screamAlpha > 0) {
        ctx.fillStyle = `rgba(160,0,0,${s.screamAlpha * 0.5})`;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.restore();

      setUiState((u) => {
        if (u.inCloset !== s.inCloset || u.nearCloset !== s.nearCloset || Math.abs(u.surviveTimer - s.surviveTimer) > 0.5) {
          return { ...u, inCloset: s.inCloset, nearCloset: s.nearCloset, surviveTimer: s.surviveTimer };
        }
        return u;
      });

      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const W = COLS * TILE;
  const H = ROWS * TILE;

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ background: "#030000", fontFamily: "'Press Start 2P', monospace" }}
    >
      {uiState.gameState === "menu" && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 20,
          background: "radial-gradient(ellipse at center, #1a0505 0%, #000000 70%)",
        }}>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            <div style={{
              color: "#ff2200", fontSize: "clamp(28px, 6vw, 56px)",
              textShadow: "0 0 20px #ff0000, 0 0 60px #ff000066, 0 0 100px #ff000033",
              marginBottom: "12px", letterSpacing: "10px",
            }}>
              HIDE
            </div>
            <div style={{ color: "#441111", fontSize: "clamp(6px, 1.2vw, 9px)", marginBottom: "40px", letterSpacing: "3px" }}>
              — ПИКСЕЛЬНЫЙ ХОРРОР —
            </div>
            <div style={{ color: "#883333", fontSize: "clamp(7px, 1.3vw, 10px)", marginBottom: "48px", lineHeight: "2.4" }}>
              ВЫЖИВИ 60 СЕКУНД<br />
              ПРЯЧЬСЯ В ШКАФ<br />
              НЕ ДАЙ ЕМУ НАЙТИ ТЕБЯ
            </div>
            <div style={{ color: "#442222", fontSize: "clamp(5px, 1vw, 8px)", marginBottom: "48px", lineHeight: "2.6" }}>
              WASD / СТРЕЛКИ — ДВИЖЕНИЕ<br />
              E / ПРОБЕЛ / КЛИК — ШКАФ
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent",
                color: "#ff2200",
                border: "3px solid #cc0000",
                padding: "16px 40px",
                fontSize: "clamp(9px, 1.8vw, 13px)",
                fontFamily: "'Press Start 2P', monospace",
                cursor: "pointer",
                boxShadow: "0 0 20px #cc000066, inset 0 0 20px #33000033",
                letterSpacing: "3px",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#cc0000";
                e.currentTarget.style.color = "#fff";
                e.currentTarget.style.boxShadow = "0 0 40px #ff0000, inset 0 0 20px #44000033";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#ff2200";
                e.currentTarget.style.boxShadow = "0 0 20px #cc000066, inset 0 0 20px #33000033";
              }}
            >
              НАЧАТЬ
            </button>
          </div>
        </div>
      )}

      {uiState.gameState === "gameover" && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 20,
          background: "rgba(8,0,0,0.96)",
        }}>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            <div style={{
              color: "#ff0000", fontSize: "clamp(20px, 4.5vw, 40px)",
              textShadow: "0 0 30px #ff0000, 0 0 60px #ff000044",
              marginBottom: "20px",
              animation: "flicker 0.2s infinite",
            }}>
              ТЫ УМЕР
            </div>
            <div style={{ color: "#551111", fontSize: "clamp(7px, 1.3vw, 10px)", marginBottom: "48px", letterSpacing: "2px" }}>
              ОН НАШЁЛ ТЕБЯ
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent",
                color: "#cc3333",
                border: "2px solid #440000",
                padding: "14px 32px",
                fontSize: "clamp(8px, 1.5vw, 11px)",
                fontFamily: "'Press Start 2P', monospace",
                cursor: "pointer",
                letterSpacing: "2px",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#cc0000"; e.currentTarget.style.color = "#ff4444"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#440000"; e.currentTarget.style.color = "#cc3333"; }}
            >
              СНОВА
            </button>
          </div>
        </div>
      )}

      {uiState.gameState === "win" && (
        <div style={{
          position: "fixed", inset: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", zIndex: 20,
          background: "rgba(0,5,0,0.96)",
        }}>
          <div style={{ textAlign: "center", padding: "0 32px" }}>
            <div style={{
              color: "#44ff66", fontSize: "clamp(20px, 4.5vw, 38px)",
              textShadow: "0 0 20px #44ff66, 0 0 40px #44ff6644",
              marginBottom: "20px",
            }}>
              ТЫ ВЫЖИЛ
            </div>
            <div style={{ color: "#226633", fontSize: "clamp(7px, 1.3vw, 10px)", marginBottom: "48px", letterSpacing: "2px" }}>
              60 СЕКУНД ПОЗАДИ
            </div>
            <button
              onClick={startGame}
              style={{
                background: "transparent",
                color: "#44ff66",
                border: "2px solid #116622",
                padding: "14px 32px",
                fontSize: "clamp(8px, 1.5vw, 11px)",
                fontFamily: "'Press Start 2P', monospace",
                cursor: "pointer",
                letterSpacing: "2px",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#44ff66"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#116622"; }}
            >
              ЕЩЁ РАЗ
            </button>
          </div>
        </div>
      )}

      <div style={{ position: "relative", display: "inline-block" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onClick={handleCanvasClick}
          style={{
            display: "block",
            imageRendering: "pixelated",
            border: "3px solid #220000",
            boxShadow: "0 0 50px #aa000033, 0 0 100px #33000022",
            cursor: uiState.gameState === "playing" ? "crosshair" : "default",
            maxWidth: "calc(100vw - 24px)",
          }}
        />

        {uiState.gameState === "playing" && (
          <>
            <div style={{
              position: "absolute", top: 10, left: 10,
              display: "flex", gap: "5px", alignItems: "center",
            }}>
              {Array.from({ length: MAX_HP }).map((_, i) => (
                <div key={i} style={{
                  width: 12, height: 12,
                  background: i < uiState.hp ? "#ff2200" : "#220000",
                  border: `2px solid ${i < uiState.hp ? "#ff6644" : "#330000"}`,
                  boxShadow: i < uiState.hp ? "0 0 8px #ff2200" : "none",
                  imageRendering: "pixelated",
                  transition: "all 0.25s",
                }} />
              ))}
            </div>

            <div style={{
              position: "absolute", top: 10, right: 10,
              color: uiState.surviveTimer > 45 ? "#44ff66" : "#663333",
              fontSize: "clamp(7px, 1.4vw, 10px)",
              textShadow: uiState.surviveTimer > 45 ? "0 0 10px #44ff66" : "none",
              letterSpacing: "2px",
            }}>
              {Math.max(0, Math.ceil(uiState.winTime - uiState.surviveTimer))}с
            </div>

            <div style={{
              position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
              color: uiState.inCloset ? "#8855cc" : (uiState.nearCloset ? "#ffdd44" : "#332222"),
              fontSize: "clamp(5px, 1vw, 7px)",
              letterSpacing: "2px",
              textShadow: uiState.inCloset ? "0 0 8px #8855cc" : (uiState.nearCloset ? "0 0 6px #ffdd44" : "none"),
              whiteSpace: "nowrap",
              animation: uiState.nearCloset || uiState.inCloset ? "pulse 1s infinite" : "none",
            }}>
              {uiState.inCloset ? "[E] — ВЫЙТИ ИЗ ШКАФА" : uiState.nearCloset ? "[E] — СПРЯТАТЬСЯ" : "WASD — ДВИГАЙСЯ"}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes flicker {
          0%,100% { opacity: 1; }
          33% { opacity: 0.6; }
          66% { opacity: 0.9; }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}