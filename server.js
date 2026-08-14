const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

const WORLD_WIDTH = 5760;
const WORLD_HEIGHT = 1600;
const ADMIN_KEY = "admin123";

// Plataformas (Lobby + Arena)
const PLATFORMS = [
    { x: 0, y: 1400, w: 1800, h: 100, type: 'lobby_floor' },
    { x: 0, y: 800, w: 50, h: 600, type: 'wall' },
    { x: 1750, y: 800, w: 50, h: 600, type: 'wall' },
    { x: 2200, y: 1500, w: 1800, h: 100, type: 'grass' },
    { x: 4000, y: 1500, w: 1760, h: 100, type: 'grass' },
    { x: 2500, y: 1300, w: 300, h: 25, type: 'wood' },
    { x: 3000, y: 1120, w: 400, h: 30, type: 'stone' },
    { x: 3600, y: 950, w: 500, h: 35, type: 'stone' }
];

const PORTAL_LOBBY = { x: 1550, y: 1280, w: 120, h: 120 };

const PLAYERS = {};
const BULLETS = [];
const AURA_PARTICLES = [];

// ESTADO DEL MINIJUEGO CO-OP
let GAME_MODE = 'PVP'; // 'PVP' o 'MINIGAME'
let MISSION = { targetWord: "ENGLISH", currentWord: "ENG_ISH", missingLetter: "L", active: false };
const MISSION_ITEMS = [];

function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

function startMinigame() {
    MISSION.active = true;
    MISSION.currentWord = "ENG_ISH";
    MISSION_ITEMS.length = 0;
    const letters = ['L', 'A', 'X', 'Z', 'O'];
    letters.forEach((letra, i) => {
        MISSION_ITEMS.push({
            id: i, text: letra, x: 2500 + (i * 250), y: 1200, w: 40, h: 40,
            isCorrect: letra === MISSION.missingLetter
        });
    });
}

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        const username = data.name || "Guerrero";
        const pass = data.adminKey;
        const lowerName = username.trim().toLowerCase();

        let isProfe = lowerName === "profe";
        let isNinja = lowerName === "ninja";
        let isWolfcute = lowerName === "wolfcute";
        let isAdmin = pass === ADMIN_KEY || isProfe || isNinja || isWolfcute;

        let pSkill = data.skill || 'vines';
        if (isProfe) pSkill = 'english';
        if (isNinja) pSkill = 'ninja_dash';
        if (isWolfcute) pSkill = 'cute_howl';

        PLAYERS[socket.id] = {
            id: socket.id, name: username, isAdmin, isProfe, isNinja, isWolfcute,
            weapon: data.weapon || 'rifle', skill: pSkill,
            inLobby: true,
            x: Math.random() * 800 + 200, y: 1200,
            w: 32, h: 50, vx: 0, vy: 0, aimAngle: 0,
            hp: isAdmin ? 150 : 100, maxHp: isAdmin ? 150 : 100,
            abilityCD: 0, slowedTimer: 0, score: 0, onGround: false
        };

        socket.emit('registered', { id: socket.id, platforms: PLATFORMS, portal: PORTAL_LOBBY });
        io.emit('chatMessage', { sender: "SISTEMA", text: `👉 ${username} ha entrado a la sala.`, type: 'system' });
    });

    socket.on('selectMode', (mode) => {
        GAME_MODE = mode;
        if (mode === 'MINIGAME') startMinigame();
        io.emit('chatMessage', { sender: "SISTEMA", text: `🎮 Modo cambiado a: ${mode}`, type: 'system' });
    });

    socket.on('sendChat', (msg) => {
        const p = PLAYERS[socket.id];
        if (p && msg.trim()) io.emit('chatMessage', { sender: p.name, text: msg.trim(), isAdmin: p.isAdmin });
    });

    socket.on('playerInput', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;
        let spd = p.isAdmin ? 1.6 : 1.3;
        let maxSpd = p.isAdmin ? 8 : 6;

        if (data.left && p.vx > -maxSpd) p.vx -= spd;
        if (data.right && p.vx < maxSpd) p.vx += spd;
        if (data.up && p.onGround) { p.vy = -16; p.onGround = false; }
    });

    socket.on('useAbilityTrigger', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.abilityCD > 0 || p.hp <= 0 || p.inLobby) return;

        // 🎓 HABILIDAD DEL PROFE: Dictionary Barrage
        if (p.isProfe || p.skill === 'english') {
            let angle = p.aimAngle;
            for (let i = -1; i <= 1; i++) {
                BULLETS.push({
                    id: Math.random(), ownerId: socket.id, x: p.x + p.w/2, y: p.y + p.h/3,
                    vx: Math.cos(angle + i * 0.15) * 20, vy: Math.sin(angle + i * 0.15) * 20,
                    damage: 45, life: 60, isBook: true, text: i === 0 ? "A+" : "ABC"
                });
            }
            p.abilityCD = 180;
        }

        // 🥷 HABILIDAD DEL NINJA: Shadow Dash + Shurikens
        if (p.isNinja || p.skill === 'ninja_dash') {
            let angle = p.aimAngle;
            p.vx = Math.cos(angle) * 30; // Teletransporte / Dash sombrío
            p.vy = Math.sin(angle) * 30;
            for (let i = 0; i < 5; i++) {
                let shurikenAngle = angle + (Math.random() - 0.5) * 0.8;
                BULLETS.push({
                    id: Math.random(), ownerId: socket.id, x: p.x + p.w/2, y: p.y + p.h/2,
                    vx: Math.cos(shurikenAngle) * 26, vy: Math.sin(shurikenAngle) * 26,
                    damage: 25, life: 40, isShuriken: true
                });
            }
            p.abilityCD = 140;
        }

        // 🐺 HABILIDAD DE WOLFCUTE: Cute Howl & Pounce
        if (p.isWolfcute || p.skill === 'cute_howl') {
            let angle = p.aimAngle;
            p.vx = Math.cos(angle) * 22;
            p.vy = Math.sin(angle) * 22;
            Object.values(PLAYERS).forEach(enemy => {
                if (enemy.id !== p.id && !enemy.inLobby) {
                    let dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                    if (dist < 220) { enemy.slowedTimer = 60; enemy.hp -= 25; }
                }
            });
            p.abilityCD = 160;
        }
    });

    socket.on('shoot', () => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0 || p.inLobby) return;
        BULLETS.push({
            id: Math.random(), ownerId: socket.id, x: p.x + p.w/2, y: p.y + p.h/3,
            vx: Math.cos(p.aimAngle)*25, vy: Math.sin(p.aimAngle)*25, damage: 22, life: 70
        });
    });

    socket.on('disconnect', () => delete PLAYERS[socket.id]);
});

// Bucle principal de física y auras
setInterval(() => {
    Object.values(PLAYERS).forEach(p => {
        if (p.hp > 0) {
            if (p.inLobby && checkCollision(p, PORTAL_LOBBY)) {
                p.inLobby = false; p.x = 2500; p.y = 400;
            }

            // Generación de Auras según el Nickname
            if (p.isProfe) {
                AURA_PARTICLES.push({ x: p.x + p.w/2, y: p.y + p.h/2, vx: (Math.random()-0.5)*1.5, vy: -Math.random()*2, size: 4, life: 25, type: 'text', text: 'ABC' });
            } else if (p.isNinja) {
                AURA_PARTICLES.push({ x: p.x + p.w/2, y: p.y + p.h/2, vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, size: 5, life: 20, type: 'ninja' });
            } else if (p.isWolfcute) {
                const icons = ['🐾', '🌙', '💖', '🐺'];
                AURA_PARTICLES.push({ x: p.x + p.w/2, y: p.y + p.h/2, vx: (Math.random()-0.5)*1.5, vy: -Math.random()*2, size: 4, life: 25, type: 'text', text: icons[Math.floor(Math.random()*icons.length)] });
            }
        }
    });

    // Actualizar Partículas
    for (let i = AURA_PARTICLES.length - 1; i >= 0; i--) {
        let part = AURA_PARTICLES[i];
        part.x += part.vx; part.y += part.vy; part.life--;
        if (part.life <= 0) AURA_PARTICLES.splice(i, 1);
    }

    // Minijuego Co-op: Comprobar colisión con letras
    if (GAME_MODE === 'MINIGAME' && MISSION.active) {
        Object.values(PLAYERS).forEach(p => {
            if (!p.inLobby && p.hp > 0) {
                MISSION_ITEMS.forEach((item, idx) => {
                    if (checkCollision(p, item)) {
                        if (item.isCorrect) {
                            MISSION.currentWord = "ENGLISH";
                            io.emit('chatMessage', { sender: "SISTEMA", text: `🎉 ¡${p.name} atrapó la 'L' y completó ENGLISH!`, type: 'system' });
                            MISSION.active = false;
                        } else {
                            p.hp -= 20;
                            io.emit('chatMessage', { sender: "SISTEMA", text: `❌ ¡Letra incorrecta! ${p.name} pierde vida.`, type: 'system' });
                        }
                        MISSION_ITEMS.splice(idx, 1);
                    }
                });
            }
        });
    }

    // Movimiento y Balas
    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;
        if (p.abilityCD > 0) p.abilityCD--;
        p.vy += 0.6; p.vx *= p.onGround ? 0.8 : 0.92;
        p.x += p.vx; p.y += p.vy; p.onGround = false;

        PLATFORMS.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vy > 0) { p.y = plat.y - p.h; p.vy = 0; p.onGround = true; }
            }
        });
    });

    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        let bRect = { x: b.x - 5, y: b.y - 5, w: 10, h: 10 };
        Object.values(PLAYERS).forEach(p => {
            if (!p.inLobby && p.id !== b.ownerId && checkCollision(bRect, p)) {
                p.hp -= b.damage; b.life = 0;
            }
        });
        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS, auraParticles: AURA_PARTICLES, mission: MISSION, missionItems: MISSION_ITEMS, gameMode: GAME_MODE });
}, 1000 / 60);

http.listen(3000, () => console.log("Servidor en puerto 3000"));
