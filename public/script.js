document.addEventListener('DOMContentLoaded', function() {
  // --- Firestore Reference ---
  const db = firebase.firestore();

  // --- DOM Elements ---
  const chatContainer        = document.getElementById('chat-container');
  const inputForm            = document.getElementById('input-form');
  const userInput            = document.getElementById('user-input');
  const scoreDisplay         = document.getElementById('score');
  const gameOverOverlay      = document.getElementById('game-over');
  const gameOverMsg          = document.getElementById('game-over-msg');
  const gameOverButtons      = document.getElementById('game-over-buttons');
  const submitScoreBtn       = document.getElementById('submit-score');
  const restartBtn           = document.getElementById('restart');
  const usernameForm         = document.getElementById('username-form');
  const usernameInput        = document.getElementById('username-input');
  const usernameSubmit       = document.getElementById('username-submit');
  const leaderboardContainer = document.getElementById('leaderboard-container');
  const leaderboardList      = document.getElementById('leaderboard');
  const leaderboardRestart   = document.getElementById('leaderboard-restart');
  const binaryChoices        = document.getElementById('binary-choices');
  const choiceTough          = document.getElementById('choice-tough');
  const choiceDefense        = document.getElementById('choice-defense');
  const timerBar             = document.getElementById('timer-bar');

  // --- Game State ---
  let nflToCollege       = {};
  let collegeAliases     = {};
  let dialogueBuckets    = {};
  let gameStarted        = false;
  let phase              = "easy";  // "easy", "trivia", or "binary"
  let currentNFLPlayer   = "";
  let score              = 0;
  let gameActive         = true;
  let correctStreak      = 0;
  let easyRounds         = 0;      // up to 3
  let normalRoundsCount  = 0;      // up to 3
  let recentSchools      = [];     // last 7 schools

  let binaryModeActive   = false;
  let binaryRoundCount   = 0;      // 3 rounds once triggered

  let timerInterval;
  const playerExclusionList = ["russell wilson","jayden daniels"];

  // --- Fetch Data ---
  fetch('dialogue.json')
    .then(r=>r.json())
    .then(d=>{ dialogueBuckets=d; console.log("Dialogue loaded."); checkStart(); })
    .catch(e=>console.error("dialogue.json failed:",e));

  fetch('college_aliases.csv')
    .then(r=>r.text())
    .then(t=>{ collegeAliases=parseCSVtoObject(t); console.log("Aliases loaded."); })
    .catch(e=>console.error("aliases CSV failed:",e));

  fetch('players.csv')
    .then(r=>r.text())
    .then(t=>{ nflToCollege=parsePlayersCSV(t); console.log("Players loaded."); checkStart(); })
    .catch(e=>console.error("players CSV failed:",e));

  function checkStart(){
    if(!gameStarted && Object.keys(nflToCollege).length>0 && dialogueBuckets.questions){
      gameStarted=true;
      startIntro();
    }
  }

  // --- CSV Parsers ---
  function parseCSVtoObject(csv){
    const lines=csv.trim().split(/\r?\n/);
    const obj={};
    for(let i=1;i<lines.length;i++){
      const parts=lines[i].split(',');
      const key=parts[0].trim().toLowerCase();
      if(!key) continue;
      obj[key]=parts.slice(1).map(a=>a.trim().toLowerCase()).filter(a=>a);
    }
    return obj;
  }

  function parsePlayersCSV(csv){
    const lines=csv.trim().split(/\r?\n/);
    const obj={};
    for(let i=1;i<lines.length;i++){
      const parts=lines[i].split(',');
      if(parts.length<7) continue;
      const [rnd,, ,name,pos,col,val]=parts;
      const roundNum=parseInt(rnd);
      const value = val.trim()===""?0:parseFloat(val);
      if(name && pos && col && !isNaN(roundNum)){
        obj[name.trim()]={
          college: col.trim(),
          round: roundNum,
          position: pos.trim(),
          value
        };
      }
    }
    return obj;
  }

  // --- Timer ---
  function startTimer(){
    clearTimer();
    let t=7;
    timerBar.style.width="100%";
    timerInterval=setInterval(()=>{
      t-=0.1;
      timerBar.style.width=`${(t/7)*100}%`;
      if(t<=0){ clearTimer(); gameOver("Time's up! Game Over!"); }
    },100);
  }
  function clearTimer(){
    clearInterval(timerInterval);
    timerBar.style.width="0%";
  }

  // --- UI Helpers ---
  function addMessage(txt,cls){
    const d=document.createElement('div');
    d.classList.add('message',cls);
    d.textContent=txt;
    chatContainer.appendChild(d);
    chatContainer.scrollTop=chatContainer.scrollHeight;
  }
  function updateScore(){ scoreDisplay.textContent=`Score: ${score}`; }

  // --- Dialogue Helpers ---
  function getBriefResponse(){
    if(phase==="easy"){
      const arr=dialogueBuckets.confirmations||["nice"];
      return arr[Math.floor(Math.random()*arr.length)];
    } else {
      if(Math.random()<0.1 && (dialogueBuckets.big_compliments||[]).length){
        return dialogueBuckets.big_compliments[Math.floor(Math.random()*dialogueBuckets.big_compliments.length)];
      }
      const arr=dialogueBuckets.confirmations||["nice"];
      return arr[Math.floor(Math.random()*arr.length)];
    }
  }
  function getQuestionTemplate(){
    const arr=dialogueBuckets.questions||["How about XXXXX"];
    return arr[Math.floor(Math.random()*arr.length)];
  }

  // --- Normalization & Checking ---
  function normalizeCollegeString(s){
    let str=s.replace(/[^\w\s]/gi,"").toLowerCase().trim();
    if(str.startsWith("university of ")) str=str.slice(14);
    if(str.startsWith("college of ")) str=str.slice(11);
    const tokens=str.split(/\s+/);
    const last=tokens[tokens.length-1];
    if(last==="st"||last==="st.") tokens[tokens.length-1]="state";
    str=tokens.join(" ");
    if(str.endsWith(" university")){
      const tmp=str.slice(0,str.lastIndexOf(" university"));
      if(tmp.split(" ").length>1) str=tmp;
    }
    return str;
  }
  function isCollegeAnswerCorrect(ans,correct){
    const a=normalizeCollegeString(ans);
    const c=normalizeCollegeString(correct);
    if(a===c) return true;
    return (collegeAliases[c]||[]).includes(a);
  }

  // --- Typing Indicator & AI Messaging ---
  function showTypingIndicator(cb){
    const ind=document.createElement('div');
    ind.classList.add('message','ai','typing-indicator');
    ind.textContent="...";
    chatContainer.appendChild(ind);
    chatContainer.scrollTop=chatContainer.scrollHeight;
    setTimeout(()=>{
      chatContainer.removeChild(ind);
      cb();
    },1500);
  }
  function addAIMessage(txt){
    clearTimer();
    showTypingIndicator(()=>{
      addMessage(txt,"ai");
      startTimer();
    });
  }

  // --- Game Over & Restart UI Flow ---
  function gameOver(msg){
    gameActive=false;
    clearTimer();
    addAIMessage(msg);
    gameOverMsg.textContent=msg;
    gameOverOverlay.style.display="flex";
    gameOverButtons.style.display="block";
    usernameForm.style.display="none";
    leaderboardContainer.style.display="none";
    inputForm.style.display="none";
  }
  restartBtn.addEventListener('click',()=> restartGame());
  submitScoreBtn.addEventListener('click',()=>{
    gameOverButtons.style.display="none";
    usernameForm.style.display="block";
  });
  usernameSubmit.addEventListener('click',()=>{
    const uname=usernameInput.value.trim();
    if(!uname) return alert("Enter your username.");
    // write score + username
    db.collection("highScores").add({
      username: uname,
      score,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(showLeaderboard)
    .catch(e=>{
      console.error(e);
      alert("Submit failed.");
    });
  });
  leaderboardRestart.addEventListener('click',()=>{
    leaderboardContainer.style.display="none";
    usernameInput.value="";
    restartGame();
  });

  function showLeaderboard(){
    usernameForm.style.display="none";
    leaderboardContainer.style.display="block";
    leaderboardList.innerHTML="";
    db.collection("highScores")
      .orderBy("score","desc")
      .limit(20)
      .get()
      .then(snap=>{
        if(snap.empty){
          leaderboardList.innerHTML="<li>No scores yet.</li>";
        } else {
          snap.forEach(doc=>{
            const {username,score} = doc.data();
            const li=document.createElement('li');
            li.textContent=`${username}: ${score}`;
            leaderboardList.appendChild(li);
          });
        }
      })
      .catch(e=>{
        console.error(e);
        leaderboardList.innerHTML="<li>Unable to load leaderboard.</li>";
      });
  }

  function restartGame(){
    clearTimer();
    phase="easy";
    easyRounds=0;
    normalRoundsCount=0;
    currentNFLPlayer="";
    score=0;
    gameActive=true;
    correctStreak=0;
    binaryModeActive=false;
    binaryRoundCount=0;
    recentSchools=[];
    updateScore();
    chatContainer.innerHTML="";
    userInput.value="";
    inputForm.style.display="block";
    gameOverOverlay.style.display="none";
    startIntro();
  }

  // --- Intro and Rounds Logic ---
  function startIntro(){
    addAIMessage(dialogueBuckets.greetings?.[0] || "You and I have to take an oath 🤝");
    setTimeout(()=> addAIMessage(dialogueBuckets.greetings?.[1] || "No googling"), 1500);
    setTimeout(()=>{
      addAIMessage("We can start with some easy ones.");
      phase="easy";
      startEasyRound();
    },3000);
  }

  function startEasyRound(){
    if(!gameActive) return;
    if(easyRounds>=3){
      let tmsg = dialogueBuckets.easyTransition?.[Math.floor(Math.random()*dialogueBuckets.easyTransition.length)]
                  || "Ok, now let's have some fun";
      addAIMessage(tmsg);
      phase="trivia";
      normalRoundsCount=0;
      return setTimeout(startTriviaRound,1500);
    }
    phase="easy";
    let cand = Object.keys(nflToCollege).filter(p=>{
      const i=nflToCollege[p];
      return i.position.toUpperCase()==="QB" && i.value>=40 && !playerExclusionList.includes(p.toLowerCase());
    });
    const filtered = cand.filter(p=>{
      return !recentSchools.includes(normalizeCollegeString(nflToCollege[p].college));
    });
    if(filtered.length) cand=filtered;
    if(!cand.length) return gameOver("No eligible easy players. Game Over!");
    currentNFLPlayer = cand[Math.floor(Math.random()*cand.length)];
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].college));
    if(recentSchools.length>7) recentSchools.shift();
    easyRounds++;
    const q = getQuestionTemplate().replace("XXXXX", currentNFLPlayer);
    addAIMessage(q);
    userInput.value="";
  }

  function startTriviaRound(){
    phase="trivia"; normalRoundsCount++;
    let cand=Object.keys(nflToCollege).filter(p=>{
      const i=nflToCollege[p];
      return i.round<=4 && ["QB","RB","WR"].includes(i.position.toUpperCase()) && i.value>=20 &&
             !playerExclusionList.includes(p.toLowerCase());
    });
    const filt=cand.filter(p=>!recentSchools.includes(normalizeCollegeString(nflToCollege[p].college)));
    if(filt.length) cand=filt;
    if(!cand.length) return gameOver("No eligible players. Game Over!");
    currentNFLPlayer = cand[Math.floor(Math.random()*cand.length)];
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].college));
    if(recentSchools.length>7) recentSchools.shift();
    const q = getQuestionTemplate().replace("XXXXX", currentNFLPlayer);
    addAIMessage(q);
    userInput.value="";
  }

  function startTriviaRoundFiltered(choice){
    phase="binary"; binaryRoundCount--;
    let cand=[];
    if(choice==="tough"){
      cand=Object.keys(nflToCollege).filter(p=>{
        const i=nflToCollege[p];
        return i.round>=2&&i.round<=7&&["QB","RB","WR"].includes(i.position.toUpperCase())&&i.value>=5&&i.value<=20;
      });
    } else {
      cand=Object.keys(nflToCollege).filter(p=>{
        const i=nflToCollege[p];
        return !["QB","RB","WR"].includes(i.position.toUpperCase())&&i.value>=49;
      });
    }
    const filt=cand.filter(p=>!recentSchools.includes(normalizeCollegeString(nflToCollege[p].college)));
    if(filt.length) cand=filt;
    cand=cand.filter(p=>!playerExclusionList.includes(p.toLowerCase()));
    if(!cand.length){
      addAIMessage("Can't think of anyone, let's just keep going.");
      return setTimeout(startTriviaRound,1500);
    }
    currentNFLPlayer=cand[Math.floor(Math.random()*cand.length)];
    recentSchools.push(normalizeCollegeString(nflToCollege[currentNFLPlayer].college));
    if(recentSchools.length>7) recentSchools.shift();
    const q=getQuestionTemplate().replace("XXXXX",currentNFLPlayer);
    addAIMessage(q);
  }

  function askNextQuestion(){
    addAIMessage(dialogueBuckets.transitions?.[0]||"What's next?");
    setTimeout(()=>{
      if(normalRoundsCount>=3){
        binaryModeActive=true; binaryRoundCount=3; normalRoundsCount=0; correctStreak=0;
        return showBinaryChoices();
      }
      startTriviaRound();
    },1500);
  }

  function showBinaryChoices(){ inputForm.style.display="none"; binaryChoices.style.display="block"; }
  function hideBinaryChoices(){ binaryChoices.style.display="none"; inputForm.style.display="block"; }

  function handleCollegeGuess(ans){
    clearTimer();
    addMessage(ans,"user");
    const correct = nflToCollege[currentNFLPlayer].college;
    if(isCollegeAnswerCorrect(ans,correct)){
      addAIMessage(getBriefResponse());
      score++; updateScore(); correctStreak++;
      if(phase==="easy"){
        setTimeout(()=> easyRounds<3 ? startEasyRound() : startTriviaRound(),1500);
      } else if(phase==="trivia"){
        if(normalRoundsCount>=3) setTimeout(askNextQuestion,1500);
        else setTimeout(startTriviaRound,1500);
      } else {
        if(binaryModeActive && binaryRoundCount>0) setTimeout(showBinaryChoices,1500);
        else { binaryModeActive=false; setTimeout(startTriviaRound,1500); }
      }
    } else {
      gameOver(`Nah, ${currentNFLPlayer} played at ${correct}. Better luck next time!`);
    }
  }

  inputForm.addEventListener('submit', e=>{
    e.preventDefault();
    if(!gameActive) return;
    const ans=userInput.value.trim();
    if(ans) handleCollegeGuess(ans);
    userInput.value="";
  });

  choiceTough.onclick = ()=>{
    addMessage("Hit me with a tough one","user");
    hideBinaryChoices(); correctStreak=0; startTriviaRoundFiltered("tough");
  };
  choiceDefense.onclick = ()=>{
    addMessage("Go defense","user");
    hideBinaryChoices(); correctStreak=0; startTriviaRoundFiltered("defense");
  };

  // Start the game
  startIntro();
});
