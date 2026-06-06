const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const addPlayerBtn = document.getElementById("addPlayerBtn");
const playersConfig = document.getElementById("playersConfig");

const globalHpInput = document.getElementById("globalHp");
const globalMaxHpInput = document.getElementById("globalMaxHp");

let players = [];
let playerId = 0;

let running = false;
let countdownText = "";
let countdownActive = false;
let winSoundPlayed = false;
let winnerDeclared = false;

let mediaRecorder;
let recordedChunks = [];
let audioCtx;
let audioDestination;
let recording = false;

let particles = [];

const arena = {
  x: canvas.width / 2,
  y: canvas.height / 2 + 100,
  radius: 310
};

const swordLength = 70;
const swordWidth = 8;

function createPlayer(name = `Player ${players.length + 1}`, color = randomColor()) {
  const moveAngle = Math.random() * Math.PI * 2;
  const spawnAngle = Math.random() * Math.PI * 2;

  const player = {
    id: playerId++,
    name,
    color,
    image: null,

    x: arena.x + Math.cos(spawnAngle) * 120,
    y: arena.y + Math.sin(spawnAngle) * 120,

    r: 28,
    hp: 10,
    maxHp: 10,

    angle: Math.random() * Math.PI * 2,
    rotationSpeed: Math.random() > 0.5 ? 0.05 : -0.05,

    speed: 10,
    vx: Math.cos(moveAngle) * 10,
    vy: Math.sin(moveAngle) * 10,

    hitCooldown: 0,
    alive: true
  };

  players.push(player);
  createPlayerControls(player);
  draw();
}

function createPlayerControls(player) {
  const div = document.createElement("div");
  div.className = "playerControls";
  div.dataset.playerId = player.id;

  div.innerHTML = `
    <input type="text" value="${player.name}" placeholder="Nume">
    <input type="number" value="${player.maxHp}" min="1" max="999" title="HP">
    <input type="color" value="${player.color}">
    <input type="file" accept="image/*">
    <button>Șterge</button>
  `;

  const nameInput = div.querySelector("input[type='text']");
  const hpInput = div.querySelector("input[type='number']");
  const colorInput = div.querySelector("input[type='color']");
  const fileInput = div.querySelector("input[type='file']");
  const deleteBtn = div.querySelector("button");

  nameInput.addEventListener("input", () => {
    player.name = nameInput.value || "Player";
    draw();
  });

  hpInput.addEventListener("input", () => {
    const hp = Math.max(1, Number(hpInput.value) || 1);
    player.maxHp = hp;
    player.hp = Math.min(player.hp, player.maxHp);
    draw();
  });

  colorInput.addEventListener("input", () => {
    player.color = colorInput.value;
    draw();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const img = new Image();
    img.src = URL.createObjectURL(file);

    img.onload = () => {
      player.image = img;

      const dominantColor = getDominantColor(img);
      player.color = dominantColor;
      colorInput.value = rgbToHex(dominantColor);

      draw();
    };
  });

  deleteBtn.addEventListener("click", () => {
    players = players.filter(p => p.id !== player.id);
    div.remove();
    draw();
  });

  playersConfig.appendChild(div);
}

addPlayerBtn.addEventListener("click", () => {
  createPlayer();
});

startBtn.addEventListener("click", () => {
  if (!running && !countdownActive && players.length >= 2) {
    startCountdown();
  }
});

resetBtn.addEventListener("click", () => {
  resetBattleOnly();
});

function resetGame() {
  players.forEach((p, index) => {
    const moveAngle = Math.random() * Math.PI * 2;
    const spawnAngle = (Math.PI * 2 / players.length) * index;

    p.hp = p.maxHp;
    p.alive = true;

    p.x = arena.x + Math.cos(spawnAngle) * 120;
    p.y = arena.y + Math.sin(spawnAngle) * 120;

    p.vx = Math.cos(moveAngle) * p.speed;
    p.vy = Math.sin(moveAngle) * p.speed;

    p.angle = Math.random() * Math.PI * 2;
    p.hitCooldown = 0;

    normalizeSpeed(p);
  });

  particles = [];
  winnerDeclared = false;
  winSoundPlayed = false;
}

function resetBattleOnly() {
  running = false;
  countdownActive = false;
  countdownText = "";
  winnerDeclared = false;
  winSoundPlayed = false;

  resetGame();

  if (recording && mediaRecorder && mediaRecorder.state !== "inactive") {
    recording = false;
    mediaRecorder.stop();
  }

  draw();
}

function startCountdown() {
  resetGame();
  startRecording();

  countdownActive = true;

  const names = players.map(p => p.name).join(" vs ");

  const sequence = [
    names,
    "3",
    "2",
    "1",
    "GO"
  ];

  let index = 0;

  function nextText() {
    countdownText = sequence[index];

    if (countdownText === "GO") {
      playGoSound();
    } else {
      playCountdownSound();
    }

    draw();

    index++;

    if (index < sequence.length) {
      setTimeout(nextText, 900);
    } else {
      setTimeout(() => {
        countdownText = "";
        countdownActive = false;
        running = true;
        gameLoop();
      }, 700);
    }
  }

  nextText();
}

function normalizeSpeed(p) {
  const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (len === 0) return;

  p.vx = (p.vx / len) * p.speed;
  p.vy = (p.vy / len) * p.speed;
}

function getBestMimeType() {
  const types = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function startRecording() {
  recordedChunks = [];

  document.querySelectorAll(".downloadBtn").forEach(btn => btn.remove());

  if (!audioCtx) {
    audioCtx = new AudioContext();
    audioDestination = audioCtx.createMediaStreamDestination();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const canvasStream = canvas.captureStream(30);

  const finalStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks()
  ]);

  const mimeType = getBestMimeType();

  const options = {
    videoBitsPerSecond: 5000000,
    audioBitsPerSecond: 128000
  };

  if (mimeType) {
    options.mimeType = mimeType;
  }

  mediaRecorder = new MediaRecorder(finalStream, options);

  mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    const isMp4 = mimeType.includes("mp4");
    const blobType = isMp4 ? "video/mp4" : "video/webm";
    const extension = isMp4 ? "mp4" : "webm";

    const blob = new Blob(recordedChunks, {
      type: blobType
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `battle-video.${extension}`;
    a.textContent = `Salvează videoclipul .${extension}`;
    a.className = "downloadBtn";

    document.body.appendChild(a);
  };

  mediaRecorder.start();
  recording = true;
}

function stopRecordingNow() {
  if (recording && mediaRecorder && mediaRecorder.state !== "inactive") {
    recording = false;
    mediaRecorder.stop();
  }
}

function keepFinalFrameRecording(duration = 500) {
  const start = performance.now();

  function loop(now) {
    drawWinnerScreenOnly();

    if (now - start < duration) {
      requestAnimationFrame(loop);
    } else {
      stopRecordingNow();
    }
  }

  requestAnimationFrame(loop);
}

function playHitSound() {
  playBeep(500, 0.12, "square", 0.15);
}

function playCountdownSound() {
  playBeep(440, 0.12, "sine", 0.18);
}

function playGoSound() {
  playBeep(800, 0.25, "triangle", 0.22);
}

function playWinSound() {
  playBeep(1000, 0.5, "sawtooth", 0.22);
}

function playBounceSound() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    audioDestination = audioCtx.createMediaStreamDestination();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);

  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.connect(audioDestination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

function playBeep(freq, duration, type = "sine", volume = 0.18) {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    audioDestination = audioCtx.createMediaStreamDestination();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.frequency.value = freq;
  osc.type = type;

  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.001,
    audioCtx.currentTime + duration
  );

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.connect(audioDestination);

  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function createHitParticles(x, y, color) {
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 3 + Math.random() * 4,
      life: 35,
      maxLife: 35,
      color
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life--;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function getDominantColor(img) {
  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = 50;
  tempCanvas.height = 50;

  tempCtx.drawImage(img, 0, 0, 50, 50);

  const data = tempCtx.getImageData(0, 0, 50, 50).data;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;

    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }

  if (count === 0) return "#ffffff";

  r = Math.round(r / count);
  g = Math.round(g / count);
  b = Math.round(b / count);

  return `rgb(${r}, ${g}, ${b})`;
}

function rgbToHex(rgb) {
  if (rgb.startsWith("#")) return rgb;

  const result = rgb.match(/\d+/g);
  if (!result) return "#ffffff";

  const r = Number(result[0]);
  const g = Number(result[1]);
  const b = Number(result[2]);

  return (
    "#" +
    [r, g, b]
      .map(x => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

function randomColor() {
  return "#" + Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, "0");
}

function drawImageCover(img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);

  const newW = img.width * scale;
  const newH = img.height * scale;

  const offsetX = x + (w - newW) / 2;
  const offsetY = y + (h - newH) / 2;

  ctx.drawImage(img, offsetX, offsetY, newW, newH);
}

function drawHealthBars() {
  const margin = 20;
  const avatarSize = 34;
  const gap = 8;

  const count = players.length;
  if (count === 0) return;

  let barsPerRow = 2;

  if (count >= 5) barsPerRow = 3;
  if (count >= 9) barsPerRow = 4;

  const rows = Math.ceil(count / barsPerRow);

  const barHeight = Math.max(10, 24 - rows * 2);
  const fontSize = Math.max(8, 16 - rows);

  const totalWidth = canvas.width - margin * 2;
  const barBlockWidth = totalWidth / barsPerRow - gap;

  players.forEach((p, index) => {
    const row = Math.floor(index / barsPerRow);
    const col = index % barsPerRow;

    const x = margin + col * (barBlockWidth + gap);
    const y = 25 + row * 58;

    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));

    drawAvatar(p, x, y, avatarSize);

    const barX = x + avatarSize + 8;
    const barY = y + 5;
    const barWidth = barBlockWidth - avatarSize - 8;

    ctx.fillStyle = "gray";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "lime";
    ctx.fillRect(barX, barY, barWidth * ratio, barHeight);

    ctx.strokeStyle = "darkgreen";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth * ratio, barHeight);

    ctx.strokeStyle = "white";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    const text = `${p.name}: ${p.hp}/${p.maxHp}`;
    let size = fontSize;

    ctx.font = `${size}px Arial`;

    while (ctx.measureText(text).width > barWidth && size > 7) {
      size--;
      ctx.font = `${size}px Arial`;
    }

    ctx.fillStyle = p.alive ? "white" : "gray";
    ctx.fillText(text, barX, barY + barHeight + 14);
  });
}

function drawAvatar(player, x, y, size) {
  ctx.save();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (player.image) {
    drawImageCover(player.image, x, y, size, size);
  } else {
    ctx.fillStyle = player.color;
    ctx.fillRect(x, y, size, size);
  }

  ctx.restore();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.strokeStyle = player.color;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawArena() {
  ctx.beginPath();
  ctx.arc(arena.x, arena.y, arena.radius, 0, Math.PI * 2);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawPlayer(p) {
  ctx.save();

  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);

  ctx.fillStyle = "white";
  ctx.fillRect(p.r, -swordWidth / 2, swordLength, swordWidth);

  ctx.restore();

  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.closePath();

  if (p.image) {
    ctx.save();
    ctx.clip();

    drawImageCover(
      p.image,
      p.x - p.r,
      p.y - p.r,
      p.r * 2,
      p.r * 2
    );

    ctx.restore();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 4;
    ctx.stroke();
  } else {
    ctx.fillStyle = p.color;
    ctx.fill();
  }
}

function movePlayer(p) {
  p.x += p.vx;
  p.y += p.vy;

  const dx = p.x - arena.x;
  const dy = p.y - arena.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist + p.r >= arena.radius) {
    const nx = dx / dist;
    const ny = dy / dist;

    const dot = p.vx * nx + p.vy * ny;

    p.vx = p.vx - 2 * dot * nx;
    p.vy = p.vy - 2 * dot * ny;

    normalizeSpeed(p);

    p.x = arena.x + nx * (arena.radius - p.r - 1);
    p.y = arena.y + ny * (arena.radius - p.r - 1);

    playBounceSound();
  }

  p.angle += p.rotationSpeed;

  if (p.hitCooldown > 0) {
    p.hitCooldown--;
  }
}

function checkBallCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0 || dist > a.r + b.r) return;

  const nx = dx / dist;
  const ny = dy / dist;

  const overlap = a.r + b.r - dist;

  a.x -= nx * overlap / 2;
  a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2;
  b.y += ny * overlap / 2;

  const tx = -ny;
  const ty = nx;

  const dpTanA = a.vx * tx + a.vy * ty;
  const dpTanB = b.vx * tx + b.vy * ty;

  const dpNormA = a.vx * nx + a.vy * ny;
  const dpNormB = b.vx * nx + b.vy * ny;

  a.vx = tx * dpTanA + nx * dpNormB;
  a.vy = ty * dpTanA + ny * dpNormB;
  b.vx = tx * dpTanB + nx * dpNormA;
  b.vy = ty * dpTanB + ny * dpNormA;

  normalizeSpeed(a);
  normalizeSpeed(b);

  playBounceSound();
}

function swordTip(p) {
  return {
    x: p.x + Math.cos(p.angle) * (p.r + swordLength),
    y: p.y + Math.sin(p.angle) * (p.r + swordLength)
  };
}

function swordHitsPlayer(attacker, defender) {
  const tip = swordTip(attacker);

  const dx = tip.x - defender.x;
  const dy = tip.y - defender.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  return dist < defender.r;
}

function swordHandleCollision(attacker, defender) {
  const tip = swordTip(attacker);

  const dx = defender.x - tip.x;
  const dy = defender.y - tip.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist === 0 || dist > defender.r + 12) return;

  const nx = dx / dist;
  const ny = dy / dist;

  const dot = defender.vx * nx + defender.vy * ny;

  defender.vx = defender.vx - 2 * dot * nx;
  defender.vy = defender.vy - 2 * dot * ny;

  normalizeSpeed(defender);

  defender.x += nx * 8;
  defender.y += ny * 8;

  playHitSound();
}

function checkAllSwordHits() {
  for (const attacker of players) {
    if (!attacker.alive) continue;

    for (const defender of players) {
      if (attacker.id === defender.id) continue;
      if (!defender.alive) continue;

      const tip = swordTip(attacker);

      if (swordHitsPlayer(attacker, defender) && defender.hitCooldown === 0) {
        defender.hp = Math.max(0, defender.hp - 1);
        defender.hitCooldown = 20;

        createHitParticles(tip.x, tip.y, attacker.color);
        swordHandleCollision(attacker, defender);
        playHitSound();

        if (defender.hp <= 0) {
          defender.alive = false;
        }
      }
    }
  }
}

function drawWinner() {
  if (winnerDeclared) return;

  const alivePlayers = players.filter(p => p.alive);

  if (alivePlayers.length <= 1 && players.length > 1) {
    running = false;
    winnerDeclared = true;

    if (!winSoundPlayed) {
      playWinSound();
      winSoundPlayed = true;
    }

    drawWinnerScreenOnly();
    keepFinalFrameRecording(500);
  }
}

function drawWinnerScreenOnly() {
  draw();

  const alivePlayers = players.filter(p => p.alive);

  ctx.fillStyle = "white";
  ctx.font = "50px Arial";
  ctx.textAlign = "center";

  if (alivePlayers.length === 1) {
    ctx.fillText(
      `${alivePlayers[0].name} WINS`,
      canvas.width / 2,
      canvas.height / 2
    );
  } else {
    ctx.fillText("DRAW", canvas.width / 2, canvas.height / 2);
  }

  ctx.textAlign = "left";
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawHealthBars();
  drawArena();

  players.forEach(p => {
    if (p.alive) {
      drawPlayer(p);
    }
  });

  drawParticles();

  if (countdownActive) {
    ctx.fillStyle = "white";

    let fontSize = 70;
    ctx.font = `${fontSize}px Arial`;

    while (
      ctx.measureText(countdownText).width > canvas.width - 60 &&
      fontSize > 20
    ) {
      fontSize--;
      ctx.font = `${fontSize}px Arial`;
    }

    ctx.textAlign = "center";
    ctx.fillText(countdownText, canvas.width / 2, canvas.height / 2);
    ctx.textAlign = "left";
  }
}

function gameLoop() {
  if (!running) return;

  players.forEach(p => {
    if (p.alive) {
      movePlayer(p);
    }
  });

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (players[i].alive && players[j].alive) {
        checkBallCollision(players[i], players[j]);
      }
    }
  }

  checkAllSwordHits();

  updateParticles();
  draw();
  drawWinner();

  requestAnimationFrame(gameLoop);
}

createPlayer("RED", "#ff0000");
createPlayer("BLUE", "#0000ff");
draw();
