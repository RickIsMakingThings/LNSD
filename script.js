document.addEventListener('DOMContentLoaded', function() {
  // Global variables and state
  let nflToCollege = {};       // From players.csv
  let collegeAliases = {};     // From college_aliases.csv
  let dialogueBuckets = {};    // From dialogue.json

  let gameStarted = false;
  let gameActive = true;
  let phase = "easy";          // "easy", "trivia", or "binary"
  let easyRounds = 0;          // Count of completed easy rounds (goal: 3)
  let binaryModeActive = false;
  let binaryRoundCount = 0;    // 3 consecutive binary rounds
  let choicePending = "";      // "tough" or "defense"

  // Current question / player
  let currentNFLPlayer = "";
  let correctStreak = 0;
  let recentSchools = [];      // Tracks normalized college names from last 7 rounds

  // Timer
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
  const timerBar = document.getElementById('timer-bar');

  let score = 0;

  // --------------------- DATA LOADING ---------------------

  // Load dialogue
  fetch('dialogue.json')
    .then(r => r.json())
    .then(data => {
      dialogueBuckets = data;
      console.log("Dialogue loaded:", dialogueBuckets);
      checkAndStartGame();
    })
    .catch(err => console.error("Error loading dialogue:", err));

  // Load aliases
  fetch('college_aliases.csv')
    .then(r => r.text())
    .then(text => {
      collegeAliases = parseCSVtoObject(text);
      console.log("College aliases loaded:", collegeAliases);
    })
    .catch(err => console.error("Error loading college aliases:", err));

  // Load players
  fetch('players.csv')
    .then(r => r.text())
    .then(text => {
      nflToCollege = parsePlayersCSV(text);
      console.log("Players loaded:", nflToCollege);
      checkAndStartGame();
    })
    .catch(err => console.error("Error loading players CSV:", err));

  // If players are loaded, start the game once
  function checkAndStartGame() {
    if (!gameStarted && Object.keys(nflToCollege).length > 0) {
      gameStarted = true;
      startIntro();
    }
  }

  // --------------------- CSV PARSING ---------------------

  function parseCSVtoObject(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const result = {};
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (!parts.length) continue;
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

  // --------------------- TIMER ---------------------

  function startTimer() {
    clearTimer();
    let timeLeft = 7.0;
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

  // --------------------- UI UTIL ---------------------

  function addMessage(text, sender) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    div.textContent = text;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function updateScore() {
    scoreDisplay.textContent = `Score: ${score}`;
  }

  // --------------------- DIALOGUE UTIL ---------------------

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

  // --------------------- COLLEGE NORMALIZATION ---------------------

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

  function isCollegeAnswerCorrect(answer, correctCollege) {
    const normAnswer = normalizeCollegeString(answer);
    const normCorrect = normalizeCollegeString(correctCollege);
    if (normAnswer === normCorrect) return true;
    if (collegeAliases[normCorrect] && collegeAliases[normCorrect].includes(normAnswer)) return true;
    return false;
  }

  // --------------------- TYPING INDICATOR ---------------------

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

  // --------------------- GAME OVER & RESTART ---------------------

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
    correctStreak = 0;
    binaryModeActive = false;
    binaryRoundCount = 0;
    recentSchools = [];
    gameActive = true;
    updateScore();
    chatContainer.innerHTML = "";
    userInput.value = "";
    inputForm.style.display = "block";
    gameOverOverlay.style.display = "none";
    startIntro();
  }

  // --------------------- INTRO & EASY ROUNDS ---------------------

  function startIntro() {
    addAIMessage(dialogueBuckets.greetings ? dialogueBuckets.greetings[0] : "Hey, let's kick it off. You know the drill 🤝");
    setTimeout(() => {
      addAIMessage(dialogueBuckets.greetings && dialogueBuckets.greetings[1] ? dialogueBuckets.greetings[1] : "No googling, just pure football wisdom.");
    }, 1500);
    setTimeout(() => {
      addAIMessage("We can start with some easy ones.");
      // We'll pick the first easy question here
      startEasyQuestion();
    }, 3000);
  }

  // Called to pick and display an easy question
  function startEasyQuestion() {
    if (!gameActive) return;
    phase = "easy";
    // Filter QBs with value >= 50
    let eligiblePlayers = Object.keys(nflToCollege).filter(name => {
      const info = nflToCollege[name];
      return info.position.toUpperCase() === "QB" && info.value >= 50;
    });
    // Exclude recent schools
    let filtered = eligiblePlayers.filter(name => {
      const colNorm = normalizeCollegeString(nflToCollege[name].college);
      return !recentSchools.includes(colNorm);
    });
    if (filtered.length > 0) {
      eligiblePlayers = filtered;
    }
    if (eligiblePlayers.length === 0) {
      gameOver("No eligible players for easy round. Game Over!");
      return;
    }
    currentNFLPlayer = eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    // track recent school
    const colNorm = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(colNorm);
    if (recentSchools.length > 7) recentSchools.shift();
    // Show question
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    userInput.value = "";
  }

  // Once the user guesses the correct easy question, we increment easyRounds
  // If easyRounds < 3 => pick next easy question
  // else => transition to normal round
  function proceedFromEasyRound() {
    easyRounds++;
    if (easyRounds < 3) {
      // next easy question
      setTimeout(startEasyQuestion, 1500);
    } else {
      // go to normal
      phase = "trivia";
      setTimeout(startTriviaRound, 1500);
    }
  }

  // --------------------- NORMAL & BINARY ROUNDS ---------------------

  // Normal round: round ≤ 3, position in [QB,RB,WR], value ≥ 10
  function startTriviaRound() {
    if (!gameActive) return;
    phase = "trivia";
    let eligible = Object.keys(nflToCollege).filter(name => {
      const info = nflToCollege[name];
      return info.round <= 3 &&
             ["QB","RB","WR"].includes(info.position.toUpperCase()) &&
             info.value >= 10;
    });
    // exclude recent
    let filtered = eligible.filter(name => {
      const colNorm = normalizeCollegeString(nflToCollege[name].college);
      return !recentSchools.includes(colNorm);
    });
    if (filtered.length > 0) {
      eligible = filtered;
    }
    if (eligible.length === 0) {
      gameOver("No eligible players available for this round. Game Over!");
      return;
    }
    currentNFLPlayer = eligible[Math.floor(Math.random() * eligible.length)];
    const colNorm = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(colNorm);
    if (recentSchools.length > 7) recentSchools.shift();
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    userInput.value = "";
  }

  // startTriviaRoundFiltered => for binary modes
  function startTriviaRoundFiltered(choice) {
    if (!gameActive) return;
    phase = "binary";
    let eligible = [];
    if (choice === "tough") {
      // rounds 2..7, QB/RB/WR, value 5..20
      eligible = Object.keys(nflToCollege).filter(name => {
        const info = nflToCollege[name];
        return info.round >= 2 && info.round <= 7 &&
               ["QB","RB","WR"].includes(info.position.toUpperCase()) &&
               info.value >= 5 && info.value <= 20;
      });
    } else if (choice === "defense") {
      // any round, DE/DT/LB/OLB/ILB/CB/S, value >= 49
      eligible = Object.keys(nflToCollege).filter(name => {
        const info = nflToCollege[name];
        const p = info.position.toUpperCase();
        return !["QB","RB","WR"].includes(p) &&
               ["DE","DT","LB","OLB","ILB","CB","S"].includes(p) &&
               info.value >= 49;
      });
    }
    let filtered = eligible.filter(name => {
      const colNorm = normalizeCollegeString(nflToCollege[name].college);
      return !recentSchools.includes(colNorm);
    });
    if (filtered.length > 0) {
      eligible = filtered;
    }
    if (eligible.length === 0) {
      addAIMessage("Can't think of anyone, let's just keep going.");
      setTimeout(startTriviaRound, 1500);
      return;
    }
    currentNFLPlayer = eligible[Math.floor(Math.random() * eligible.length)];
    const colNorm = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(colNorm);
    if (recentSchools.length > 7) recentSchools.shift();
    binaryRoundCount--;
    const template = getQuestionTemplate();
    const question = template.replace("XXXXX", currentNFLPlayer);
    addAIMessage(question);
    hideBinaryChoices();
  }

  // If correct streak >= 4, binary mode triggers
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

  // --------------------- ANSWER HANDLER ---------------------

  function handleCollegeGuess(answer) {
    console.log("Handling answer:", answer);
    const correctCollege = nflToCollege[currentNFLPlayer].college;
    clearTimer();
    if (isCollegeAnswerCorrect(answer, correctCollege)) {
      // correct
      addAIMessage(getBriefResponse());
      score++;
      updateScore();
      correctStreak++;
      if (phase === "easy") {
        // proceed from easy round
        proceedFromEasyRound();
      } else if (phase === "trivia") {
        // normal round
        if (correctStreak >= 4) {
          // force binary mode
          binaryModeActive = true;
          binaryRoundCount = 3;
          correctStreak = 0;
          setTimeout(askNextQuestion, 1500);
        } else {
          setTimeout(startTriviaRound, 1500);
        }
      } else if (phase === "binary") {
        // if still in binary mode
        if (binaryModeActive && binaryRoundCount > 0) {
          // after 3 consecutive binary questions, revert to normal
          setTimeout(() => {
            showBinaryChoices();
          }, 1500);
        } else {
          binaryModeActive = false;
          setTimeout(startTriviaRound, 1500);
        }
      }
    } else {
      // incorrect => game over
      gameOver(`Nah, ${currentNFLPlayer} played at ${correctCollege}. Better luck next time!`);
    }
  }

  // Form submission
  inputForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!gameActive) return;
    const answer = userInput.value.trim();
    if (answer === "") return;
    addMessage(answer, "user");
    userInput.value = "";
    handleCollegeGuess(answer);
  });

  // Binary choices
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

  // Restart
  restartButton.addEventListener('click', function() {
    console.log("Restart button clicked.");
    restartGame();
  });
});
