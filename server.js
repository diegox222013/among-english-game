const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL Y MAPAS
// ==========================================
const ADMIN_KEY = "admin123";
let GAME_STATE = 'LOBBY';
let CURRENT_MAP_INDEX = 0;

const MAPS = [
    {
        name: "CYBER CITY NEON", width: 6000, height: 3000, bgColor: "#020617",
        platforms: [
            { id: 'f1', x: 0, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'f2', x: 2500, y: 2800, w: 1000, h: 200, type: 'metal' },
            { id: 'f3', x: 4000, y: 2800, w: 2000, h: 200, type: 'arena' },
            { id: 'p1', x: 800, y: 2400, w: 500, h: 40, type: 'glass' },
            { id: 'tower1', x: 1800, y: 1000, w: 200, h: 1800, type: 'wall' }
        ],
        spawnPoints: [{x: 500, y: 2500}, {x: 3000, y: 2500}, {x: 5000, y: 2500}]
    },
    {
        name: "LIBRARY OF BABEL", width: 5000, height: 3000, bgColor: "#0f172a",
        platforms: [
            { id: 'f1', x: 0, y: 2800, w: 5000, h: 200, type: 'arena' },
            { id: 'book1', x: 1000, y: 2500, w: 300, h: 40, type: 'glass' },
            { id: 'book2', x: 1500, y: 2200, w: 300, h: 40, type: 'glass' },
            { id: 'desk', x: 2500, y: 2600, w: 600, h: 200, type: 'metal' }
        ],
        spawnPoints: [{x: 500, y: 2500}, {x: 2500, y: 2000}, {x: 4500, y: 2500}]
    }
];

const PLAYERS = {};
const BULLETS = [];
const ZONES = []; // Áreas de efecto (Ej: Classroom)

// 🧬 ESTADÍSTICAS DE CLASES (Sin nombres específicos, solo arquetipos)
const CLASS_STATS = {
    'ASSAULT':    { hp: 120, speed: 8,  jumps: 2, color: '#38bdf8', w: 36, h: 54 },
    'HEAVY':      { hp: 200, speed: 5,  jumps: 1, color: '#ef4444', w: 46, h: 64 },
    'CREATOR':    { hp: 110, speed: 12, jumps: 3, color: '#00f3ff', w: 34, h: 52 }, // Caos, Movilidad
    'INSTRUCTOR': { hp: 130, speed: 7,  jumps: 2, color: '#1e3a8a', w: 32, h: 56 }  // Orden, Control
};

io.on('connection', (socket) => {
    
    socket.on('joinLobby', (data) => {
        PLAYERS[socket.id] = {
            id: socket.id, name: data.name || "Operator", 
            charClass: 'ASSAULT',
            x: 0, y: 0, w: 36, h: 54, vx: 0, vy: 0, aimAngle: 0, hp: 100, maxHp: 100, onGround: false,
            
            // Atributos de Estado Generales
            iFrames: 0, stunTimer: 0, slowTimer: 0,
            
            // CREADOR (Caos)
            comboTech: 0, auraLevel: 1, weaponMode: 'BYTE', modeChaosTimer: 0, ultTimer: 0, dashCooldown: 0, targetFound: 0,
            
            // INSTRUCTORA (Orden)
            gradeScore: 50, // 0-100 (B -> A+)
            marks: {},      // Correction marks por enemigo
            popQuizTarget: null, classroomTimer: 0
        };
        socket.emit('lobbyData', { state: GAME_STATE, me: PLAYERS[socket.id], maps: MAPS });
        io.emit('updateLobbyPlayers', PLAYERS);
    });

    socket.on('selectClass', (className) => {
        if (GAME_STATE !== 'LOBBY' || !PLAYERS[socket.id]) return;
        PLAYERS[socket.id].charClass = className;
        io.emit('updateLobbyPlayers', PLAYERS);
    });

    socket.on('adminAction', (data) => {
        if (data.action === 'START_GAME') {
            GAME_STATE = 'PLAYING';
            CURRENT_MAP_INDEX = data.mapIndex || 0;
            let currentMap = MAPS[CURRENT_MAP_INDEX];
            
            Object.values(PLAYERS).forEach((p, idx) => {
                let s = CLASS_STATS[p.charClass];
                p.maxHp = s.hp; p.hp = s.hp; p.w = s.w; p.h = s.h; p.color = s.color; p.speed = s.speed; p.jumpsLeft = s.jumps; p.maxJumps = s.jumps;
                let sp = currentMap.spawnPoints[idx % currentMap.spawnPoints.length];
                p.x = sp.x; p.y = sp.y - 100; p.vx = 0; p.vy = 0;
            });
            BULLETS.length = 0; ZONES.length = 0;
            io.emit('gameStarted', { map: currentMap, players: PLAYERS });
        }
    });

    socket.on('playerInput', (data) => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0 || p.stunTimer > 0) return; // Stun impide movimiento

        p.aimAngle = data.aimAngle || 0;
        
        let speedMult = 1.0;
        if (p.slowTimer > 0) speedMult = 0.5;
        if (p.ultTimer > 0 && p.charClass === 'CREATOR') speedMult = 1.8;
        if (p.modeChaosTimer > 0) speedMult = 1.3;
        if (p.gradeScore >= 80 && p.charClass === 'INSTRUCTOR') speedMult = 1.2; // A+ Bonus

        let maxSpd = (p.speed + (p.comboTech * 0.4)) * speedMult;
        
        if (data.left && p.vx > -maxSpd) p.vx -= 1.8;
        if (data.right && p.vx < maxSpd) p.vx += 1.8;
        if (data.upTrigger && p.jumpsLeft > 0) { p.vy = -18; p.onGround = false; p.jumpsLeft--; }

        // ==========================================
        // ⚡ HABILIDADES: CREADOR (Diego)
        // ==========================================
        if (p.charClass === 'CREATOR') {
            if (data.useSkill1 && p.dashCooldown <= 0) { // GLITCH DASH
                p.vx = Math.cos(p.aimAngle) * 35; p.vy = Math.sin(p.aimAngle) * 35;
                p.dashCooldown = p.modeChaosTimer > 0 ? 20 : 45; p.iFrames = 15;
                io.emit('vfxEvent', { type: 'GLITCH_DASH', x: p.x, y: p.y });
            }
            if (data.useSkill2) p.weaponMode = p.weaponMode === 'BYTE' ? 'ARDUINO' : 'BYTE'; // SWAP
            if (data.useSkill3 && p.modeChaosTimer <= 0) { p.modeChaosTimer = 300; io.emit('vfxEvent', { type: 'CHAOS_MODE', id: p.id }); }
            if (data.useUlt && p.ultTimer <= 0) { p.ultTimer = 420; io.emit('vfxEvent', { type: 'BREAK_THE_GAME', name: p.name }); }
        }

        // ==========================================
        // 📚 HABILIDADES: INSTRUCTORA (Profesora)
        // ==========================================
        if (p.charClass === 'INSTRUCTOR') {
            if (data.useSkill1 && p.dashCooldown <= 0) { 
                // Habilidad 1: LISTEN! (AoE Stun)
                p.dashCooldown = 120;
                io.emit('vfxEvent', { type: 'LISTEN_WAVE', x: p.x, y: p.y });
                Object.values(PLAYERS).forEach(enemy => {
                    if (enemy.id !== p.id && Math.hypot(enemy.x - p.x, enemy.y - p.y) < 400) {
                        enemy.stunTimer = 60; // 1 segundo detenido
                        io.emit('floatingText', { x: enemy.x, y: enemy.y - 40, text: "LISTEN!", color: "#fbbf24" });
                    }
                });
            }
            if (data.useSkill2) {
                // Habilidad 2: POP QUIZ (Marca a un enemigo para Crítico)
                let closest = null; let minDist = 800;
                Object.values(PLAYERS).forEach(enemy => {
                    if (enemy.id !== p.id) { let d = Math.hypot(enemy.x - p.x, enemy.y - p.y); if(d < minDist){ minDist=d; closest=enemy; } }
                });
                if (closest) { p.popQuizTarget = closest.id; io.emit('floatingText', { x: closest.x, y: closest.y-50, text: "POP QUIZ!", color: "#ef4444" }); }
            }
            if (data.useSkill3 && p.classroomTimer <= 0) {
                // Habilidad 3: CLASSROOM (Zona de control)
                p.classroomTimer = 600; // Cooldown
                ZONES.push({ ownerId: p.id, x: p.x - 400, y: p.y - 200, w: 800, h: 400, life: 300, type: 'CLASSROOM' });
                io.emit('vfxEvent', { type: 'CLASSROOM_SPAWN', x: p.x, y: p.y });
            }
            if (data.useUlt && p.ultTimer <= 0) {
                // ULTIMATE: FINAL EXAM
                p.ultTimer = 600;
                io.emit('vfxEvent', { type: 'FINAL_EXAM', name: p.name });
                // Daño global automático si la profe tiene A+
                let dmg = p.gradeScore >= 80 ? 50 : 25;
                Object.values(PLAYERS).forEach(enemy => {
                    if (enemy.id !== p.id) {
                        enemy.hp -= dmg;
                        io.emit('floatingText', { x: enemy.x, y: enemy.y, text: "EXAM RESULT", color: "#fbbf24" });
                    }
                });
            }
        }
    });

    socket.on('shoot', () => {
        if (GAME_STATE !== 'PLAYING') return;
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0 || p.stunTimer > 0) return;

        if (p.charClass === 'CREATOR') {
            if (p.weaponMode === 'BYTE') {
                BULLETS.push({ ownerId: socket.id, type: 'BYTE', x: p.x+15, y: p.y+15, vx: Math.cos(p.aimAngle)*30, vy: Math.sin(p.aimAngle)*30, damage: 25, size: 5, color: '#00f3ff', bounces: 1, life: 100 });
            } else {
                BULLETS.push({ ownerId: socket.id, type: 'ARDUINO', x: p.x+15, y: p.y+15, vx: Math.cos(p.aimAngle)*40, vy: Math.sin(p.aimAngle)*40, damage: 18, size: 3, color: '#a855f7', life: 10 });
            }
        } else if (p.charClass === 'INSTRUCTOR') {
            // RED PEN: Proyectiles intercalados (X, ✓, !)
            let signs = ['X', '✓', '!'];
            let sign = signs[Math.floor(Math.random()*signs.length)];
            BULLETS.push({ ownerId: socket.id, type: 'PEN', sign: sign, x: p.x+15, y: p.y+15, vx: Math.cos(p.aimAngle)*25, vy: Math.sin(p.aimAngle)*25, damage: 20, size: 6, color: '#ef4444', life: 100 });
        } else {
            BULLETS.push({ ownerId: socket.id, type: 'NORMAL', x: p.x+15, y: p.y+15, vx: Math.cos(p.aimAngle)*24, vy: Math.sin(p.aimAngle)*24, damage: 15, size: 5, color: p.color, life: 100 });
        }
    });

    socket.on('disconnect', () => { delete PLAYERS[socket.id]; io.emit('updateLobbyPlayers', PLAYERS); });
});

// ==========================================
// 🌍 BUCLE FÍSICO Y SISTEMAS (60 FPS)
// ==========================================
function checkCollision(r1, r2) { return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y; }

setInterval(() => {
    if (GAME_STATE !== 'PLAYING') return;
    const currentMap = MAPS[CURRENT_MAP_INDEX];

    // Procesar Zonas (Classroom)
    for (let i = ZONES.length - 1; i >= 0; i--) {
        let z = ZONES[i];
        Object.values(PLAYERS).forEach(p => {
            if (checkCollision(p, z)) {
                if (p.id !== z.ownerId) p.slowTimer = 10; // Enemigos ralentizados
            }
        });
        z.life--; if (z.life <= 0) ZONES.splice(i, 1);
    }

    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;

        // Timers Globales
        if (p.dashCooldown > 0) p.dashCooldown--;
        if (p.iFrames > 0) p.iFrames--;
        if (p.stunTimer > 0) p.stunTimer--;
        if (p.slowTimer > 0) p.slowTimer--;
        if (p.modeChaosTimer > 0) p.modeChaosTimer--;
        if (p.ultTimer > 0) p.ultTimer--;
        if (p.classroomTimer > 0) p.classroomTimer--;

        // Gravedad y Fricción
        if (p.stunTimer <= 0) {
            p.vy += 0.8;
            p.vx *= p.onGround ? 0.85 : 0.95;
            p.x += p.vx; p.y += p.vy;
        }
        p.onGround = false;

        currentMap.platforms.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vy > 0 && p.y + p.h - p.vy <= plat.y + 10) { p.y = plat.y - p.h; p.vy = 0; p.onGround = true; p.jumpsLeft = p.maxJumps; }
            }
        });
        if (p.y > currentMap.height + 500) p.hp = 0;
    });

    // Físicas de Balas y Colisiones
    BULLETS.forEach((b, i) => {
        // Si está dentro de una Classroom enemiga, la bala se frena
        let insideClass = ZONES.some(z => z.ownerId !== b.ownerId && checkCollision({x:b.x, y:b.y, w:b.size, h:b.size}, z));
        let speedMod = insideClass ? 0.4 : 1.0;
        
        b.x += b.vx * speedMod; b.y += b.vy * speedMod; b.life--;
        
        let hit = false;
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0 && p.iFrames <= 0 && checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, p)) {
                
                let shooter = PLAYERS[b.ownerId];
                let finalDmg = b.damage;

                // Lógica de Impacto: INSTRUCTORA
                if (shooter && shooter.charClass === 'INSTRUCTOR') {
                    shooter.gradeScore = Math.min(100, shooter.gradeScore + 5); // Sube nota por acertar
                    if (shooter.popQuizTarget === p.id) { finalDmg *= 2; shooter.popQuizTarget = null; io.emit('floatingText', { x: p.x, y: p.y, text: "A+ CRITICAL!", color: "#fbbf24" }); }
                    
                    // Pasiva: Correction Marks
                    if (!shooter.marks[p.id]) shooter.marks[p.id] = 0;
                    shooter.marks[p.id]++;
                    if (shooter.marks[p.id] >= 3) {
                        p.slowTimer = 90; shooter.marks[p.id] = 0;
                        io.emit('floatingText', { x: p.x, y: p.y - 20, text: "CORRECT!", color: "#1e3a8a" });
                    }
                }

                // Lógica de Impacto: CREADOR
                if (shooter && shooter.charClass === 'CREATOR') {
                    shooter.comboTech = Math.min(10, shooter.comboTech + 1);
                }
                if (p.charClass === 'CREATOR') {
                    p.comboTech = 0; // Pierde combo al recibir daño
                    io.emit('floatingText', { x: p.x, y: p.y - 20, text: "ERROR", color: "#ef4444" });
                }
                if (p.charClass === 'INSTRUCTOR') {
                    p.gradeScore = Math.max(0, p.gradeScore - 10); // Pierde nota al recibir daño
                }

                p.hp -= finalDmg; hit = true;
                io.emit('floatingText', { x: p.x, y: p.y, text: `-${Math.floor(finalDmg)}`, color: "#fff" });
            }
        });

        // Colisión con paredes
        currentMap.platforms.forEach(plat => {
            if (checkCollision({x: b.x-b.size, y: b.y-b.size, w: b.size*2, h: b.size*2}, plat)) {
                if (b.bounces > 0) { b.vx = -b.vx; b.bounces--; } else hit = true;
            }
        });

        // Eliminar bala si impactó (y no es piercing) o caducó
        if (hit || b.life <= 0) BULLETS.splice(i, 1);
        else if (shooter = PLAYERS[b.ownerId]) {
             if (b.life <= 0 && shooter.charClass === 'INSTRUCTOR') shooter.gradeScore = Math.max(0, shooter.gradeScore - 2); // Falla disparo = baja nota
        }
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS, zones: ZONES });
}, 1000 / 60);

http.listen(3000, () => console.log("🌐 LAST WORD ENGINE: CREATOR vs INSTRUCTOR ENABLED."));
