document.addEventListener('DOMContentLoaded', function() {
  // ─── CONFIG ────────────────────────────────────────
  const easyNames = [
    "Matthew Stafford","Cam Newton","Patrick Mahomes","Lamar Jackson","Kirk Cousins",
    "Derrick Henry","Christian McCaffrey","Andrew Luck","Baker Mayfield","Jalen Hurts",
    "Kyler Murray","Ezekiel Elliott","Justin Herbert","Jameis Winston","Odell Beckham Jr.",
    "Joe Burrow","Saquon Barkley","Justin Jefferson","Joe Mixon","Marcus Mariota",
    "Amon-Ra St. Brown","Nick Chubb","Jonathan Taylor","Trevor Lawrence","Justin Fields",
    "Mark Sanchez","Mac Jones","C.J. Stroud","George Pickens","Travis Etienne",
    "Caleb Williams","Marvin Harrison Jr.","Malik Nabers","Bo Nix"
  ];
  const tips = [
    "Try abbreviations (e.g. 'Bama' for Alabama).",
    "Focus on the position—WRs often go to SEC schools.",
    "Late-round rookies might be tougher than veterans.",
    "Watch for back-to-back players from the same school.",
    "If you get stuck, think geographic—West Coast vs East Coast.",
    "Dual-threat QBs often come from smaller programs.",
    "Speedy RBs are sometimes late-round picks.",
    "Transfers can throw you off—use aliases if needed.",
    "Big-school receivers tend to be drafted earlier.",
    "Keep an eye on recent draftees for extra points."
  ];

  // ─── STATE ─────────────────────────────────────────
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
  let timerInterval;

  const COOLDOWN = 5;
  const recentQuestions           = [];
  const recentConfirmations       = [];
  const recentBigCompliments      = [];
  const recentTransferCompliments = [];

  // ─── DOM REFS ─────────────────────────────────────
  const startScreen     = document.getElementById('start-screen');
  const startButton     = document.getElementById('start-button');
  const gameContainer   = document.getElementById('game-container');
  const chatContainer   = document.getElementById('chat-container');
  const inputForm       = document.getElementById('input-form');
  const userInput       = document.getElementById('user-input');
  const scoreDisplay    = document.getElementById('score-display');
  const plusOneDisplay  = document.getElementById('plus-one');
  const timerBar        = document.getElementById('timer-bar');
  const binaryChoices   = document.getElementById('binary-choices');
  const choiceTough     = document.getElementById('choice-tough');
  const choiceDefense   = document.getElementById('choice-defense');
  const gameOverOverlay = document.getElementById('game-over');
  const gameOverMsg     = document.getElementById('game-over-msg');
  const gameOverButtons = document.getElementById('game-over-buttons');
  const tipContainer    = document.getElementById('tip-container');
  const submitScoreBtn  = document.getElementById('submit-score');
  const restartBtn      = document.getElementById('restart');
  const shareScoreBtn   = document.getElementById('share-score');
  const usernameForm    = document.getElementById('username-form');
  const usernameInput   = document.getElementById('username-input');
  const usernameSubmit  = document.getElementById('username-submit');
  const leaderboardCont = document.getElementById('leaderboard-container');
  const leaderboardList = document.getElementById('leaderboard');
  const leaderboardRestart = document.getElementById('leaderboard-restart');
  const toastEl         = document.getElementById('toast');

  // ─── FIREBASE SETUP ───────────────────────────────
  const db = firebase.firestore();
  startButton.disabled = true;

  // ─── DATA LOADING ─────────────────────────────────
  Promise.all([
    fetch('dialogue.json').then(r=>r.json()).then(d=>dialogueBuckets=d),
    fetch('college_aliases.csv').then(r=>r.text()).then(t=>collegeAliases=parseCSVtoObject(t)),
    fetch('players.csv').then(r=>r.text()).then(t=>nflToCollege=parsePlayersCSV(t))
  ]).then(()=> {
    startButton.disabled = false;
  }).catch(err=> console.error("Data load failed",err));

  // ─── UTILITIES ────────────────────────────────────
  function weightedRandomPick(items){
    const total = items.reduce((sum,i)=>sum+i.weight,0);
    let r = Math.random()*total;
    for(const it of items){
      if(r < it.weight) return it.name;
      r -= it.weight;
    }
    return items[items.length-1].name;
  }

  const MAX_WEIGHT = 100;
  function computeWeight(p){
    const base = p.value + (p.draftYear>=2023?10:0);
    let boost;
    if(p.draftYear>=2024)      boost=3.0;
    else if(p.draftYear>=2022) boost=2.5;
    else if(p.draftYear>=2018) boost=2.0;
    else                        boost=0.4;
    return Math.min(base*boost, MAX_WEIGHT);
  }

  function pickWithCooldown(arr,recent){
    const opts = arr.filter(i=>!recent.includes(i));
    const pool = opts.length?opts:arr;
    const pick = pool[Math.floor(Math.random()*pool.length)];
    recent.push(pick);
    if(recent.length>COOLDOWN) recent.shift();
    return pick;
  }

  function parseCSVtoObject(csv){
    return csv.trim().split(/\r?\n/).slice(1).reduce((map,line)=>{
      const cols = line.split(',').map(s=>s.trim());
      const key  = cols.shift();
      if(!key) return map;
      const norm = normalizeCollegeString(key);
      map[norm] = cols.map(a=>normalizeCollegeString(a)).filter(Boolean);
      return map;
    }, {});
  }

  function parsePlayersCSV(csv){
    return csv.trim().split(/\r?\n/).slice(1).reduce((o,line)=>{
      const p = line.split(',');
      if(p.length<10) return o;
      const [dy,rnd,, ,name,pos,c1,c2,c3,val] = p;
      const draftYear = parseInt(dy,10);
      const round     = parseInt(rnd,10);
      const value     = val.trim()===''?0:parseFloat(val);
      if(!isNaN(draftYear)&&!isNaN(round)&&name&&pos&&c1){
        o[name] = { draftYear, round, position:pos, college:c1, value };
      }
      return o;
    }, {});
  }

  // new helper to fetch whichever field your parser uses
  function getRawCollegeFor(player){
    const info = nflToCollege[player]||{};
    if(typeof info.college==='string') return info.college;
    if(Array.isArray(info.colleges)&&info.colleges.length) return info.colleges[0];
    return '';
  }

  function normalizeCollegeString(str){
    if(typeof str!=='string') str = String(str||'');
    let s = str.replace(/[^\w\s&]/gi,'').toLowerCase().trim();
    if(s.startsWith('university of ')) s = s.slice(14);
    if(s.startsWith('college of '))    s = s.slice(11);
    const toks = s.split(/\s+/), last = toks[toks.length-1];
    if(last==='st'||last==='st.') toks[toks.length-1]='state';
    s = toks.join(' ');
    if(s.endsWith(' university')){
      const tmp = s.slice(0,-11).trim();
      if(tmp.split(/\s+/).length>1) s = tmp;
    }
    return s;
  }

  function isCollegeAnswerCorrect(ans,correct){
    const a = normalizeCollegeString(ans),
          c = normalizeCollegeString(correct);
    return a===c || (collegeAliases[c]||[]).includes(a);
  }

  function showPlusOne(){
    plusOneDisplay.classList.add('show');
    setTimeout(()=>plusOneDisplay.classList.remove('show'),600);
  }

  function showToast(msg,dur=1500){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(()=>toastEl.classList.remove('show'),dur);
  }

  // ─── TIMER ────────────────────────────────────────
  function startTimer(){
    clearTimer();
    if(timerBar){
      timerBar.style.width='100%';
      timerBar.style.transition='width 0.1s linear';
    }
    let t=9;
    timerInterval = setInterval(()=>{
      t-=0.1;
      if(timerBar) timerBar.style.width = ((t/9)*100)+'%';
      if(t<=0){ clearTimer(); gameOver("Time's up! Game Over!"); }
    },100);
  }
  function clearTimer(){
    clearInterval(timerInterval);
    if(timerBar){
      timerBar.style.transition='none';
      timerBar.style.width='0%';
    }
  }

  // ─── UI HELPERS ─────────────────────────────────
  function addMessage(txt,cls){
    const d = document.createElement('div');
    d.classList.add('message',cls);
    d.textContent = txt;
    chatContainer.appendChild(d);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  function updateScore(){
    scoreDisplay.textContent = score;
  }

  // ─── START / DATA READY ──────────────────────────
  startButton.addEventListener('click',()=>{
    if(startButton.disabled) return;
    startScreen.style.display   = 'none';
    gameContainer.style.display = 'flex';
    startIntro();
  });

  // ─── GAME OVER / LEADERBOARD ────────────────────
  function gameOver(msg){
    gameActive = false;
    clearTimer();
    addMessage(msg,'ai');
    gameOverMsg.textContent       = msg;
    gameOverOverlay.style.display = 'flex';
    gameOverButtons.style.display = 'block';
    inputForm.style.display       = 'none';
    // tip at bottom:
    tipContainer.textContent = "Tip: " + tips[Math.floor(Math.random()*tips.length)];
  }
  restartBtn.addEventListener('click',restartGame);
  submitScoreBtn.addEventListener('click',()=>{
    gameOverButtons.style.display = 'none';
    usernameForm.style.display    = 'block';
  });
  shareScoreBtn.addEventListener('click',()=>{
    const txt = `Lost on ${currentNFLPlayer||'…'} but I got ${score}`;
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(txt)
        .then(()=>showToast('Copied to clipboard!'))
        .catch(()=>showToast('Copy failed'));
    } else showToast(`Share: ${txt}`);
  });
  usernameSubmit.addEventListener('click',()=>{
    const u = usernameInput.value.trim();
    if(!u) return alert('Enter username.');
    db.collection('highScores').add({
      username:u,
      score,
      timestamp:firebase.firestore.FieldValue.serverTimestamp()
    }).then(showLeaderboard)
      .catch(()=>alert('Submit failed.'));
  });
  leaderboardRestart.addEventListener('click',()=>{
    leaderboardCont.style.display = 'none';
    usernameInput.value = '';
    restartGame();
  });
  function showLeaderboard(){
    usernameForm.style.display    = 'none';
    leaderboardCont.style.display = 'block';
    leaderboardList.innerHTML     = '';
    db.collection('highScores')
      .orderBy('score','desc').limit(20)
      .get().then(snap=>{
        if(snap.empty) leaderboardList.innerHTML = '<li>No scores yet.</li>';
        else snap.forEach(doc=>{
          const {username,score} = doc.data();
          const li = document.createElement('li');
          li.textContent = `${username}: ${score}`;
          leaderboardList.appendChild(li);
        });
      }).catch(()=>leaderboardList.innerHTML='<li>Unable to load leaderboard.</li>');
  }

  // ─── RESTART ─────────────────────────────────────
  function restartGame(){
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
    chatContainer.innerHTML      = '';
    userInput.value              = '';
    inputForm.style.display      = 'flex';
    gameOverOverlay.style.display= 'none';
    gameOverButtons.style.display= 'none';
    usernameForm.style.display   = 'none';
    leaderboardCont.style.display= 'none';
    tipContainer.textContent     = '';
    startIntro();
  }

  // ─── INTRO SEQUENCE ──────────────────────────────
  function startIntro(){
    addMessage("you and I have to take an oath 🤝",'ai');
    setTimeout(()=> addMessage("no googling",'ai'),500);
    setTimeout(()=> {
      addMessage("We can start with some easy ones.",'ai');
      startEasyRound();
    },1000);
  }

  // ─── EASY ROUND ──────────────────────────────────
  function startEasyRound(){
    if(!gameActive||easyRounds>=3) return;
    phase = 'easy';

    // filter candidates by your curated list & recent schools
    let candidates = easyNames.filter(n=>nflToCollege[n])
                              .filter(n=>{
      const raw = getRawCollegeFor(n);
      const norm= normalizeCollegeString(raw);
      return raw && !recentSchools.includes(norm);
    });

    if(!candidates.length){
      return gameOver("No eligible easy players.");
    }

    // pick & record
    currentNFLPlayer = candidates[Math.floor(Math.random()*candidates.length)];
    const chosenCol = getRawCollegeFor(currentNFLPlayer);
    const normCol   = normalizeCollegeString(chosenCol);
    recentSchools.push(normCol);
    if(recentSchools.length>7) recentSchools.shift();

    easyRounds++;
    // ask
    const tmpl = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions);
    addMessage(tmpl.replace('XXXXX', currentNFLPlayer),'ai');
    startTimer();

    // after 3, transition
    if(easyRounds>=3){
      setTimeout(()=>{
        phase='trivia';
        startTriviaRound();
      },1500);
    }
  }

  // ─── TRIVIA ROUND ────────────────────────────────
  function startTriviaRound(){
    phase='trivia';

    let candidates = Object.keys(nflToCollege).filter(n=>
      !easyNames.includes(n) &&
      nflToCollege[n].round<=4 &&
      ['QB','RB','WR','TE'].includes(nflToCollege[n].position.toUpperCase()) &&
      nflToCollege[n].value>=20
    ).filter(n=>{
      const norm = normalizeCollegeString(getRawCollegeFor(n));
      return !recentSchools.includes(norm);
    });

    if(!candidates.length){
      return gameOver("No eligible players.");
    }

    // weighted pick
    const weighted = candidates.map(n=>({
      name:n, weight:computeWeight(nflToCollege[n])
    }));
    currentNFLPlayer = weightedRandomPick(weighted);

    // record & ask
    const normCol = normalizeCollegeString(getRawCollegeFor(currentNFLPlayer));
    recentSchools.push(normCol);
    if(recentSchools.length>7) recentSchools.shift();

    const tmpl = pickWithCooldown(dialogueBuckets.questions||['How about XXXXX'], recentQuestions);
    addMessage(tmpl.replace('XXXXX', currentNFLPlayer),'ai');
    startTimer();
  }

  // ─── BINARY CHOICES ──────────────────────────────
  choiceTough.addEventListener('click',()=>{
    addMessage('Hit me with a tough one','user');
    binaryChoices.style.display='none';
    // …your binary logic here…
  });
  choiceDefense.addEventListener('click',()=>{
    addMessage('Go defense','user');
    binaryChoices.style.display='none';
    // …your binary logic here…
  });

  // ─── INPUT HANDLING ──────────────────────────────
  inputForm.addEventListener('submit',e=>{
    e.preventDefault();
    if(!gameActive) return;
    const ans = userInput.value.trim();
    if(!ans) return;
    addMessage(ans,'user');
    userInput.value = '';
    clearTimer();

    const correctCollege = getRawCollegeFor(currentNFLPlayer);
    if(isCollegeAnswerCorrect(ans,correctCollege)){
      // correct
      addMessage(pickWithCooldown(dialogueBuckets.confirmations||['nice'], recentConfirmations),'ai');
      score += (phase==='easy'?1:10);
      updateScore();
      showPlusOne();
      // then continue per-phase…
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${correctCollege}. Game Over!`);
    }
  });

});
