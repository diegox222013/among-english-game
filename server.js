const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

const WORLD_WIDTH = 5760;
const WORLD_HEIGHT = 1600;

// CLAVE SECRETA DE ADMIN (Solo tú la sabes)
const ADMIN_KEY = "admin123";

const PLATFORMS = [
    { x: 0, y: 1500, w: 1800, h: 100, type: 'grass' },
    { x: 1950, y: 1540, w: 1800, h: 60, type: 'dirt' },
    { x: 3900, y: 1480, w: 1860, h: 120, type: 'grass' },
    { x: 400, y: 1300, w: 250, h: 25, type: 'wood' },
    { x: 300, y: 1100, w: 200, h: 25, type: 'wood' },
    { x: 550, y: 920, w: 300, h: 30, type: 'wood' },
    { x: 450, y: 700, w: 500, h: 35, type: 'leaves' },
    { x: 650, y: 480, w: 200, h: 25, type: 'wood' },
    { x: 1200, y: 1320, w: 350, h: 30, type: 'stone' },
    { x: 1300, y: 1120, w: 200, h: 30, type: 'stone' },
    { x: 1150, y: 920, w: 500, h: 35, type: 'stone' },
    { x: 2000, y: 1300, w: 200, h: 25, type: 'wood' },
    { x: 2300, y: 1150, w: 250, h: 25, type: 'wood' },
    { x: 2650, y: 1000, w: 300, h: 25, type: 'wood' },
    { x: 2400, y: 600, w: 800, h: 40, type: 'stone' },
    { x: 4000, y: 1280, w: 300, h: 30, type: 'grass' },
    { x: 4400, y: 1100, w: 350, h: 30, type: 'grass' },
    { x: 4200, y: 880, w: 400, h: 35, type: 'stone' }
];

const PLAYERS = {};
const BULLETS = [];
const VINES = [];      // 1. Enredaderas
const TORNADOS = [];   // 2. Tornados de Viento

function checkCollision(r1, r2) {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x &&
           r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

io.on('connection', (socket) => {

    socket.on('joinGame', (data) => {
        const username = data.name || "Guerrero";
        const pass = data.adminKey;
        
        let pClass = 'RECLUTA';
        let isAdmin = false;

        // VERIFICACIÓN DE ADMIN EXCLUSIVO
        if (pass === ADMIN_KEY) {
            pClass = 'NINJA'; // Solo tú puedes tener la clase Ninja con tu clave
            isAdmin = true;
        }

        PLAYERS[socket.id] = {
            id: socket.id,
            name: username,
            classType: pClass,
            isAdmin: isAdmin,
            weapon: data.weapon || 'rifle',
            skill: data.skill || 'grapple',
            x: Math.random() * 3000 + 500,
            y: 300,
            w: 32, h: 50,
            vx: 0, vy: 0,
            aimAngle: 0,
            hp: pClass === 'NINJA' ? 140 : 100,
            maxHp: pClass === 'NINJA' ? 140 : 100,
            abilityCD: 0,
            slowedTimer: 0,
            score: 0,
            grapple: { active: false, x: 0, y: 0 }
        };

        socket.emit('registered', { 
            id: socket.id, 
            platforms: PLATFORMS, 
            worldW: WORLD_WIDTH, 
            worldH: WORLD_HEIGHT,
            isAdmin: isAdmin
        });
    });

    socket.on('playerInput', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;

        let spd = p.classType === 'NINJA' ? 10 : 7;
        if (p.slowedTimer > 0) spd = 2.5; // Frenado por Enredaderas

        if (data.left) p.vx -= 1.2;
        if (data.right) p.vx += 1.2;

        p.vx *= 0.85;

        if (data.up && p.onGround) {
            p.vy = -14;
            p.onGround = false;
        }

        // GRAPPLE CONTINUO (Manteniendo Clic Derecho)
        if (data.holdingRightClick && p.skill === 'grapple' && data.targetPoint) {
            if (!p.grapple.active) {
                p.grapple.active = true;
                p.grapple.x = data.targetPoint.x;
                p.grapple.y = data.targetPoint.y;
            }
            let dx = p.grapple.x - (p.x + p.w / 2);
            let dy = p.grapple.y - (p.y + p.h / 2);
            let dist = Math.hypot(dx, dy);

            p.vx += (dx / dist) * 0.95;
            p.vy += (dy / dist) * 0.95;
        } else {
            p.grapple.active = false;
        }
    });

    // ACTIVACIÓN DE LAS 3 NUEVAS HABILIDADES
    socket.on('useAbilityTrigger', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.abilityCD > 0 || p.hp <= 0) return;

        // 1. ENREDADERA ESPINOSA
        if (p.skill === 'vines' && data.targetPoint) {
            VINES.push({
                x: data.targetPoint.x - 40,
                y: data.targetPoint.y - 60,
                w: 80, h: 60,
                life: 300, // Dura 5 Segundos
                ownerId: p.id
            });
            p.abilityCD = 240; // Cooldown 4s
        }

        // 2. TORNADO FOLIAR (Impulso de Viento)
        if (p.skill === 'tornado' && data.targetPoint) {
            TORNADOS.push({
                x: data.targetPoint.x - 35,
                y: data.targetPoint.y - 120,
                w: 70, h: 140,
                life: 180, // Dura 3 Segundos
                ownerId: p.id
            });
            p.abilityCD = 300;
        }

        // 3. PISOTÓN SÍSMICO (Slam desde el aire)
        if (p.skill === 'slam') {
            p.vy = 28; // Caída instantánea
            p.isSlamming = true;
            p.abilityCD = 200;
        }
    });

    socket.on('shoot', () => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        let angle = p.aimAngle;
        let startX = p.x + p.w / 2;
        let startY = p.y + p.h / 3;

        if (p.weapon === 'shotgun') {
            for (let i = -2; i <= 2; i++) {
                BULLETS.push({ id: Math.random(), ownerId: socket.id, x: startX, y: startY, vx: Math.cos(angle + i*0.08)*16, vy: Math.sin(angle + i*0.08)*16, damage: 12, life: 35 });
            }
        } else if (p.weapon === 'sniper') {
            BULLETS.push({ id: Math.random(), ownerId: socket.id, x: startX, y: startY, vx: Math.cos(angle)*28, vy: Math.sin(angle)*28, damage: 55, life: 90 });
        } else {
            BULLETS.push({ id: Math.random(), ownerId: socket.id, x: startX, y: startY, vx: Math.cos(angle)*19, vy: Math.sin(angle)*19, damage: 20, life: 60 });
        }
    });

    socket.on('disconnect', () => delete PLAYERS[socket.id]);
});

// BUCLE DE FÍSICAS Y LÓGICA DE HABILIDADES
setInterval(() => {
    // Actualizar Enredaderas
    for (let i = VINES.length - 1; i >= 0; i--) {
        VINES[i].life--;
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== VINES[i].ownerId && checkCollision(p, VINES[i])) {
                p.slowedTimer = 30; // Ralentiza al enemigo
                p.hp -= 0.2; // Daño constante
            }
        });
        if (VINES[i].life <= 0) VINES.splice(i, 1);
    }

    // Actualizar Tornados de Viento
    for (let i = TORNADOS.length - 1; i >= 0; i--) {
        TORNADOS[i].life--;
        Object.values(PLAYERS).forEach(p => {
            if (checkCollision(p, TORNADOS[i])) {
                p.vy = -18; // Super Salto hacia arriba
            }
        });
        if (TORNADOS[i].life <= 0) TORNADOS.splice(i, 1);
    }

    // Actualizar Jugadores
    Object.values(PLAYERS).forEach(p => {
        if (p.abilityCD > 0) p.abilityCD--;
        if (p.slowedTimer > 0) p.slowedTimer--;

        p.vy += p.grapple.active ? 0.3 : 0.55;

        p.x += p.vx;
        PLATFORMS.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vx > 0) p.x = plat.x - p.w;
                else if (p.vx < 0) p.x = plat.x + plat.w;
                p.vx = 0;
            }
        });

        p.y += p.vy;
        p.onGround = false;
        PLATFORMS.forEach(plat => {
            if (checkCollision(p, plat)) {
                if (p.vy > 0) {
                    p.y = plat.y - p.h;

                    // Explosión de Pisotón Sísmico al tocar el suelo
                    if (p.isSlamming) {
                        p.isSlamming = false;
                        Object.values(PLAYERS).forEach(enemy => {
                            if (enemy.id !== p.id) {
                                let dist = Math.hypot((enemy.x + enemy.w/2) - (p.x + p.w/2), (enemy.y + enemy.h/2) - (p.y + p.h/2));
                                if (dist < 250) {
                                    enemy.hp -= 35;
                                    enemy.vy = -12; // Lo lanza por los aires
                                }
                            }
                        });
                    }

                    p.vy = 0;
                    p.onGround = true;
                } else if (p.vy < 0) {
                    p.y = plat.y + plat.h;
                    p.vy = 0;
                }
            }
        });

        if (p.x < -p.w) p.x = WORLD_WIDTH - 20;
        if (p.x > WORLD_WIDTH) p.x = 0;
    });

    // Balas
    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        let bulletRect = { x: b.x - 4, y: b.y - 4, w: 8, h: 8 };

        if (PLATFORMS.some(plat => checkCollision(bulletRect, plat))) b.life = 0;

        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0 && checkCollision(bulletRect, p)) {
                p.hp -= b.damage;
                b.life = 0;
                if (p.hp <= 0) {
                    p.hp = 0;
                    if (PLAYERS[b.ownerId]) PLAYERS[b.ownerId].score++;
                    setTimeout(() => { p.hp = p.maxHp; p.x = Math.random()*3000+500; p.y = 300; }, 2500);
                }
            }
        });

        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS, vines: VINES, tornados: TORNADOS });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));
