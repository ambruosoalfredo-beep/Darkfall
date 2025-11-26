const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

// Serve static files (like index.html)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Game State
let players = {};

io.on('connection', (socket) => {
    console.log('Un guerriero si è unito: ' + socket.id);

    // Limit to 2 players for 1v1
    if (Object.keys(players).length >= 2) {
        socket.emit('serverMsg', 'Server pieno! Solo 1vs1.');
        socket.disconnect();
        return;
    }

    // Create player entry
    players[socket.id] = {
        id: socket.id,
        hp: 100,
        position: { x: 0, y: 6, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        weaponMode: 'ranged'
    };

    // Send current players to new joiner
    socket.emit('currentPlayers', players);

    // Notify others of new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle Movement & State Updates
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            players[socket.id].animState = data.animState; // walking, sprinting, etc.
            players[socket.id].weaponMode = data.weaponMode;
            // Relay to other player immediately
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation,
                animState: data.animState,
                weaponMode: data.weaponMode
            });
        }
    });

    // Handle Attacks
    socket.on('playerAttack', (attackData) => {
        // attackData contains: type (spell id), origin, direction
        socket.broadcast.emit('enemyAttacked', {
            id: socket.id,
            ...attackData
        });
    });

    // Handle Damage Taken (Client authority for simplicity in this demo)
    socket.on('playerHit', (dmgData) => {
        if (players[socket.id]) {
            players[socket.id].hp -= dmgData.damage;
            io.emit('updateHealth', { id: socket.id, hp: players[socket.id].hp });
            
            if (players[socket.id].hp <= 0) {
                io.emit('playerDied', { id: socket.id });
                // Reset game logic could go here
            }
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