document.addEventListener('DOMContentLoaded', function() {
  // ─── Mobile Snappiness via Visual Viewport API ───
  const gameContainer = document.getElementById('game-container');
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

  // ─── Flags & State ─────────────────────────────────
  let loadedData        = false;
  let userStarted       = false;
  let gameStarted       = false;
  let gameActive        = true;

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

  const COOLDOWN = 5;
  const recentQuestions           = [];
  const recentConfirmations       = [];
  const recentBigCompliments      = [];
  const recentTransferCompliments = [];

  // ─── Firebase / Leaderboard Setup ─────────────────
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

  // ─── Utility: Draft‑Year Boost ─────────────────────
  const MAX_WEIGHT = 100;
  function computeWeight(p) {
    let boost;
    if (p.draftYear >= 2024)      boost = 3.0;
    else if (p.draftYear >= 2022) boost = 2.5;
    else if (p.draftYear >= 2018) boost = 2.0;
    else                           boost = 0.4;
    return Math.min(p.value * boost, MAX_WEIGHT);
  }

  // ─── Utility: Pick With Cooldown ──────────────────
  function pickWithCooldown(arr, recentArr) {
    const choices = arr.filter(item => !recentArr.includes(item));
    const pool    = choices.length ? choices : arr;
    const pick    = pool[Math.floor(Math.random() * pool.length)];
    recentArr.push(pick);
    if (recentArr.length > COOLDOWN) recentArr.shift();
    return pick;
  }

  // ─── DOM References ────────────────────────────────
  const startScreen     = document.getElementById('start-screen');
  const startButton     = document.getElementById('start-button');
  const chatContainer   = document.getElementById('chat-container');
  const inputForm       = document.getElementById('input-form');
  const userInput       = document.getElementById('user-input');
  const scoreDisplay    = document.getElementById('score-display'); // now just the number
  const timerBar        = document.getElementById('timer-bar');
  const binaryChoices   = document.getElementById('binary-choices');
  const choiceTough     = document.getElementById('choice-tough');
  const choiceDefense   = document.getElementById('choice-defense');
  const gameOverOverlay = document.getElementById('game-over');
  const gameOverMsg     = document.getElementById('game-over-msg');
  const gameOverButtons = document.getElementById('game-over-buttons');
  const submitScoreBtn  = document.getElementById('submit-score');
  const restartBtn      = document.getElementById('restart');
  const usernameForm    = document.getElementById('username-form');
  const usernameInput   = document.getElementById('username-input');
  const usernameSubmit  = document.getElementById('username-submit');
  const leaderboardCont = document.getElementById('leaderboard-container');
  const leaderboardList = document.getElementById('leaderboard');
  const leaderboardRestart = document.getElementById('leaderboard-restart');

  // ─── CSV Parsing Helpers ──────────────────────────
  function parseCSVtoObject(csv) {
    return csv.trim().split(/\r?\n/).slice(1).reduce((map,line) => {
      const cols = line.split(',').map(s=>s.trim());
      const keyRaw = cols.shift();
      if (!keyRaw) return map;
      const key = normalizeCollegeString(keyRaw);
      map[key] = cols.map(a=>normalizeCollegeString(a)).filter(a=>a);
      return map;
    }, {});
  }
  function parsePlayersCSV(csv) {
    return csv.trim().split(/\r?\n/).slice(1).reduce((o,line) => {
      const p = line.split(',');
      if (p.length<10) return o;
      const [dy, rnd, , , name, pos, c1, c2, c3, val] = p;
      const draftYear = parseInt(dy,10),
            round     = parseInt(rnd,10),
            value     = val.trim()===''?0:parseFloat(val);
      if (!isNaN(draftYear)&&!isNaN(round)&&name&&pos&&c1) {
        o[name] = { draftYear, round, position:pos,
                    colleges:[c1,c2,c3].filter(c=>c),
                    value };
      }
      return o;
    }, {});
  }

  // ─── Fetch Data & Try Start ───────────────────────
  function tryStartGame() {
    if (loadedData && userStarted && !gameStarted) {
      gameStarted = true;
      startIntro();
    }
  }
  startButton.addEventListener('click', () => {
    userStarted = true;
    startScreen.style.display = 'none';
    tryStartGame();
  });
  fetch('dialogue.json').then(r=>r.json()).then(d=>{
    dialogueBuckets = d;
    tryStartGame();
  });
  fetch('college_aliases.csv').then(r=>r.text()).then(t=>{
    collegeAliases = parseCSVtoObject(t);
  });
  fetch('players.csv').then(r=>r.text()).then(t=>{
    nflToCollege = parsePlayersCSV(t);
    loadedData = true;
    tryStartGame();
  });

  // ─── Timer ────────────────────────────────────────
  function startTimer() {
    clearTimer();
    timerBar.style.transition = 'none';
    timerBar.style.width = '100%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width 0.1s linear';
    let t = 9;
    timerInterval = setInterval(()=>{
      t -= 0.1;
      timerBar.style.width = `${(t/9)*100}%`;
      if (t<=0) {
        clearTimer();
        gameOver("Time's up! Game Over!");
      }
    },100);
  }
  function clearTimer() {
    clearInterval(timerInterval);
    timerBar.style.transition = 'none';
    timerBar.style.width = '0%';
    void timerBar.offsetWidth;
    timerBar.style.transition = 'width 0.1s linear';
  }

  // ─── UI Helpers ───────────────────────────────────
  function addMessage(txt, cls) {
    const d = document.createElement('div');
    d.classList.add('message', cls);
    d.textContent = txt;
    chatContainer.appendChild(d);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function updateScore() {
    scoreDisplay.textContent = score;  // now just the number
  }

  // ─── Normalize & Check ────────────────────────────
  function normalizeCollegeString(str) {
    let s = str.replace(/[^\w\s&]/gi,'').toLowerCase().trim();
    if (s.startsWith('university of ')) s=s.slice(14);
    if (s.startsWith('college of '))    s=s.slice(11);
    const toks = s.split(/\s+/);
    const last = toks[toks.length-1];
    if (last==='st'||last==='st.') toks[toks.length-1]='state';
    s = toks.join(' ');
    if (s.endsWith(' university')) {
      const tmp = s.slice(0,-11).trim();
      if (tmp.split(/\s+/).length>1) s=tmp;
    }
    return s;
  }
  function isCollegeAnswerCorrect(ans,correct) {
    const a = normalizeCollegeString(ans),
          c = normalizeCollegeString(correct);
    return a===c || (collegeAliases[c]||[]).includes(a);
  }

  // ─── Typing/Cross‑fade & AI Messaging ─────────────
  function showTypingIndicator(txt, cb, step=200) {
    const ind  = document.createElement('div');
    ind.classList.add('message','ai','typing-indicator');
    chatContainer.appendChild(ind);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    const real = document.createElement('div');
    real.classList.add('message','ai');
    real.style.opacity = '0';
    chatContainer.appendChild(real);

    let count=1, max=3;
    ind.textContent = 'ₒ';
    const dotTimer = setInterval(()=>{
      count++;
      ind.textContent = 'ₒ '.repeat(count).trim();
      if (count>=max) clearInterval(dotTimer);
    }, step);

    setTimeout(()=>{
      clearInterval(dotTimer);
      real.textContent = txt;
      ind.style.transition = 'opacity 150ms ease-in';
      real.style.transition = 'opacity 150ms ease-out';
      ind.style.opacity = '0';
      real.style.opacity = '1';
      setTimeout(()=>{
        if(ind.parentNode) ind.parentNode.removeChild(ind);
        if (gameActive && currentNFLPlayer && txt.includes(currentNFLPlayer)) {
          startTimer();
        }
        cb();
      },150);
    }, step*max + 50);
  }
  function addAIMessage(txt,onDone) {
    clearTimer();
    showTypingIndicator(txt, onDone);
  }

  // ─── Game Over & Leaderboard ──────────────────────
  function gameOver(msg) {
    gameActive = false; clearTimer();
    addAIMessage(msg);
    gameOverMsg.textContent = msg;
    gameOverOverlay.style.display = 'flex';
    gameOverButtons.style.display = 'block';
    usernameForm.style.display = 'none';
    leaderboardCont.style.display = 'none';
    inputForm.style.display = 'none';
  }
  restartBtn.addEventListener('click', restartGame);
  submitScoreBtn.addEventListener('click', ()=>{
    gameOverButtons.style.display = 'none';
    usernameForm.style.display    = 'block';
  });
  usernameSubmit.addEventListener('click', ()=>{
    const uname = usernameInput.value.trim();
    if (!uname) return alert('Enter username.');
    db.collection('highScores').add({
      username: uname,
      score,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(showLeaderboard)
      .catch(e=>{console.error(e);alert('Submit failed.')});
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
    db.collection('highScores')
      .orderBy('score','desc').limit(20)
      .get().then(snap=>{
        if (snap.empty) leaderboardList.innerHTML = '<li>No scores yet.</li>';
        else snap.forEach(doc=>{
          const {username,score} = doc.data();
          const li = document.createElement('li');
          li.textContent = `${username}: ${score}`;
          leaderboardList.appendChild(li);
        });
      }).catch(e=>{
        console.error(e);
        leaderboardList.innerHTML = '<li>Unable to load leaderboard.</li>';
      });
  }

  // ─── Restart Game ─────────────────────────────────
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
    chatContainer.innerHTML = '';
    userInput.value         = '';
    inputForm.style.display       = 'block';
    gameOverOverlay.style.display = 'none';
    gameOverButtons.style.display = 'none';
    usernameForm.style.display    = 'none';
    leaderboardCont.style.display = 'none';
    startIntro();
  }

  // ─── Intro Sequence ──────────────────────────────
  function startIntro() {
    addAIMessage(
      dialogueBuckets.greetings?.[0] || "you and I have to take an oath 🤝",
      ()=> addAIMessage(
        dialogueBuckets.greetings?.[1] || "no googling",
        ()=> addAIMessage(
          "We can start with some easy ones.",
          startEasyRound
        )
      )
    );
  }

  // ─── … rest of your rounds & handlers (unchanged) …
});

  // ─── Easy Round ───────────────────────────────────
  function startEasyRound() {
    if (!gameActive) return;
    if (easyRounds >= 3) return;
    phase = 'easy';
    let cands = Object.keys(nflToCollege).filter(name=>{
      const p = nflToCollege[name];
      return (p.position.toUpperCase()==='QB' && p.value>=40)
          || ((p.position.toUpperCase()==='RB' || p.position.toUpperCase()==='WR')
              && p.round<=2 && p.value>=40);
    });
    const filt = cands.filter(name=>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].colleges[0]))
    );
    if (filt.length) cands = filt;
    if (!cands.length) return gameOver('No eligible easy players.');
    const weighted = cands.map(name=>({
      name, weight: computeWeight(nflToCollege[name])
    }));
    currentNFLPlayer = weightedRandomPick(weighted);
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].colleges[0]));
    if (recentSchools.length>7) recentSchools.shift();
    easyRounds++;
    const q = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions)
              .replace('XXXXX', currentNFLPlayer);
    addAIMessage(q);
  }

  // ─── Standard Trivia Round ────────────────────────
  function startTriviaRound() {
    phase = 'trivia'; normalRoundsCount++;
    let cands = Object.keys(nflToCollege).filter(name=>{
      const p = nflToCollege[name];
      return p.round<=4
          && ['QB','RB','WR'].includes(p.position.toUpperCase())
          && p.value>=20;
    });
    const filt = cands.filter(name=>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].colleges[0]))
    );
    if (filt.length) cands = filt;
    if (!cands.length) return gameOver('No eligible players.');
    const weighted = cands.map(name=>({
      name, weight: computeWeight(nflToCollege[name])
    }));
    currentNFLPlayer = weightedRandomPick(weighted);
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].colleges[0]));
    if (recentSchools.length>7) recentSchools.shift();
    const q = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions)
              .replace('XXXXX', currentNFLPlayer);
    addAIMessage(q);
  }

  // ─── Binary Choice Round (once only) ─────────────
  function startTriviaRoundFiltered(choice) {
    phase = 'binary';
    binaryRoundCount--; // will go from 1→0
    let cands = [];
    if (choice==='tough') {
      // tough: value 10–20
      cands = Object.keys(nflToCollege).filter(name=>{
        const p = nflToCollege[name];
        return p.round>=2 && p.round<=7
            && ['QB','RB','WR'].includes(p.position.toUpperCase())
            && p.value>=10 && p.value<=20;
      });
    } else {
      // defense: include DL, value ≥60
      const defPos = ['DE','DT','DL','LB','OLB','ILB','CB','S'];
      cands = Object.keys(nflToCollege).filter(name=>{
        const p = nflToCollege[name];
        return defPos.includes(p.position.toUpperCase()) && p.value>=60;
      });
    }
    const filt2 = cands.filter(name=>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].colleges[0]))
    );
    if (filt2.length) cands = filt2;
    if (!cands.length) {
      addAIMessage("Can't think of anyone, let's just keep going.");
      return setTimeout(startTriviaRound,1500);
    }
    const weighted = cands.map(name=>({
      name, weight: computeWeight(nflToCollege[name])
    }));
    currentNFLPlayer = weightedRandomPick(weighted);
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].colleges[0]));
    if (recentSchools.length>7) recentSchools.shift();
    const q = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions)
              .replace('XXXXX', currentNFLPlayer);
    addAIMessage(q);
  }

  // ─── Ask Next / Trigger Binary Once ───────────────
  function askNextQuestion() {
    addAIMessage(
      dialogueBuckets.transitions?.[0] || "What's next?",
      ()=>{  
        if (normalRoundsCount>=3) {
          // only once!
          binaryModeActive = true;
          binaryRoundCount = 1;   // ← was 3, now just 1
          normalRoundsCount = 0;
          addAIMessage("Alright, pick an option:", showBinaryChoices);
        } else {
          startTriviaRound();
        }
      }
    );
  }
  function showBinaryChoices() {
    inputForm.style.display     = 'none';
    binaryChoices.style.display = 'block';
  }
  function hideBinaryChoices() {
    binaryChoices.style.display = 'none';
    inputForm.style.display     = 'block';
  }

  // ─── Handle User Guess ───────────────────────────
  function handleCollegeGuess(ans) {
    clearTimer();
    addMessage(ans,'user');
    const cols = nflToCollege[currentNFLPlayer].colleges;
    const idx  = cols.findIndex(c=>isCollegeAnswerCorrect(ans,c));
    if (idx>=0) {
      const resp = idx===0
        ? pickWithCooldown(dialogueBuckets.confirmations||['nice'], recentConfirmations)
        : pickWithCooldown(dialogueBuckets.transferCompliments||["I see what you did there"], recentTransferCompliments);
      addAIMessage(resp, ()=>{
        score++; updateScore();
        if (phase==='easy') {
          if (easyRounds<3) setTimeout(startEasyRound,500);
          else {
            const et = dialogueBuckets.easyTransition||[];
            const msg = et.length
              ? pickWithCooldown(et, [])
              : "Ok, now let's have some fun";
            addAIMessage(msg, ()=>{
              phase='trivia'; normalRoundsCount=0;
              startTriviaRound();
            });
          }
        } else if (phase==='trivia') {
          if (normalRoundsCount>=3) setTimeout(askNextQuestion,500);
          else setTimeout(startTriviaRound,500);
        } else {
          // binaryModeActive && binaryRoundCount > 0 only true once
          if (binaryModeActive && binaryRoundCount>0) setTimeout(showBinaryChoices,500);
          else { 
            binaryModeActive = false;
            setTimeout(startTriviaRound,500);
          }
        }
      });
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${cols[0]}. Game Over!`);
    }
  }

  // ─── Event Listeners ─────────────────────────────
  inputForm.addEventListener('submit', e=>{
    e.preventDefault();
    if (!gameActive) return;
    const ans = userInput.value.trim();
    if (ans) handleCollegeGuess(ans);
    userInput.value = '';
  });
  choiceTough.addEventListener('click', ()=>{
    addMessage('Hit me with a tough one','user');
    hideBinaryChoices();
    startTriviaRoundFiltered('tough');
  });
  choiceDefense.addEventListener('click', ()=>{
    addMessage('Go defense','user');
    hideBinaryChoices();
    startTriviaRoundFiltered('defense');
 

}); // end DOMContentLoaded
