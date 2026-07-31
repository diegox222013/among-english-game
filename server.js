const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

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
let votes = {};
let imposterId = null;
let isSabotaged = false;

io.on('connection', (socket) => {
  socket.on('joinGame', (username) => {
    players[socket.id] = {
      id: socket.id,
      name: username,
      role: 'CREWMATE',
      isAlive: true
    };
    io.emit('updatePlayers', players);
  });

  socket.on('startGame', () => {
    const ids = Object.keys(players);
    if (ids.length < 2) {
      socket.emit('errorMsg', 'Need at least 2 players!');
      return;
    }

    imposterId = ids[Math.floor(Math.random() * ids.length)];
    ids.forEach(id => {
      players[id].role = (id === imposterId) ? 'IMPOSTOR' : 'CREWMATE';
      players[id].isAlive = true;
    });

    votes = {};
    isSabotaged = false;
    io.emit('gameStarted', { players, question: getNextQuestion() });
  });

  socket.on('submitAnswer', (data) => {
    const currentQ = questionBank.find(q => q.question === data.questionText);
    const isCorrect = currentQ && currentQ.correct === data.answerIndex;

    // Si el juego está saboteado y la respuesta es correcta, arreglan las luces
    if (isSabotaged && isCorrect) {
      isSabotaged = false;
      io.emit('sabotageFixed');
    }

    socket.emit('taskResult', { 
      correct: isCorrect, 
      nextQuestion: getNextQuestion() 
    });
  });

  // EVENTO DE SABOTAJE (solo emitido por el Impostor)
  socket.on('triggerSabotage', () => {
    if (socket.id === imposterId) {
      isSabotaged = true;
      io.emit('sabotageTriggered', {
        question: {
          question: "🚨 SABOTAGE! Fix the lights: 'The power ___ off!'",
          options: ["went", "go", "gone"],
          correct: 0
        }
      });
    }
  });

  socket.on('callEmergency', () => {
    votes = {};
    io.emit('startDiscussion', players);
  });

  socket.on('castVote', (targetId) => {
    votes[socket.id] = targetId;
    const alivePlayers = Object.values(players).filter(p => p.isAlive);
    if (Object.keys(votes).length >= alivePlayers.length) {
      processEjection();
    } else {
      io.emit('voteUpdate', { totalVotes: Object.keys(votes).length, required: alivePlayers.length });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });
});

function processEjection() {
  const tally = {};
  Object.values(votes).forEach(targetId => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  let maxVotes = 0;
  let ejectedId = null;

  for (const [id, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      ejectedId = id;
    }
  }

  if (ejectedId && players[ejectedId]) {
    const ejectedPlayer = players[ejectedId];
    ejectedPlayer.isAlive = false;
    const isImpostor = (ejectedId === imposterId);

    io.emit('ejectionResult', {
      ejectedName: ejectedPlayer.name,
      isImpostor: isImpostor
    });
  }
}

function getNextQuestion() {
  return questionBank[Math.floor(Math.random() * questionBank.length)];
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
