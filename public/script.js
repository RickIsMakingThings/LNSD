document.addEventListener('DOMContentLoaded', function() {
  // --- Flags & State ---
  let loadedData        = false;
  let userStarted       = false;
  let gameStarted       = false;
  let gameActive        = true;

  // --- DOM Elements ---
  const startScreen        = document.getElementById('start-screen');
  const startButton        = document.getElementById('start-button');
  const gameContainer      = document.getElementById('game-container');
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
  let phase             = 'easy';       // "easy", "trivia", "binary"
  let currentNFLPlayer  = '';
  let score             = 0;
  let easyRounds        = 0;
  let normalRoundsCount = 0;
  let recentSchools     = [];
  let binaryModeActive  = false;
  let binaryRoundCount  = 0;
  let timerInterval;

  // --- Draft‑Year Weighting Parameters ---
  const minDraftYear = 2009;
  const maxDraftYear = 2024;
  const alphaMin     = 0.4;
  const alphaMax     = 0.8;

  // --- Firestore Setup ---
  const db = firebase.firestore();

  // --- Weighted Random Pick Helper ---
  function weightedRandomPick(items) {
    const total = items.reduce((sum,i)=>sum+i.weight,0);
    let r = Math.random()*total;
    for (const item of items) {
      if (r < item.weight) return item.name;
      r -= item.weight;
    }
    return items[items.length-1].name;
  }

  // --- Try Start Game ---
  function tryStartGame() {
    if (loadedData && userStarted && !gameStarted) {
      gameStarted = true;
      startIntro();
    }
  }

  // --- Start Button ---
  startButton.addEventListener('click', () => {
    userStarted = true;
    startScreen.style.display    = 'none';
    gameContainer.style.display  = 'flex';
    tryStartGame();
  });

  // --- Load dialogue.json ---
  fetch('dialogue.json')
    .then(r=>r.json())
    .then(d=>{
      dialogueBuckets = d;
      loadedData = !!Object.keys(nflToCollege).length;
      tryStartGame();
    }).catch(console.error);

  // --- Load college_aliases.csv ---
  fetch('college_aliases.csv')
    .then(r=>r.text())
    .then(t=>{ collegeAliases = parseCSVtoObject(t); })
    .catch(console.error);

  // --- Load players.csv ---
  fetch('players.csv')
    .then(r=>r.text())
    .then(t=>{
      nflToCollege = parsePlayersCSV(t);
      loadedData = !!dialogueBuckets.questions;
      tryStartGame();
    }).catch(console.error);

  // --- CSV Parsers ---
  function parseCSVtoObject(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const obj = {};
    for (let i=1; i<lines.length; i++) {
      const cols = lines[i].split(',');
      const key  = cols[0].trim().toLowerCase();
      if (!key) continue;
      obj[key] = cols.slice(1).map(a=>a.trim().toLowerCase()).filter(a=>a);
    }
    return obj;
  }
  function parsePlayersCSV(csv) {
    const lines = csv.trim().split(/\r?\n/);
    const obj = {};
    for (let i=1; i<lines.length; i++) {
      const p = lines[i].split(',');
      if (p.length < 10) continue;
      const draftYear = parseInt(p[0].trim(),10);
      const round     = parseInt(p[1].trim(),10);
      const name      = p[4].trim();
      const pos       = p[5].trim();
      const col1      = p[6].trim();
      const col2      = p[7].trim();
      const col3      = p[8].trim();
      const val       = p[9].trim()===''?0:parseFloat(p[9].trim());
      if (!isNaN(draftYear)&&!isNaN(round)&&name&&pos&&col1) {
        obj[name] = {
          draftYear,
          round,
          position: pos,
          colleges: [col1, col2, col3].filter(c=>c),
          value: val
        };
      }
    }
    return obj;
  }

  // --- Timer ---
  function startTimer() {
    clearTimer();
    let t=7; timerBar.style.width='100%';
    timerInterval = setInterval(()=>{
      t -= 0.1;
      timerBar.style.width = `${(t/7)*100}%`;
      if (t<=0) {
        clearTimer();
        gameOver("Time's up! Game Over!");
      }
    },100);
  }
  function clearTimer() { clearInterval(timerInterval); timerBar.style.width='0%'; }

  // --- UI Helpers ---
  function addMessage(txt,cls) {
    const d=document.createElement('div');
    d.classList.add('message',cls);
    d.textContent=txt;
    chatContainer.appendChild(d);
    chatContainer.scrollTop=chatContainer.scrollHeight;
  }
  function updateScore() { scoreDisplay.textContent=`Score: ${score}`; }

  // --- Dialogue Helpers ---
  function getBriefResponse() {
    if (phase==='easy') {
      const arr=dialogueBuckets.confirmations||['nice'];
      return arr[Math.floor(Math.random()*arr.length)];
    }
    if (Math.random()<0.1 && dialogueBuckets.big_compliments?.length) {
      const arr=dialogueBuckets.big_compliments;
      return arr[Math.floor(Math.random()*arr.length)];
    }
    const arr=dialogueBuckets.confirmations||['nice'];
    return arr[Math.floor(Math.random()*arr.length)];
  }
  function getTransferCompliment() {
    const arr=dialogueBuckets.transferCompliments||["I see what you did there"];
    return arr[Math.floor(Math.random()*arr.length)];
  }
  function getQuestionTemplate() {
    const arr=dialogueBuckets.questions||['How about XXXXX'];
    return arr[Math.floor(Math.random()*arr.length)];
  }

  // --- College Normalization & Check ---
  function normalizeCollegeString(s) {
    let str=s.replace(/[^\w\s]/gi,'').toLowerCase().trim();
    if (str.startsWith('university of ')) str=str.slice(14);
    if (str.startsWith('college of '))    str=str.slice(11);
    const toks=str.split(/\s+/), last=toks[toks.length-1];
    if (last==='st'||last==='st.') toks[toks.length-1]='state';
    str=toks.join(' ');
    if (str.endsWith(' university')) {
      const tmp=str.slice(0,str.lastIndexOf(' university'));
      if (tmp.split(' ').length>1) str=tmp;
    }
    return str;
  }
  function isCollegeAnswerCorrect(ans,correct) {
    const a=normalizeCollegeString(ans),
          c=normalizeCollegeString(correct);
    return a===c||(collegeAliases[c]||[]).includes(a);
  }

  // --- Typing & AI Messaging ---
  function showTypingIndicator(cb) {
    const ind=document.createElement('div');
    ind.classList.add('message','ai','typing-indicator');
    ind.textContent='...';
    chatContainer.appendChild(ind);
    chatContainer.scrollTop=chatContainer.scrollHeight;
    setTimeout(()=>{
      chatContainer.removeChild(ind);
      cb();
    },1500);
  }
  function addAIMessage(txt,onDone) {
    clearTimer();
    showTypingIndicator(()=>{
      addMessage(txt,'ai');
      if (gameActive&&currentNFLPlayer&&txt.includes(currentNFLPlayer)) {
        startTimer();
      }
      if (typeof onDone==='function') onDone();
    });
  }

  // --- Game Over & Leaderboard ---
  function gameOver(msg) {
    gameActive=false; clearTimer();
    addAIMessage(msg);
    gameOverMsg.textContent=msg;
    gameOverOverlay.style.display='flex';
    gameOverButtons.style.display='block';
    usernameForm.style.display='none';
    leaderboardCont.style.display='none';
    inputForm.style.display='none';
  }
  restartBtn.addEventListener('click',restartGame);
  submitScoreBtn.addEventListener('click',()=>{
    gameOverButtons.style.display='none';
    usernameForm.style.display='block';
  });
  usernameSubmit.addEventListener('click',()=>{
    const uname=usernameInput.value.trim();
    if (!uname) return alert('Enter username.');
    db.collection('highScores').add({
      username:uname,
      score,
      timestamp:firebase.firestore.FieldValue.serverTimestamp()
    }).then(showLeaderboard)
      .catch(e=>{console.error(e);alert('Submit failed.')});
  });
  leaderboardRestart.addEventListener('click',()=>{
    leaderboardCont.style.display='none';
    usernameInput.value='';
    restartGame();
  });
  function showLeaderboard(){
    usernameForm.style.display='none';
    leaderboardCont.style.display='block';
    leaderboardList.innerHTML='';
    db.collection('highScores')
      .orderBy('score','desc').limit(20)
      .get().then(snap=>{
        if (snap.empty) leaderboardList.innerHTML='<li>No scores yet.</li>';
        else snap.forEach(doc=>{
          const {username,score}=doc.data();
          const li=document.createElement('li');
          li.textContent=`${username}: ${score}`;
          leaderboardList.appendChild(li);
        });
      }).catch(e=>{
        console.error(e);
        leaderboardList.innerHTML='<li>Unable to load leaderboard.</li>';
      });
  }

  // --- Restart Game ---
  function restartGame() {
    clearTimer();
    phase='easy';
    easyRounds=0;
    normalRoundsCount=0;
    currentNFLPlayer='';
    score=0;
    gameActive=true;
    binaryModeActive=false;
    binaryRoundCount=0;
    recentSchools=[];
    updateScore();
    chatContainer.innerHTML='';
    userInput.value='';
    inputForm.style.display='block';
    gameOverOverlay.style.display='none';
    gameOverButtons.style.display='none';
    usernameForm.style.display='none';
    leaderboardCont.style.display='none';
    startIntro();
  }

  // --- Intro Sequence ---
  function startIntro() {
    addAIMessage(
      dialogueBuckets.greetings?.[0]||"you and I have to take an oath 🤝",
      ()=>addAIMessage(
        dialogueBuckets.greetings?.[1]||"no googling",
        ()=>addAIMessage(
          "We can start with some easy ones.",
          startEasyRound
        )
      )
    );
  }

  // --- Easy Round ---
  function startEasyRound() {
    if (!gameActive) return;
    if (easyRounds>=3) return;
    phase='easy';
    let candidates=Object.keys(nflToCollege).filter(name=>{
      const p=nflToCollege[name];
      const pos=p.position.toUpperCase(), valOK=p.value>=40;
      return (pos==='QB'&&valOK)||((pos==='RB'||pos==='WR')&&p.round<=2&&valOK);
    });
    const filt=candidates.filter(name=>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].colleges[0]))
    );
    if (filt.length) candidates=filt;
    if (!candidates.length) return gameOver('No eligible easy players.');
    currentNFLPlayer=candidates[Math.floor(Math.random()*candidates.length)];
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].colleges[0]));
    if (recentSchools.length>7) recentSchools.shift();
    easyRounds++;
    const q=getQuestionTemplate().replace('XXXXX',currentNFLPlayer);
    addAIMessage(q);
  }

  // --- Trivia Round with Non-Linear Weighting ---
  function startTriviaRound() {
    phase='trivia';
    normalRoundsCount++;
    let candidates=Object.keys(nflToCollege).filter(name=>{
      const p=nflToCollege[name];
      return p.round<=4 &&
             ['QB','RB','WR'].includes(p.position.toUpperCase()) &&
             p.value>=20;
    });
    const filt=candidates.filter(name=>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].colleges[0]))
    );
    if (filt.length) candidates=filt;
    if (!candidates.length) return gameOver('No eligible players.');

    const weighted=candidates.map(name=>{
      const p=nflToCollege[name];
      const norm=(p.draftYear-minDraftYear)/(maxDraftYear-minDraftYear);
      const norm2=norm*norm;
      const alpha=alphaMin+(alphaMax-alphaMin)*norm2;
      const factor=1+alpha*(norm*2-1);
      return { name, weight:p.value*factor };
    });

    currentNFLPlayer = weightedRandomPick(weighted);
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].colleges[0]));
    if (recentSchools.length>7) recentSchools.shift();
    const q=getQuestionTemplate().replace('XXXXX',currentNFLPlayer);
    addAIMessage(q);
  }

  // --- Binary Round Filtered ---
  function startTriviaRoundFiltered(choice) {
    phase='binary';
    binaryRoundCount--;
    let candidates=[];
    if (choice==='tough') {
      candidates=Object.keys(nflToCollege).filter(name=>{
        const p=nflToCollege[name];
        return p.round>=2&&p.round<=7&&
               ['QB','RB','WR'].includes(p.position.toUpperCase())&&
               p.value>=5&&p.value<=20;
      });
    } else {
      candidates=Object.keys(nflToCollege).filter(name=>{
        const p=nflToCollege[name];
        return !['QB','RB','WR'].includes(p.position.toUpperCase())&&
               p.value>=49;
      });
    }
    const filt2=candidates.filter(name=>
      !recentSchools.includes(normalizeCollegeString(nflToCollege[name].colleges[0]))
    );
    if (filt2.length) candidates=filt2;
    if (!candidates.length) {
      addAIMessage("Can't think of anyone, let's just keep going.");
      return setTimeout(startTriviaRound,1500);
    }
    currentNFLPlayer=candidates[Math.floor(Math.random()*candidates.length)];
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].colleges[0]));
    if (recentSchools.length>7) recentSchools.shift();
    const q=getQuestionTemplate().replace('XXXXX',currentNFLPlayer);
    addAIMessage(q);
  }

  // --- Ask Next or Trigger Binary ---
  function askNextQuestion() {
    addAIMessage(
      dialogueBuckets.transitions?.[0]||"What's next?",
      ()=>{
        if (normalRoundsCount>=3) {
          binaryModeActive=true;
          binaryRoundCount=3;
          normalRoundsCount=0;
          addAIMessage("Alright, pick an option:", showBinaryChoices);
        } else {
          startTriviaRound();
        }
      }
    );
  }

  function showBinaryChoices() {
    inputForm.style.display='none';
    binaryChoices.style.display='block';
  }
  function hideBinaryChoices() {
    binaryChoices.style.display='none';
    inputForm.style.display='block';
  }

  // --- Handle College Guess (incl. transfers) ---
  function handleCollegeGuess(ans) {
    clearTimer();
    addMessage(ans,'user');
    const cols = nflToCollege[currentNFLPlayer].colleges;
    const idx = cols.findIndex(c=>isCollegeAnswerCorrect(ans,c));
    if (idx>=0) {
      const resp = idx===0 ? getBriefResponse() : getTransferCompliment();
      addAIMessage(resp,()=>{
        score++; updateScore();
        if (phase==='easy') {
          if (easyRounds<3) setTimeout(startEasyRound,500);
          else {
            const et=dialogueBuckets.easyTransition||[];
            const msg=et.length?et[Math.floor(Math.random()*et.length)]
                                :"Ok, now let's have some fun";
            addAIMessage(msg,()=>{
              phase='trivia';
              normalRoundsCount=0;
              startTriviaRound();
            });
          }
        } else if (phase==='trivia') {
          if (normalRoundsCount>=3) setTimeout(askNextQuestion,500);
          else setTimeout(startTriviaRound,500);
        } else {
          if (binaryModeActive&&binaryRoundCount>0) setTimeout(showBinaryChoices,500);
          else { binaryModeActive=false; setTimeout(startTriviaRound,500); }
        }
      });
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${cols[0]}. Game Over!`);
    }
  }

  // --- Form & Choice Listeners ---
  inputForm.addEventListener('submit',e=>{
    e.preventDefault();
    if(!gameActive) return;
    const ans=userInput.value.trim();
    if(ans) handleCollegeGuess(ans);
    userInput.value='';
  });
  choiceTough.addEventListener('click',()=>{
    addMessage('Hit me with a tough one','user');
    hideBinaryChoices();
    startTriviaRoundFiltered('tough');
  });
  choiceDefense.addEventListener('click',()=>{
    addMessage('Go defense','user');
    hideBinaryChoices();
    startTriviaRoundFiltered('defense');
  });

});
