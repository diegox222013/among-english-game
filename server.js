const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

const WORLD_WIDTH = 5760;
const WORLD_HEIGHT = 1600;
const ADMIN_KEY = "admin123";

const PLATFORMS = [
    { x: 0, y: 1500, w: 2000, h: 100, type: 'grass' },
    { x: 2000, y: 1500, w: 2000, h: 100, type: 'dirt' },
    { x: 4000, y: 1500, w: 1760, h: 100, type: 'grass' },
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
const VINES = [];
const TORNADOS = [];
const AURA_PARTICLES = [];

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
        let isProfe = username.trim().toLowerCase() === "profe";

        if (pass === ADMIN_KEY || isProfe) {
            pClass = 'PROFE / NINJA';
            isAdmin = true;
        }

        let pSkill = data.skill || 'vines';
        if (isProfe) pSkill = 'english'; // Habilidad especial de inglés fija si te llamas "profe"
        else if (pSkill === 'grapple' && !isAdmin) pSkill = 'vines';

        PLAYERS[socket.id] = {
            id: socket.id, name: username, classType: pClass, isAdmin: isAdmin, isProfe: isProfe,
            weapon: data.weapon || 'rifle', skill: pSkill,
            x: Math.random() * 3000 + 500, y: 300,
            w: 32, h: 50, vx: 0, vy: 0, aimAngle: 0,
            hp: isAdmin ? 150 : 100,
            maxHp: isAdmin ? 150 : 100,
            abilityCD: 0, slowedTimer: 0, score: 0,
            onGround: false, jumpHeld: false,
            grapple: { active: false, x: 0, y: 0, length: 0 }
        };

        socket.emit('registered', { id: socket.id, platforms: PLATFORMS, worldW: WORLD_WIDTH, worldH: WORLD_HEIGHT, isAdmin: isAdmin });
        io.emit('chatMessage', { sender: "SISTEMA", text: isProfe ? `🎓 ¡EL PROFE DE INGLÉS HA ENTRADO A CLASE!` : `👉 ${username} ha entrado a la arena.`, type: 'system' });
    });

    socket.on('sendChat', (msg) => {
        const p = PLAYERS[socket.id];
        if (p && msg.trim().length > 0) {
            io.emit('chatMessage', { sender: p.name, text: msg.trim(), isAdmin: p.isAdmin, type: 'user' });
        }
    });

    socket.on('playerInput', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.hp <= 0) return;

        p.aimAngle = data.aimAngle || 0;

        let spd = p.isAdmin ? 1.6 : 1.3;
        let maxWalkSpeed = p.isAdmin ? 8 : 6;
        
        if (p.slowedTimer > 0) {
            spd = 0.5;
            maxWalkSpeed = 2;
        }

        if (data.left && p.vx > -maxWalkSpeed) p.vx -= spd;
        if (data.right && p.vx < maxWalkSpeed) p.vx += spd;

        if (data.up) {
            if (!p.jumpHeld) {
                if (p.onGround) {
                    p.vy = -16;
                    p.onGround = false;
                } else if (p.grapple.active) {
                    p.vy = -16;
                    p.grapple.active = false;
                }
            }
            p.jumpHeld = true;
        } else {
            p.jumpHeld = false;
        }

        // GRAPPLE HIPER RÁPIDO
        if (data.holdingRightClick && (p.skill === 'grapple' || p.isProfe) && p.isAdmin && data.targetPoint) {
            if (!p.grapple.active) {
                p.grapple.active = true;
                p.grapple.x = data.targetPoint.x;
                p.grapple.y = data.targetPoint.y;
                let dx = p.grapple.x - (p.x + p.w / 2);
                let dy = p.grapple.y - (p.y + p.h / 2);
                let dist = Math.hypot(dx, dy);

                p.grapple.length = dist * 0.6;
                if (dist > 0) {
                    p.vx += (dx / dist) * 14;
                    p.vy += (dy / dist) * 14;
                }
            }
        } else {
            p.grapple.active = false;
        }
    });

    socket.on('useAbilityTrigger', (data) => {
        const p = PLAYERS[socket.id];
        if (!p || p.abilityCD > 0 || p.hp <= 0) return;

        // HABILIDAD DE INGLÉS: Ráfaga de Libros / Rango A+
        if ((p.skill === 'english' || p.isProfe) && data.targetPoint) {
            let angle = p.aimAngle;
            let startX = p.x + p.w / 2;
            let startY = p.y + p.h / 3;

            for (let i = -1; i <= 1; i++) {
                BULLETS.push({
                    id: Math.random(), ownerId: socket.id, x: startX, y: startY,
                    vx: Math.cos(angle + i * 0.15) * 20, vy: Math.sin(angle + i * 0.15) * 20,
                    damage: 45, life: 60, isBook: true, text: i === 0 ? "A+" : i === -1 ? "100%" : "ABC"
                });
            }
            p.abilityCD = 180; // Cooldown rápido
        }

        if (p.skill === 'vines' && data.targetPoint) {
            VINES.push({ x: data.targetPoint.x - 40, y: data.targetPoint.y - 60, w: 80, h: 60, life: 300, ownerId: p.id });
            p.abilityCD = 240;
        }
        if (p.skill === 'tornado' && data.targetPoint) {
            TORNADOS.push({ x: data.targetPoint.x - 35, y: data.targetPoint.y - 120, w: 70, h: 140, life: 180, ownerId: p.id });
            p.abilityCD = 300;
        }
        if (p.skill === 'slam') {
            p.vy = 32; p.isSlamming = true; p.abilityCD = 200;
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
                BULLETS.push({ id: Math.random(), ownerId: socket.id, x: startX, y: startY, vx: Math.cos(angle + i*0.08)*22, vy: Math.sin(angle + i*0.08)*22, damage: 14, life: 30 });
            }
        } else if (p.weapon === 'sniper') {
            BULLETS.push({ id: Math.random(), ownerId: socket.id, x: startX, y: startY, vx: Math.cos(angle)*38, vy: Math.sin(angle)*38, damage: 65, life: 100 });
        } else {
            BULLETS.push({ id: Math.random(), ownerId: socket.id, x: startX, y: startY, vx: Math.cos(angle)*25, vy: Math.sin(angle)*25, damage: 22, life: 70 });
        }
    });

    socket.on('disconnect', () => {
        if(PLAYERS[socket.id]) {
            io.emit('chatMessage', { sender: "SISTEMA", text: `👋 ${PLAYERS[socket.id].name} se ha ido.`, type: 'system' });
        }
        delete PLAYERS[socket.id];
    });
});

setInterval(() => {
    // Generar partículas de aura
    Object.values(PLAYERS).forEach(p => {
        if (p.hp > 0) {
            if (p.isProfe) {
                // Aura de Inglés (Letras flotantes ABC)
                const letters = ['A', 'B', 'C', 'A+', '100%', 'ENGLISH'];
                AURA_PARTICLES.push({
                    x: p.x + p.w / 2 + (Math.random() * 24 - 12),
                    y: p.y + p.h / 2 + (Math.random() * 30 - 15),
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: -Math.random() * 2.5,
                    size: Math.random() * 4 + 3,
                    life: 30,
                    type: 'english',
                    text: letters[Math.floor(Math.random() * letters.length)]
                });
            } else if (p.isAdmin) {
                // Aura Neón RGB
                AURA_PARTICLES.push({
                    x: p.x + p.w / 2 + (Math.random() * 20 - 10),
                    y: p.y + p.h / 2 + (Math.random() * 30 - 15),
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: -Math.random() * 2,
                    size: Math.random() * 5 + 3,
                    life: 25,
                    type: 'rgb'
                });
            }
        }
    });

    for (let i = AURA_PARTICLES.length - 1; i >= 0; i--) {
        let part = AURA_PARTICLES[i];
        part.x += part.vx;
        part.y += part.vy;
        part.life--;
        part.size *= 0.94;
        if (part.life <= 0) AURA_PARTICLES.splice(i, 1);
    }

    for (let i = VINES.length - 1; i >= 0; i--) {
        VINES[i].life--;
        Object.values(PLAYERS).forEach(p => {
            if (p.id !== VINES[i].ownerId && checkCollision(p, VINES[i])) { p.slowedTimer = 30; p.hp -= 0.3; }
        });
        if (VINES[i].life <= 0) VINES.splice(i, 1);
    }

    for (let i = TORNADOS.length - 1; i >= 0; i--) {
        TORNADOS[i].life--;
        Object.values(PLAYERS).forEach(p => {
            if (checkCollision(p, TORNADOS[i])) p.vy = -22;
        });
        if (TORNADOS[i].life <= 0) TORNADOS.splice(i, 1);
    }

    Object.values(PLAYERS).forEach(p => {
        if (p.hp <= 0) return;

        if (p.abilityCD > 0) p.abilityCD--;
        if (p.slowedTimer > 0) p.slowedTimer--;

        p.vy += 0.6;

        if (p.grapple.active) {
            let cx = p.x + p.w / 2;
            let cy = p.y + p.h / 2;
            let dx = p.grapple.x - cx;
            let dy = p.grapple.y - cy;
            let dist = Math.hypot(dx, dy);

            if (dist > 0) {
                if (dist > p.grapple.length) {
                    let diff = dist - p.grapple.length;
                    let tension = diff * 0.085;
                    p.vx += (dx / dist) * tension;
                    p.vy += (dy / dist) * tension;
                }
                p.grapple.length = Math.max(20, p.grapple.length - 8.0);
                p.vx *= 0.99; p.vy *= 0.99;
            }
        }

        if (p.vy > 25) p.vy = 25;
        p.vx *= p.onGround ? 0.80 : 0.92;

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
                    if (p.isSlamming) {
                        p.isSlamming = false;
                        Object.values(PLAYERS).forEach(enemy => {
                            if (enemy.id !== p.id) {
                                let dist = Math.hypot((enemy.x + enemy.w/2) - (p.x + p.w/2), (enemy.y + enemy.h/2) - (p.y + p.h/2));
                                if (dist < 300) { enemy.hp -= 40; enemy.vy = -16; enemy.vx = (enemy.x - p.x > 0) ? 10 : -10; }
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

        if (p.x < -p.w) p.x = WORLD_WIDTH - 1;
        if (p.x > WORLD_WIDTH) p.x = -p.w + 1;

        if (p.y > WORLD_HEIGHT + 200) {
            p.hp = 0;
            setTimeout(() => { p.hp = p.maxHp; p.x = Math.random()*3000+500; p.y = 300; p.vx = 0; p.vy = 0; }, 2000);
        }
    });

    BULLETS.forEach((b, i) => {
        b.x += b.vx; b.y += b.vy; b.life--;
        let bRect = { x: b.x - 6, y: b.y - 6, w: 12, h: 12 };

        if (b.x < 0) b.x = WORLD_WIDTH;
        if (b.x > WORLD_WIDTH) b.x = 0;

        if (PLATFORMS.some(plat => checkCollision(bRect, plat))) b.life = 0;

        Object.values(PLAYERS).forEach(p => {
            if (p.id !== b.ownerId && p.hp > 0 && checkCollision(bRect, p)) {
                p.hp -= b.damage;
                if (b.isBook) p.slowedTimer = 25; // La ráfaga de inglés los alenta
                b.life = 0;
                if (p.hp <= 0) {
                    p.hp = 0;
                    if (PLAYERS[b.ownerId]) PLAYERS[b.ownerId].score++;
                    io.emit('chatMessage', { sender: "SISTEMA", text: `💀 ${p.name} reprobó el examen de inglés.`, type: 'system' });
                    setTimeout(() => { p.hp = p.maxHp; p.x = Math.random()*3000+500; p.y = 300; p.vx = 0; p.vy = 0; }, 2000);
                }
            }
        });
        if (b.life <= 0) BULLETS.splice(i, 1);
    });

    io.emit('stateUpdate', { players: PLAYERS, bullets: BULLETS, vines: VINES, tornados: TORNADOS, auraParticles: AURA_PARTICLES });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Servidor en línea en puerto ${PORT}`));
