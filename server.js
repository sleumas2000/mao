var server_port = process.env.OPENSHIFT_NODEJS_PORT || 8080
var server_ip_address = process.env.OPENSHIFT_NODEJS_IP || 'localhost'
var game_title = process.env.GAME_TITLE || 'Online Mao'
var password = process.env.PASSWORD || ""

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
  socket.emit('game title', {gameTitle:game_title})
  console.log('Socket connecting');
  socket.on('name query', function(msg){
    console.log('name query: '+msg.playerName);
    socket.emit('name query response', {playerName: msg.playerName, status: queryName(msg.playerName)});
  });
  socket.on('join as new player', function(playerName){
    if (queryName(playerName) !== "unused") {
      console.log("A socket attempted to create "+playerName+" as a new player, when that player already exists");
      return;
    }
    console.log('player joining: '+playerName);
    game.addPlayer(playerName);
    game.broadcast('player joined', {playerName: playerName});
    allocateSocket(socket,playerName);
  });
  socket.on('rejoin as existing player', function(playerName){
    if (queryName(playerName) !== "disconnected") {
      if (queryName(playerName) == "active") {
        console.log("A socket attempted to reconnect as "+playerName+", but that player is already connected");
      } else {
        console.log("A socket attempted to reconnect as "+playerName+", but that player does not exist");
      }
      return;
    }
    console.log('player rejoining: '+playerName);
    game.broadcast('player reconnected', {playerName: playerName});
    allocateSocket(socket,playerName);
  });
  socket.on('disconnect', function() {
    console.log("Unallocated socket disconnecting");
    console.log(unallocated_sockets.length+" unallocated socket(s) currently connected");
    unallocated_sockets.splice(unallocated_sockets.indexOf(this),1);
  });
});

function allocateSocket(socket,playerName) {
  unallocated_sockets.splice(unallocated_sockets.indexOf(socket),1);
  game.players[playerName].connected = true;
  game.players[playerName].socket = socket
  game.broadcastStates();
  socket.on('disconnect', function(){
    console.log('player lost connection: '+playerName);
    game.players[playerName].connected = false;
    game.broadcast('player disconnected', {playerName: playerName});
    game.broadcastStates();
  });
  socket.on('draw card', function(){
    var card = game.drawCard(playerName);
    socket.emit('you drew card',{playerName:playerName,card:card})
    socket.broadcast.emit('player drew card',{playerName:playerName})
    game.broadcastStates();
  })
  socket.on('give card', function(msg){
    if (msg.password != password) return;
    var card = game.drawCard(msg.targetName);
    var theirSocket = game.findSocketByPlayerName(msg.targetName)
    if (theirSocket) {
      theirSocket.emit('you were given card',{playerName:msg.targetName,card:card})
      theirSocket.broadcast.emit('player was given card',{playerName:msg.targetName})
    } else {
      game.broadcast('player was given card',{playerName:msg.targetName})
    }
    game.broadcastStates();
  })
  socket.on('play card', function(msg){
    success = game.playCard(playerName,msg.card);
    if (success) {
      socket.emit('you played card',{playerName:playerName,card:msg.card});
      socket.broadcast.emit('player played card',{playerName:playerName,card:msg.card});
      game.broadcastStates();
    } else {
      // TODO: Error Condition
    }
  });
  socket.on('take back card', function(){
    console.log("Player taking back card");
    card = game.takeBackCard(playerName);
    if (card !== false) {
      socket.emit('you took back card',{playerName:playerName,card:card})
      socket.broadcast.emit('player took back card',{playerName:playerName,card:card})
      game.broadcastStates();
    } else {
      // TODO: Error Condition
    }
  })
  socket.on('give back card', function(msg){
    if (msg.password != password) return;
    console.log("Player being given back card");
    card = game.takeBackCard(msg.targetName);
    var theirSocket = game.findSocketByPlayerName(msg.targetName)
    if (card !== false) {
      if (theirSocket) {
        theirSocket.emit('you were given back card',{playerName:msg.targetName,card:card})
        theirSocket.broadcast.emit('player was given back card',{playerName:msg.targetName,card:card})
      } else {
        game.broadcast('player was given back card',{playerName:msg.targetName,card:card})
      }
      game.broadcastStates();
    } else {
      // TODO: Error Condition
    }
  })
  socket.on('shuffle deck', function(msg){
    if (msg.password != password) return;
    game.shuffleDeck();
    console.log("Deck shuffled");
    game.broadcast("deck shuffled")
  })
  socket.on('chat message', function(msg){
    console.log("Chat message: "+msg.playerName+": "+msg.message);
    game.broadcast('chat message',msg)
  })
  socket.on('move card from deck to discard', function(msg){
    if (msg.password != password) return;
    if (game.deck.length > 0) {
      var card = game.deck.pop()
      game.discard.push(card)
      game.broadcast("card moved from deck to discard",{card:card})
      game.broadcastStates()
    }
  })
  socket.on('move card from discard to deck', function(msg){
    if (msg.password != password) return;
    if (game.discard.length > 0) {
      var card = game.discard.pop()
      game.deck.push(card)
      game.broadcast("card moved from discard to deck",{card:card})
      game.broadcastStates()
    }
  })
  socket.on('remove player', function(msg){
    if (msg.password != password) return;
    player = game.players[msg.targetName];
    if (player.connected) {
      player.socket.disconnect();
    }
    for (card of player.hand) {
      game.deck.push(card);
      game.shuffleDeck();
    }
    game.broadcast('player removed',{playerName:msg.targetName})
    delete game.players[msg.targetName];
    game.broadcastStates();
  });
  socket.on('start new game',function (msg){
    if (msg.password != password) return;
    game.broadcast('game ended')
    for (playerName in game.players) {
      game.players[playerName].socket.disconnect();
      delete game.players[playerName].socket; // IDK if this is necessary, but it's good to collect your garbage
      delete game.players[playerName];
      console.log("deleting "+playerName);
    }
    game = newGame(msg);
  })
}

function queryName(playerName) {
  for (usedName in game.players) {
    if (usedName == playerName) {
      if (game.players[playerName].connected == true) return "active";
      else return "disconnected";
    }
  }
  return "unused";
}

http.listen(server_port, function(){
  console.log('listening on '+server_ip_address+':'+server_port);
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
  addPlayer: function(playerName) {
    this.players[playerName] = {
      playerName: playerName,
      hand: [],
      connected: false,
    };
    for (var i=0; i < this.parameters.numStartingCards; i++) {
      this.drawCard(playerName);
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
          this.broadcast('discard shuffled into deck');
        } else if (this.discard.length >= 10) {
          this.deck = this.discard.splice(0,this.discard.length-5);
          this.broadcast('discard shuffled into deck');
        } else if (this.discard.length >= 5) {
          this.deck = this.discard.splice(0,this.discard.length-1);
          this.broadcast('discard shuffled into deck');
        } else {
          this.deck = [...cardList];
          this.parameters.numDecks = this.parameters.numDecks + 1;
          this.broadcast('deck added');
        }
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
        playerName: otherPlayerName,
        connected: this.players[otherPlayerName].connected,
        handSize: this.players[otherPlayerName].hand.length,
      }
    }
    for (var playerName in this.players) {
      if (this.players[playerName].connected) {
        state.hand = this.players[playerName].hand;
        state.playerName = playerName;
        state.createdOn = Date.now();
        this.players[playerName].socket.emit('game state update',state);
      }
    }
    console.log("Update sent");
  },
  findSocketByPlayerName: function(playerName) {
    if (this.players[playerName].connected) {
      return this.players[playerName].socket
    } else return false;
  }
}
//emptyGame.giveBackCard = emptyGame.takeBackCard

function newGame(params) {
  game = Object.create(emptyGame)
  if (params) {
    game.parameters.maxSize = (params.maxSize === undefined) ? 8 : params.maxSize,
    game.parameters.numDecks = (params.numDecks === undefined) ? 2 : params.numDecks
    game.parameters.numStartingCards = (params.numStartingCards === undefined) ? 5 : params.numStartingCards
  }

  if (params.players !== undefined) {
    for (var playerObject of params.players) {
      game.addPlayer(playerObject);
    }
  }
  if (game.parameters.numDecks != 0) {
    game.deck = repeatArray(cardList,game.parameters.numDecks)
    game.shuffleDeck()
  }
  game.discard = [...game.discard]
  game.players = {...game.players}
  game.parameters = {...game.parameters}
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

var game = newGame({numDecks:1})
