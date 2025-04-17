document.addEventListener('DOMContentLoaded', function() {
  // --- Flags & State ---
  let loadedData   = false;
  let userStarted  = false;
  let gameStarted  = false;
  let gameActive   = true;

  // --- DOM Elements ---
  const startScreen       = document.getElementById('start-screen');
  const startButton       = document.getElementById('start-button');
  const gameContainer     = document.getElementById('game-container');
  const chatContainer     = document.getElementById('chat-container');
  const inputForm         = document.getElementById('input-form');
  const userInput         = document.getElementById('user-input');
  const scoreDisplay      = document.getElementById('score');
  const timerBar          = document.getElementById('timer-bar');
  const binaryChoices     = document.getElementById('binary-choices');
  const choiceTough       = document.getElementById('choice-tough');
  const choiceDefense     = document.getElementById('choice-defense');
  const gameOverOverlay   = document.getElementById('game-over');
  const gameOverMsg       = document.getElementById('game-over-msg');
  const gameOverButtons   = document.getElementById('game-over-buttons');
  const submitScoreBtn    = document.getElementById('submit-score');
  const restartBtn        = document.getElementById('restart');
  const usernameForm      = document.getElementById('username-form');
  const usernameInput     = document.getElementById('username-input');
  const usernameSubmit    = document.getElementById('username-submit');
  const leaderboardCont   = document.getElementById('leaderboard-container');
  const leaderboardList   = document.getElementById('leaderboard');
  const leaderboardRestart= document.getElementById('leaderboard-restart');

  // --- Game Data & Variables ---
  let nflToCollege         = {};
  let collegeAliases       = {};
  let dialogueBuckets      = {};
  let phase                = 'easy';       // "easy", "trivia", "binary"
  let currentNFLPlayer     = '';
  let score                = 0;
  let easyRounds           = 0;            // count of easy questions answered
  let normalRoundsCount    = 0;            // count of trivia questions answered
  let recentSchools        = [];           // last 7 colleges
  let binaryModeActive     = false;
  let binaryRoundCount     = 0;
  let timerInterval;
  const playerExclusionList = ['russell wilson','jayden daniels'];

  // --- Initialize Firestore ---
  const db = firebase.firestore();

  // --- Attempt to start once data & user ready ---
  function tryStartGame() {
    if (loadedData && userStarted && !gameStarted) {
      gameStarted = true;
      startIntro();
    }
  }

  // --- Start Button ---
  startButton.addEventListener('click', () => {
    userStarted = true;
    startScreen.style.display   = 'none';
    gameContainer.style.display = 'flex';
    tryStartGame();
  });

  // --- Load Dialogue JSON ---
  fetch('dialogue.json')
    .then(r => r.json())
    .then(d => {
      dialogueBuckets = d;
      loadedData = !!Object.keys(nflToCollege).length;
      tryStartGame();
    })
    .catch(console.error);

  // --- Load College Aliases CSV ---
  fetch('college_aliases.csv')
    .then(r => r.text())
    .then(txt => {
      collegeAliases = parseCSVtoObject(txt);
    })
    .catch(console.error);

  // --- Load Players CSV ---
  fetch('players.csv')
    .then(r => r.text())
    .then(txt => {
      nflToCollege = parsePlayersCSV(txt);
      loadedData = !!dialogueBuckets.questions;
      tryStartGame();
    })
    .catch(console.error);

  // --- CSV Parsing Helpers ---
  function parseCSVtoObject(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const obj = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const key  = cols[0].trim().toLowerCase();
      if (!key) continue;
      obj[key] = cols.slice(1)
                     .map(a => a.trim().toLowerCase())
                     .filter(a => a);
    }
    return obj;
  }

  function parsePlayersCSV(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const obj = {};
    for (let i = 1; i < lines.length; i++) {
      const p = lines[i].split(',');
      if (p.length < 7) continue;
      const rnd  = parseInt(p[0].trim());
      const name = p[3].trim();
      const pos  = p[4].trim();
      const col  = p[5].trim();
      const val  = p[6].trim() === '' ? 0 : parseFloat(p[6].trim());
      if (!isNaN(rnd) && name && pos && col) {
        obj[name] = { round: rnd, position: pos, college: col, value: val };
      }
    }
    return obj;
  }

  // --- Timer Logic ---
  function startTimer() {
    clearTimer();
    let t = 7;
    timerBar.style.width = '100%';
    timerInterval = setInterval(() => {
      t -= 0.1;
      timerBar.style.width = `${(t/7)*100}%`;
      if (t <= 0) {
        clearTimer();
        gameOver("Time's up! Game Over!");
      }
    }, 100);
  }

  function clearTimer() {
    clearInterval(timerInterval);
    timerBar.style.width = '0%';
  }

  // --- UI Helpers ---
  function addMessage(text, cls) {
    const msg = document.createElement('div');
    msg.classList.add('message', cls);
    msg.textContent = text;
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function updateScore() {
    scoreDisplay.textContent = `Score: ${score}`;
  }

  // --- Dialogue Helpers ---
  function getBriefResponse() {
    if (phase === 'easy') {
      const arr = dialogueBuckets.confirmations || ['nice'];
      return arr[Math.floor(Math.random()*arr.length)];
    }
    if (Math.random() < 0.1 && dialogueBuckets.big_compliments?.length) {
      const arr = dialogueBuckets.big_compliments;
      return arr[Math.floor(Math.random()*arr.length)];
    }
    const arr = dialogueBuckets.confirmations || ['nice'];
    return arr[Math.floor(Math.random()*arr.length)];
  }

  function getQuestionTemplate() {
    const arr = dialogueBuckets.questions || ['How about XXXXX'];
    return arr[Math.floor(Math.random()*arr.length)];
  }

  // --- College Answer Checking ---
  function normalizeCollegeString(s) {
    let str = s.replace(/[^\w\s]/gi,'').toLowerCase().trim();
    if (str.startsWith('university of ')) str = str.slice(14);
    if (str.startsWith('college of '))    str = str.slice(11);
    const tokens = str.split(/\s+/);
    const last   = tokens[tokens.length-1];
    if (last==='st'||last==='st.') tokens[tokens.length-1]='state';
    str = tokens.join(' ');
    if (str.endsWith(' university')) {
      const tmp = str.slice(0,str.lastIndexOf(' university'));
      if (tmp.split(' ').length>1) str = tmp;
    }
    return str;
  }

  function isCollegeAnswerCorrect(ans, correct) {
    const a = normalizeCollegeString(ans);
    const c = normalizeCollegeString(correct);
    if (a===c) return true;
    return (collegeAliases[c]||[]).includes(a);
  }

  // --- Typing & AI Messaging ---
  function showTypingIndicator(cb) {
    const ind = document.createElement('div');
    ind.classList.add('message','ai','typing-indicator');
    ind.textContent = '...';
    chatContainer.appendChild(ind);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    setTimeout(() => {
      chatContainer.removeChild(ind);
      cb();
    }, 1500);
  }

  function addAIMessage(text, onDone) {
    clearTimer();
    showTypingIndicator(() => {
      addMessage(text,'ai');
      if (gameActive && currentNFLPlayer && text.includes(currentNFLPlayer)) {
        startTimer();
      }
      if (typeof onDone==='function') onDone();
    });
  }

  // --- Game Over & Leaderboard Flow ---
  function gameOver(msg) {
    gameActive = false;
    clearTimer();
    addAIMessage(msg);
    gameOverMsg.textContent       = msg;
    gameOverOverlay.style.display = 'flex';
    gameOverButtons.style.display = 'block';
    usernameForm.style.display    = 'none';
    leaderboardCont.style.display = 'none';
    inputForm.style.display       = 'none';
  }

  restartBtn.addEventListener('click', restartGame);
  submitScoreBtn.addEventListener('click', () => {
    gameOverButtons.style.display = 'none';
    usernameForm.style.display    = 'block';
  });

  usernameSubmit.addEventListener('click', () => {
    const uname = usernameInput.value.trim();
    if (!uname) return alert('Enter your username.');
    db.collection('highScores').add({
      username: uname,
      score,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(showLeaderboard)
    .catch(e=>{console.error(e);alert('Submit failed.')});
  });

  leaderboardRestart.addEventListener('click', () => {
    leaderboardCont.style.display = 'none';
    usernameInput.value           = '';
    restartGame();
  });

  function showLeaderboard() {
    usernameForm.style.display       = 'none';
    leaderboardCont.style.display    = 'block';
    leaderboardList.innerHTML        = '';
    db.collection('highScores')
      .orderBy('score','desc')
      .limit(20)
      .get()
      .then(snap => {
        if (snap.empty) {
          leaderboardList.innerHTML = '<li>No scores yet.</li>';
        } else {
          snap.forEach(doc => {
            const { username, score } = doc.data();
            const li = document.createElement('li');
            li.textContent = `${username}: ${score}`;
            leaderboardList.appendChild(li);
          });
        }
      })
      .catch(e => {
        console.error(e);
        leaderboardList.innerHTML = '<li>Unable to load leaderboard.</li>';
      });
  }

  // --- Restart Game ---
  function restartGame() {
    clearTimer();
    phase             = 'easy';
    easyRounds        = 0;
    normalRoundsCount = 0;
    currentNFLPlayer  = '';
    score             = 0;
    gameActive        = true;
    binaryModeActive  = false;
    binaryRoundCount  = 0;
    recentSchools     = [];
    updateScore();
    chatContainer.innerHTML       = '';
    userInput.value               = '';
    inputForm.style.display       = 'block';
    gameOverOverlay.style.display = 'none';
    gameOverButtons.style.display = 'none';
    usernameForm.style.display    = 'none';
    leaderboardCont.style.display = 'none';
    startIntro();
  }

  // --- Intro Sequence ---
  function startIntro() {
    addAIMessage(
      dialogueBuckets.greetings?.[0] || 'you and I have to take an oath 🤝',
      () => addAIMessage(
        dialogueBuckets.greetings?.[1] || 'no googling',
        () => addAIMessage(
          'We can start with some easy ones.',
          startEasyRound
        )
      )
    );
  }

  // --- Easy Round: QBs ≥40 or RB/WR R1–2 ≥40 ---
  function startEasyRound() {
    if (!gameActive) return;
    if (easyRounds >= 3) return; // transition in answer handler

    phase = 'easy';
    let candidates = Object.keys(nflToCollege).filter(name => {
      const p   = nflToCollege[name];
      const pos = p.position.toUpperCase();
      const valOK    = p.value >= 40;
      const qbOK     = pos === 'QB' && valOK;
      const skillOK  = (pos==='RB'||pos==='WR') && p.round<=2 && valOK;
      return (qbOK||skillOK) && !playerExclusionList.includes(name.toLowerCase());
    });

    const filtered = candidates.filter(name =>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].college))
    );
    if (filtered.length) candidates = filtered;

    if (!candidates.length) {
      return gameOver('No eligible easy players. Game Over!');
    }

    currentNFLPlayer = candidates[Math.floor(Math.random()*candidates.length)];
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].college));
    if (recentSchools.length > 7) recentSchools.shift();

    easyRounds++;
    const q = getQuestionTemplate().replace('XXXXX', currentNFLPlayer);
    addAIMessage(q);
  }

  // --- Handle User Answer (with fixed transition) ---
  function handleCollegeGuess(ans) {
    clearTimer();
    addMessage(ans, 'user');
    const correctCollege = nflToCollege[currentNFLPlayer].college;
    if (isCollegeAnswerCorrect(ans, correctCollege)) {
      addAIMessage(getBriefResponse(), () => {
        score++; updateScore();

        if (phase === 'easy') {
          if (easyRounds < 3) {
            setTimeout(startEasyRound, 500);
          } else {
            const et = dialogueBuckets.easyTransition || [];
            const msg = et.length
              ? et[Math.floor(Math.random() * et.length)]
              : "Ok, now let's have some fun";
            addAIMessage(msg, () => {
              phase = 'trivia';
              normalRoundsCount = 0;    // reset the correct counter
              startTriviaRound();
            });
          }

        } else if (phase === 'trivia') {
          if (normalRoundsCount >= 3) {
            setTimeout(askNextQuestion, 500);
          } else {
            setTimeout(startTriviaRound, 500);
          }

        } else { // binary
          if (binaryModeActive && binaryRoundCount > 0) {
            setTimeout(showBinaryChoices, 500);
          } else {
            binaryModeActive = false;
            setTimeout(startTriviaRound, 500);
          }
        }
      });

    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${correctCollege}. Better luck next time!`);
    }
  }

  inputForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!gameActive) return;
    const ans = userInput.value.trim();
    if (ans) handleCollegeGuess(ans);
    userInput.value = '';
  });

  // --- The rest of trivia/binary logic (startTriviaRound, askNextQuestion, startTriviaRoundFiltered, show/hideBinaryChoices) remains unchanged ---
});
