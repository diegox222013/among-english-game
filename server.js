// ==============================================================================
// WAR OF WORDS - SERVER ENGINE (EXPANDED TO MAXIMUM CAPACITY)
// ==============================================================================
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL Y CONSTANTES
// ==========================================
const TICK_RATE = 60;
const SERVER_PORT = 3000;
let GAME_STATE = 'LOBBY';
let CURRENT_MAP_INDEX = 0;
let MATCH_TIMER = 0;
let MAX_SCORE = 50;

const PLAYERS = {};
const BULLETS = [];
const ZONES = [];
const ITEMS = [];
const CHAT_LOG = [];
const EVENT_FEED = [];

// ==========================================
// 🗺️ SISTEMA DE MAPAS AVANZADO
// ==========================================
const MAPS = [
    {
        name: "CYBER CITY NEON", width: 6000, height: 3000, bgColor: "#020617",
        gravity: 0.8, friction: 0.85,
        platforms: [
            { id: 'f1', x: 0, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'f2', x: 2500, y: 2800, w: 1000, h: 200, type: 'metal' },
            { id: 'f3', x: 4000, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'p1', x: 800, y: 2400, w: 500, h: 40, type: 'glass' },
            { id: 'p2', x: 2800, y: 2200, w: 400, h: 40, type: 'metal' },
            { id: 'p3', x: 4800, y: 2400, w: 500, h: 40, type: 'glass' },
            { id: 'tower1', x: 1800, y: 1000, w: 200, h: 1800, type: 'wall' },
            { id: 'tower2', x: 3800, y: 1500, w: 200, h: 1300, type: 'wall' }
        ],
        itemSpawns: [{x: 1050, y: 2300}, {x: 3000, y: 2100}, {x: 5050, y: 2300}],
        spawnPoints: [{x: 500, y: 2500}, {x: 3000, y: 2500}, {x: 5000, y: 2500}, {x: 1000, y: 2000}]
    },
    {
        name: "LIBRARY OF BABEL", width: 5000, height: 4000, bgColor: "#0f172a",
        gravity: 0.7, friction: 0.9,
        platforms: [
            { id: 'f1', x: 0, y: 3800, w: 5000, h: 200, type: 'arena' },
            { id: 'book1', x: 1000, y: 3500, w: 300, h: 40, type: 'glass' },
            { id: 'book2', x: 1500, y: 3200, w: 300, h: 40, type: 'glass' },
            { id: 'book3', x: 2000, y: 2900, w: 300, h: 40, type: 'glass' },
            { id: 'desk1', x: 2500, y: 3600, w: 600, h: 200, type: 'metal' },
            { id: 'desk2', x: 3500, y: 3200, w: 600, h: 40, type: 'metal' },
            { id: 'shelf1', x: 4500, y: 2000, w: 500, h: 1800, type: 'wall' }
        ],
        itemSpawns: [{x: 1150, y: 3400}, {x: 2800, y: 3500}, {x: 3800, y: 3100}],
        spawnPoints: [{x: 500, y: 3500}, {x: 2500, y: 3000}, {x: 4000, y: 3500}]
    },
    {
        name: "GLITCH CORE", width: 4000, height: 4000, bgColor: "#110011",
        gravity: 0.6, friction: 0.8,
        platforms: [
            { id: 'f1', x: 0, y: 3800, w: 1200, h: 200, type: 'glitch' },
            { id: 'f2', x: 2800, y: 3800, w: 1200, h: 200, type: 'glitch' },
            { id: 'p1', x: 1500, y: 3400, w: 1000, h: 40, type: 'glitch' },
            { id: 'p2', x: 500, y: 2800, w: 600, h: 40, type: 'glitch' },
            { id: 'p3', x: 2900, y: 2800, w: 600, h: 40, type: 'glitch' },
            { id: 'core', x: 1800, y: 2000, w: 400, h: 400, type: 'metal' }
        ],
        itemSpawns: [{x: 2000, y: 1900}, {x: 800, y: 2700}, {x: 3200, y: 2700}],
        spawnPoints: [{x: 500, y: 3500}, {x: 3500, y: 3500}, {x: 2000, y: 3200}]
    },
    {
        name: "THE COURTYARD", width: 7000, height: 2500, bgColor: "#001a00",
        gravity: 0.9, friction: 0.85,
        platforms: [
            { id: 'f1', x: 0, y: 2300, w: 7000, h: 200, type: 'arena' },
            { id: 'statue1', x: 2000, y: 1800, w: 200, h: 500, type: 'wall' },
            { id: 'statue2', x: 5000, y: 1800, w: 200, h: 500, type: 'wall' },
            { id: 'p1', x: 3000, y: 1900, w: 1000, h: 40, type: 'glass' }
        ],
        itemSpawns: [{x: 3500, y: 1800}],
        spawnPoints: [{x: 1000, y: 2000}, {x: 6000, y: 2000}]
    }
];

// ==========================================
// 🧬 SISTEMA DE CLASES Y ESTADÍSTICAS
// ==========================================
const CLASS_STATS = {
    'ASSAULT':    { hp: 120, speed: 8, jumps: 2, color: '#38bdf8', w: 36, h: 54, type: 'dps', regen: 1 },
    'HEAVY':      { hp: 250, speed: 4, jumps: 1, color: '#ef4444', w: 48, h: 68, type: 'tank', regen: 0.5 },
    'SNIPER':     { hp: 90,  speed: 9, jumps: 2, color: '#facc15', w: 32, h: 50, type: 'precision', regen: 1 },
    'MEDIC':      { hp: 110, speed: 7, jumps: 2, color: '#10b981', w: 34, h: 52, type: 'support', regen: 2 },
    'CREATOR':    { hp: 110, speed: 12, jumps: 3, color: '#00f3ff', w: 34, h: 52, type: 'chaos', regen: 1 },
    'INSTRUCTOR': { hp: 130, speed: 7, jumps: 2, color: '#1e3a8a', w: 32, h: 56, type: 'control', regen: 1.5 }
};

// ==========================================
// 📡 GESTIÓN DE CONEXIONES Y SOCKETS
// ==========================================
io.on('connection', (socket) => {
    console.log(`[+] Nuevo Operador conectado: ${socket.id}`);
    
    socket.on('joinLobby', (data) => {
        PLAYERS[socket.id] = {
            id: socket.id, 
            name: data.name.substring(0, 12) || "Operator", 
            charClass: 'ASSAULT',
            kills: 0, deaths: 0, score: 0,
            x: 0, y: 0, w: 36, h: 54, vx: 0, vy: 0, aimAngle: 0, hp: 100, maxHp: 100, onGround: false,
            
            // Atributos de Estado Generales
            iFrames: 0, stunTimer: 0, slowTimer: 0, burnTimer: 0, healTimer: 0,
            dashCooldown: 0, ultTimer: 0, skill1Cooldown: 0, skill2Cooldown: 0,
            
            // Variables de CREADOR (Caos)
            comboTech: 0, weaponMode: 'BYTE', modeChaosTimer: 0, 
            
            // Variables de INSTRUCTORA (Orden)
            gradeScore: 50, marks: {}, popQuizTarget: null, classroomTimer: 0
        };
        
        socket.emit('lobbyData', { state: GAME_STATE, me: PLAYERS[socket.id], maps: MAPS });
        io.emit('updateLobbyPlayers', PLAYERS);
        addEventFeed(`${PLAYERS[socket.id].name} joined the server.`);
    });

    socket.on('selectClass', (className) => {
        if (GAME_STATE !== 'LOBBY' || !PLAYERS[socket.id]) return;
        if (CLASS_STATS[className]) {
            PLAYERS[socket.id].charClass = className;
            io.emit('updateLobbyPlayers', PLAYERS);
        }
    });

    socket.on('chatMessage', (msg) => {
        if (!PLAYERS[socket.id]) return;
        let cleanMsg = msg.substring(0, 100);
        let chatObj = { sender: PLAYERS[socket.id].name, text: cleanMsg, time: new Date().toLocaleTimeString() };
        CHAT_LOG.push(chatObj);
        if (CHAT_LOG.length > 20) CHAT_LOG.shift();
        io.emit('newChatMessage', chatObj);
    });

    socket.on('adminAction', (data) => {
        if (data.action === 'START_GAME') {
            GAME_STATE = 'PLAYING';
            CURRENT_MAP_INDEX = data.mapIndex || 0;
            MATCH_TIMER = 300 * TICK_RATE; // 5 minutos
            let currentMap = MAPS[CURRENT_MAP_INDEX];
            
            Object.values(PLAYERS).forEach((p, idx) => {
                let s = CLASS_STATS[p.charClass];
                p.maxHp = s.hp; p.hp = s.hp; p.w = s.w; p.h = s.h; p.color = s.color; 
                p.speed = s.speed; p.jumpsLeft = s.jumps; p.maxJumps = s.jumps;
                p.kills = 0; p.deaths = 0; p.score = 0;
                let sp = currentMap.spawnPoints[idx % currentMap.spawnPoints.length];
                p.x = sp.x; p.y = sp.y - 100; p.vx = 0; p.vy = 0;
            });
            BULLETS.length = 0; ZONES.length = 0; ITEMS.length = 0; EVENT_FEED.length = 0;
            io.emit('gameStarted', { map: currentMap, players: PLAYERS });
            addEventFeed("MATCH STARTED!");
        }
    });

    socket.on('playerInput', (data) => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0 || p.stunTimer > 0) return;

        p.aimAngle = data.aimAngle || 0;
        
        let speedMult = 1.0;
        if (p.slowTimer > 0) speedMult = 0.4;
        if (p.ultTimer > 0 && p.charClass === 'CREATOR') speedMult = 1.8;
        if (p.modeChaosTimer > 0) speedMult = 1.3;
        if (p.gradeScore >= 80 && p.charClass === 'INSTRUCTOR') speedMult = 1.2;

        let maxSpd = (p.speed + (p.charClass === 'CREATOR' ? p.comboTech * 0.4 : 0)) * speedMult;
        
        if (data.left && p.vx > -maxSpd) p.vx -= 2.0;
        if (data.right && p.vx < maxSpd) p.vx += 2.0;
        if (data.upTrigger && p.jumpsLeft > 0) { 
            p.vy = -18; p.onGround = false; p.jumpsLeft--; 
            io.emit('soundEvent', { type: 'jump', x: p.x, y: p.y });
        }

        // ==========================================
        // ⚡ HABILIDADES: CREADOR
        // ==========================================
        if (p.charClass === 'CREATOR') {
            if (data.useSkill1 && p.skill1Cooldown <= 0) { 
                p.vx = Math.cos(p.aimAngle) * 40; p.vy = Math.sin(p.aimAngle) * 40;
                p.skill1Cooldown = p.modeChaosTimer > 0 ? 30 : 60; p.iFrames = 20;
                io.emit('vfxEvent', { type: 'GLITCH_DASH', x: p.x, y: p.y });
                io.emit('soundEvent', { type: 'dash', x: p.x, y: p.y });
            }
            if (data.useSkill2 && p.skill2Cooldown <= 0) {
                p.weaponMode = p.weaponMode === 'BYTE' ? 'ARDUINO' : 'BYTE';
                p.skill2Cooldown = 30;
            }
            if (data.useSkill3 && p.modeChaosTimer <= 0 && p.ultTimer <= 0) { 
                p.modeChaosTimer = 400; 
                io.emit('vfxEvent', { type: 'CHAOS_MODE', id: p.id }); 
            }
            if (data.useUlt && p.ultTimer <= 0 && p.comboTech >= 10) { 
                p.ultTimer = 500; p.comboTech = 0;
                io.emit('vfxEvent', { type: 'BREAK_THE_GAME', name: p.name }); 
                addEventFeed(`${p.name} activated SYSTEM OVERRIDE!`);
            }
        }

        // ==========================================
        // 📚 HABILIDADES: INSTRUCTORA
        // ==========================================
        if (p.charClass === 'INSTRUCTOR') {
            if (data.useSkill1 && p.skill1Cooldown <= 0) { 
                p.skill1Cooldown = 180;
                io.emit('vfxEvent', { type: 'LISTEN_WAVE', x: p.x, y: p.y });
                io.emit('soundEvent', { type: 'magic', x: p.x, y: p.y });
                Object.values(PLAYERS).forEach(enemy => {
                    if (enemy.id !== p.id && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 500) {
                        enemy.stunTimer = 90;
                        io.emit('floatingText', { x: enemy.x, y: enemy.y - 40, text: "LISTEN!", color: "#fbbf24" });
                    }
                });
            }
            if (data.useSkill2 && p.skill2Cooldown <= 0) {
                p.skill2Cooldown = 120;
                let closest = null; let minDist = 1000;
                Object.values(PLAYERS).forEach(enemy => {
                    if (enemy.id !== p.id && enemy.hp > 0) { 
                        let d = Math.hypot(enemy.x - p.x, enemy.y - p.y); 
                        if(d < minDist){ minDist=d; closest=enemy; } 
                    }
                });
                if (closest) { 
                    p.popQuizTarget = closest.id; 
                    io.emit('floatingText', { x: closest.x, y: closest.y-50, text: "POP QUIZ!", color: "#ef4444" }); 
                }
            }
            if (data.useSkill3 && p.classroomTimer <= 0) {
                p.classroomTimer = 800; 
                ZONES.push({ ownerId: p.id, x: p.x - 500, y: p.y - 300, w: 1000, h: 600, life: 400, type: 'CLASSROOM' });
                io.emit('vfxEvent', { type: 'CLASSROOM_SPAWN', x: p.x, y: p.y });
            }
            if (data.useUlt && p.ultTimer <= 0 && p.gradeScore >= 80) {
                p.ultTimer = 700; p.gradeScore = 50;
                io.emit('vfxEvent', { type: 'FINAL_EXAM', name: p.name });
                addEventFeed(`${p.name} activated FINAL EXAM!`);
                Object.values(PLAYERS).forEach(enemy => {
                    if (enemy.id !== p.id && enemy.hp > 0) {
                        enemy.hp -= 60;
                        io.emit('floatingText', { x: enemy.x, y: enemy.y, text: "F", color: "#ef4444" });
                        if(enemy.hp <= 0) handleKill(p.id, enemy.id);
                    }
                });
            }
        }
    });

    socket.on('shoot', () => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0 || p.stunTimer > 0) return;

        let bx = p.x + p.w/2; let by = p.y + p.h/2;
        io.emit('soundEvent', { type: 'shoot', x: bx, y: by });

        if (p.charClass === 'CREATOR') {
            if (p.weaponMode === 'BYTE') {
                BULLETS.push({ ownerId: socket.id, type: 'BYTE', x: bx, y: by, vx: Math.cos(p.aimAngle)*35, vy: Math.sin(p.aimAngle)*35, damage: 20, size: 6, color: '#00f3ff', bounces: 1, life: 90 });
            } else {
                for(let i=-1; i<=1; i++) {
                    let spread = p.aimAngle + (i * 0.15);
                    BULLETS.push({ ownerId: socket.id, type: 'ARDUINO', x: bx, y: by, vx: Math.cos(spread)*45, vy: Math.sin(spread)*45, damage: 12, size: 4, color: '#a855f7', life: 15 });
                }
            }
        } 
        else if (p.charClass === 'INSTRUCTOR') {
            let signs = ['X', '✓', '!', '?', '&'];
            let sign = signs[Math.floor(Math.random()*signs.length)];
            BULLETS.push({ ownerId: socket.id, type: 'PEN', sign: sign, x: bx, y: by, vx: Math.cos(p.aimAngle)*28, vy: Math.sin(p.aimAngle)*28, damage: 22, size: 8, color: '#ef4444', life: 120 });
        } 
        else if (p.charClass === 'SNIPER') {
            BULLETS.push({ ownerId: socket.id, type: 'SNIPER', x: bx, y: by, vx: Math.cos(p.aimAngle)*60, vy: Math.sin(p.aimAngle)*60, damage: 80, size: 3, color: '#facc15', life: 200, pierce: true });
        }
        else if (p.charClass === 'HEAVY') {
            BULLETS.push({ ownerId: socket.id, type: 'ROCKET', x: bx, y: by, vx: Math.cos(p.aimAngle)*15, vy: Math.sin(p.aimAngle)*15, damage: 45, size: 12, color: '#ef4444', life: 150, explode: true });
        }
        else {
            BULLETS.push({ ownerId: socket.id, type: 'NORMAL', x: bx, y: by, vx: Math.cos(p.aimAngle)*25, vy: Math.sin(p.aimAngle)*25, damage: 15, size: 5, color: p.color, life: 100 });
        }
    });

    socket.on('disconnect', () => { 
        if(PLAYERS[socket.id]) addEventFeed(`${PLAYERS[socket.id].name} left the server.`);
        delete PLAYERS[socket.id]; 
        io.emit('updateLobbyPlayers', PLAYERS); 
    });
});

// ==========================================
// 🏆 SISTEMA DE KILLS Y EVENTOS
// ==========================================
function addEventFeed(msg) {
    EVENT_FEED.push({ text: msg, time: 200 });
    if(EVENT_FEED.length > 5) EVENT_FEED.shift();
    io.emit('eventFeed', EVENT_FEED);
}

function handleKill(killerId, victimId) {
    let killer = PLAYERS[killerId];
    let victim = PLAYERS[victimId];
    if(killer && victim) {
        killer.kills++; killer.score += 100;
        victim.deaths++;
        addEventFeed(`${killer.name} [DELETED] ${victim.name}`);
        io.emit('soundEvent', { type: 'explosion', x: victim.x, y: victim.y });
        
        // Efectos pasivos de kill
        if(killer.charClass === 'INSTRUCTOR') killer.gradeScore = Math.min(100, killer.gradeScore + 20);
        if(killer.charClass === 'CREATOR') killer.comboTech = Math.min(10, killer.comboTech + 3);
        
        // Respawn logic
        setTimeout(() => {
            if(victim && GAME_STATE === 'PLAYING') {
                let map = MAPS[CURRENT_MAP_INDEX];
                let sp = map.spawnPoints[Math.floor(Math.random() * map.spawnPoints.length)];
                victim.hp = victim.maxHp; victim.x = sp.x; victim.y = sp.y - 100;
                victim.vx = 0; victim.vy = 0; victim.iFrames = 120;
            }
        }, 3000);
    }
}

// ==========================================
// 🌍 BUCLE FÍSICO MAESTRO (60 FPS)
// ==========================================
function checkCollision(r1, r2) { 
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y; 
}

setInterval(() => {
    if (GAME_STATE !== 'PLAYING') return;
    const currentMap = MAPS[CURRENT_MAP_INDEX];
    
    // Timer de partida
    MATCH_TIMER--;
    if(MATCH_TIMER <= 0) {
        GAME_STATE = 'LOBBY';
        io.emit('gameOver', { players: PLAYERS });
        addEventFeed("MATCH ENDED");
        return;
    }

    // Spawner de Ítems
    if(Math.random() < 0.005 && ITEMS.length < 5 && currentMap.itemSpawns.length > 0) {
        let sp = currentMap.itemSpawns[Math.floor(Math.random() * currentMap.itemSpawns.length)];
        let types = ['HEALTH', 'AMMO', 'BOOST'];
        ITEMS.push({ id: Math.random(), type: types[Math.floor(Math.random()*types.length)], x: sp.x, y: sp.y, w: 20, h: 20, life: 600 });
    }

    // Procesar Zonas
    for (let i = ZONES.length - 1; i >= 0; i--) {
        let z = ZONES[i];
        Object.values(PLAYERS).forEach(p => {
            if (checkCollision(p, z)) {
                if (p.id !== z.ownerId) { p.slowTimer = 5; p.hp -= 0.1; } // Daño mínimo continuo en área enemiga
                else { p.healTimer = 5; p.hp = Math.min(p.maxHp, p.hp + 0.2); } // Curación al dueño
            }
        });
        z.life--; if (z.life <= 0) ZONES.splice(i, 1);
    }

    // Procesar Ítems
    for(let i = ITEMS.length - 1; i >= 0; i--) {
        let it = ITEMS[i];
        Object.values(PLAYERS).forEach(p => {
            if(p.hp > 0 && checkCollision(p, it)) {
                if(it.type === 'HEALTH') p.hp = Math.min(p.maxHp, p.hp + 50);
                if(it.type === 'BOOST') p.ultTimer -= 100;
                io.emit('soundEvent', { type: 'pickup', x: p.x, y: p.y });
                ITEMS.splice(i, 1);
            }
        });
        if(it) it.life--;
        if(it && it.life <= 0) ITEMS.splice(i, 1);
    }

    // Procesar Jugadores
    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;

        // Timers
        if (p.skill1Cooldown > 0) p.skill1Cooldown--;
        if (p.skill2Cooldown > 0) p.skill2Cooldown--;
        if (p.iFrames > 0) p.iFrames--;
        if (p.stunTimer > 0) p.stunTimer--;
        if (p.slowTimer > 0) p.slowTimer--;
        if (p.modeChaosTimer > 0) p.modeChaosTimer--;
        if (p.ultTimer > 0) p.ultTimer--;
        if (p.classroomTimer > 0) p.classroomTimer--;

        // Regeneración pasiva
        if (CLASS_STATS[p.charClass].regen && p.hp < p.maxHp) p.hp += CLASS_STATS[p.charClass].regen * 0.01;

        // Físicas
        if (p.stunTimer <= 0) {
            p.vy += currentMap.gravity;
            p.vx *= p.onGround ? currentMap.friction : 0.95;
            p.x += p.vx; p.y += p.vy;
        }
        p.onGround = false;

        // Colisiones con plataformas (Sistema AABB avanzado para top/bottom/sides)
        currentMap.platforms.forEach(plat => {
            if (checkCollision(p, plat)) {
                // Colisión Superior
                if (p.vy > 0 && p.y + p.h - p.vy <= plat.y + 15) { 
                    p.y = plat.y - p.h; p.vy = 0; p.onGround = true; p.jumpsLeft = p.maxJumps; 
                }
                // Colisión Inferior
                else if (p.vy < 0 && p.y - p.vy >= plat.y + plat.h - 15) {
                    p.y = plat.y + plat.h; p.vy = 0;
                }
                // Colisiones Laterales
                else {
                    if (p.vx > 0 && p.x + p.w - p.vx <= plat.x + 15) { p.x = plat.x - p.w; p.vx = 0; }
                    if (p.vx < 0 && p.x - p.vx >= plat.x + plat.w - 15) { p.x = plat.x + plat.w; p.vx = 0; }
                }
            }
        });
        
        // Muerte por caída
        if (p.y > currentMap.height + 500) {
            p.hp = 0; handleKill(p.id, p.id); // Suicidio
        }
    });

    // Procesar Proyectiles
    for (let i = BULLETS.length - 1; i >= 0; i--) {
        let b = BULLETS[i];
        let insideClass = ZONES.some(z => z.ownerId !== b.ownerId && checkCollision({x:b.x, y:b.y, w:b.size, h:b.size}, z));
        let speedMod = insideClass ? 0.3 : 1.0;
        
        b.x += b.vx * speedMod; b.y += b.vy * speedMod; b.life--;
        b.vy += (b.type === 'ROCKET' ? 0 : 0.1); // Gravedad ligera a balas
        
        let hit = false;
        
        // Colisión con Jugadores
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0 && p.iFrames <= 0 && checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, p)) {
                
                let shooter = PLAYERS[b.ownerId];
                let finalDmg = b.damage;

                // Lógica INSTRUCTORA
                if (shooter && shooter.charClass === 'INSTRUCTOR') {
                    shooter.gradeScore = Math.min(100, shooter.gradeScore + 8);
                    if (shooter.popQuizTarget === p.id) { 
                        finalDmg *= 2.5; shooter.popQuizTarget = null; 
                        io.emit('floatingText', { x: p.x, y: p.y, text: "A+ CRITICAL!", color: "#fbbf24" }); 
                    }
                    if (!shooter.marks[p.id]) shooter.marks[p.id] = 0;
                    shooter.marks[p.id]++;
                    if (shooter.marks[p.id] >= 3) {
                        p.slowTimer = 120; shooter.marks[p.id] = 0; finalDmg += 15;
                        io.emit('floatingText', { x: p.x, y: p.y - 20, text: "CORRECT!", color: "#1e3a8a" });
                    }
                }

                // Lógica CREADOR
                if (shooter && shooter.charClass === 'CREATOR') {
                    shooter.comboTech = Math.min(15, shooter.comboTech + 1);
                }
                if (p.charClass === 'CREATOR') {
                    p.comboTech = 0; 
                    io.emit('floatingText', { x: p.x, y: p.y - 20, text: "SYS_ERROR", color: "#ef4444" });
                }
                if (p.charClass === 'INSTRUCTOR') {
                    p.gradeScore = Math.max(0, p.gradeScore - 15);
                }

                p.hp -= finalDmg; 
                if(!b.pierce) hit = true;
                io.emit('floatingText', { x: p.x, y: p.y, text: `-${Math.floor(finalDmg)}`, color: "#fff" });
                
                if (p.hp <= 0) handleKill(b.ownerId, p.id);
            }
        });

        // Colisión con Paredes
        if(!hit) {
            currentMap.platforms.forEach(plat => {
                if (checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, plat)) {
                    if (b.bounces > 0) { 
                        b.vx = -b.vx * 0.8; b.vy = -b.vy * 0.8; b.bounces--; 
                    } else {
                        hit = true;
                        if(b.explode) {
                            io.emit('vfxEvent', { type: 'EXPLOSION', x: b.x, y: b.y });
                            io.emit('soundEvent', { type: 'explosion', x: b.x, y: b.y });
                            Object.values(PLAYERS).forEach(p => {
                                if(p.id !== b.ownerId && p.hp > 0 && Math.hypot(p.x - b.x, p.y - b.y) < 150) {
                                    p.hp -= 30; if(p.hp<=0) handleKill(b.ownerId, p.id);
                                }
                            });
                        }
                    }
                }
            });
        }

        if (hit || b.life <= 0) {
            BULLETS.splice(i, 1);
            let shooter = PLAYERS[b.ownerId];
            if (shooter && hit === false && b.life <= 0 && shooter.charClass === 'INSTRUCTOR') {
                shooter.gradeScore = Math.max(0, shooter.gradeScore - 3); 
            }
        }
    }

    io.emit('stateUpdate', { 
        players: PLAYERS, bullets: BULLETS, zones: ZONES, items: ITEMS, 
        timer: Math.floor(MATCH_TIMER/TICK_RATE) 
    });
}, 1000 / TICK_RATE);

http.listen(SERVER_PORT, () => console.log(`[OK] SERVER ENGINE RUNNING ON PORT ${SERVER_PORT} WITH MAXIMUM CAPACITY.`));
