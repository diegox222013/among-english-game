const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

// ==========================================
// ⚙️ CONFIGURACIÓN Y CONSTANTES
// ==========================================
const ADMIN_KEY = "admin123";
const NINJA_SECRET_KEY = "diegox222013";

let GAME_STATE = 'LOBBY';
let CURRENT_MAP_INDEX = 0;

const MAPS = [
    {
        name: "CYBER CITY NEON",
        width: 6000, height: 3000, bgColor: "#020617",
        platforms: [
            { id: 'f1', x: 0, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'f2', x: 2500, y: 2800, w: 1000, h: 200, type: 'bridge' },
            { id: 'f3', x: 4000, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'p1', x: 800, y: 2400, w: 500, h: 40, type: 'glass' },
            { id: 'p2', x: 1500, y: 2000, w: 400, h: 40, type: 'arena' },
            { id: 'tower1', x: 1800, y: 1000, w: 200, h: 1800, type: 'wall' }
        ],
        spawnPoints: [{x: 500, y: 2500}, {x: 3000, y: 2500}, {x: 5000, y: 2500}]
    }
];

const PLAYERS = {};
const BULLETS = [];

// ==========================================
// 🧬 ESTADÍSTICAS DE CLASES
// ==========================================
const CLASS_STATS = {
    'ASSAULT': { hp: 120, speed: 8, jumps: 2, color: '#38bdf8', w: 36, h: 54, aura: 'electric' },
    'HEAVY':   { hp: 200, speed: 5, jumps: 1, color: '#ef4444', w: 46, h: 64, aura: 'fire' },
    'GHOST':   { hp: 90,  speed: 10, jumps: 3, color: '#10b981', w: 30, h: 48, aura: 'smoke' },
    'DIEGO':   { hp: 110, speed: 12, jumps: 3, color: '#00f3ff', w: 34, h: 52, aura: 'glitch' } // CREATOR
};

// ==========================================
// 🔌 SOCKETS
// ==========================================
io.on('connection', (socket) => {
    
    socket.on('joinLobby', (data) => {
        const username = data.name || `Operator-${Math.floor(Math.random()*1000)}`;
        const pass = data.adminKey ? data.adminKey.trim() : "";
        
        let isAdmin = (pass === ADMIN_KEY);
        let isDiego = (pass === NINJA_SECRET_KEY || pass === ADMIN_KEY); // Acceso a Diego

        PLAYERS[socket.id] = {
            id: socket.id, name: username, role: isAdmin ? 'THE CREATOR' : 'ROOKIE',
            isAdmin: isAdmin, isDiego: isDiego,
            charClass: isDiego ? 'DIEGO' : 'ASSAULT',
            x: 0, y: 0, w: 36, h: 54, vx: 0, vy: 0, aimAngle: 0,
            hp: 100, maxHp: 100, onGround: false, color: '#fff',
            
            // MECÁNICAS ÚNICAS DE DIEGO
            comboTech: 0,           // Pasiva Frame Perfect
            auraLevel: 1,           // 1: STABLE, 2: OVERCLOCK, 3: CORRUPTED
            shotCount: 0,           // Contador para rebotar tiros
            dashCooldown: 0,
            ultActive: false,
            ultTimer: 0,
            modeChaos: false,
            modeChaosTimer: 0
        };

        socket.emit('lobbyData', { state: GAME_STATE, me: PLAYERS[socket.id], map: MAPS[CURRENT_MAP_INDEX] });
        io.emit('updateLobbyPlayers', PLAYERS);
    });

    socket.on('selectClass', (className) => {
        if (GAME_STATE !== 'LOBBY' || !PLAYERS[socket.id]) return;
        if (className === 'DIEGO' && !PLAYERS[socket.id].isDiego) return;
        PLAYERS[socket.id].charClass = className;
        io.emit('updateLobbyPlayers', PLAYERS);
    });

    socket.on('adminAction', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || !p.isAdmin) return;

        if (data.action === 'START_GAME') {
            GAME_STATE = 'PLAYING';
            const currentMap = MAPS[CURRENT_MAP_INDEX];
            
            Object.values(PLAYERS).forEach((player, idx) => {
                const stats = CLASS_STATS[player.charClass];
                player.maxHp = stats.hp; player.hp = stats.hp;
                player.w = stats.w; player.h = stats.h;
                player.color = stats.color; player.aura = stats.aura;
                player.speed = stats.speed; player.maxJumps = stats.jumps;
                player.jumpsLeft = stats.jumps;
                
                let sp = currentMap.spawnPoints[idx % currentMap.spawnPoints.length];
                player.x = sp.x; player.y = sp.y - 100;
                player.vx = 0; player.vy = 0;
            });
            BULLETS.length = 0;
            io.emit('gameStarted', { map: currentMap, players: PLAYERS });
        }
    });

    // ==========================================
    // 🎮 HABILIDADES & INPUTS DE DIEGO
    // ==========================================
    socket.on('playerInput', (data) => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;
        let speedMult = p.ultActive ? 1.5 : (p.modeChaos ? 1.3 : 1.0);
        let maxSpd = (p.speed + (p.comboTech * 0.3)) * speedMult;
        let accel = 1.8;

        if (data.left && p.vx > -maxSpd) p.vx -= accel;
        if (data.right && p.vx < maxSpd) p.vx += accel;
        
        if (data.upTrigger && p.jumpsLeft > 0) { 
            p.vy = -18; p.onGround = false; p.jumpsLeft--; 
        }

        // HABILIDAD 1: GLITCH DASH (Tecla Shift)
        if (data.useDash && p.dashCooldown <= 0) {
            let dashDist = 25;
            p.vx = Math.cos(p.aimAngle) * dashDist;
            p.vy = Math.sin(p.aimAngle) * dashDist;
            p.dashCooldown = p.modeChaos ? 20 : 50; // Menos Cooldown en Modo Caos
            
            if (p.charClass === 'DIEGO') {
                p.comboTech = Math.min(10, p.comboTech + 1); // Subir combo
                io.emit('vfxEvent', { type: 'GLITCH_DASH', x: p.x, y: p.y });
            }
        }

        // HABILIDAD 3 / ULTI (Tecla Q)
        if (data.useUlt && p.charClass === 'DIEGO' && !p.ultActive) {
            p.ultActive = true;
            p.ultTimer = 420; // 7 segundos (60 FPS * 7)
            io.emit('vfxEvent', { type: 'BREAK_THE_GAME', x: p.x, y: p.y, name: p.name });
        }
    });

    socket.on('shoot', () => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        let bSpeed = 28; let bDmg = 20; let bSize = 6; let bColor = p.color;

        if (p.charClass === 'DIEGO') {
            p.shotCount++;
            let isBounceShot = (p.shotCount % 3 === 0);
            
            BULLETS.push({ 
                ownerId: socket.id, 
                x: p.x + p.w/2, y: p.y + p.h/3, 
                vx: Math.cos(p.aimAngle)*bSpeed, 
                vy: Math.sin(p.aimAngle)*bSpeed, 
                damage: isBounceShot ? 35 : 22, 
                size: isBounceShot ? 9 : 5, 
                color: isBounceShot ? '#a855f7' : '#00f3ff', // Morado o Cyan
                bounces: isBounceShot ? 2 : 0, 
                life: 120 
            });

            // Si está en Modo Caos o Ulti dispara extra
            if (p.modeChaos || p.ultActive) {
                BULLETS.push({
                    ownerId: socket.id, x: p.x + p.w/2, y: p.y + p.h/3,
                    vx: Math.cos(p.aimAngle + 0.2)*bSpeed, vy: Math.sin(p.aimAngle + 0.2)*bSpeed,
                    damage: 15, size: 4, color: '#ffffff', life: 100
                });
            }
            return;
        }

        BULLETS.push({ ownerId: socket.id, x: p.x + p.w/2, y: p.y + p.h/3, vx: Math.cos(p.aimAngle)*bSpeed, vy: Math.sin(p.aimAngle)*bSpeed, damage: bDmg, size: bSize, color: bColor, life: 100 });
    });

    socket.on('disconnect', () => {
        delete PLAYERS[socket.id];
        io.emit('updateLobbyPlayers', PLAYERS);
    });
});

// ==========================================
// 🌍 BUCLE FÍSICO GLOBAL
// ==========================================
function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

setInterval(() => {
    if (GAME_STATE !== 'PLAYING') return;
    const currentMap = MAPS[CURRENT_MAP_INDEX];

    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;

        // Tickers de Diego
        if (p.dashCooldown > 0) p.dashCooldown--;
        if (p.ultActive) {
            p.ultTimer--;
            if (p.ultTimer <= 0) p.ultActive = false;
        }

        // Actualizar Nivel de Aura según Combo
        if (p.charClass === 'DIEGO') {
            if (p.comboTech >= 8 || p.ultActive) p.auraLevel = 3; // CORRUPTED
            else if (p.comboTech >= 4) p.auraLevel = 2;            // OVERCLOCK
            else p.auraLevel = 1;                                  // STABLE
        }

        p.vy += 0.8; p.vx *= p.onGround ? 0.85 : 0.95;
        p.x += p.vx; p.y += p.vy; p.onGround = false;

        currentMap.platforms.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vy > 0 && p.y + p.h - p.vy <= plat.y + 10) {
                    p.y = plat.y - p.h; p.vy = 0; p.onGround = true; p.jumpsLeft = p.maxJumps;
                }
            }
        });
        if (p.y > currentMap.height + 500) p.hp = 0;
    });

    // Balas y Rebotes
    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0 && checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, p)) {
                p.hp -= b.damage;
                b.life = 0;
                
                // Reiniciar combo del objetivo golpeado si es Diego
                if (p.charClass === 'DIEGO') p.comboTech = 0;

                // Subir combo del tirador si es Diego
                let shooter = PLAYERS[b.ownerId];
                if (shooter && shooter.charClass === 'DIEGO') shooter.comboTech = Math.min(10, shooter.comboTech + 1);

                io.emit('damageNumber', { x: p.x, y: p.y, dmg: b.damage });
            }
        });

        // Rebotes en paredes para el BYTE BLASTER
        currentMap.platforms.forEach(plat => {
            if (checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, plat)) {
                if (b.bounces > 0) {
                    b.vx = -b.vx; // Rebotar
                    b.bounces--;
                } else {
                    b.life = 0;
                }
            }
        });

        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS });
}, 1000 / 60);

http.listen(3000, () => console.log("🔥 WAR OF WORDS: THE CREATOR ENGINE AT PORT 3000"));
