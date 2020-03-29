// Globals

var game = {}

$(document).ready(function () {

  var admin = new URLSearchParams(window.location.search).has('admin');
  if (admin) {
    console.log("Showing admin buttons");
    $("#new-game-button-container").removeClass("hidden");
    $("#new-game-submit-button").click(newGame);
    function newGame() {
      var numDecks = parseInt($("#num-decks-field").val());
      socket.emit("start new game",{numDecks:numDecks})
    }
    $(".card-button").removeClass("hidden");
    $("#players-sidebar").addClass("admin-padding")
  }

  var socket = io();

  socket.on('disconnect', function(){
    $("#shade").removeClass("hidden");
    $("#disconnected-alert").removeClass("hidden")
  })

  socket.on('connect', function(){
    $("#disconnected-alert").addClass("hidden");
    if (game && game.playerName) {
      socket.emit("rejoin as existing player",game.playerName)
    }
  })
  $("#disconnected-alert").click(reconnect)
  function reconnect() {
    /*console.log("reconnecting");
    $("#shade").addClass("hidden")
    $("#disconnected-alert").addClass("hidden")
    socket = io()
    socket.emit("name query", {playerName:game.playerName});*/
  }

  function submitName() {
    var name = $("#name-field").val();
    if (name.length < 2) {
      $("#name-error-alert").removeClass("hidden").text("This name is too short. Please try another");
    } else if (name.length > 32) {
      $("#name-error-alert").removeClass("hidden").text("This name is too long. Please try another");
    } else {
      socket.emit("name query", {playerName:name});
    }
  }
  $("#name-join-button").click(submitName)

  socket.on('name query response', function(msg){
    if (msg.status=="active") {
      $("#name-error-alert").removeClass("hidden").text("This name is already in use. Please try another");
    } else if (msg.status=="disconnected") {
      logEvent("Rejoining game as player "+msg.playerName);
      socket.emit("rejoin as existing player",msg.playerName)
      hideNamePrompt();
    } else if (msg.status=="unused") {
      logEvent("Joining game as new player "+msg.playerName);
      socket.emit("join as new player",msg.playerName)
      hideNamePrompt();
    } else {
      console.log("ERROR");
    }
  });
  function hideNamePrompt(){
    $("#shade").addClass("hidden");
    $("#name-dialog").addClass("hidden");
  }

  socket.on('game state update', onStateUpdate);

  function onStateUpdate(state) {
    //console.log("update recieved");
    //console.log(state);
    game = state

    // Players list consistency Check

    var count = $("#players-list li").length;
    var playersOK = (count == Object.keys(state.players).length);
    for (var i = 0; i < count; i++) {
      var card = $(`#players-list li:nth-child(${i+1})`);
      var playerName = card.children("span.player-name").text();
      var connected = card.hasClass("connected");
      var handSize = parseInt(card.children("span.player-hand-size").children("span.number").text());
      playersOK = playersOK && state.players[playerName].connected == connected && state.players[playerName].handSize == handSize;
    }
    if (!playersOK) {
      $("#players-list li").remove()
      for (p in state.players) {
        appendPlayer(state.players[p]);
      }
    }

    // Discard pile consistency Check

    var count = $("#discard-area div.card").length;
    var discardList
    if (state.discard.length > 10) {
      discardList = state.discard.slice(state.discard.length-10,state.discard.length);
    } else {
      discardList = [...state.discard];
    }
    var discardOK = (count == discardList.length);
    for (var i = 0; i < count; i++) {
      var card = $(`#discard-area div.card:nth-child(${i+1})`);
      var cardString = card.children("div.card-number:not(.flipped)").text().replace("10","X")+card.children("div.card-suit:not(.flipped)").text().replace("♠","S").replace("♣","C").replace("♦","D").replace("♥","H");
      discardOK = discardOK && cardString == discardList[i];
    }
    if (!discardOK) {
      $("#discard-area div.card").remove()
      for (c of state.discard) {
        appendCardToDiscard(c);
      }
    }

    // Hand consistency Check

    var count = $("#hand-area div.card").length;
    var handOK = (count == state.hand.length);
    var handElementStringList = Array(count);
    var handCanonicalStringList = [...state.hand]
    for (var i = 0; i < count; i++) {
      var card = $(`#hand-area div.card:nth-child(${i+1})`);
      var cardString = card.children("div.card-number:not(.flipped)").text().replace("10","X")+card.children("div.card-suit:not(.flipped)").text().replace("♠","S").replace("♣","C").replace("♦","D").replace("♥","H");
      handElementStringList[i] = cardString;
    }
    handElementStringList.sort();
    handCanonicalStringList.sort();
    for (var i = 0; i < count; i++) {
      handOK = handOK && handElementStringList[i] == handCanonicalStringList[i];
    }

    if (!handOK) {
      $("#hand-area div.card").remove()
      for (c of state.hand) {
        appendCardToHand(c);
      }
    }

    // Write correct deck size (not worth checking, faster to just write and won't cause problems if it keeps getting rewritten)
    $("#deck-area .card .number-coin span.number").text(state.deckSize)

  }
  function appendPlayer(player) {
    $('#players-list')
      .append($('<li>')
      .addClass("list-group-item")
      .addClass("player-card")
      .addClass(player.playerName == game.playerName ? "this-player" : "other-player")
      .addClass(player.connected ? "connected" : "disconnected")
      .html(`<span class="player-name">${player.playerName}</span><span class="player-hand-size"><span class="number">${player.handSize}</span> cards</span>`)
    );
    if (admin) {
      var card = $('#players-list li:nth-last-child(1)')
      card
        .append($('<input type="button" value="K">').addClass("btn btn-sm btn-danger player-admin-button")
        .click(function(){kickPromptPlayer(player.playerName,card)}))
        .append($('<input type="button" value="D">').addClass("btn btn-sm btn-outline-warning player-admin-button")
        .click(function(){giveCardToPlayer(player.playerName)}))
        .append($('<input type="button" value="R">').addClass("btn btn-sm btn-outline-danger player-admin-button")
        .click(function(){giveCardBackToPlayer(player.playerName)})
      );
    }
  }
  function kickPromptPlayer(playerName,cardElement) {
    if (cardElement.children(".kick-button").length == 1) {
      cardElement.children(".kick-button").remove();
    } else {
      cardElement.append($('<input type="button" value="Kick?">').addClass("btn btn-sm btn-danger player-admin-button kick-button")
      .click(function(){kickPlayer(playerName)}))
    }
  }
  function kickPlayer(playerName) {
    socket.emit("remove player",{targetName:playerName})
  };
  function giveCardToPlayer(playerName) {
    socket.emit("give card",{targetName:playerName})
  };
  function giveCardBackToPlayer(playerName) {
    socket.emit("give back card",{targetName:playerName})
  };
  function appendCardToDiscard(card) {
    var number = card.slice(0,1).replace("X","10");
    var suit = card.slice(1,2).replace("S","♠").replace("C","♣").replace("D","♦").replace("H","♥");
    $('#discard-area')
      .append($('<div>')
      .addClass("discard")
      .addClass("card")
      .addClass("face-up")
      .addClass(suit == "♥" || suit == "♦" ? "red" : "black")
      .click(takeBackCard)
      .html(`<div class="card-number">${number}</div><div class="card-suit">${suit}</div><div class="card-suit flipped">${suit}</div><div class="card-number flipped">${number}</div>`)
    );
      $('#discard-area div.card:nth-last-child(2) div.flipped').remove()
      $('#discard-area div.card:nth-last-child(2)').off("click")
      $('#discard-area div.card:nth-last-child(11)').remove()
  }
  function appendCardToHand(card) {
    var number = card.slice(0,1).replace("X","10");
    var suit = card.slice(1,2).replace("S","♠").replace("C","♣").replace("D","♦").replace("H","♥");
    $('#hand-area')
      .append($('<div>')
      .addClass("hand")
      .addClass("card")
      .addClass("face-up")
      .addClass(suit == "♥" || suit == "♦" ? "red" : "black")
      .html(`<div class="card-number">${number}</div><div class="card-suit">${suit}</div><div class="card-suit flipped">${suit}</div><div class="card-number flipped">${number}</div>`)
      .click(function(){playCard(card,this)})
    );
  }
  function logEvent(event) {
    $("#console-list")
      .append($('<li>')
      .addClass("log-entry")
      .text(event)
    );
    updateLogScroll();
  }
  function updateLogScroll(){
    var element = $("#console-area")[0];
    element.scrollTop = element.scrollHeight;
  }

  function playCard(value,element) {
    element.remove();
    appendCardToDiscard(value)
    changePlayerHandSize(game.playerName,-1)
    socket.emit("play card",{card:value});
  }
  $('#deck-area').click(drawCard)

  $('#left-button').click(function(e) {
    moveCardLeft()
    e.stopPropagation();
  });
  $('#shuffle-button').click(function(e) {
    shuffleDeck()
    e.stopPropagation();
  });
  $('#right-button').click(function(e) {
    moveCardRight()
    e.stopPropagation();
  });
  function moveCardLeft(){
    removeTopCard()
    socket.emit("move card from discard to deck")
  }
  function shuffleDeck(){
    socket.emit("shuffle deck")
  }
  function moveCardRight(){
    socket.emit("move card from deck to discard")
  }
  socket.on("deck shuffled", function(){
    logEvent("The deck was shuffled")
  });
  socket.on("card moved from deck to discard", function(msg){
    appendCardToDiscard(msg.card);
    logEvent(formatCard(msg.card)+" was moved from the deck to the discard pile")
  });
  socket.on("card moved from discard to deck", function(msg){
    logEvent(formatCard(msg.card)+" was returned from the discard pile to the deck")
  });
  socket.on("discard shuffled into deck", function(){
    logEvent("The discard pile was shuffled back into the deck")
  });
  socket.on("deck added", function(){
    logEvent("An extra deck was added")
  });
  socket.on("you played card",youPlayedCard)
  function youPlayedCard(msg) {
    logEvent("You played "+formatCard(msg.card))
  }
  function drawCard() {
    socket.emit("draw card");
  }
  socket.on("you were given card",youWereGivenCard);
  function youWereGivenCard(msg) {
    logEvent("You were given a card")
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.playerName,+1)
  }
  socket.on("you drew card",youDrewCard);
  function youDrewCard(msg) {
    logEvent("You drew a card")
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.playerName,+1)
  }
  socket.on("you were given back card",youWereGivenBackCard);
  function youWereGivenBackCard(msg) {
    logEvent("You were given back the card "+formatCard(msg.card))
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.playerName,+1)
    removeTopCard();
  }
  socket.on("you took back card",youTookBackCard);
  function youTookBackCard(msg) {
    logEvent("You took back the card "+formatCard(msg.card))
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.playerName,+1)
    removeTopCard();
  }
  socket.on("player was given card",playerWasGivenCard);
  function playerWasGivenCard(msg) {
    logEvent(msg.playerName+" was given a card")
    changePlayerHandSize(msg.playerName,+1)
  }
  socket.on("player drew card",playerDrewCard);
  function playerDrewCard(msg) {
    logEvent(msg.playerName+" drew a card")
    changePlayerHandSize(msg.playerName,+1)
  }
  socket.on("player was given back card",playerWasGivenBackCard);
  function playerWasGivenBackCard(msg) {
    logEvent(msg.playerName+" was given back the card "+formatCard(msg.card))
    changePlayerHandSize(msg.playerName,+1)
    removeTopCard();
  }
  socket.on("player took back card",playerTookBackCard);
  function playerTookBackCard(msg) {
    logEvent(msg.playerName+" took back "+formatCard(msg.card))
    changePlayerHandSize(msg.playerName,+1)
    removeTopCard();
  }
  socket.on("player played card",playerPlayedCard)
  function playerPlayedCard(msg) {
    appendCardToDiscard(msg.card)
    changePlayerHandSize(msg.playerName,-1)
    logEvent(msg.playerName+" played "+formatCard(msg.card))
  }
  socket.on("player removed",removePlayer)
  function removePlayer(msg) {
    logEvent(msg.playerName+" was removed from the game")
    var count = $("#players-list li").length;
    for (var i = 0; i < count; i++) {
      var card = $(`#players-list li:nth-child(${i+1})`);
      var playerName = card.children("span.player-name").text();
      if (playerName == msg.playerName) {
        card.remove();
        return;
      }
    }
  }
  socket.on("player joined",playerJoined)
  function playerJoined(msg) {
    $("#shade").addClass("hidden");
    logEvent(msg.playerName+" joined the game")
  }
  socket.on("player disconnected",playerDisconnected)
  function playerDisconnected(msg) {
    logEvent(msg.playerName+" lost connection")
  }
  socket.on("player reconnected",playerReconnected)
  function playerReconnected(msg) {
    $("#shade").addClass("hidden");
    logEvent(msg.playerName+" reconnected")
  }
  socket.on("game ended", gameEnded)
  function gameEnded() {
    $("#disconnected-alert").text("The game  has ended. Please refresh the page to join a new game").removeClass("hidden")
    $("#shade").removeClass("hidden")
  }
  function removeTopCard() {
    $('#discard-area div.card:nth-last-child(1)').remove()
    $('#discard-area div.card:nth-last-child(1)').click(takeBackCard)
  }
  function takeBackCard() {
    socket.emit("take back card");
  }
  function changePlayerHandSize(playerName,increment) {
    var count = $("#players-list li").length;
    for (var i = 0; i < count; i++) {
      var card = $(`#players-list li:nth-child(${i+1})`);
      var elementPlayerName = card.children("span.player-name").text();
      if (elementPlayerName == playerName) {
        var handSize = parseInt(card.children("span.player-hand-size").children("span.number").text());
        card.children("span.player-hand-size").children("span.number").text(handSize + increment)
      }
    }
  }

  function formatCard(cardString) {
    return cardString.slice(0,1).replace("X","10") + cardString.slice(1,2).replace("S","♠").replace("C","♣").replace("D","♦").replace("H","♥");
  }

  /*appendPlayer({playerName:"Sam", handSize:3, connected: true})
  appendPlayer({playerName:"Kate", handSize:17, connected: false})
  handList = ["3H","AH","XC"]
  for (i of handList) { appendCardToHand(i)};
  discardList = ["6S","JC","9D","QC","2D","5S","4H","7C","8S","KD"]
  for (i of discardList) { appendCardToDiscard(i)}
  onStateUpdate({hand:handList,discard:discardList,deckSize:144,players:{Sam:{playerName:"Sam", handSize:3, connected: true}, Kate:{playerName:"Kate", handSize:17, connected: false}}})*/

});
