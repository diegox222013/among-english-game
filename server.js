const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

// CONFIGURACIONES Y CLAVES
const NINJA_SECRET_KEY = "diegox222013";
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 1600;

// PLATAFORMAS (Plataformas destructibles / dinámicas)
const PLATFORMS = [
    { id: 'floor1', x: 0, y: 1400, w: 1800, h: 100, type: 'arena', active: true },
    { id: 'floor2', x: 2200, y: 1400, w: 1800, h: 100, type: 'arena', active: true },
    { id: 'plat_left', x: 400, y: 1100, w: 400, h: 30, type: 'danger_zone', active: true },
    { id: 'plat_mid', x: 1800, y: 950, w: 400, h: 30, type: 'bridge', active: true },
    { id: 'plat_right', x: 3000, y: 1100, w: 400, h: 30, type: 'danger_zone', active: true }
];

const PLAYERS = {};
const BULLETS = [];
const TACTICAL_NOTICES = {}; // Mensajes asimétricos por jugador

// ESTADO GLOBAL DEL JUEGO
let GAME_MODE = 'FFA'; // 'FFA', 'TEAM', 'WORD_RUSH', 'HUNTER', 'CREATOR_BOSS'
let CREATOR_BOSS = null;

// BANCO DE EVENTOS ASIMÉTRICOS (Progresión lingüística)
const EVENT_POOL = [
    {
        msg: "DANGER: The central bridge will collapse in 5 seconds!",
        action: () => {
            const bridge = PLATFORMS.find(p => p.id === 'plat_mid');
            if (bridge) bridge.active = false;
            setTimeout(() => { if (bridge) bridge.active = true; }, 7000);
        }
    },
    {
        msg: "INFO: Heavy Weapon Drop incoming on the Western Platform!",
        action: () => {
            BULLETS.push({ x: 600, y: 1050, vx: 0, vy: 0, damage: 80, life: 300, type: 'drop' });
        }
    },
    {
        msg: "WARNING: High Voltage on Eastern floor! Jump now!",
        action: () => {
            Object.values(PLAYERS).forEach(p => {
                if (p.x > 2500 && p.onGround) p.hp -= 35;
            });
        }
    }
];

function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

// Bucle de Eventos Competitivos Tácticos (Cada 15 segundos)
setInterval(() => {
    if (Object.keys(PLAYERS).length === 0) return;

    const currentEvent = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];
    const pKeys = Object.keys(PLAYERS);
    
    // Asimetría: Solo algunos jugadores reciben la advertencia real
    const luckyPlayerId = pKeys[Math.floor(Math.random() * pKeys.length)];
    
    pKeys.forEach(id => {
        if (id === luckyPlayerId) {
            TACTICAL_NOTICES[id] = { text: `📡 [INTEL]: ${currentEvent.msg}`, color: '#38bdf8' };
        } else {
            TACTICAL_NOTICES[id] = { text: "📡 [INTEL]: Static noise... Radio signal lost.", color: '#64748b' };
        }
    });

    // Ejecutar el evento en el mundo después de 5 segundos
    setTimeout(() => {
        currentEvent.action();
        io.emit('chatMessage', { sender: "SYSTEM", text: "⚠️ TACTICAL EVENT EXECUTED!", type: 'alert' });
    }, 5000);

}, 15000);

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        const username = data.name || "Operator";
        const pass = data.adminKey ? data.adminKey.trim() : "";
        const lowerName = username.trim().toLowerCase();

        // VALIDACIÓN RIGUROSA DEL NINJA MEDIANTE SU CLAVE
        let isNinja = (pass === NINJA_SECRET_KEY);
        let isProfe = (lowerName === "profe");
        let isWolfcute = (lowerName === "wolfcute");

        let pRole = 'ROOKIE';
        let color = '#10b981';

        if (isNinja) { pRole = 'NINJA (SHADOW)'; color = '#a855f7'; }
        else if (isProfe) { pRole = 'PROFE (MENTOR)'; color = '#38bdf8'; }
        else if (isWolfcute) { pRole = 'WOLFCUTE (BEAST)'; color = '#ec4899'; }

        PLAYERS[socket.id] = {
            id: socket.id, name: username, pRole, color,
            isNinja, isProfe, isWolfcute,
            x: Math.random() * 1000 + 500, y: 1000,
            w: 36, h: 54, vx: 0, vy: 0, aimAngle: 0,
            hp: isNinja ? 140 : 100, maxHp: isNinja ? 140 : 100,
            stamina: 100, dashCharges: isNinja ? 3 : 1,
            abilityCD: 0, onGround: false, kills: 0
        };

        socket.emit('registered', { id: socket.id, platforms: PLATFORMS });
        io.emit('chatMessage', { sender: "SYSTEM", text: `⚔️ ${username} joined as [${pRole}]`, type: 'system' });
    });

    socket.on('playerInput', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;
        let spd = 1.5;
        let maxSpd = 8;

        if (data.left && p.vx > -maxSpd) p.vx -= spd;
        if (data.right && p.vx < maxSpd) p.vx += spd;
        if (data.up && p.onGround) { p.vy = -18; p.onGround = false; }
    });

    // SISTEMA DE HABILIDADES Y BALANCE DEL NINJA
    socket.on('useAbilityTrigger', () => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0 || p.abilityCD > 0) return;

        let angle = p.aimAngle;

        // 🥷 NINJA: ZIP -> AIR DASH (Consume Cargas)
        if (p.isNinja) {
            if (p.dashCharges > 0) {
                p.vx = Math.cos(angle) * 32;
                p.vy = Math.sin(angle) * 32;
                p.dashCharges--;
                p.abilityCD = 20; // CD corto entre dashes
                
                // Regenerar carga cada 4 segundos
                setTimeout(() => { if (p.dashCharges < 3) p.dashCharges++; }, 4000);
            }
        } 
        // 📚 PROFE: MENTOR VISION (Traduce la última Intel pero revela ubicación)
        else if (p.isProfe) {
            let myNotice = TACTICAL_NOTICES[p.id];
            if (myNotice) {
                myNotice.text += " [TRANSLATED: ¡Peligro o Ventaja inminente!]";
                myNotice.color = "#fcd34d";
            }
            // Muestra posición a los enemigos por breves segundos (Riesgo/Recompensa)
            io.emit('revealProfe', { x: p.x, y: p.y });
            p.abilityCD = 200;
        }
    });

    socket.on('shoot', () => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;
        BULLETS.push({ ownerId: socket.id, x: p.x + p.w/2, y: p.y + p.h/3, vx: Math.cos(p.aimAngle)*24, vy: Math.sin(p.aimAngle)*24, damage: 20, life: 60 });
    });

    socket.on('disconnect', () => delete PLAYERS[socket.id]);
});

// Bucle Principal de Física 60 FPS
setInterval(() => {
    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;

        if (p.abilityCD > 0) p.abilityCD--;
        p.vy += 0.8;
        p.vx *= p.onGround ? 0.85 : 0.95;
        p.x += p.vx; p.y += p.vy;
        p.onGround = false;

        // Colisión con Plataformas Dinámicas
        PLATFORMS.forEach(plat => {
            if (plat.active && checkCollision(p, plat)) {
                if (p.vy > 0 && p.y + p.h - p.vy <= plat.y) {
                    p.y = plat.y - p.h; p.vy = 0; p.onGround = true;
                }
            }
        });
    });

    // Balas
    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && checkCollision({x: b.x-6, y: b.y-6, w: 12, h: 12}, p)) {
                p.hp -= b.damage; b.life = 0;
            }
        });
        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS, platforms: PLATFORMS, notices: TACTICAL_NOTICES });
}, 1000 / 60);

http.listen(3000, () => console.log("🎮 LAST WORD: WAR OF WORDS running on port 3000"));
