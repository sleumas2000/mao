// Globals

var game = {}

$(document).ready(function () {
  var socket = io();

  socket.on('disconnect', function(){
    $("#disconnected-alert").removeClass("hidden")
  })

  socket.on('connect', function(){
    $("#disconnected-alert").addClass("hidden");
    if (game && game.player) {
      socket.emit("rejoin as existing player",game.player)
    }
  })
  $("#disconnected-alert").click(reconnect)
  function reconnect() {
    console.log("reconnecting");
    $("#disconnected-alert").addClass("hidden")
    socket.emit("name query", {name:game.player});
  }

  function submitName() {
    var name = $("#name-field").val();
    socket.emit("name query", {name:name});
  }
  $("#name-join-button").click(submitName)

  socket.on('name query response', function(msg){
    if (msg.status=="active") {
      $("#name-error-alert").removeClass("hidden").text("This name is already in use. Please try another");
    } else if (msg.status=="disconnected") {
      logEvent("Rejoining game as player "+msg.name);
      socket.emit("rejoin as existing player",msg.name)
      hideNamePrompt();
    } else if (msg.status=="unused") {
      logEvent("Joining game as new player "+msg.name);
      socket.emit("join as new player",msg.name)
      hideNamePrompt();
    } else {
      console.log("ERROR");
    }
  });
  function hideNamePrompt(){
    $("#shade").addClass("hidden");
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
      var name = card.children("span.player-name").text();
      var connected = card.hasClass("connected");
      var handSize = parseInt(card.children("span.player-hand-size").children("span.number").text());
      playersOK = playersOK && state.players[name].connected == connected && state.players[name].handSize == handSize;
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
      .addClass(player.connected ? "connected" : "disconnected")
      .html(`<span class="player-name">${player.name}</span><span class="player-hand-size"><span class="number">${player.handSize}</span> cards</span>`)
    );
  }
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
  }
  function playCard(value,element) {
    element.remove();
    appendCardToDiscard(value)
    changePlayerHandSize(game.player,-1)
    socket.emit("play card",{card:value});
  }
  $('#deck-area').click(drawCard)
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
    changePlayerHandSize(msg.player,+1)
  }
  socket.on("you drew card",youDrewCard);
  function youDrewCard(msg) {
    logEvent("You drew a card")
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.player,+1)
  }
  socket.on("you were given back card",youWereGivenBackCard);
  function youWereGivenBackCard(msg) {
    logEvent("You were given back the card "+formatCard(msg.card))
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.player,+1)
    removeTopCard();
  }
  socket.on("you took back card",youTookBackCard);
  function youTookBackCard(msg) {
    logEvent("You took back the card "+formatCard(msg.card))
    appendCardToHand(msg.card)
    changePlayerHandSize(msg.player,+1)
    removeTopCard();
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
      var name = card.children("span.player-name").text();
      if (name == playerName) {
        var handSize = parseInt(card.children("span.player-hand-size").children("span.number").text());
        card.children("span.player-hand-size").children("span.number").text(handSize + increment)
      }
    }
  }

  function formatCard(cardString) {
    return cardString.slice(0,1).replace("X","10") + cardString.slice(1,2).replace("S","♠").replace("C","♣").replace("D","♦").replace("H","♥");
  }

  /*appendPlayer({name:"Sam", handSize:3, connected: true})
  appendPlayer({name:"Kate", handSize:17, connected: false})
  handList = ["3H","AH","XC"]
  for (i of handList) { appendCardToHand(i)};
  discardList = ["6S","JC","9D","QC","2D","5S","4H","7C","8S","KD"]
  for (i of discardList) { appendCardToDiscard(i)}
  onStateUpdate({hand:handList,discard:discardList,deckSize:144,players:{Sam:{name:"Sam", handSize:3, connected: true}, Kate:{name:"Kate", handSize:17, connected: false}}})*/

});
