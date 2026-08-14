const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

const WORLD_WIDTH = 2880;  // 3 Pantallas
const WORLD_HEIGHT = 1000; // 2 Pantallas

const PLAYERS = {};
const BULLETS = [];

io.on('connection', (socket) => {

    socket.on('joinGame', (username) => {
        const nameClean = username.trim().toLowerCase();
        let pClass = 'RECLUTA';

        if (nameClean === 'diegox222013') pClass = 'NINJA';
        else if (nameClean === 'profe') pClass = 'PROFE';

        PLAYERS[socket.id] = {
            id: socket.id,
            name: username,
            classType: pClass,
            x: Math.random() * 2000 + 400,
            y: 200,
            vx: 0, vy: 0,
            hp: pClass === 'NINJA' ? 9999 : (pClass === 'PROFE' ? 15000 : 5000),
            maxHp: pClass === 'NINJA' ? 9999 : (pClass === 'PROFE' ? 15000 : 5000),
            abilityCD: 0,
            slowed: false,
            score: 0
        };

        socket.emit('registered', { id: socket.id, player: PLAYERS[socket.id], worldW: WORLD_WIDTH, worldH: WORLD_HEIGHT });
    });

    socket.on('playerInput', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        // VELOCIDAD EXTREMA
        let spd = p.classType === 'NINJA' ? 18 : 12;
        if (p.slowed) spd = 2; // El ralentizado del Profe sigue siendo fatal

        if (data.left) p.vx = -spd;
        else if (data.right) p.vx = spd;
        else p.vx *= 0.85;

        // TRIPLE/SUPER SALTO
        if (data.up && p.onGround) p.vy = -22;
    });

    socket.on('shoot', (angle) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        // DIEGIOX / NINJA: DISPARO EN RÁFAGA 360° (12 BALAS DE UN SOLO CLIC)
        if (p.classType === 'NINJA') {
            for (let i = 0; i < 12; i++) {
                let spreadAngle = angle + (Math.PI / 6) * i;
                BULLETS.push({
                    id: Math.random(),
                    ownerId: socket.id,
                    x: p.x, y: p.y,
                    vx: Math.cos(spreadAngle) * 35, // Balas hipersónicas
                    vy: Math.sin(spreadAngle) * 35,
                    damage: 150, life: 100, isLaser: true
                });
            }
        } 
        // PROFE: ROCKET LAUNCHER GIGANTE
        else if (p.classType === 'PROFE') {
            BULLETS.push({
                id: Math.random(),
                ownerId: socket.id,
                x: p.x, y: p.y,
                vx: Math.cos(angle) * 20,
                vy: Math.sin(angle) * 20,
                damage: 800, life: 120, isNuke: true
            });
        } 
        // RECLUTA: ESCOPETA OP
        else {
            for(let i = -2; i <= 2; i++) {
                BULLETS.push({
                    id: Math.random(),
                    ownerId: socket.id,
                    x: p.x, y: p.y,
                    vx: Math.cos(angle + i*0.1) * 25,
                    vy: Math.sin(angle + i*0.1) * 25,
                    damage: 100, life: 50
                });
            }
        }
    });

    socket.on('useAbility', (target) => {
        const p = PLAYERS[socket.id];
        if (!p || p.abilityCD > 0 || p.hp <= 0) return;

        // BUFF NINJA: TELEPORT / GANCHO A VELOCIDAD DE LA LUZ
        if (p.classType === 'NINJA') {
            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            p.vx = (dx / dist) * 55; // Vuela a través del mapa
            p.vy = (dy / dist) * 55;
            p.abilityCD = 15; // Prácticamente SIN COOLDOWN (0.25s)
        } 
        // BUFF PROFE: "EXAMEN REPROBADO" - AURA DE LA DEATH MAPA COMPLETO
        else if (p.classType === 'PROFE') {
            Object.values(PLAYERS).forEach(enemy => {
                if (enemy.id !== p.id) {
                    let dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                    if (dist < 1200) { // Ocupa más de una pantalla
                        enemy.hp -= 2000; // Daño directo masivo
                        enemy.slowed = true;
                        enemy.abilityCD = 300; // Bloquea al rival por 5 seg
                        setTimeout(() => enemy.slowed = false, 5000);
                    }
                }
            });
            p.abilityCD = 120; // 2 segundos
        }
        else {
            // SUPER DASH
            p.vx = p.vx >= 0 ? 40 : -40;
            p.abilityCD = 30;
        }
    });

    socket.on('disconnect', () => delete PLAYERS[socket.id]);
});

// Bucle Físico
setInterval(() => {
    Object.values(PLAYERS).forEach(p => {
        if (p.abilityCD > 0) p.abilityCD--;
        p.vy += 0.6; // Gravedad
        p.x += p.vx;
        p.y += p.vy;

        // PAC-MAN EXTRA BUFFEADO (Aparece al otro lado al instante)
        if (p.x < 0) p.x = WORLD_WIDTH - 50;
        if (p.x > WORLD_WIDTH) p.x = 50;

        // Suelo Base
        if (p.y >= WORLD_HEIGHT - 40) {
            p.y = WORLD_HEIGHT - 40;
            p.vy = 0;
            p.onGround = true;
        } else {
            p.onGround = false;
        }
    });

    // Balas
    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;

        if (b.x < 0) b.x = WORLD_WIDTH;
        if (b.x > WORLD_WIDTH) b.x = 0;

        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0) {
                let hitbox = b.isNuke ? 80 : 30; // El cohete del profe tiene hitbox gigante
                if (Math.hypot(p.x - b.x, p.y - b.y) < hitbox) {
                    p.hp -= b.damage;
                    b.life = 0;
                    if (p.hp <= 0) {
                        p.hp = 0;
                        if (PLAYERS[b.ownerId]) PLAYERS[b.ownerId].score++;
                        setTimeout(() => { p.hp = p.maxHp; p.x = Math.random()*2000+400; p.y = 200; }, 1000);
                    }
                }
            }
        });

        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor BUFFEADO corriendo en puerto ${PORT}`));
