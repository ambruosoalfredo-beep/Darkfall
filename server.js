const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const path = require('path');

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};

io.on('connection', (socket) => {
    console.log('Nuova connessione: ' + socket.id);

    // Gestione ingresso gioco
    socket.on('joinGame', (userData) => {
        // Se ci sono già 2 giocatori e questo socket non è uno di loro
        if (Object.keys(players).length >= 2 && !players[socket.id]) {
            socket.emit('serverMsg', 'Server pieno! Solo 1vs1.');
            return;
        }

        console.log(`Giocatore ${userData.username} (ID: ${socket.id}) entrato.`);

        players[socket.id] = {
            id: socket.id,
            username: userData.username || "Guerriero",
            hp: 100,
            maxHp: 100,
            position: { x: 0, y: 6, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            animState: 'idle',
            weaponMode: 'ranged',
            isDead: false
        };

        // Invia al nuovo giocatore la lista di chi c'è già
        socket.emit('currentPlayers', players);

        // Avvisa gli altri che è arrivato un nuovo giocatore
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });
    
    // RICHIESTA POSIZIONE: Risolve il bug per cui chi entra dopo non vede chi era fermo
    socket.on('requestPosition', () => {
        // Chiedo a tutti gli altri di inviare la loro posizione attuale
        socket.broadcast.emit('forcePositionUpdate');
    });

    // Aggiornamento Nome
    socket.on('updateUsername', (username) => {
        if(players[socket.id]) {
            players[socket.id].username = username;
            io.emit('updateUsername', { id: socket.id, username: username });
        }
    });

    // Movimento
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

    // Attacco (Animazione)
    socket.on('playerAttack', (attackData) => {
        socket.broadcast.emit('enemyAttacked', {
            id: socket.id,
            ...attackData
        });
    });

    // Gestione Sbalzamento (Knockback)
    socket.on('playerPushed', (pushData) => {
        const targetId = pushData.targetId;
        if (players[targetId]) {
            // Applica danno se presente
            if (pushData.damage) {
                players[targetId].hp -= pushData.damage;
            }
            
            // Invia la spinta al client colpito
            io.to(targetId).emit('playerPushed', {
                force: pushData.force,
                pushOrigin: pushData.pushOrigin
            });

            // Aggiorna la vita a tutti
            io.emit('updateHealth', { 
                id: targetId, 
                hp: players[targetId].hp 
            });

            if (players[targetId].hp <= 0 && !players[targetId].isDead) {
                players[targetId].isDead = true;
                io.emit('playerDied', { id: targetId, killerId: socket.id });
            }
        }
    });

    // Danno standard
    socket.on('playerHit', (dmgData) => {
        const targetId = dmgData.targetId;
        if (players[targetId]) {
            players[targetId].hp -= dmgData.damage;
            
            io.emit('updateHealth', { 
                id: targetId, 
                hp: players[targetId].hp 
            });
            
            if (players[targetId].hp <= 0 && !players[targetId].isDead) {
                players[targetId].isDead = true;
                io.emit('playerDied', { id: targetId, killerId: socket.id });
            }
        }
    });
    
    // Cura
    socket.on('playerHealed', (healData) => {
        if (players[socket.id]) {
            players[socket.id].hp = Math.min(players[socket.id].maxHp, players[socket.id].hp + healData.amount);
            players[socket.id].isDead = false; // Resurrect logic handled by client respawn usually
            
            io.emit('updateHealth', { 
                id: socket.id, 
                hp: players[socket.id].hp 
            });
        }
    });

    // Respawn
    socket.on('playerRespawn', () => {
        if (players[socket.id]) {
            players[socket.id].hp = 100;
            players[socket.id].isDead = false;
            io.emit('playerRespawned', { id: socket.id });
            io.emit('updateHealth', { id: socket.id, hp: 100 });
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