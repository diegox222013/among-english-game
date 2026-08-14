const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL Y CONSTANTES
// ==========================================
const ADMIN_KEY = "admin123";
const NINJA_SECRET_KEY = "diegox222013";

let GAME_STATE = 'LOBBY'; // 'LOBBY' o 'PLAYING'
let CURRENT_MAP_INDEX = 0;

// ==========================================
// 🗺️ BASE DE DATOS DE MAPAS GIGANTES
// ==========================================
const MAPS = [
    {
        name: "CYBER CITY NEON",
        width: 6000, height: 3000,
        bgColor: "#020617",
        platforms: [
            { id: 'f1', x: 0, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'f2', x: 2500, y: 2800, w: 1000, h: 200, type: 'bridge' },
            { id: 'f3', x: 4000, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'p1', x: 800, y: 2400, w: 500, h: 40, type: 'glass' },
            { id: 'p2', x: 1500, y: 2000, w: 400, h: 40, type: 'arena' },
            { id: 'p3', x: 2800, y: 2300, w: 400, h: 40, type: 'glass' },
            { id: 'p4', x: 3500, y: 1800, w: 600, h: 40, type: 'arena' },
            { id: 'tower1', x: 1800, y: 1000, w: 200, h: 1800, type: 'wall' }, // Pared gigante
            { id: 'p5', x: 4500, y: 2400, w: 500, h: 40, type: 'arena' }
        ],
        spawnPoints: [{x: 500, y: 2500}, {x: 3000, y: 2500}, {x: 5000, y: 2500}]
    },
    {
        name: "LAVA CORE DEEP",
        width: 4000, height: 4000,
        bgColor: "#1a0505",
        platforms: [
            { id: 'f1', x: 0, y: 3800, w: 4000, h: 200, type: 'danger_zone' }, // Lava
            { id: 'p1', x: 500, y: 3400, w: 300, h: 40, type: 'arena' },
            { id: 'p2', x: 1200, y: 3000, w: 300, h: 40, type: 'arena' },
            { id: 'p3', x: 2000, y: 2600, w: 300, h: 40, type: 'arena' },
            { id: 'p4', x: 2800, y: 2200, w: 300, h: 40, type: 'arena' },
            { id: 'p5', x: 1500, y: 1800, w: 800, h: 40, type: 'glass' }
        ],
        spawnPoints: [{x: 600, y: 3200}, {x: 2100, y: 2400}, {x: 1800, y: 1500}]
    }
];

const PLAYERS = {};
const BULLETS = [];
const TACTICAL_NOTICES = {}; 

// ==========================================
// 🧬 ESTADÍSTICAS DE CLASES (HÉROES)
// ==========================================
const CLASS_STATS = {
    'ASSAULT': { hp: 120, speed: 8, jumps: 2, color: '#38bdf8', w: 36, h: 54, aura: 'electric' },
    'HEAVY': { hp: 200, speed: 5, jumps: 1, color: '#ef4444', w: 46, h: 64, aura: 'fire' },
    'GHOST': { hp: 90, speed: 10, jumps: 3, color: '#10b981', w: 30, h: 48, aura: 'smoke' },
    'NINJA': { hp: 140, speed: 12, jumps: 3, color: '#a855f7', w: 34, h: 50, aura: 'shadow' }
};

// ==========================================
// 🔌 SISTEMA DE RED (SOCKETS)
// ==========================================
io.on('connection', (socket) => {
    
    // Unirse al Lobby
    socket.on('joinLobby', (data) => {
        const username = data.name || `Operator-${Math.floor(Math.random()*1000)}`;
        const pass = data.adminKey ? data.adminKey.trim() : "";
        
        let isAdmin = (pass === ADMIN_KEY);
        let isNinja = (pass === NINJA_SECRET_KEY);
        let role = isAdmin ? 'ADMIN' : (isNinja ? 'SHADOW' : 'ROOKIE');

        PLAYERS[socket.id] = {
            id: socket.id, name: username, role: role,
            isAdmin: isAdmin, isNinja: isNinja,
            charClass: isNinja ? 'NINJA' : 'ASSAULT', // Clase por defecto
            ready: false,
            // Stats de juego (se reinician al jugar)
            x: 0, y: 0, w: 36, h: 54, vx: 0, vy: 0, aimAngle: 0,
            hp: 100, maxHp: 100, onGround: false, kills: 0, color: '#fff'
        };

        socket.emit('lobbyData', { state: GAME_STATE, me: PLAYERS[socket.id], map: MAPS[CURRENT_MAP_INDEX] });
        io.emit('updateLobbyPlayers', PLAYERS);
    });

    // Cambiar Clase en el Lobby
    socket.on('selectClass', (className) => {
        if (GAME_STATE !== 'LOBBY' || !PLAYERS[socket.id]) return;
        if (className === 'NINJA' && !PLAYERS[socket.id].isNinja) return; // Protegido
        PLAYERS[socket.id].charClass = className;
        io.emit('updateLobbyPlayers', PLAYERS);
    });

    // ==========================================
// 👑 PODERES DE ADMINISTRADOR
// ==========================================
    socket.on('adminAction', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || !p.isAdmin) return;

        if (data.action === 'START_GAME') {
            GAME_STATE = 'PLAYING';
            const currentMap = MAPS[CURRENT_MAP_INDEX];
            
            // Spawnear jugadores y asignar stats
            let spawnIndex = 0;
            Object.values(PLAYERS).forEach(player => {
                const stats = CLASS_STATS[player.charClass];
                player.maxHp = stats.hp; player.hp = stats.hp;
                player.w = stats.w; player.h = stats.h;
                player.color = stats.color; player.aura = stats.aura;
                player.speed = stats.speed; player.maxJumps = stats.jumps;
                player.jumpsLeft = stats.jumps;
                
                // Asignar Spawn
                let sp = currentMap.spawnPoints[spawnIndex % currentMap.spawnPoints.length];
                player.x = sp.x + (Math.random()*100 - 50); 
                player.y = sp.y - 100;
                player.vx = 0; player.vy = 0;
                spawnIndex++;
            });
            BULLETS.length = 0; // Limpiar balas
            io.emit('gameStarted', { map: currentMap, players: PLAYERS });
        }
        
        if (data.action === 'CHANGE_MAP') {
            CURRENT_MAP_INDEX = (CURRENT_MAP_INDEX + 1) % MAPS.length;
            io.emit('mapChanged', MAPS[CURRENT_MAP_INDEX]);
        }
    });

    // ==========================================
    // 🎮 INPUT Y LÓGICA DE JUEGO
    // ==========================================
    socket.on('playerInput', (data) => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;
        let maxSpd = p.speed || 8;
        let accel = 1.5;

        if (data.left && p.vx > -maxSpd) p.vx -= accel;
        if (data.right && p.vx < maxSpd) p.vx += accel;
        
        // Sistema Multi-Salto
        if (data.upTrigger && p.jumpsLeft > 0) { 
            p.vy = -18; 
            p.onGround = false; 
            p.jumpsLeft--; 
        }
    });

    socket.on('shoot', () => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        // Propiedades de disparo según clase
        let bSpeed = 24; let bDmg = 15; let bSize = 5; let bColor = p.color;
        if (p.charClass === 'HEAVY') { bSpeed = 16; bDmg = 40; bSize = 10; }
        if (p.charClass === 'GHOST') { bSpeed = 35; bDmg = 25; bSize = 3; }

        BULLETS.push({ 
            ownerId: socket.id, 
            x: p.x + p.w/2, y: p.y + p.h/3, 
            vx: Math.cos(p.aimAngle)*bSpeed, 
            vy: Math.sin(p.aimAngle)*bSpeed, 
            damage: bDmg, size: bSize, color: bColor, life: 100 
        });
    });

    socket.on('disconnect', () => {
        delete PLAYERS[socket.id];
        io.emit('updateLobbyPlayers', PLAYERS);
    });
});

// ==========================================
// 🌍 BUCLE DE FÍSICAS GLOBAL (60 FPS)
// ==========================================
function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

setInterval(() => {
    if (GAME_STATE !== 'PLAYING') return;
    const currentMap = MAPS[CURRENT_MAP_INDEX];

    // Lógica Jugadores
    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;
        p.vy += 0.8; // Gravedad
        p.vx *= p.onGround ? 0.85 : 0.95; // Fricción
        p.x += p.vx; p.y += p.vy;
        p.onGround = false;

        // Colisión Mapas
        currentMap.platforms.forEach(plat => {
            if (checkCollision(p, plat)) {
                // Colisión Superior (Suelo)
                if (p.vy > 0 && p.y + p.h - p.vy <= plat.y + 10) {
                    p.y = plat.y - p.h; p.vy = 0; p.onGround = true;
                    p.jumpsLeft = p.maxJumps; // Resetear saltos
                }
                // Colisión Lateral Muros Gigantes
                else if (plat.type === 'wall') {
                    if (p.vx > 0 && p.x < plat.x) { p.x = plat.x - p.w; p.vx = 0; }
                    else if (p.vx < 0 && p.x > plat.x) { p.x = plat.x + plat.w; p.vx = 0; }
                }
            }
        });
        
        // Muerte por caída al vacío o Lava
        if (p.y > currentMap.height + 500) p.hp = 0;
    });

    // Lógica Balas
    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        
        // Hitbox Jugadores
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0 && checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, p)) {
                p.hp -= b.damage; 
                b.life = 0; // Destruir bala
                io.emit('damageNumber', { x: p.x, y: p.y, dmg: b.damage }); // Emitir texto flotante
            }
        });

        // Hitbox Plataformas
        currentMap.platforms.forEach(plat => {
            if (plat.type !== 'danger_zone' && checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, plat)) {
                b.life = 0;
            }
        });

        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    // Enviar estado de física al cliente
    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS });
}, 1000 / 60);

http.listen(3000, () => console.log("🔥 THE MONSTER IS AWAKE: WAR OF WORDS running on port 3000"));
