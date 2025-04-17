document.addEventListener('DOMContentLoaded', function() {
  // --- DOM Elements (needed for viewport adjustment) ---
  const gameContainer = document.getElementById('game-container');

  // ─── Mobile Snappiness via Visual Viewport API ───
  if (window.visualViewport) {
    const adjustForKeyboard = () => {
      gameContainer.style.transform = `translateY(-${visualViewport.offsetTop}px)`;
    };
    visualViewport.addEventListener('resize', adjustForKeyboard);
    visualViewport.addEventListener('scroll', adjustForKeyboard);
    window.addEventListener('beforeunload', () => {
      gameContainer.style.transform = '';
    });
  }

  // --- Flags & State ---
  let loadedData        = false;
  let userStarted       = false;
  let gameStarted       = false;
  let gameActive        = true;

  // --- Dialog Cooldown Settings ---
  const COOLDOWN = 5;
  const recentQuestions           = [];
  const recentConfirmations       = [];
  const recentBigCompliments      = [];
  const recentTransferCompliments = [];

  // --- Weight Capping & Draft‑Year Boost Groups ---
  const MAX_WEIGHT = 100;
  function computeWeight(p) {
    let boost;
    if (p.draftYear >= 2024)       boost = 3.0;
    else if (p.draftYear >= 2022)  boost = 2.5;
    else if (p.draftYear >= 2018)  boost = 2.0;
    else                            boost = 0.4;
    return Math.min(p.value * boost, MAX_WEIGHT);
  }

  // --- Helper: pick with cooldown ---
  function pickWithCooldown(arr, recentArr) {
    const choices = arr.filter(item => !recentArr.includes(item));
    const pool    = choices.length ? choices : arr;
    const pick    = pool[Math.floor(Math.random() * pool.length)];
    recentArr.push(pick);
    if (recentArr.length > COOLDOWN) recentArr.shift();
    return pick;
  }

  // --- DOM Elements ---
  const startScreen        = document.getElementById('start-screen');
  const startButton        = document.getElementById('start-button');
  const chatContainer      = document.getElementById('chat-container');
  const inputForm          = document.getElementById('input-form');
  const userInput          = document.getElementById('user-input');
  const scoreDisplay       = document.getElementById('score');
  const timerBar           = document.getElementById('timer-bar');
  const binaryChoices      = document.getElementById('binary-choices');
  const choiceTough        = document.getElementById('choice-tough');
  const choiceDefense      = document.getElementById('choice-defense');
  const gameOverOverlay    = document.getElementById('game-over');
  const gameOverMsg        = document.getElementById('game-over-msg');
  const gameOverButtons    = document.getElementById('game-over-buttons');
  const submitScoreBtn     = document.getElementById('submit-score');
  const restartBtn         = document.getElementById('restart');
  const usernameForm       = document.getElementById('username-form');
  const usernameInput      = document.getElementById('username-input');
  const usernameSubmit     = document.getElementById('username-submit');
  const leaderboardCont    = document.getElementById('leaderboard-container');
  const leaderboardList    = document.getElementById('leaderboard');
  const leaderboardRestart = document.getElementById('leaderboard-restart');

  // --- Game Data & Variables ---
  let nflToCollege      = {};
  let collegeAliases    = {};
  let dialogueBuckets   = {};
  let phase             = 'easy';
  let currentNFLPlayer  = '';
  let score             = 0;
  let easyRounds        = 0;
  let normalRoundsCount = 0;
  let recentSchools     = [];
  let binaryModeActive  = false;
  let binaryRoundCount  = 0;
  let timerInterval;

  // --- Firestore Setup ---
  const db = firebase.firestore();

  // --- Weighted Random Pick Helper ---
  function weightedRandomPick(items) {
    const total = items.reduce((sum,i)=>sum + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
      if (r < item.weight) return item.name;
      r -= item.weight;
    }
    return items[items.length - 1].name;
  }

  // --- Try Start ---
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

  // --- Load dialogue.json ---
  fetch('dialogue.json')
    .then(r => r.json())
    .then(d => {
      dialogueBuckets = d;
      loadedData = !!Object.keys(nflToCollege).length;
      tryStartGame();
    })
    .catch(console.error);

  // --- Load CSVs ---
  fetch('college_aliases.csv')
    .then(r => r.text())
    .then(t => { collegeAliases = parseCSVtoObject(t); })
    .catch(console.error);

  fetch('players.csv')
    .then(r => r.text())
    .then(t => {
      nflToCollege = parsePlayersCSV(t);
      loadedData = !!dialogueBuckets.questions;
      tryStartGame();
    })
    .catch(console.error);

  // --- CSV Parsers ---
  function parseCSVtoObject(csv) {
    return csv.trim().split(/\r?\n/).slice(1).reduce((map, line) => {
      const cols   = line.split(',').map(s => s.trim());
      const rawKey = cols[0];
      if (!rawKey) return map;
      const key     = normalizeCollegeString(rawKey);
      const aliases = cols.slice(1)
                          .map(a => normalizeCollegeString(a))
                          .filter(a => a);
      map[key] = aliases;
      return map;
    }, {});
  }
  function parsePlayersCSV(csv) {
    return csv.trim().split(/\r?\n/).slice(1).reduce((o, line) => {
      const p = line.split(',');
      if (p.length < 10) return o;
      const [dy, rnd, , , name, pos, c1, c2, c3, val] = p;
      const draftYear = parseInt(dy, 10),
            round     = parseInt(rnd, 10),
            value     = val.trim() === '' ? 0 : parseFloat(val);
      if (!isNaN(draftYear) && !isNaN(round) && name && pos && c1) {
        o[name] = {
          draftYear,
          round,
          position: pos,
          colleges: [c1, c2, c3].filter(c => c),
          value
        };
      }
      return o;
    }, {});
  }

  // --- Timer (instant fill, then smooth drain) ---
  function startTimer() {
    clearTimer();
    timerBar.style.transition = 'none';
    timerBar.style.width      = '100%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width 0.1s linear';
    let t = 9; // now uses 9 seconds
    timerInterval = setInterval(() => {
      t -= 0.1;
      timerBar.style.width = `${(t / 9) * 100}%`;
      if (t <= 0) {
        clearTimer();
        gameOver("Time's up! Game Over!");
      }
    }, 100);
  }
  function clearTimer() {
    clearInterval(timerInterval);
    timerBar.style.transition = 'none';
    timerBar.style.width      = '0%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width 0.1s linear';
  }

  // --- UI Helpers ---
  function addMessage(txt, cls) {
    const d = document.createElement('div');
    d.classList.add('message', cls);
    d.textContent = txt;
    chatContainer.appendChild(d);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function updateScore() {
    scoreDisplay.textContent = `Score: ${score}`;
  }

  // --- Dialogue Helpers (with cooldown) ---
  function getQuestionTemplate() {
    const arr = dialogueBuckets.questions || ['How about XXXXX'];
    return pickWithCooldown(arr, recentQuestions);
  }
  function getBriefResponse() {
    if (phase === 'easy') {
      const arr = dialogueBuckets.confirmations || ['nice'];
      return pickWithCooldown(arr, recentConfirmations);
    }
    if (Math.random() < 0.1 && dialogueBuckets.big_compliments?.length) {
      return pickWithCooldown(dialogueBuckets.big_compliments, recentBigCompliments);
    }
    const arr = dialogueBuckets.confirmations || ['nice'];
    return pickWithCooldown(arr, recentConfirmations);
  }
  function getTransferCompliment() {
    const arr = dialogueBuckets.transferCompliments || ["I see what you did there"];
    return pickWithCooldown(arr, recentTransferCompliments);
  }

  // --- Normalize & Check ---
  function normalizeCollegeString(str) {
    let s = str
      .replace(/[^\w\s&]/gi, '')
      .toLowerCase()
      .trim();
    if (s.startsWith('university of ')) s = s.slice(14).trim();
    else if (s.startsWith('college of ')) s = s.slice(11).trim();
    const toks = s.split(/\s+/);
    const last = toks[toks.length - 1];
    if (last === 'st' || last === 'st.') toks[toks.length - 1] = 'state';
    s = toks.join(' ');
    if (s.endsWith(' university')) {
      const without = s.slice(0, -11).trim();
      if (without.split(/\s+/).length > 1) s = without;
    }
    return s;
  }
  function isCollegeAnswerCorrect(ans, correct) {
    const a = normalizeCollegeString(ans),
          c = normalizeCollegeString(correct);
    return a === c || (collegeAliases[c] || []).includes(a);
  }

  // --- Typing Indicator & Cross‑Fade AI Messaging ---
  function showTypingIndicator(txt, cb, step = 200) {
    // create indicator
    const ind = document.createElement('div');
    ind.classList.add('message','ai','typing-indicator','fade-in');
    chatContainer.appendChild(ind);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // prepare real bubble under it (hidden)
    const real = document.createElement('div');
    real.classList.add('message','ai');
    real.style.opacity = 0;
    chatContainer.appendChild(real);

    // animate dots
    let count = 1, max = 3;
    ind.textContent = 'ₒ';
    const dotTimer = setInterval(() => {
      count++;
      ind.textContent = 'ₒ '.repeat(count).trim();
      if (count >= max) clearInterval(dotTimer);
    }, step);

    // after typing
    setTimeout(() => {
      clearInterval(dotTimer);

      // insert text
      real.textContent = txt;

      // cross-fade
      ind.classList.remove('fade-in');
      ind.classList.add('fade-out');
      real.classList.add('fade-in');

      // remove indicator after fade
      setTimeout(() => {
        if (ind.parentNode) ind.parentNode.removeChild(ind);
        if (typeof cb === 'function') cb();
      }, 200);
    }, step * max + 50);
  }

  function addAIMessage(txt, onDone, speed) {
    clearTimer();
    showTypingIndicator(txt, () => {
      // start timer if it's a question
      if (gameActive && currentNFLPlayer && txt.includes(currentNFLPlayer)) {
        startTimer();
      }
      if (typeof onDone === 'function') onDone();
    }, speed);
  }

  // --- Game Over & Leaderboard ---
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
    if (!uname) return alert('Enter username.');
    db.collection('highScores').add({
      username: uname,
      score,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(showLeaderboard)
      .catch(e => { console.error(e); alert('Submit failed.'); });
  });
  leaderboardRestart.addEventListener('click', () => {
    leaderboardCont.style.display = 'none';
    usernameInput.value            = '';
    restartGame();
  });
  function showLeaderboard() {
    usernameForm.style.display    = 'none';
    leaderboardCont.style.display = 'block';
    leaderboardList.innerHTML     = '';
    db.collection('highScores')
      .orderBy('score','desc').limit(20)
      .get().then(snap => {
        if (snap.empty) leaderboardList.innerHTML = '<li>No scores yet.</li>';
        else snap.forEach(doc => {
          const { username, score } = doc.data();
          const li = document.createElement('li');
          li.textContent = `${username}: ${score}`;
          leaderboardList.appendChild(li);
        });
      }).catch(e => {
        console.error(e);
        leaderboardList.innerHTML = '<li>Unable to load leaderboard.</li>';
      });
  }

  // --- Restart Game ---
  function restartGame() {
    clearTimer();
    phase               = 'easy';
    easyRounds          = 0;
    normalRoundsCount   = 0;
    currentNFLPlayer    = '';
    score               = 0;
    gameActive          = true;
    binaryModeActive    = false;
    binaryRoundCount    = 0;
    recentSchools       = [];
    updateScore();
    chatContainer.innerHTML      = '';
    userInput.value              = '';
    inputForm.style.display      = 'block';
    gameOverOverlay.style.display= 'none';
    gameOverButtons.style.display= 'none';
    usernameForm.style.display   = 'none';
    leaderboardCont.style.display= 'none';
    startIntro();
  }

  // --- Intro Sequence ---
  function startIntro() {
    addAIMessage(
      dialogueBuckets.greetings?.[0] || "you and I have to take an oath 🤝",
      () => addAIMessage(
        dialogueBuckets.greetings?.[1] || "no googling",
        () => addAIMessage(
          "We can start with some easy ones.",
          startEasyRound
        )
      )
    );
  }

  // ... rest of your startEasyRound, startTriviaRound, etc. unchanged ...
});
