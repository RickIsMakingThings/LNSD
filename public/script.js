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
    "Try abbreviations (e.g. 'Bama' for Alabama).",
    "Focus on the position—WRs often go to SEC schools.",
    "Late-round rookies might be tougher than veterans.",
    "Watch for back-to-back players from the same school.",
    "Think geographic—West vs East Coast.",
    "Dual-threat QBs often come from smaller programs.",
    "Speedy RBs are sometimes late-round picks.",
    "Transfers can throw you off—use aliases if needed.",
    "Big-school receivers tend to be drafted earlier.",
    "Keep an eye on recent draftees for extra points."
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
  let timerInterval;

 // Cooldown pools for question/dialogue reuse
const recentQuestions           = [];
const recentConfirmations       = [];
const recentBigCompliments      = [];
const recentTransferCompliments = [];

  // ─── DOM Refs ──────────────────────────────────────
  const startScreen       = document.getElementById('start-screen');
  const startButton       = document.getElementById('start-button');
  const gameContainer = document.getElementById('game-container');
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
    const baseValue = p.value + ((p.draftYear||0) >= 2023 ? 10 : 0);
    let boost;
    if      (p.draftYear >= 2024) boost = 3.0;
    else if (p.draftYear >= 2022) boost = 2.5;
    else if (p.draftYear >= 2018) boost = 2.0;
    else                           boost = 0.4;
    return Math.min(baseValue * boost, MAX_WEIGHT);
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
    // we expect at least: year, round, ??, ??, name, position, college, ... , value
    if (p.length < 10) return o;
    const [dy, rnd, , , name, pos, c1, c2, c3, val] = p;
    const draftYear = parseInt(dy, 10);
    const round     = parseInt(rnd,10);
    const value     = val.trim()==='' ? 0 : parseFloat(val);
    if (!isNaN(draftYear) && !isNaN(round) && name && pos && c1) {
      o[name] = {
        draftYear,
        round,
        position: pos,
        college: c1,    // first college column
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
    clearTimer();
    let t = 7;
    timerBar.style.width = '100%';
    timerInterval = setInterval(()=>{
      t -= 0.1;
      timerBar.style.width = `${(t/7)*100}%`;
      if (t<=0) {
        clearInterval(timerInterval);
        gameOver("Time's up! Game Over!");
      }
    },100);
  }
  function clearTimer() {
    clearInterval(timerInterval);
    timerBar.style.width = '0%';
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
      ? 'Switch to Choice Mode'
      : 'Switch to Legend Mode';
    restartGame();
  });
  gameOverButtons.appendChild(modeBtn);

  // ─── Game Over & Tips ─────────────────────────────
  function gameOver(msg) {
    gameActive = false;
    clearTimer();
    addAIMessage(msg);
    gameOverMsg.textContent = msg;
    gameOverOverlay.style.display = 'flex';
    inputForm.style.display       = 'none';
    binaryChoices.style.display   = 'none';
    if (choiceContainer) choiceContainer.style.display = 'none';

    // Tip
    tipContainer.textContent = 'Tip: ' + tips[Math.floor(Math.random()*tips.length)];

    // Update mode button label
    modeBtn.textContent = mode==='legend'
      ? 'Switch to Choice Mode'
      : 'Switch to Legend Mode';
  }

  // ─── Restart ──────────────────────────────────────
  restartBtn.addEventListener('click', restartGame);

  function restartGame() {
    clearTimer();
    phase             = 'easy';
    currentNFLPlayer  = '';
    score             = 0;
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
    inputForm.style.display = 'flex';
    gameOverOverlay.style.display = 'none';

    startIntro();
  }

  // ─── Share / Leaderboard Hooks (unchanged) ───────
  submitScoreBtn.addEventListener('click', ()=>{
    submitScoreBtn.style.display = 'none';
    usernameForm.style.display   = 'block';
  });
  shareScoreBtn.addEventListener('click', () => {
    const txt = `Lost on ${currentNFLPlayer} but I got ${score}`;
    navigator.clipboard.writeText(txt)
      .then(()=> showToast('Copied to clipboard!'))
      .catch(()=> showToast('Copy failed'));
  });

  // ... (usernameSubmit, leaderboardRestart, showLeaderboard same as before) ...

  // ─── Intro Sequence ──────────────────────────────
  function startIntro() {
    addAIMessage(
      dialogueBuckets.greetings?.[0] || "you and I have to take an oath 🤝",
      () => addAIMessage(
        dialogueBuckets.greetings?.[1] || "no googling",
        () => {
          addAIMessage("We can start with some easy ones.");
          startEasyRound();
        }
      )
    );
  }

  // ─── ROUND STARTERS ───────────────────────────────
  function startEasyRound() {
    phase = 'easy';
    const candidates = easyNames
      .filter(n=>nflToCollege[n])
      .filter(n=>{
        const c = normalizeCollegeString(nflToCollege[n].college);
        return !recentSchools.includes(c);
      });
    if (!candidates.length) return gameOver("No eligible easy players.");
    currentNFLPlayer = candidates[Math.floor(Math.random()*candidates.length)];
    holdPlayerAndAsk();
    easyRounds++;
    if (easyRounds >= 3) {
      setTimeout(()=>{ phase='trivia'; startTriviaRound(); }, 1500);
    }
  }

  function startTriviaRound() {
    phase = 'trivia';
    const base = Object.keys(nflToCollege)
      .filter(n=>!easyNames.includes(n))
      .filter(n=>{
        const info = nflToCollege[n];
        return info.round <= 4
            && ['QB','RB','WR','TE'].includes(info.position.toUpperCase())
            && info.value >= 20;
      })
      .filter(n=>{
        const c = normalizeCollegeString(nflToCollege[n].college);
        return !recentSchools.includes(c);
      });
    if (!base.length) return gameOver("No eligible players.");
    currentNFLPlayer = base[Math.floor(Math.random()*base.length)];
    holdPlayerAndAsk();
  }

  function startTriviaRoundFiltered(choice) {
    phase = 'binary';
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
    if (!base.length) {
      addAIMessage("Can't think of anyone, let's keep going");
      return setTimeout(startTriviaRound,1500);
    }
    currentNFLPlayer = base[Math.floor(Math.random()*base.length)];
    binaryRoundCount--;
    holdPlayerAndAsk();
  }

  // ─── Shared “ask” logic ───────────────────────────
  function holdPlayerAndAsk() {
    // register school
    const colNorm = normalizeCollegeString(nflToCollege[currentNFLPlayer].college);
    recentSchools.push(colNorm);
    if (recentSchools.length > 7) recentSchools.shift();

    // pick question
    const tmpl = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions);
    const question = tmpl.replace('XXXXX', currentNFLPlayer);
    if (mode === 'legend') {
      inputForm.style.display = 'flex';
      ensureChoiceContainer();
      choiceContainer.style.display = 'none';
      addAIMessage(question);
    } else {
      // choice mode
      inputForm.style.display = 'none';
      presentMultipleChoice(question);
    }
  }

  // ─── Multiple-Choice UI ───────────────────────────
  function presentMultipleChoice(question) {
    addAIMessage(question);
    ensureChoiceContainer();
    choiceContainer.innerHTML = '';
    // gather all unique college names
    const allCols = Array.from(new Set(
      Object.values(nflToCollege).map(p=>p.college)
    ));
    const correct = nflToCollege[currentNFLPlayer].college;
    // pick 2 random decoys
    const decoys = [];
    while(decoys.length < 2) {
      const pick = allCols[Math.floor(Math.random()*allCols.length)];
      if (pick !== correct && !decoys.includes(pick)) decoys.push(pick);
    }
    const options = [correct, ...decoys].sort(()=>Math.random()-0.5);
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.style.margin = '5px';
      btn.onclick = () => {
        choiceContainer.style.display = 'none';
        handleAnswer(opt);
      };
      choiceContainer.appendChild(btn);
    });
    choiceContainer.style.display = 'block';
  }

  // ─── Answer Handler ──────────────────────────────
  function handleAnswer(ans) {
    clearTimer();
    addMessage(ans, 'user');
    const correctCol = nflToCollege[currentNFLPlayer].college;
    if (isCollegeAnswerCorrect(ans, correctCol)) {
      const resp = pickWithCooldown(dialogueBuckets.confirmations||['Nice!'], recentConfirmations);
      addAIMessage(resp, ()=> {
        // scoring
        score += (mode==='choice'?5:10);
        updateScore();
        showPlusOne();
        // next round
        if (phase==='easy') {
          if (easyRounds<3) startEasyRound();
          else {
            phase='trivia';
            startTriviaRound();
          }
        } else if (phase==='trivia') {
          if (++normalRoundsCount >= 3) askNextQuestion();
          else startTriviaRound();
        } else {
          if (binaryModeActive && binaryRoundCount>0) showBinaryChoices();
          else {
            binaryModeActive = false;
            startTriviaRound();
          }
        }
      });
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${correctCol}. Better luck next time!`);
    }
  }

  // ─── Next / Binary Trigger ───────────────────────
  function askNextQuestion() {
    addAIMessage(dialogueBuckets.transitions?.[0] || "What's next?", ()=> {
      if (++correctStreak >= 4) {
        binaryModeActive = true;
        binaryRoundCount = 3;
        correctStreak = 0;
        showBinaryChoices();
      } else {
        startTriviaRound();
      }
    });
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
