// script.js (v7)
document.addEventListener('DOMContentLoaded', () => {
  // ─── Mode Persistence ──────────────────────────────
  let mode = localStorage.getItem('gameMode') || 'legend'; // 'legend' or 'choice'

  // ─── Curated Easy-Round Names & Exclusion ──────────
  const easyNames = [
    "Matthew Stafford","Cam Newton","Patrick Mahomes","Lamar Jackson","Kirk Cousins",
    "Derrick Henry","Christian McCaffrey","Andrew Luck","Baker Mayfield","Jalen Hurts",
    "Kyler Murray","Ezekiel Elliott","Justin Herbert","Jameis Winston","Odell Beckham Jr.",
    "Joe Burrow","Saquon Barkley","Justin Jefferson","Joe Mixon","Marcus Mariota",
    "Amon-Ra St. Brown","Nick Chubb","Jonathan Taylor","Trevor Lawrence","Justin Fields",
    "Mark Sanchez","Mac Jones","C.J. Stroud","George Pickens","Travis Etienne",
    "Caleb Williams","Marvin Harrison Jr.","Malik Nabers","Bo Nix"
  ];

  // ─── Tip Bucket ────────────────────────────────────
  const tips = [
    "Switch to Multiple Choice Mode for an easier experience.",
    "Multiple Choice Mode is easier and has it’s own Leaderboard.",
    "There are two game modes, see which one you like best!",
    "Abbreviations work for all schools like Bama, Ole Miss and LSU.",
    "Shortened names will work with most schools (ND, OSU, UM).",
    "Boom Fantasy is the only place where two picks can win 500x your entry.",
    "If you cheat, we will find you.",
    "Close your eyes, take a deep breath, and guess Bama."
  ];

 // ─── Static decoy list for multiple-choice ─────────────────
  // Populate this with all the “big” schools you want as wrong options
  const decoyList = ['Alabama', 'Ohio State', 'Georgia', 'Clemson', 'LSU', 'Michigan', 'Florida', 'Penn State', 'Notre Dame', 'Oklahoma', 'Texas', 'Iowa', 'USC', 'Washington', 'Auburn', 'Oregon', 'Mississippi', 'UCLA', 'South Carolina', 'Tennessee', 'Wisconsin', 'Miami Fl', 'TCU', 'Cincinnati', 'North Carolina State', 'Florida State', 'Illinois', 'Kentucky', 'Nebraska', 'BYU', 'Baylor', 'Purdue', 'Utah', 'Arkansas', 'Maryland', 'Kansas State', 'Syracuse', 'Vanderbilt', 'Memphis'    
  ];

  // ─── State ─────────────────────────────────────────
  let nflToCollege      = {};
  let collegeAliases    = {};
  let dialogueBuckets   = {};
  let gameActive        = true;
  let phase             = 'easy';
  let currentNFLPlayer  = '';
  let score             = 0;
  let easyRounds        = 0;
  let normalRoundsCount = 0;
  let recentSchools     = [];
  let binaryModeActive  = false;
  let binaryRoundCount  = 0;
  let correctStreak     = 0;
  let _timerTimeout = null;
  let _timerInterval = null;
  let _timerDeadline = 0;
  let _hasIntroduced = false;
  let recentPlayers = [];


 // Cooldown pools for question/dialogue reuse
  const recentQuestions           = [];
  const recentConfirmations       = [];
  const recentBigCompliments      = [];
  const recentTransferCompliments = [];

  // ─── DOM Refs ──────────────────────────────────────
  const startScreen       = document.getElementById('start-screen');
  const startButton       = document.getElementById('start-button');
  const gameContainer     = document.getElementById('game-container');
  const chatContainer     = document.getElementById('chat-container');
  const inputForm         = document.getElementById('input-form');
  const userInput         = document.getElementById('user-input');
  const scoreDisplay      = document.getElementById('score-display');
  const plusOneEl         = document.getElementById('plus-one');
  const timerBar          = document.getElementById('timer-bar');
  const binaryChoices     = document.getElementById('binary-choices');
  const choiceTough       = document.getElementById('choice-tough');
  const choiceDefense     = document.getElementById('choice-defense');
  const gameOverOverlay   = document.getElementById('game-over');
  const gameOverMsg       = document.getElementById('game-over-msg');
  const gameOverButtons   = document.getElementById('game-over-buttons');
  const restartBtn        = document.getElementById('restart');
  const submitScoreBtn    = document.getElementById('submit-score');
  const shareScoreBtn     = document.getElementById('share-score');
  const usernameForm      = document.getElementById('username-form');
  const usernameInput     = document.getElementById('username-input');
  const usernameSubmit    = document.getElementById('username-submit');
  const leaderboardCont   = document.getElementById('leaderboard-container');
  const leaderboardList   = document.getElementById('leaderboard');
  const leaderboardRestart= document.getElementById('leaderboard-restart');
  const toastEl           = document.getElementById('toast');
  const tipContainer      = document.getElementById('tip-container');

  // ─── Legend‐Mode Text Submit Handler ─────────────────
  inputForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!gameActive || mode === 'choice') return;
    const ans = userInput.value.trim();
    if (!ans) return;
    clearTimer();
    userInput.value = '';
    handleAnswer(ans);
  });

  // We'll inject our Choice-Mode container here
  let choiceContainer = null;
  function ensureChoiceContainer() {
    if (!choiceContainer) {
      choiceContainer = document.createElement('div');
      choiceContainer.id = 'choice-container';
      choiceContainer.style.display = 'none';
      choiceContainer.style.padding = '10px';
      choiceContainer.style.textAlign = 'center';
      document.getElementById('game-container').insertBefore(
        choiceContainer,
        inputForm
      );
    }
  }

// helper to render every option in Title Case
function toTitleCase(str) {
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const collegeDisplayOverrides = {
  'usc':      'USC',
  'lsu':      'LSU',
  'texas am': 'Texas A&M',
  'byu':      'BYU',
  'tcu':      'TCU',
  // add any others you need: 'nd': 'Notre Dame', 'osu': 'Ohio State', etc.
};

function formatCollegeName(rawName) {
  // normalize exactly the same way you already do
  const key = normalizeCollegeString(rawName);
  // if it's in overrides, use that, otherwise fall back to Title Case
  return collegeDisplayOverrides[key] || toTitleCase(rawName);
}

  // ─── Binary‐choices UI Helpers ──────────────────
  function showBinaryChoices() {
    // Make sure the MC container exists (we’ll hide it here)
    ensureChoiceContainer();

    // Hide anything else
    inputForm.style.display       = 'none';
    choiceContainer.style.display = 'none';

    // Show the two-button binary choice panel every time
    binaryChoices.style.display = 'block';
  }

  // ─── hide the two-button binary panel ─────────────
  function hideBinaryChoices() {
    binaryChoices.style.display = 'none';
  }

  // ─── Firebase Setup ───────────────────────────────
  const db = firebase.firestore();

  // ─── Utility: Weighted Random Pick ────────────────
  function weightedRandomPick(items) {
    const total = items.reduce((sum,i) => sum + i.weight, 0);
    let r = Math.random() * total;
    for (const item of items) {
      if (r < item.weight) return item.name;
      r -= item.weight;
    }
    return items[items.length-1].name;
  }

  // ─── Utility: Draft-Year Boost ─────────────────────
  const MAX_WEIGHT = 100;
  function computeWeight(p) {
  const CURRENT_YEAR = new Date().getFullYear();
  const age = CURRENT_YEAR - p.draftYear;

  // base bump for very recent players
  const baseValue = p.value + (p.draftYear >= 2023 ? 15 : 0);

  // age‐tiered multiplier (more aggressive for rookies/young vets)
  let tierBoost;
  if      (p.draftYear >= 2024) tierBoost = 4.0;  // huge rookie boost
  else if (p.draftYear >= 2022) tierBoost = 3.0;
  else if (p.draftYear >= 2018) tierBoost = 2.5;
  else if (p.draftYear >= 2015) tierBoost = 1.5;
  else                           tierBoost = 1.0;  // minimal for older vets

  // penalize true veterans (older than 7 years)
  const vetPenalty = age >= 7 ? 0.4 : 1.0;

  return Math.min(baseValue * tierBoost * vetPenalty, MAX_WEIGHT);
}

  // ─── Utility: Flat Recency Boost ─────────────────
  function recencyBoost(draftYear) {
    const CURRENT_YEAR = new Date().getFullYear();
    const age = CURRENT_YEAR - draftYear;
    if (age === 1) return 30;   // 2024
    if (age === 2) return 25;   // 2023
    if (age === 3) return 20;   // 2022
    if (age === 4) return 15;   // 2021
    if (age === 5) return 10;   // 2020
    return 0;                   // 2019 and older
  }

  // ─── Utility: Cooldown Pick ───────────────────────
  function pickWithCooldown(arr, recentArr) {
    const choices = arr.filter(i => !recentArr.includes(i));
    const pool    = choices.length ? choices : arr;
    const pick    = pool[Math.floor(Math.random()*pool.length)];
    recentArr.push(pick);
    if (recentArr.length > 5) recentArr.shift();
    return pick;
  }

  // ─── CSV Parsers ──────────────────────────────────
  function parseCSVtoObject(csv) {
    return csv.trim().split(/\r?\n/).slice(1).reduce((map,line)=>{
      const cols = line.split(',').map(s=>s.trim());
      const key = normalizeCollegeString(cols.shift());
      if (!key) return map;
      map[key] = cols.map(a=>normalizeCollegeString(a)).filter(a=>a);
      return map;
    }, {});
  }
  function parsePlayersCSV(csv) {
  return csv.trim().split(/\r?\n/).slice(1).reduce((o, line) => {
    const p = line.split(',');
    if (p.length < 10) return o;
    const [dy, rnd, , , name, pos, c1, c2, c3, val] = p;
    const draftYear = parseInt(dy, 10);
    const round     = parseInt(rnd, 10);
    const value     = val.trim() === '' ? 0 : parseFloat(val);
    if (!isNaN(draftYear) && !isNaN(round) && name && pos && c1) {
      // 1) Gather and normalize *all* non-empty college strings:
      const colleges = [c1, c2, c3]
        .filter(s => s && s.trim())                // drop blanks
        .map(s => normalizeCollegeString(s))        // normalize formatting
        .filter(s => s);                            // drop any still-empty

      // 2) Attach both the array *and* the primary college:
      o[name] = {
        draftYear,
        round,
        position: pos,
        colleges,                                   // <-- full list
        college: colleges[0],                       // <-- primary for fallbacks
        value
      };
    }
    return o;
  }, {});
}


  // ─── Normalize & Alias Check ──────────────────────
  function normalizeCollegeString(s) {
    let str = s.replace(/[^\w\s]/g,'').toLowerCase().trim();
    if (str.startsWith('university of ')) str = str.slice(14);
    if (str.startsWith('college of '))    str = str.slice(11);
    const toks = str.split(/\s+/);
    const last = toks[toks.length - 1];
    if (last==='st'||last==='st.') toks[toks.length - 1] = 'state';
    str = toks.join(' ');
    if (str.endsWith(' university')) {
      const tmp = str.slice(0,-11).trim();
      if (tmp.split(/\s+/).length>1) str = tmp;
    }
    return str;
  }
  function isCollegeAnswerCorrect(ans, correct) {
    const a = normalizeCollegeString(ans);
    const c = normalizeCollegeString(correct);
    if (a === c) return true;
    return (collegeAliases[c] || []).includes(a);
  }

  // ─── Typing Indicator & AI Bubble ─────────────────
  function showTypingIndicator(cb) {
    const ind = document.createElement('div');
    ind.className = 'message ai typing-indicator';
    ind.textContent = 'ₒ';
    chatContainer.appendChild(ind);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    let count = 1, max = 3;
    const dotTimer = setInterval(()=>{
      count++;
      ind.textContent = 'ₒ '.repeat(count).trim();
      if (count>=max) clearInterval(dotTimer);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 100);
    setTimeout(()=>{
      clearInterval(dotTimer);
      ind.remove();
      cb();
    }, max*100 + 100);
  }
  function addAIMessage(txt, cb) {
    clearTimer();
    showTypingIndicator(()=>{
      addMessage(txt, 'ai');
      if (gameActive && txt.includes(currentNFLPlayer)) startTimer();
      if (cb) cb();
    });
  }

  // ─── Chat Bubble & Score UI ──────────────────────
  function addMessage(txt, cls) {
    const d = document.createElement('div');
    d.className = `message ${cls}`;
    d.textContent = txt;
    chatContainer.appendChild(d);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function updateScore() {
    scoreDisplay.textContent = score;
  }
  function showPlusOne() {
    const bonus = mode==='choice' ? 5 : 10;
    plusOneEl.textContent = `+${bonus}`;
    plusOneEl.classList.add('show');
    setTimeout(()=> plusOneEl.classList.remove('show'), 600);
  }

  // ─── Timer ────────────────────────────────────────
  function startTimer() {
  // clear whatever was running
  clearTimer();

  // choose duration based on mode
  const DURATION = mode === 'choice'
    ? 5500   // 5.5s for Choice Mode
    : 8000;  // 8s for Legend Mode

  _timerDeadline = Date.now() + DURATION;

  // 1) Schedule the actual Game Over at the deadline.
  _timerTimeout = setTimeout(() => {
    gameOver("Time's up! Game Over!");
  }, DURATION);

  // 2) Kick off a quick UI‐update loop to move & recolor the blue bar.
  _timerInterval = setInterval(() => {
    const remaining = Math.max(0, _timerDeadline - Date.now());
    const pct       = (remaining / DURATION) * 100;
    timerBar.style.width            = pct + '%';
    timerBar.style.backgroundColor  =
      pct > 60 ? 'var(--blue)'
    : pct > 30 ? 'orange'
    :             'red';

    // once we're at zero we can clear early
    if (remaining <= 0) clearTimer();
  }, 100);
}

// sibling, not nested in startTimer:
function clearTimer() {
  if (_timerTimeout   !== null) { clearTimeout(_timerTimeout);   _timerTimeout   = null; }
  if (_timerInterval  !== null) { clearInterval(_timerInterval); _timerInterval  = null; }
  timerBar.style.width           = '0%';
  timerBar.style.backgroundColor = 'var(--blue)';
}
  // ─── Data Loading ─────────────────────────────────
  let dataLoaded = 0;
  function tryStart() {
    if (++dataLoaded === 3) {
      startButton.disabled = false;
    }
  }
  startButton.disabled = true;
  fetch('dialogue.json').then(r=>r.json()).then(d=>{ dialogueBuckets = d; tryStart(); });
  fetch('college_aliases.csv').then(r=>r.text()).then(t=>{ collegeAliases = parseCSVtoObject(t); tryStart(); });
  fetch('players.csv').then(r=>r.text()).then(t=>{ nflToCollege = parsePlayersCSV(t); tryStart(); });

  // ─── Mode Toggle Button ───────────────────────────
  const modeBtn = document.createElement('button');
  modeBtn.id = 'toggle-mode';
  modeBtn.style.marginTop = '10px';
  modeBtn.addEventListener('click', () => {
    mode = mode==='legend' ? 'choice' : 'legend';
    localStorage.setItem('gameMode', mode);
    modeBtn.textContent = mode==='legend'
      ? 'Switch to Multiple Choice'
      : 'Switch to Legend Mode';
    restartGame();
  });
  gameOverButtons.appendChild(modeBtn);

  // ─── Game Over & Tips ─────────────────────────────
  function gameOver(msg) {
  gameActive = false;
  clearTimer();

  // 1) update the overlay text
  gameOverMsg.textContent = msg;
  document.getElementById('final-score').textContent = `Your score: ${score}`;

  // 2) show AI announcing the loss if you still want that
  addAIMessage(msg);

  // 3) reveal the Game-Over UI
  gameOverButtons.style.display = 'flex';
  gameOverOverlay.style.display = 'flex';
  inputForm.style.display       = 'none';
  binaryChoices.style.display   = 'none';
  if (choiceContainer) choiceContainer.style.display = 'none';

  tipContainer.textContent = 'Tip: ' + tips[Math.floor(Math.random()*tips.length)];

  modeBtn.textContent = mode==='legend'
    ? 'Switch to Multiple Choice'
    : 'Switch to Legend Mode';
}

  // ─── Restart ──────────────────────────────────────
  restartBtn.addEventListener('click', restartGame);
  function restartGame() {
    clearTimer();
    phase             = 'easy';
    currentNFLPlayer  = '';
    score             = 0;
    recentPlayers     = [];
    gameActive        = true;
    easyRounds        = 0;
    normalRoundsCount = 0;
    recentSchools     = [];
    binaryModeActive  = false;
    binaryRoundCount  = 0;
    correctStreak     = 0;
    updateScore();
    chatContainer.innerHTML = '';
    userInput.value         = '';
// — Restore the main buttons —
    submitScoreBtn.style.display  = '';
    shareScoreBtn.style.display   = '';
    restartBtn.style.display      = '';
    modeBtn.style.display         = '';


    inputForm.style.display = 'flex';
    gameOverOverlay.style.display = 'none';
    startIntro();
  }

  // ─── Share / Leaderboard Hooks (unchanged) ───────
  submitScoreBtn.addEventListener('click', ()=>{
    submitScoreBtn.style.display = 'none';
    usernameForm.style.display   = 'block';
  });
  shareScoreBtn.addEventListener('click', ()=>{
    const last = currentNFLPlayer || '…';
    const txt  = `Lost on ${last} , see if you can beat ${score} at WhosU.co`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt)
        .then(()=> showToast('Copied to clipboard!'))
        .catch(()=> showToast('Copy failed'));
    } else {
      showToast(`Share: ${txt}`);
    }
  });
  usernameSubmit.addEventListener('click', ()=>{
    const u = usernameInput.value.trim();
    if (!u) return alert('Enter username.');
    db.collection('highScores').add({
      username: u,
      score,
      mode,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(showLeaderboard)
      .catch(e=>{ console.error(e); alert('Submit failed.'); });
  });
  leaderboardRestart.addEventListener('click', ()=>{
    leaderboardCont.style.display = 'none';
    usernameInput.value = '';
    restartGame();
  });
  function showLeaderboard() {
  usernameForm.style.display    = 'none';
  leaderboardCont.style.display = 'block';
  leaderboardList.innerHTML     = '';

  // dynamically update the heading
  const heading = mode === 'choice'
    ? 'Multi-Choice Leaderboard (Top 20)'
    : 'Legend Mode Leaderboard (Top 20)';
  document.querySelector('#leaderboard-container h3').textContent = heading;

  db.collection('highScores')
    .where('mode', '==', mode)          // ← only pull this mode
    .orderBy('score', 'desc')
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

   // ─── Intro Sequence ──────────────────────────────
  function startIntro() {
  // decide which bucket to use
  const bucketName = _hasIntroduced ? 'restart' : 'greetings';
  const bucket = dialogueBuckets[bucketName] || [];

  // fallback default lines
  const defaults = {
    greetings: ["you and I have to take an oath 🤝"],
    restart:   ["Alright, back at it!"]
  };

  // pick one line at random (or default if bucket empty)
  const lines = bucket.length ? bucket : defaults[bucketName];
  const line  = lines[Math.floor(Math.random() * lines.length)];

  // mark that we’ve now introduced once
  _hasIntroduced = true;

  // show the single line, then go straight into the first round
  addAIMessage(line, startEasyRound);
}

  // ─── ROUND STARTERS ───────────────────────────────
  function startEasyRound() {
  phase = 'easy';
  const candidates = easyNames
    .filter(n => nflToCollege[n])
    .filter(n => {
      const c = normalizeCollegeString(nflToCollege[n].college);
      return !recentSchools.includes(c);
    })                                   // ← close this filter…
    .filter(n => !recentPlayers.includes(n)); // ← …then filter out seen players

  if (!candidates.length) return gameOver("No eligible easy players.");
  currentNFLPlayer = candidates[Math.floor(Math.random() * candidates.length)];
  recentPlayers.push(currentNFLPlayer);
  holdPlayerAndAsk();
  easyRounds++;
}

  function startTriviaRound() {
  phase = 'trivia';
  const CURRENT_YEAR      = new Date().getFullYear();
 // Base filters with dynamic, draft-year thresholds
     let base = Object.keys(nflToCollege)
       .filter(n => !easyNames.includes(n))
       .filter(n => {
         const p       = nflToCollege[n];
         const boosted = p.value + recencyBoost(p.draftYear);
 
         // pick your threshold by draft year
         let threshold;
         if (p.draftYear >= CURRENT_YEAR - 1) {
           // 2024 rookies get the lowest bar
           threshold = 15;
         } else if (p.draftYear >= 2016) {
           // 2016–2023 vets get a medium bar
           threshold = 25;
         } else {
           // pre-2016 vets need a higher bar
           threshold = 35;
         }
 
         return p.round <= 4
             && ['QB','RB','WR'].includes(p.position.toUpperCase())
             && boosted >= threshold;
       })
       .filter(n => {
         const c = normalizeCollegeString(nflToCollege[n].college);
         return !recentSchools.includes(c);
       });

  if (!base.length) return gameOver("No eligible players.");

  const items = base.map(name => {
    const p = nflToCollege[name];
    return { name, weight: computeWeight(p) };
  });
  currentNFLPlayer = weightedRandomPick(items);
  recentPlayers.push(currentNFLPlayer);
  holdPlayerAndAsk();
}

  function startTriviaRoundFiltered(choice) {
    phase = 'binary';
    const CURRENT_YEAR      = new Date().getFullYear();
    const MAX_AGE           = 7;
    const MIN_VALUE_FOR_OLD = 40;

    let base = Object.keys(nflToCollege).filter(n=>!easyNames.includes(n));
    if (choice==='tough') {
      base = base.filter(n=>{
        const p = nflToCollege[n];
        return p.round>=2 && p.round<=7
            && ['QB','RB','WR'].includes(p.position.toUpperCase())
            && p.value>=10 && p.value<=20;
      });
    } else {
      const defPos = ['DE','DT','DL','LB','OLB','ILB','CB','S'];
      base = base.filter(n=>{
        const p = nflToCollege[n];
        return defPos.includes(p.position.toUpperCase()) && p.value>=60;
      });
    }

    base = base.filter(n=>{
      const c = normalizeCollegeString(nflToCollege[n].college);
      return !recentSchools.includes(c);
    });

    // Prune old & under-value after boost
    base = base.filter(name => {
      const p = nflToCollege[name];
      const age = CURRENT_YEAR - p.draftYear;
      const boostedValue = p.value + recencyBoost(p.draftYear);
      if (age >= MAX_AGE && boostedValue < MIN_VALUE_FOR_OLD) return false;
      return true;
    });
    base = base.filter(n => !recentPlayers.includes(n));

    if (!base.length) {
      addAIMessage("Can't think of anyone, let's keep going");
      return setTimeout(startTriviaRound,1500);
    }

    // Weighted pick
    const items = base.map(name => {
    const p = nflToCollege[name];
    return { name, weight: computeWeight(p) };
  });
    currentNFLPlayer = weightedRandomPick(items);
    recentPlayers.push(currentNFLPlayer);        // ← mark seen
    binaryRoundCount--;
    holdPlayerAndAsk();
  }

  // ─── Shared “ask” logic ───────────────────────────
  function holdPlayerAndAsk() {
    ensureChoiceContainer();
    inputForm.style.display      = 'none';
    binaryChoices.style.display  = 'none';
    choiceContainer.style.display = 'none';

    const colNorm = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(colNorm);
    if (recentSchools.length > 7) recentSchools.shift();

    const tmpl     = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions);
    const question = tmpl.replace('XXXXX', currentNFLPlayer);

    if (mode === 'legend') {
      inputForm.style.display = 'flex';
      addAIMessage(question);
    } else {
      presentMultipleChoice(question);
    }
  }

  // ─── Multiple-Choice UI ───────────────────────────
  function presentMultipleChoice(question) {
  addAIMessage(question, () => {
    ensureChoiceContainer();
    inputForm.style.display = 'none';
    choiceContainer.innerHTML = '';

    // raw correct answer from your data
    const correctRaw  = nflToCollege[currentNFLPlayer].college;
    const correctNorm = normalizeCollegeString(correctRaw);

    // 1) try static decoys first (by normalized mismatch)
    let pool = decoyList.filter(s =>
      normalizeCollegeString(s) !== correctNorm
    );

    // 2) fallback if not enough static decoys
    if (pool.length < 2) {
      pool = Array.from(
        new Set(Object.values(nflToCollege).map(p => p.college))
      )
      .filter(c => normalizeCollegeString(c) !== correctNorm);
    }

    // 3) pick exactly two *distinct* decoys
    const decoys = [];
    while (decoys.length < 2 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      decoys.push(pool.splice(i,1)[0]);
    }

    // 4) mix + render, using Title Case for everything
    const options = [correctRaw, ...decoys]
      .sort(() => Math.random() - 0.5);

    options.forEach(optRaw => {
      const btn = document.createElement('button');
      btn.textContent = formatCollegeName(optRaw);
      btn.style.margin = '5px';
      btn.addEventListener('click', () => {
        choiceContainer.style.display = 'none';
        handleAnswer(optRaw);
      });
      choiceContainer.appendChild(btn);
    });

    choiceContainer.style.display = 'block';

    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}


  // ─── Answer Handler ──────────────────────────────
  function handleAnswer(ans) {
  clearTimer();
  addMessage(ans, 'user');

  // 1) pull the array of possible schools
  const info = nflToCollege[currentNFLPlayer];
  const cols = info.colleges || [info.college];

  // 2) see if the guess matches any of them
  const idx = cols.findIndex(c => isCollegeAnswerCorrect(ans, c));
  if (idx >= 0) {
    // choose different compliments for transfers
    const pool = idx === 0
      ? dialogueBuckets.confirmations
      : dialogueBuckets.transferCompliments;
    const recentPool = idx === 0
      ? recentConfirmations
      : recentTransferCompliments;
    const resp = pickWithCooldown(pool || ['Nice!'], recentPool);

    addAIMessage(resp, () => {
      // scoring
      score += (mode === 'choice' ? 5 : 10);
      updateScore();
      showPlusOne();

      // next round routing (unchanged)
      if (phase === 'easy') {
        if (easyRounds < 3) startEasyRound();
        else {
          phase = 'trivia';
          startTriviaRound();
        }
      } else if (phase === 'trivia') {
        if (++normalRoundsCount >= 3) askNextQuestion();
        else startTriviaRound();
      } else {
        if (binaryModeActive && binaryRoundCount > 0) showBinaryChoices();
        else {
          binaryModeActive = false;
          startTriviaRound();
        }
      }
    });
  } else {
    // completely wrong—always reveal the primary college (cols[0])
    gameOver(`Nah, ${currentNFLPlayer} played at ${toTitleCase(cols[0])}. Better luck next time!`);
  }
}

  // ─── Next / Binary Trigger ───────────────────────
  function askNextQuestion() {
    addAIMessage(
      dialogueBuckets.transitions?.[0] || "What's next?",
      () => {
        binaryModeActive = true;
        binaryRoundCount = 1;
        normalRoundsCount = 0;
        showBinaryChoices();
      }
    );
  }

  // ─── Binary Choices Hooks ─────────────────────────
  choiceTough.onclick   = ()=> { addMessage('Hit me with a tough one','user'); hideBinaryChoices(); startTriviaRoundFiltered('tough'); };
  choiceDefense.onclick = ()=> { addMessage('Go defense','user'); hideBinaryChoices(); startTriviaRoundFiltered('defense'); };

  // ─── Typing helper for share feedback ─────────────
  function showToast(msg, d=1500) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(()=> toastEl.classList.remove('show'), d);
  }

  // ─── Final hooking of Start Button ───────────────
  startButton.onclick = () => {
    if (startButton.disabled) return;
    startScreen.style.display   = 'none';
    gameContainer.style.display = 'flex';
    updateScore();
    startIntro();
  };
});
