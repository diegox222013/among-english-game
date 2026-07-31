const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// AQUÍ AGREGAREMOS LA MATERIA QUE ME VAYAS PASANDO
let questionBank = [
  {
    question: "What is the past tense of 'GO'?",
    options: ["Goed", "Went", "Gone"],
    correct: 1
  }
];

let players = {};
let gameState = 'LOBBY'; // LOBBY, TASK, DISCUSSION, END
let imposterId = null;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Unirse al juego
  socket.on('joinGame', (username) => {
    players[socket.id] = {
      id: socket.id,
      name: username,
      role: 'CREWMATE',
      score: 0,
      isAlive: true
    };
    io.emit('updatePlayers', players);
  });

  // Iniciar partida
  socket.on('startGame', () => {
    const ids = Object.keys(players);
    if (ids.length < 2) {
      socket.emit('errorMsg', 'Need at least 2 players to start!');
      return;
    }

    // Asignar Impostor al azar
    imposterId = ids[Math.floor(Math.random() * ids.length)];
    ids.forEach(id => {
      players[id].role = (id === imposterId) ? 'IMPOSTOR' : 'CREWMATE';
      players[id].isAlive = true;
    });

    gameState = 'TASK';
    io.emit('gameStarted', { players, question: getNextQuestion() });
  });

  // Enviar respuesta de tarea
  socket.on('submitAnswer', (answerIndex) => {
    // Procesar lógica de tareas
    socket.emit('taskResult', { correct: true }); 
  });

  // Iniciar reunión de emergencia
  socket.on('callEmergency', () => {
    gameState = 'DISCUSSION';
    io.emit('startDiscussion');
  });

  // Enviar voto
  socket.on('castVote', (targetId) => {
    io.emit('chatMessage', { sender: 'SYSTEM', text: `${players[socket.id]?.name} has voted.` });
  });

  // Desconexión
  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });
});

function getNextQuestion() {
  return questionBank[Math.floor(Math.random() * questionBank.length)];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
