var express = require('express');
var app = express();
//var app = require('morgan')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
  res.sendFile(__dirname + '/www/index.html');
});
app.use('/', express.static('www'))

var unallocated_sockets = [];

io.on('connection', function(socket){
  unallocated_sockets.push(socket)
  console.log('Socket connecting');
  console.log(unallocated_sockets.length+" unallocated socket(s) currently connected");
  socket.on('name query', function(msg){
    console.log('name query: '+msg.name);
    socket.emit('name query response', {name: msg.name, status: queryName(msg.name)});
  });
  socket.on('join as new player', function(name){
    if (queryName(name) !== "unused") {
      console.log("A socket attempted to create "+name+" as a new player, when that player already exists");
      return;
    }
    console.log('player joining: '+name);
    game.addPlayer(name);
    game.broadcast('new player joining', {name: name});
    allocateSocket(socket,name);
  });
  socket.on('rejoin as existing player', function(name){
    if (queryName(name) !== "disconnected") {
      if (queryName(name) == "active") {
        console.log("A socket attempted to reconnect as "+name+", but that player is already connected");
      } else {
        console.log("A socket attempted to reconnect as "+name+", but that player does not exist");
      }
      return;
    }
    console.log('player rejoining: '+name);
    game.broadcast('player reconnected', {name: name});
    allocateSocket(socket,name);
  });
  socket.on('disconnect', function() {
    console.log("Unallocated socket disconnecting");
    console.log(unallocated_sockets.length+" unallocated socket(s) currently connected");
    unallocated_sockets.splice(unallocated_sockets.indexOf(this),1);
  });
});

function allocateSocket(socket,name) {
  unallocated_sockets.splice(unallocated_sockets.indexOf(socket),1);
  game.players[name].connected = true;
  game.players[name].socket = socket
  game.broadcastStates();
  socket.on('disconnect', function(){
    console.log('player lost connection: '+name);
    game.players[name].connected = false;
    game.broadcast('player disconnected', {name: name});
    game.broadcastStates();
  });
  socket.on('draw card', function(){
    var card = game.drawCard(name);
    socket.emit('you drew card',{player:name,card:card})
    game.broadcast('player drew card',{player:name})
    game.broadcastStates();
  })
  socket.on('give card', function(msg){
    var card = game.drawCard(msg.player);
    socket.emit('you were given card',{player:msg.player,card:card})
    game.broadcast('player was given card',{player:msg.player})
    game.broadcastStates();
  })
  socket.on('play card', function(msg){
    success = game.playCard(name,msg.card);
    if (success) {
      socket.emit('you played card',{player:name,card:msg.card});
      game.broadcast('player played card',{player:name,card:msg.card});
      game.broadcastStates();
    } else {
      // TODO: Error Condition
    }
  });
  socket.on('take back card', function(){
    console.log("Player taking back card");
    card = game.takeBackCard(name);
    if (card !== false) {
      socket.emit('you took back card',{player:name,card:card})
      game.broadcast('player took back card',{player:name,card:card})
      game.broadcastStates();
    } else {
      // TODO: Error Condition
    }
  })
  socket.on('give back card', function(msg){
    console.log("Player being given back card");
    card = game.takeBackCard(msg.player);
    if (card !== false) {
      socket.emit('you were given back card',{player:msg.player,card:card})
      game.broadcast('player was given back card',{player:msg.player,card:card})
      game.broadcastStates();
    } else {
      // TODO: Error Condition
    }
  })
}

function queryName(name) {
  for (usedName in game.players) {
    if (usedName == name) {
      if (game.players[name].connected == true) return "active";
      else return "disconnected";
    }
  }
  return "unused";
}

http.listen(3000, function(){
  console.log('listening on *:3000');
});


var cardList = []
for (var number of ["A","2","3","4","5","6","7","8","9","X","J","Q","K"]) {
  for (var suit of ["H","C","D","S"]) {
    cardList.push(number+suit);
  }
}
const emptyGame = {
  players: {},
  discard: [],
  deck: [],
  parameters: {
    maxSize: 8,
    numDecks: 2
  },
  addPlayer: function(name) {
    this.players[name] = {
      name: name,
      hand: [],
      connected: false,
    };
    for (var i=0; i < this.parameters.numStartingCards; i++) {
      this.drawCard(name);
    }
  },
  drawCard: function(playerName) {
    var card
    if (this.parameters.numDecks == 0) {
      card = cardList[Math.floor(Math.random()*cardList.length)]
    } else {
      if (this.deck.length == 0) {
        if (this.discard.length >= 20) {
          this.deck = this.discard.splice(0,this.discard.length-10);
        } else if (this.discard.length >= 10) {
          this.deck = this.discard.splice(0,this.discard.length-5);
        } else if (this.discard.length >= 5) {
          this.deck = this.discard.splice(0,this.discard.length-1);
        } else {
          this.deck = [...cardList];
          this.parameters.numDecks = this.parameters.numDecks + 1;
          this.broadcast('extra deck added');
        }
        this.broadcast('discard shuffled into deck');
        this.shuffleDeck();
        this.broadcastStates();
      }
      card = this.deck.pop();
    }
    console.log(playerName+" drew "+card);
    this.players[playerName].hand.push(card);
    return card
  },
  takeBackCard: function(playerName) {
    if (this.discard.length == 0) {
      return false;
    }
    card = this.discard.pop();
    this.players[playerName].hand.push(card);
    return card;
  },
  playCard: function(playerName,card) {
    if (this.players[playerName].hand.indexOf(card) != -1) {
      console.log(playerName+" played "+card);
      var index = this.players[playerName].hand.indexOf(card);
      this.players[playerName].hand.splice(index,1)
      this.discard.push(card);
      return true
    } else {
      return false
    }
  },
  shuffleDeck: function() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  },
  broadcast: function(message,...args) {
    io.emit(message,...args)
  },
  broadcastStates: function() {
    var state = {
      players: {},
      deckSize: this.deck.length,
      discard: this.discard,
    }
    for (var otherPlayerName in this.players) {
      state.players[otherPlayerName] = {
        name: otherPlayerName,
        connected: this.players[otherPlayerName].connected,
        handSize: this.players[otherPlayerName].hand.length,
      }
    }
    for (var playerName in this.players) {
      if (this.players[playerName].connected) {
        state.hand = this.players[playerName].hand;
        state.player = playerName;
        state.createdOn = Date.now();
        this.players[playerName].socket.emit('game state update',state);
      }
    }
    console.log("Update sent");
  }
}
emptyGame.giveBackCard = emptyGame.takeBackCard

function newGame(numDecks,maxSize,numStartingCards,players) {
  game = Object.create(emptyGame)
  game.parameters.maxSize = (maxSize === undefined) ? 8 : maxSize,
  game.parameters.numDecks = (numDecks === undefined) ? 2 : numDecks
  game.parameters.numStartingCards = (numStartingCards === undefined) ? 5 : numStartingCards

  if (players !== undefined) {
    for (var p of players) {
      game.addPlayer(p);
    }
  }
  if (game.parameters.numDecks != 0) {
    game.deck = repeatArray(cardList,game.parameters.numDecks)
    game.shuffleDeck()
  }
  return game;
}
// Helper functions
function repeatArray(arr, count) {
  var ln = arr.length;
  var b = new Array(ln*count);
  for(var i=0; i<ln*count; i++) {
    b[i] = (arr[i%ln]);
  }
  return b;
}

// interesting
var game = newGame(5/13)
