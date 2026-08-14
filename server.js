const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

const WORLD_WIDTH = 2880;  // 3 Pantallas
const WORLD_HEIGHT = 1000; // 2 Pantallas

// Estructura del Mapa (Plataformas, Techos y Obstáculos)
const PLATFORMS = [
    // Suelo Principal
    { x: 0, y: 940, w: 2880, h: 60 },

    // Pantalla 1 (Izquierda) - Zona de Combate Cercano
    { x: 200, y: 750, w: 300, h: 30 },
    { x: 600, y: 600, w: 250, h: 30 },
    { x: 150, y: 450, w: 350, h: 30 }, // Techo/Plataforma alta
    { x: 750, y: 350, w: 200, h: 30 },

    // Pantalla 2 (Centro) - Arena Central / Torre
    { x: 1100, y: 800, w: 150, h: 30 },
    { x: 1610, y: 800, w: 150, h: 30 },
    { x: 1280, y: 650, w: 300, h: 30 }, // Plataforma Central
    { x: 1100, y: 480, w: 200, h: 30 },
    { x: 1560, y: 480, w: 200, h: 30 },
    { x: 1330, y: 300, w: 220, h: 30 }, // Techo Superior Torre

    // Pantalla 3 (Derecha) - Zona Snipers / Desnivel
    { x: 1950, y: 750, w: 350, h: 30 },
    { x: 2450, y: 620, w: 300, h: 30 },
    { x: 2050, y: 450, w: 250, h: 30 },
    { x: 2500, y: 320, w: 280, h: 30 },

    // Bloques/Paredes de Cobertura
    { x: 450, y: 860, w: 80, h: 80 },
    { x: 1390, y: 570, w: 80, h: 80 },
    { x: 2200, y: 860, w: 80, h: 80 }
];

const PLAYERS = {};
const BULLETS = [];

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

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
            w: 32, h: 48,
            vx: 0, vy: 0,
            aimAngle: 0,
            hp: pClass === 'PROFE' ? 150 : 100,
            maxHp: pClass === 'PROFE' ? 150 : 100,
            abilityCD: 0,
            slowed: false,
            score: 0,
            grapple: null
        };

        socket.emit('registered', { id: socket.id, platforms: PLATFORMS, worldW: WORLD_WIDTH, worldH: WORLD_HEIGHT });
    });

    socket.on('playerInput', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;

        let spd = p.classType === 'NINJA' ? 8.5 : 7;
        if (p.slowed) spd = 3.5;

        if (data.left) p.vx = -spd;
        else if (data.right) p.vx = spd;
        else p.vx *= 0.8;

        if (data.up && p.onGround) {
            p.vy = -13;
            p.onGround = false;
        }
    });

    socket.on('shoot', (angle) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        let dmg = p.classType === 'NINJA' ? 18 : (p.classType === 'PROFE' ? 35 : 22);
        let speed = p.classType === 'PROFE' ? 14 : 18;

        BULLETS.push({
            id: Math.random(), ownerId: socket.id,
            x: p.x + p.w / 2, y: p.y + p.h / 3,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            damage: dmg, life: 70, type: p.classType
        });
    });

    socket.on('useAbility', (target) => {
        const p = PLAYERS[socket.id];
        if (!p || p.abilityCD > 0 || p.hp <= 0) return;

        // GANCHO NINJA REAL (Engancha a superficies)
        if (p.classType === 'NINJA') {
            const dx = target.x - (p.x + p.w / 2);
            const dy = target.y - (p.y + p.h / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Dispara impulso hacia el punto seleccionado
            p.vx = (dx / dist) * 26;
            p.vy = (dy / dist) * 26;
            p.grapple = { x: target.x, y: target.y, timer: 15 };
            p.abilityCD = 120; // 2 segundos
        } 
        // HABILIDAD PROFE: Examen Sorpresa
        else if (p.classType === 'PROFE') {
            Object.values(PLAYERS).forEach(enemy => {
                if (enemy.id !== p.id) {
                    let dist = Math.hypot((enemy.x + enemy.w/2) - (p.x + p.w/2), (enemy.y + enemy.h/2) - (p.y + p.h/2));
                    if (dist < 450) {
                        enemy.hp -= 25;
                        enemy.slowed = true;
                        enemy.abilityCD = 180;
                        setTimeout(() => enemy.slowed = false, 3000);
                    }
                }
            });
            p.abilityCD = 240;
        }
        else {
            p.vx = p.vx >= 0 ? 20 : -20;
            p.abilityCD = 90;
        }
    });

    socket.on('disconnect', () => delete PLAYERS[socket.id]);
});

// Bucle Físico
setInterval(() => {
    Object.values(PLAYERS).forEach(p => {
        if (p.abilityCD > 0) p.abilityCD--;

        if (p.grapple) {
            p.grapple.timer--;
            if (p.grapple.timer <= 0) p.grapple = null;
        }

        // Gravedad
        p.vy += 0.55;

        // Movimiento Horizontal + Colisiones
        p.x += p.vx;
        PLATFORMS.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vx > 0) p.x = plat.x - p.w;
                else if (p.vx < 0) p.x = plat.x + plat.w;
            }
        });

        // Movimiento Vertical + Colisiones
        p.y += p.vy;
        p.onGround = false;
        PLATFORMS.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vy > 0) { // Cae sobre plataforma
                    p.y = plat.y - p.h;
                    p.vy = 0;
                    p.onGround = true;
                } else if (p.vy < 0) { // Choca techo
                    p.y = plat.y + plat.h;
                    p.vy = 0;
                }
            }
        });

        // Mecánica Pac-Man
        if (p.x < -p.w) p.x = WORLD_WIDTH - 10;
        if (p.x > WORLD_WIDTH) p.x = 0;
    });

    // Balas y Colisiones con Escenario y Jugadores
    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;

        let bulletRect = { x: b.x - 3, y: b.y - 3, w: 6, h: 6 };

        // Pac-man balas
        if (b.x < 0) b.x = WORLD_WIDTH;
        if (b.x > WORLD_WIDTH) b.x = 0;

        // Choca con plataformas
        let hitWall = PLATFORMS.some(plat => checkCollision(bulletRect, plat));
        if (hitWall) b.life = 0;

        // Choca con jugadores
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0) {
                if (checkCollision(bulletRect, p)) {
                    p.hp -= b.damage;
                    b.life = 0;
                    if (p.hp <= 0) {
                        p.hp = 0;
                        if (PLAYERS[b.ownerId]) PLAYERS[b.ownerId].score++;
                        setTimeout(() => { p.hp = p.maxHp; p.x = Math.random()*2000+400; p.y = 200; }, 2000);
                    }
                }
            }
        });

        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor de Plataformas activo en puerto ${PORT}`));
