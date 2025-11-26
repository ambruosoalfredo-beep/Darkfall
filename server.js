const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};

io.on('connection', (socket) => {
    console.log('Nuova connessione: ' + socket.id);

    // Limit to 2 players
    if (Object.keys(players).length >= 2) {
        socket.emit('serverMsg', 'Server pieno! Solo 1vs1.');
        return;
    }

    socket.on('joinGame', (userData) => {
        if (Object.keys(players).length >= 2 && !players[socket.id]) { // Double check
            socket.emit('serverMsg', 'Server pieno! Solo 1vs1.');
            return;
        }

        console.log(`Giocatore ${userData.username} entrato.`);

        players[socket.id] = {
            id: socket.id,
            username: userData.username || "Guerriero",
            hp: 100,
            maxHp: 100,
            position: { x: 0, y: 6, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            animState: 'idle',
            weaponMode: 'ranged'
        };

        // Send current players to the new joiner
        socket.emit('currentPlayers', players);

        // Broadcast new player to others
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });
    
    // NEW: Handle name updates
    socket.on('updateUsername', (username) => {
        if(players[socket.id]) {
            players[socket.id].username = username;
            io.emit('updateUsername', { id: socket.id, username: username });
        }
    });

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            players[socket.id].animState = data.animState;
            players[socket.id].weaponMode = data.weaponMode;
            
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation,
                animState: data.animState,
                weaponMode: data.weaponMode
            });
        }
    });

    socket.on('playerAttack', (attackData) => {
        socket.broadcast.emit('enemyAttacked', {
            id: socket.id,
            ...attackData
        });
    });

    // NEW: Handle Pushed/Knockback effects (mainly used by spell 2 & 3)
    socket.on('playerPushed', (pushData) => {
        const targetId = pushData.targetId;
        if (players[targetId]) {
            // Apply damage if provided (for fireball)
            if (pushData.damage) {
                players[targetId].hp -= pushData.damage;
            }
            
            // Broadcast new health to ALL players
            io.emit('updateHealth', { 
                id: targetId, 
                hp: players[targetId].hp 
            });

            if (players[targetId].hp <= 0) {
                io.emit('playerDied', { id: targetId, killerId: socket.id });
            }
        }
    });

    // Handle standard Damage Taken (Spell 1, 4, Melee)
    socket.on('playerHit', (dmgData) => {
        const targetId = dmgData.targetId;
        
        if (players[targetId]) {
            players[targetId].hp -= dmgData.damage;
            
            // Broadcast NEW HEALTH to ALL players so bars update
            io.emit('updateHealth', { 
                id: targetId, 
                hp: players[targetId].hp 
            });
            
            if (players[targetId].hp <= 0) {
                io.emit('playerDied', { id: targetId, killerId: socket.id });
            }
        }
    });
    
    // NEW: Handle Healing
    socket.on('playerHealed', (healData) => {
        if (players[socket.id]) {
            players[socket.id].hp = Math.min(players[socket.id].maxHp, players[socket.id].hp + healData.amount);
            
            // Broadcast NEW HEALTH to ALL players (crucial for opponent sync)
            io.emit('updateHealth', { 
                id: socket.id, 
                hp: players[socket.id].hp 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Guerriero disconnesso: ' + socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Darkfall attivo su porta ${PORT}`);
});