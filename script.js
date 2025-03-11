document.addEventListener('DOMContentLoaded', function() {
  // Global variables
  let nflToCollege = {};       // Loaded from players.csv.
  let collegeAliases = {};     // Loaded from college_aliases.csv.
  let dialogueBuckets = {};    // Loaded from dialogue.json.
  let phase = "trivia";
  let currentNFLPlayer = "";
  let score = 0;
  let gameActive = true;
  let correctStreak = 0;
  let recentSchools = [];      // Array to store normalized college names from the last 7 rounds.

  const chatContainer = document.getElementById('chat-container');
  const inputForm = document.getElementById('input-form');
  const userInput = document.getElementById('user-input');
  const scoreDisplay = document.getElementById('score');
  const gameOverOverlay = document.getElementById('game-over');
  const gameOverMsg = document.getElementById('game-over-msg');
  const restartButton = document.getElementById('restart');
  
  const binaryChoices = document.getElementById('binary-choices');
  
  // Get binary choice elements and check if they exist.
  const choiceTough = document.getElementById('choice-tough');
  const choiceDefense = document.getElementById('choice-defense');
  if (!choiceTough || !choiceDefense) {
    console.error("Binary choice elements not found. Check your HTML for 'choice-tough' and 'choice-defense'.");
  }
  
  // Load external dialogue JSON.
  fetch('dialogue.json')
    .then(response => response.json())
    .then(data => {
      dialogueBuckets = data;
      console.log("Dialogue loaded:", dialogueBuckets);
      checkAndStartGame();
    })
    .catch(error => console.error("Error loading dialogue:", error));
  
  // Load college aliases CSV.
  fetch('college_aliases.csv')
    .then(response => response.text())
    .then(text => {
      collegeAliases = parseCSVtoObject(text);
      console.log("College aliases loaded:", collegeAliases);
    })
    .catch(error => console.error("Error loading college aliases:", error));
  
  // Load players CSV.
  fetch('players.csv')
    .then(response => response.text())
    .then(text => {
      nflToCollege = parsePlayersCSV(text);
      console.log("Players loaded:", nflToCollege);
      checkAndStartGame();
    })
    .catch(error => console.error("Error loading players CSV:", error));
  
  // When both dialogue and players are loaded, start the game.
  function checkAndStartGame() {
    if (Object.keys(dialogueBuckets).length > 0 && Object.keys(nflToCollege).length > 0) {
      startIntro();
    }
  }
  
  // CSV parser for college aliases (handles multiple alias columns)
  function parseCSVtoObject(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const result = {};
    // Assume first row is headers.
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 1) continue;
      const college = parts[0].trim().toLowerCase();
      const aliases = [];
      for (let j = 1; j < parts.length; j++) {
        const alias = parts[j].trim();
        if (alias) {
          aliases.push(alias.toLowerCase());
        }
      }
      result[college] = aliases;
    }
    return result;
  }
  
  // CSV parser for players.
  function parsePlayersCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const result = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 7) continue;
      const roundNum = parseInt(parts[0].trim());
      const name = parts[3].trim();
      const position = parts[4].trim();
      const college = parts[5].trim();
      const value = parts[6].trim() === "" ? 0 : parseFloat(parts[6].trim());
      if (!isNaN(roundNum) && name && college && position) {
        result[name] = { college: college, round: roundNum, position: position, value: value };
      }
    }
    return result;
  }
  
  // Append a message to the chat container.
  function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.textContent = text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  
  // Update score display.
  function updateScore() {
    scoreDisplay.textContent = `Score: ${score}`;
  }
  
  // Returns a random brief response (20% chance from big compliments).
  function getBriefResponse() {
    if (dialogueBuckets.big_compliments && dialogueBuckets.big_compliments.length > 0 && Math.random() < 0.2) {
      return dialogueBuckets.big_compliments[Math.floor(Math.random() * dialogueBuckets.big_compliments.length)];
    } else if (dialogueBuckets.confirmations && dialogueBuckets.confirmations.length > 0) {
      return dialogueBuckets.confirmations[Math.floor(Math.random() * dialogueBuckets.confirmations.length)];
    }
    return "nice";
  }
  
  // Returns a random question template.
  function getQuestionTemplate() {
    if (dialogueBuckets.questions && dialogueBuckets.questions.length > 0) {
      return dialogueBuckets.questions[Math.floor(Math.random() * dialogueBuckets.questions.length)];
    }
    return "How about XXXXX";
  }
  
  // Normalize a college string.
  function normalizeCollegeString(str) {
    let s = str.replace(/[^\w\s]/gi, "").toLowerCase().trim();
    if (s.startsWith("university of ")) {
      s = s.slice("university of ".length).trim();
    } else if (s.startsWith("college of ")) {
      s = s.slice("college of ".length).trim();
    }
    let tokens = s.split(/\s+/);
    if (tokens.length > 1) {
      let last = tokens[tokens.length - 1];
      if (last === "st" || last === "st.") {
        tokens[tokens.length - 1] = "state";
        s = tokens.join(" ");
      }
    }
    if (s.endsWith(" university")) {
      let tmp = s.slice(0, s.lastIndexOf(" university")).trim();
      if (tmp.split(/\s+/).length >= 2) {
        s = tmp;
      }
    }
    return s;
  }
  
  // Check if the college answer is correct.
  function isCollegeAnswerCorrect(answer, correctCollege) {
    const normAnswer = normalizeCollegeString(answer);
    const normCorrect = normalizeCollegeString(correctCollege);
    if (normAnswer === normCorrect) return true;
    if (collegeAliases[normCorrect] && collegeAliases[normCorrect].includes(normAnswer)) return true;
    return false;
  }
  
  // Typing indicator.
  function showTypingIndicator(callback) {
    const indicator = document.createElement('div');
    indicator.classList.add('message', 'ai', 'typing-indicator');
    indicator.textContent = "...";
    chatContainer.appendChild(indicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    setTimeout(() => {
      chatContainer.removeChild(indicator);
      callback();
    }, 1500);
  }
  
  // Wrap AI message with typing indicator.
  function addAIMessage(text) {
    showTypingIndicator(() => {
      addMessage(text, "ai");
    });
  }
  
  // Game over.
  function gameOver(message) {
    gameActive = false;
    addMessage(message, "ai");
    gameOverMsg.textContent = message;
    gameOverOverlay.style.display = "flex";
    inputForm.style.display = "none";
  }
  
  // Restart game.
  function restartGame() {
    console.log("Restarting game.");
    phase = "trivia";
    currentNFLPlayer = "";
    score = 0;
    gameActive = true;
    correctStreak = 0;
    recentSchools = [];
    updateScore();
    chatContainer.innerHTML = "";
    userInput.value = "";
    inputForm.style.display = "block";
    gameOverOverlay.style.display = "none";
    if (dialogueBuckets.restart && dialogueBuckets.restart.length > 0) {
      addAIMessage(dialogueBuckets.restart[0]);
      setTimeout(startTriviaRound, 2500);
    } else {
      startTriviaRound();
    }
  }
  
  // Intro dialogue.
  function startIntro() {
    addAIMessage(dialogueBuckets.greetings ? dialogueBuckets.greetings[0] : "Hey, let's kick it off. You know the drill 🤝");
    setTimeout(() => {
      addAIMessage(dialogueBuckets.greetings && dialogueBuckets.greetings[1] ? dialogueBuckets.greetings[1] : "No googling, just pure football wisdom.");
    }, 1500);
    setTimeout(startTriviaRound, 3000);
  }
  
  // Ask next question.
  function askNextQuestion() {
    addAIMessage(dialogueBuckets.transitions ? dialogueBuckets.transitions[0] : "What's next?");
    setTimeout(() => {
      if (correctStreak >= 4 && Math.random() < 0.5) {
        correctStreak = 0;
        showBinaryChoices();
      } else {
        startTriviaRound();
      }
    }, 1500);
  }
  
  // Show binary choices.
  function showBinaryChoices() {
    inputForm.style.display = "none";
    binaryChoices.style.display = "block";
  }
  
  // Hide binary choices.
  function hideBinaryChoices() {
    binaryChoices.style.display = "none";
    inputForm.style.display = "block";
  }
  
  // Start a normal trivia round.
  function startTriviaRound() {
    if (Object.keys(nflToCollege).length === 0) {
      gameOver("No players data loaded.");
      return;
    }
    let eligiblePlayers = Object.keys(nflToCollege).filter(player => {
      const info = nflToCollege[player];
      return info.round <= 3 &&
             ["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
             info.value >= 20;
    });
    // Filter out players from recentSchools.
    const filteredPlayers = eligiblePlayers.filter(player => {
      const collegeNorm = normalizeCollegeString(nflToCollege[player].college);
      return !recentSchools.includes(collegeNorm);
    });
    // If none remain after filtering, fall back to all eligible players.
    if (filteredPlayers.length > 0) {
      eligiblePlayers = filteredPlayers;
    }
    if (eligiblePlayers.length === 0) {
      gameOver("No eligible players available for this round. Game Over!");
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    // Add the chosen player's college to recentSchools.
    const chosenCollege = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(chosenCollege);
    if (recentSchools.length > 7) {
      recentSchools.shift();
    }
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    userInput.value = "";
    inputForm.style.display = "block";
  }
  
  // Start a trivia round filtered by binary choice.
  function startTriviaRoundFiltered(choice) {
    let eligiblePlayers = Object.keys(nflToCollege).filter(player => {
      const info = nflToCollege[player];
      return info.round <= 3;
    });
    if (choice === "tough") {
      eligiblePlayers = eligiblePlayers.filter(player => {
        const info = nflToCollege[player];
        return ["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
               info.value >= 11 && info.value < 25;
      });
    } else if (choice === "defense") {
      eligiblePlayers = eligiblePlayers.filter(player => {
        const info = nflToCollege[player];
        return !["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
               info.value >= 30;
      });
    }
    if (eligiblePlayers.length === 0) {
      addAIMessage("Can't think of anyone, let's just keep going.");
      setTimeout(startTriviaRound, 1500);
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    // Update recentSchools with the chosen player's college.
    const chosenCollege = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(chosenCollege);
    if (recentSchools.length > 7) {
      recentSchools.shift();
    }
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    hideBinaryChoices();
  }
  
  // Handle the college guess.
  function handleCollegeGuess(answer) {
    console.log("Handling answer:", answer);
    const correctCollege = nflToCollege[currentNFLPlayer].college;
    if (isCollegeAnswerCorrect(answer, correctCollege)) {
      addAIMessage(getBriefResponse());
      score++;
      updateScore();
      correctStreak++;
      if (correctStreak >= 4 && Math.random() < 0.5) {
        correctStreak = 0;
        setTimeout(askNextQuestion, 1500);
      } else {
        setTimeout(startTriviaRound, 1500);
      }
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${correctCollege}. Better luck next time!`);
    }
  }
  
  // Listen for form submissions.
  inputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!gameActive) return;
    const answer = userInput.value.trim();
    console.log("Form submitted, answer:", answer);
    if (answer === "") return;
    addMessage(answer, "user");
    userInput.value = "";
    handleCollegeGuess(answer);
  });
  
  // Binary choice event listeners.
  if (choiceTough) {
    choiceTough.addEventListener('click', function() {
      addMessage("Hit me with a tough one", "user");
      hideBinaryChoices();
      correctStreak = 0;
      startTriviaRoundFiltered("tough");
    });
  }
  if (choiceDefense) {
    choiceDefense.addEventListener('click', function() {
      addMessage("Go defense", "user");
      hideBinaryChoices();
      correctStreak = 0;
      startTriviaRoundFiltered("defense");
    });
  }
  
  // Restart button listener.
  restartButton.addEventListener('click', function() {
    console.log("Restart button clicked.");
    restartGame();
  });
});
