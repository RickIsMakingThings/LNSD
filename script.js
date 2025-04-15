document.addEventListener('DOMContentLoaded', function() {
  // Global variables
  let nflToCollege = {};       // Loaded from players.csv.
  let collegeAliases = {};     // Loaded from college_aliases.csv.
  let dialogueBuckets = {};    // Loaded from dialogue.json.
  
  // Phase can be "easy", "trivia" (normal), or "binary"
  let phase = "easy";          
  let currentNFLPlayer = "";
  let score = 0;
  let gameActive = true;
  let correctStreak = 0;
  let easyRounds = 0;          // Count of easy rounds played (target: 3)
  let recentSchools = [];      // Tracks normalized college names of the last 7 rounds

  // Binary mode control variables:
  let binaryModeActive = false;
  let binaryRoundCount = 0;    // Should be forced to 3 when binary mode starts
  let choicePending = "";      // Holds the current binary choice ("tough" or "defense")

  // Timer variables
  let timerInterval;

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
  const timerBar = document.getElementById('timer-bar'); // Ensure this exists in your HTML

  // --- Data Loading ---
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

  // Wait until both dialogue and players data are loaded, then start the game.
  function checkAndStartGame() {
    if (Object.keys(dialogueBuckets).length > 0 && Object.keys(nflToCollege).length > 0) {
      startIntro();
    }
  }

  // --- CSV Parsing Functions ---
  function parseCSVtoObject(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const result = {};
    // Assume first row is header.
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

  function parsePlayersCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const result = {};
    // Expect header then rows: round, pick, NFL team, name, position, college, value
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
  // 20% chance for "big compliments"
  function getBriefResponse() {
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
    phase = "easy";
    easyRounds = 0;
    currentNFLPlayer = "";
    score = 0;
    gameActive = true;
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

  // Intro dialogue: starts with greetings then announces easy rounds.
  function startIntro() {
    addAIMessage(dialogueBuckets.greetings ? dialogueBuckets.greetings[0] : "Hey, let's kick it off. You know the drill 🤝");
    setTimeout(() => {
      addAIMessage(dialogueBuckets.greetings && dialogueBuckets.greetings[1] ? dialogueBuckets.greetings[1] : "No googling, just pure football wisdom.");
    }, 1500);
    setTimeout(() => {
      addAIMessage("We can start with some easy ones.");
      startEasyRound();
    }, 3000);
  }
  
  // Easy rounds: only QBs with value >= 50.
  function startEasyRound() {
    phase = "easy";
    if (Object.keys(nflToCollege).length === 0) {
      gameOver("No players data loaded.");
      return;
    }
    let eligiblePlayers = Object.keys(nflToCollege).filter(player => {
      const info = nflToCollege[player];
      return info.position.toUpperCase() === "QB" && info.value >= 50;
    });
    // Exclude players whose college is in recentSchools.
    const filteredPlayers = eligiblePlayers.filter(player => {
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
    // After 3 easy rounds, transition to normal rounds.
    if (easyRounds >= 3) {
      setTimeout(() => {
        phase = "trivia";
        startTriviaRound();
      }, 1500);
    }
  }

  // Normal rounds: rounds with criteria: round ≤ 3, position in [QB, RB, WR], value ≥ 10.
  function startTriviaRound() {
    phase = "trivia";
    if (Object.keys(nflToCollege).length === 0) {
      gameOver("No players data loaded.");
      return;
    }
    let eligiblePlayers = Object.keys(nflToCollege).filter(player => {
      const info = nflToCollege[player];
      return info.round <= 3 &&
             ["QB", "RB", "WR"].includes(info.position.toUpperCase()) &&
             info.value >= 10;
    });
    const filteredPlayers = eligiblePlayers.filter(player => {
      const collegeNorm = normalizeCollegeString(nflToCollege[player].college);
      return !recentSchools.includes(collegeNorm);
    });
    if (filteredPlayers.length > 0) {
      eligiblePlayers = filteredPlayers;
    }
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

  // Binary mode: triggered in normal rounds when correct streak reaches 4.
  // Binary mode continues for 3 consecutive rounds.
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
    const filteredPlayers = eligiblePlayers.filter(player => {
      const collegeNorm = normalizeCollegeString(nflToCollege[player].college);
      return !recentSchools.includes(collegeNorm);
    });
    if (filteredPlayers.length > 0) {
      eligiblePlayers = filteredPlayers;
    }
    if (eligiblePlayers.length === 0) {
      addAIMessage("Can't think of anyone, let's just keep going.");
      setTimeout(startTriviaRound, 1500);
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    const chosenCollege = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(chosenCollege);
    if (recentSchools.length > 7) { recentSchools.shift(); }
    // Decrement binary counter.
    binaryRoundCount--;
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    hideBinaryChoices();
  }

  // Ask next question in normal mode. If correct streak reaches 4, trigger binary mode.
  function askNextQuestion() {
    addAIMessage(dialogueBuckets.transitions ? dialogueBuckets.transitions[0] : "What's next?");
    setTimeout(() => {
      if (correctStreak >= 4) {
        // Trigger binary mode for 3 rounds.
        binaryModeActive = true;
        binaryRoundCount = 3;
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

  // Handle the college guess.
  function handleCollegeGuess(answer) {
    console.log("Handling answer:", answer);
    const correctCollege = nflToCollege[currentNFLPlayer].college;
    clearTimer();
    if (isCollegeAnswerCorrect(answer, correctCollege)) {
      addAIMessage(getBriefResponse());
      score++;
      updateScore();
      correctStreak++;
      // Check phase: easy or normal or binary.
      if (phase === "easy") {
        if (easyRounds < 3) {
          setTimeout(startEasyRound, 1500);
        } else {
          phase = "trivia";
          setTimeout(startTriviaRound, 1500);
        }
      } else if (phase === "trivia") {
        if (correctStreak >= 4) {
          binaryModeActive = true;
          binaryRoundCount = 3;
          correctStreak = 0;
          setTimeout(askNextQuestion, 1500);
        } else {
          setTimeout(startTriviaRound, 1500);
        }
      } else if (phase === "binary") {
        if (binaryModeActive && binaryRoundCount > 0) {
          // Continue binary rounds.
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

  // Form submission listener.
  inputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!gameActive) return;
    const answer = userInput.value.trim();
    console.log("Form submitted, answer:", answer);
    if (answer === "") return;
    clearTimer();
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

  // Restart button event listener.
  restartButton.addEventListener('click', function() {
    console.log("Restart button clicked.");
    restartGame();
  });
});
