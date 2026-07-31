const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// BANCO DE PREGUNTAS: VERBO TO BE
let questionBank = [
  { question: "I ___ doing my tasks in Electrical.", options: ["am", "is", "are"], correct: 0 },
  { question: "She ___ not the Impostor, I saw her scan!", options: ["am", "are", "is"], correct: 2 },
  { question: "We ___ fixing the reactor together.", options: ["was", "is", "are"], correct: 2 },
  { question: "Blue ___ acting very sus in Navigation yesterday.", options: ["were", "was", "are"], correct: 1 },
  { question: "___ you in the cafeteria when the lights went out?", options: ["Were", "Is", "Was"], correct: 0 },
  { question: "They ___ all safe in the Security room.", options: ["is", "am", "are"], correct: 2 },
  { question: "It ___ a trap! Don't go to Weapons!", options: ["are", "am", "is"], correct: 2 },
  { question: "Where ___ the body reported?", options: ["was", "were", "am"], correct: 0 },
  { question: "Red and Green ___ not in the same room.", options: ["is", "were", "was"], correct: 1 },
  { question: "Who ___ the Impostor in the last round?", options: ["were", "was", "are"], correct: 1 }
];

let players = {};
let gameState = 'LOBBY';
let imposterId = null;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

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

  socket.on('startGame', () => {
    const ids = Object.keys(players);
    if (ids.length < 2) {
      socket.emit('errorMsg', 'Need at least 2 players to start!');
      return;
    }

    imposterId = ids[Math.floor(Math.random() * ids.length)];
    ids.forEach(id => {
      players[id].role = (id === imposterId) ? 'IMPOSTOR' : 'CREWMATE';
      players[id].isAlive = true;
    });

    gameState = 'TASK';
    io.emit('gameStarted', { players, question: getNextQuestion() });
  });

  // RESPUESTA Y SIGUIENTE PREGUNTA
  socket.on('submitAnswer', (data) => {
    const currentQ = questionBank.find(q => q.question === data.questionText);
    const isCorrect = currentQ && currentQ.correct === data.answerIndex;

    if (isCorrect && players[socket.id]) {
      players[socket.id].score += 10;
    }

    // Le enviamos la confirmación y una NUEVA pregunta al jugador que respondió
    socket.emit('taskResult', { 
      correct: isCorrect, 
      nextQuestion: getNextQuestion() 
    });
  });

  socket.on('callEmergency', () => {
    gameState = 'DISCUSSION';
    io.emit('startDiscussion');
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });
});

function getNextQuestion() {
  return questionBank[Math.floor(Math.random() * questionBank.length)];
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
