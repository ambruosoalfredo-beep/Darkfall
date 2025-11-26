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

    socket.on('joinGame', (userData) => {
        // Limit to 2 players
        if (Object.keys(players).length >= 2) {
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

    socket.on('playerHit', (dmgData) => {
        // dmgData contains { damage: X, targetId: Y } (optional logic) OR just self damage
        // Simple logic: The client says "I took damage" or "I hit him".
        // Let's use: Attacker says "I hit ID X for Y damage" to prevent lag issues on victim side visually
        
        const targetId = dmgData.targetId || socket.id; // If targetId not provided, assume self (legacy)
        
        if (players[targetId]) {
            players[targetId].hp -= dmgData.damage;
            
            // Broadcast NEW HEALTH to ALL players so bars update
            io.emit('updateHealth', { 
                id: targetId, 
                hp: players[targetId].hp 
            });
            
            if (players[targetId].hp <= 0) {
                io.emit('playerDied', { id: targetId, killerId: socket.id });
                // Reset HP for next round after a delay could happen here
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnesso: ' + socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server Darkfall attivo su porta ${PORT}`);
});