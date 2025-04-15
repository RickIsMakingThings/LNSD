document.addEventListener('DOMContentLoaded', function() {
  // Global state
  let nflToCollege = {};       // Loaded from players.csv.
  let collegeAliases = {};     // Loaded from college_aliases.csv.
  let dialogueBuckets = {};    // Loaded from dialogue.json.

  // Game state variables
  let gameStarted = false;     // Controls auto-start
  // Phases: "easy", "trivia" (normal), "binary"
  let phase = "easy";
  let currentNFLPlayer = "";
  let score = 0;
  let gameActive = true;
  let correctStreak = 0;
  let easyRounds = 0;          // Target: 3 easy rounds
  let recentSchools = [];      // Tracks normalized college names from the last 7 rounds

  // Binary mode controls
  let binaryModeActive = false;
  let binaryRoundCount = 0;    // Forced to 3 rounds when binary mode triggers
  let choicePending = "";      // "tough" or "defense"

  // Timer variables
  let timerInterval;

  // --- NEW: Player Exclusion List ---
  // List of player names (normalized to lower case) that should be excluded.
  const playerExclusionList = ["russell wilson"];

  // DOM elements
  const chatContainer = document.getElementById('chat-container');
  const inputForm = document.getElementById('input-form');
  const userInput = document.getElementById('user-input');
  const scoreDisplay = document.getElementById('score');
  const gameOverOverlay = document.getElementById('game-over');
  const gameOverMsg = document.getElementById('game-over-msg');
  const restartButton = document.getElementById('restart');
  const binaryChoices = document.getElementById('binary-choices');
  const choiceTough = document.getElementById('choice-tough');
  const choiceDefense = document.getElementById('choice-defense');
  const timerBar = document.getElementById('timer-bar'); // Must exist in HTML

  // --- Data Loading ---
  fetch('dialogue.json')
    .then(response => response.json())
    .then(data => {
      dialogueBuckets = data;
      console.log("Dialogue loaded.");
      checkAndStartGame();
    })
    .catch(error => console.error("Error loading dialogue:", error));

  fetch('college_aliases.csv')
    .then(response => response.text())
    .then(text => {
      collegeAliases = parseCSVtoObject(text);
      console.log("College aliases loaded.");
    })
    .catch(error => console.error("Error loading college aliases:", error));

  fetch('players.csv')
    .then(response => response.text())
    .then(text => {
      nflToCollege = parsePlayersCSV(text);
      console.log("Players loaded.");
      checkAndStartGame();
    })
    .catch(error => console.error("Error loading players CSV:", error));

  // Start the game once both dialogue and players data are loaded.
  function checkAndStartGame() {
    if (!gameStarted && Object.keys(nflToCollege).length > 0) {
      gameStarted = true;
      startIntro();
    }
  }

  // --- CSV Parsing Functions ---
  // Parses college_aliases.csv; expects header row then rows: college, alias1, alias2, etc.
  function parseCSVtoObject(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const result = {};
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

  // Parses players.csv; expects header row then fields: round, pick, NFL team, name, position, college, value
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
        result[name] = { college, round: roundNum, position, value };
      }
    }
    return result;
  }

  // --- Timer Functions ---
  function startTimer() {
    clearTimer();
    let timeLeft = 7; // seconds
    if (timerBar) {
      timerBar.style.width = "100%";
    }
    timerInterval = setInterval(() => {
      timeLeft -= 0.1;
      if (timerBar) {
        const percent = (timeLeft / 7) * 100;
        timerBar.style.width = `${percent}%`;
      }
      if (timeLeft <= 0) {
        clearTimer();
        gameOver("Time's up! Game Over!");
      }
    }, 100);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (timerBar) {
      timerBar.style.width = "0%";
    }
  }

  // --- UI Utility Functions ---
  function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', sender);
    msgDiv.textContent = text;
    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function updateScore() {
    scoreDisplay.textContent = `Score: ${score}`;
  }

  // --- Dialogue Utility Functions ---
  function getBriefResponse() {
    // Always use responses from the dialogue bucket.
    if (dialogueBuckets.big_compliments && dialogueBuckets.big_compliments.length > 0 && Math.random() < 0.2) {
      return dialogueBuckets.big_compliments[Math.floor(Math.random() * dialogueBuckets.big_compliments.length)];
    } else if (dialogueBuckets.confirmations && dialogueBuckets.confirmations.length > 0) {
      return dialogueBuckets.confirmations[Math.floor(Math.random() * dialogueBuckets.confirmations.length)];
    }
    return "nice";
  }

  function getQuestionTemplate() {
    if (dialogueBuckets.questions && dialogueBuckets.questions.length > 0) {
      return dialogueBuckets.questions[Math.floor(Math.random() * dialogueBuckets.questions.length)];
    }
    return "How about XXXXX";
  }

  // --- String Normalization ---
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

  // --- Answer Checking ---
  function isCollegeAnswerCorrect(answer, correctCollege) {
    const normAnswer = normalizeCollegeString(answer);
    const normCorrect = normalizeCollegeString(correctCollege);
    if (normAnswer === normCorrect) return true;
    if (collegeAliases[normCorrect] && collegeAliases[normCorrect].includes(normAnswer)) return true;
    return false;
  }

  // --- Typing Indicator ---
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

  function addAIMessage(text) {
    clearTimer();
    showTypingIndicator(() => {
      addMessage(text, "ai");
      startTimer();
    });
  }

  // --- Game Over and Restart ---
  function gameOver(message) {
    gameActive = false;
    clearTimer();
    addMessage(message, "ai");
    gameOverMsg.textContent = message;
    gameOverOverlay.style.display = "flex";
    inputForm.style.display = "none";
  }

  function restartGame() {
    console.log("Restarting game.");
    gameActive = true;
    phase = "easy";
    easyRounds = 0;
    currentNFLPlayer = "";
    score = 0;
    correctStreak = 0;
    binaryModeActive = false;
    binaryRoundCount = 0;
    recentSchools = [];
    updateScore();
    chatContainer.innerHTML = "";
    userInput.value = "";
    inputForm.style.display = "block";
    gameOverOverlay.style.display = "none";
    startIntro();
  }

  // --- Game Phase Functions ---
  // Intro dialogue: start with greetings then announce easy round.
  function startIntro() {
    addAIMessage(dialogueBuckets.greetings ? dialogueBuckets.greetings[0] : "Hey, let's kick it off. You know the drill 🤝");
    setTimeout(() => {
      addAIMessage(dialogueBuckets.greetings && dialogueBuckets.greetings[1] ? dialogueBuckets.greetings[1] : "No googling, just pure football wisdom.");
    }, 1500);
    setTimeout(() => {
      addAIMessage("We can start with some easy ones.");
      phase = "easy";
      startEasyRound();
    }, 3000);
  }

  // Easy Rounds: Only QBs with value >= 50.
  function startEasyRound() {
    if (!gameActive) return;
    if (easyRounds >= 3) {
      // Transition: show easy-to-normal transition message.
      const transitionMsg = (dialogueBuckets.easyTransition && dialogueBuckets.easyTransition.length > 0)
                              ? dialogueBuckets.easyTransition[Math.floor(Math.random() * dialogueBuckets.easyTransition.length)]
                              : "Ok, now let's have some fun.";
      addAIMessage(transitionMsg);
      phase = "trivia";
      setTimeout(startTriviaRound, 1500);
      return;
    }
    phase = "easy";
    let eligiblePlayers = Object.keys(nflToCollege).filter(player => {
      const info = nflToCollege[player];
      return info.position.toUpperCase() === "QB" && info.value >= 50;
    });
    // Exclude players whose name is in the exclusion list.
    eligiblePlayers = eligiblePlayers.filter(player => {
      return !playerExclusionList.includes(player.toLowerCase());
    });
    // Exclude players from recent schools if possible.
    let filteredPlayers = eligiblePlayers.filter(player => {
      const collegeNorm = normalizeCollegeString(nflToCollege[player].college);
      return !recentSchools.includes(collegeNorm);
    });
    if (filteredPlayers.length > 0) {
      eligiblePlayers = filteredPlayers;
    }
    if (eligiblePlayers.length === 0) {
      gameOver("No eligible players for easy round. Game Over!");
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const chosenCollege = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(chosenCollege);
    if (recentSchools.length > 7) { recentSchools.shift(); }
    easyRounds++;
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    userInput.value = "";
    inputForm.style.display = "block";
  }

  // Normal Rounds: Criteria: round ≤ 3, [QB, RB, WR], value ≥ 10.
  function startTriviaRound() {
    phase = "trivia";
    let eligiblePlayers = Object.keys(nflToCollege).filter(player => {
      const info = nflToCollege[player];
      return info.round <= 3 &&
             ["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
             info.value >= 10;
    });
    eligiblePlayers = eligiblePlayers.filter(player => {
      const collegeNorm = normalizeCollegeString(nflToCollege[player].college);
      return !recentSchools.includes(collegeNorm);
    });
    // Exclude players in the exclusion list.
    eligiblePlayers = eligiblePlayers.filter(player => {
      return !playerExclusionList.includes(player.toLowerCase());
    });
    if (eligiblePlayers.length === 0) {
      gameOver("No eligible players available for this round. Game Over!");
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const chosenCollege = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(chosenCollege);
    if (recentSchools.length > 7) { recentSchools.shift(); }
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    userInput.value = "";
    inputForm.style.display = "block";
  }

  // Binary Mode Rounds: Using binary filters based on the player's choice.
  function startTriviaRoundFiltered(choice) {
    phase = "binary";
    let eligiblePlayers = [];
    if (choice === "tough") {
      eligiblePlayers = Object.keys(nflToCollege).filter(player => {
        const info = nflToCollege[player];
        return info.round >= 2 && info.round <= 7 &&
               ["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
               info.value >= 5 && info.value <= 20;
      });
    } else if (choice === "defense") {
      eligiblePlayers = Object.keys(nflToCollege).filter(player => {
        const info = nflToCollege[player];
        return !["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
               info.value >= 49;
      });
    }
    eligiblePlayers = eligiblePlayers.filter(player => {
      const collegeNorm = normalizeCollegeString(nflToCollege[player].college);
      return !recentSchools.includes(collegeNorm);
    });
    // Exclude players in the exclusion list.
    eligiblePlayers = eligiblePlayers.filter(player => {
      return !playerExclusionList.includes(player.toLowerCase());
    });
    if (eligiblePlayers.length === 0) {
      addAIMessage("Can't think of anyone, let's just keep going.");
      setTimeout(startTriviaRound, 1500);
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const chosenCollege = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(chosenCollege);
    if (recentSchools.length > 7) { recentSchools.shift(); }
    binaryRoundCount--;
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    hideBinaryChoices();
  }

  // Ask next question in normal mode and trigger binary if needed.
  function askNextQuestion() {
    addAIMessage(dialogueBuckets.transitions ? dialogueBuckets.transitions[0] : "What's next?");
    setTimeout(() => {
      if (correctStreak >= 4) {
        binaryModeActive = true;
        binaryRoundCount = 3;
        correctStreak = 0;
        showBinaryChoices();
      } else {
        startTriviaRound();
      }
    }, 1500);
  }

  function showBinaryChoices() {
    inputForm.style.display = "none";
    binaryChoices.style.display = "block";
  }

  function hideBinaryChoices() {
    binaryChoices.style.display = "none";
    inputForm.style.display = "block";
  }

  // --- Answer Handling ---
  function handleCollegeGuess(answer) {
    console.log("Handling answer:", answer);
    clearTimer();
    const correctCollege = nflToCollege[currentNFLPlayer].college;
    if (isCollegeAnswerCorrect(answer, correctCollege)) {
      addAIMessage(getBriefResponse());
      score++;
      updateScore();
      correctStreak++;
      if (phase === "easy") {
        setTimeout(() => {
          if (easyRounds < 3) {
            startEasyRound();
          } else {
            // Transition to normal with a special phrase from the easyTransition bucket if available.
            const transitionMsg = (dialogueBuckets.easyTransition && dialogueBuckets.easyTransition.length > 0)
                                    ? dialogueBuckets.easyTransition[Math.floor(Math.random() * dialogueBuckets.easyTransition.length)]
                                    : "Ok, now let's have some fun.";
            addAIMessage(transitionMsg);
            phase = "trivia";
            setTimeout(startTriviaRound, 1500);
          }
        }, 1500);
      } else if (phase === "trivia") {
        if (correctStreak >= 4) {
          setTimeout(askNextQuestion, 1500);
        } else {
          setTimeout(startTriviaRound, 1500);
        }
      } else if (phase === "binary") {
        if (binaryModeActive && binaryRoundCount > 0) {
          setTimeout(() => { showBinaryChoices(); }, 1500);
        } else {
          binaryModeActive = false;
          setTimeout(startTriviaRound, 1500);
        }
      }
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${correctCollege}. Better luck next time!`);
    }
  }

  // --- Event Listeners ---
  inputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!gameActive) return;
    const answer = userInput.value.trim();
    if (!answer) return;
    clearTimer();
    addMessage(answer, "user");
    userInput.value = "";
    handleCollegeGuess(answer);
  });

  if (choiceTough) {
    choiceTough.addEventListener('click', function() {
      addMessage("Hit me with a tough one", "user");
      hideBinaryChoices();
      correctStreak = 0;
      choicePending = "tough";
      startTriviaRoundFiltered("tough");
    });
  }
  if (choiceDefense) {
    choiceDefense.addEventListener('click', function() {
      addMessage("Go defense", "user");
      hideBinaryChoices();
      correctStreak = 0;
      choicePending = "defense";
      startTriviaRoundFiltered("defense");
    });
  }

  restartButton.addEventListener('click', function() {
    console.log("Restart button clicked.");
    restartGame();
  });

  // --- Typing Indicator and AI Messaging ---
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

  function addAIMessage(text) {
    clearTimer();
    showTypingIndicator(() => {
      addMessage(text, "ai");
      startTimer();
    });
  }

  function gameOver(message) {
    gameActive = false;
    clearTimer();
    addMessage(message, "ai");
    gameOverMsg.textContent = message;
    gameOverOverlay.style.display = "flex";
    inputForm.style.display = "none";
  }
});
