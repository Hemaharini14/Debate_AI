/* ════════════════════════════════════════
   DebateAI — main.js
   ════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────────
var currentUser  = null;
var users        = {};
var coachSide    = 'both';
var coachRounds  = 2;
var coachTone    = 'Neutral';
var debateTone   = 'Neutral';
var debateMsgs   = [];
var debateCfg    = {};
var debateRound  = 0;
var isSending    = false;
var isRecording  = false;
var recognition  = null;
var myRoom       = null;
var myRoomRole   = null;
var mpPollTimer  = null;

// ── API call (goes through Flask backend) ─────────────────────────
function callAPI(messages, cb, maxTokens) {
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: messages, max_tokens: maxTokens || 1600 })
  })
  .then(function(r) {
    return r.json().then(function(d) {
      if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
      return d;
    });
  })
  .then(function(d) { cb(null, d.content, d.tokens); })
  .catch(function(e) { cb(e.message, null, null); });
}

// ── PAGE ROUTING ──────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById(id + 'Page').classList.add('active');
}

function gotoPage(id) {
  document.querySelectorAll('.nlink').forEach(function(b) { b.className = 'nlink'; });
  document.querySelectorAll('.nlink').forEach(function(b) {
    if ((id === 'coach'  && b.textContent.trim() === 'Coach') ||
        (id === 'debate' && b.textContent.trim() === 'Live Debate')) {
      b.className = 'nlink on';
    }
  });
  showPage(id);
}

// ── AUTH ──────────────────────────────────────────────────────────
function switchTab(t) {
  document.getElementById('ltab1').className = t === 'login'  ? 'ltab on' : 'ltab';
  document.getElementById('ltab2').className = t === 'signup' ? 'ltab on' : 'ltab';
  document.getElementById('loginForm').style.display  = t === 'login'  ? 'block' : 'none';
  document.getElementById('signupForm').style.display = t === 'signup' ? 'block' : 'none';
  document.getElementById('lerr').style.display = 'none';
}

function showErr(m) {
  var e = document.getElementById('lerr');
  e.textContent = m;
  e.style.display = 'block';
}

function doLogin() {
  var email = document.getElementById('lEmail').value.trim();
  var pass  = document.getElementById('lPass').value;
  if (!email || !pass) { showErr('Fill in all fields.'); return; }
  if (pass.length < 6)  { showErr('Password needs 6+ characters.'); return; }
  var name = (users[email] && users[email].name) ? users[email].name : email.split('@')[0];
  loginOK(email, name);
}

function doSignup() {
  var name  = document.getElementById('sName').value.trim();
  var email = document.getElementById('sEmail').value.trim();
  var pass  = document.getElementById('sPass').value;
  if (!name || !email || !pass) { showErr('Fill in all fields.'); return; }
  if (pass.length < 6) { showErr('Password needs 6+ characters.'); return; }
  users[email] = { name: name };
  loginOK(email, name);
}

function loginOK(email, name) {
  currentUser = { email: email, name: name };
  var init = name.charAt(0).toUpperCase();
  document.getElementById('av1').textContent = init;
  document.getElementById('av2').textContent = init;
  document.getElementById('lerr').style.display = 'none';
  showPage('coach');
}

function doLogout() {
  currentUser = null;
  showPage('login');
}

// ── COACH PAGE ────────────────────────────────────────────────────
function setTone(btn) {
  document.querySelectorAll('#toneGrid .tone-btn').forEach(function(b) { b.className = 'tone-btn'; });
  btn.className = 'tone-btn on';
  coachTone = btn.getAttribute('data-tone');
}

function setDebateTone(btn) {
  document.querySelectorAll('#debateToneGrid .tone-btn').forEach(function(b) { b.className = 'tone-btn'; });
  btn.className = 'tone-btn on';
  debateTone = btn.getAttribute('data-tone');
}

function setSide(s) {
  coachSide = s;
  document.getElementById('btn-pro').className  = 'sbtn';
  document.getElementById('btn-both').className = 'sbtn';
  document.getElementById('btn-con').className  = 'sbtn';
  if (s === 'pro')  document.getElementById('btn-pro').className  = 'sbtn s-pro';
  if (s === 'both') document.getElementById('btn-both').className = 'sbtn s-both';
  if (s === 'con')  document.getElementById('btn-con').className  = 'sbtn s-con';
}

function setRounds(n) {
  coachRounds = n;
  ['r1','r2','r3'].forEach(function(id) { document.getElementById(id).className = 'rbtn'; });
  document.getElementById('r' + n).className = 'rbtn on';
}

function setTopic(t) { document.getElementById('topicInput').value = t; }

function setCoachSt(type, msg) {
  document.getElementById('coachSbar').className = 'sbar ' + type;
  document.getElementById('coachStxt').textContent = msg;
}

function toneDesc(tone) {
  var map = {
    'Neutral':       'balanced, factual, no emotional bias',
    'Aggressive':    'bold, confrontational, directly attacks the opposing view',
    'Empathetic':    'warm, understanding, acknowledges other views while arguing your point',
    'Humorous':      'witty, clever jokes and analogies to make points land',
    'Authoritative': 'commanding, cite expertise and strong evidence, speak with conviction',
    'Diplomatic':    'tactful, polite, find common ground while advancing your position',
    'Passionate':    'intense, emotionally driven, appeal to values and morals',
    'Sarcastic':     'sharp irony and sarcasm to expose flaws in the opposing argument'
  };
  return map[tone] || 'balanced and clear';
}

function buildCoachPrompt(topic, side, style, rounds, tone) {
  var sd = {
    'Academic':     'formal, cite logic and statistics',
    'Street Smart': 'casual, punchy, real-world examples',
    'Socratic':     'use probing questions',
    'Lawyer Mode':  'structured courtroom style'
  }[style] || 'formal';
  var td = toneDesc(tone);
  var i;

  if (side === 'both') {
    var p = 'You are a debate coach. Topic: "' + topic + '"\n\n'
      + 'Write ' + rounds + ' argument(s) for each side.\n'
      + 'Argument style: ' + sd + '\nTone: ' + td + '\n\n'
      + 'Use EXACTLY these markers on their own lines: ##PRO## and ##CON## and ##VERDICT##\n\n'
      + '##PRO##\n';
    for (i = 0; i < rounds; i++) p += 'Round ' + (i+1) + ': [strong FOR argument using tone and style above]\n\n';
    p += '##CON##\n';
    for (i = 0; i < rounds; i++) p += 'Round ' + (i+1) + ': [strong AGAINST argument using tone and style above]\n\n';
    p += '##VERDICT##\n[Which side is logically stronger, 2 sentences]\n\nWrite real specific arguments. No placeholders.';
    return p;
  } else {
    var dir = side === 'pro' ? 'FOR' : 'AGAINST';
    var body = 'You are a debate coach. Topic: "' + topic + '"\n'
      + 'Argue ' + dir + ' in ' + rounds + ' round(s).\nStyle: ' + sd + '\nTone: ' + td + '\n\n'
      + 'OPENING: [hook using the tone]\n\n';
    for (i = 0; i < rounds; i++) {
      body += 'ROUND ' + (i+1) + ': [title]\n[argument]\nREBUTTAL: [preempt strongest objection]\n\n';
    }
    body += 'CLOSING: [memorable closing line in the specified tone]';
    return body;
  }
}

function generateDebate() {
  var topic = document.getElementById('topicInput').value.trim();
  var style = document.getElementById('styleSelect').value;
  if (!topic) { setCoachSt('err', 'Please enter a debate topic first'); return; }

  var btn = document.getElementById('genBtn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  setCoachSt('busy', 'Crafting arguments with LLaMA 3.1 [Tone: ' + coachTone + ']...');
  document.getElementById('coachEmpty').style.display  = 'none';
  document.getElementById('coachResult').style.display = 'none';

  callAPI(
    [{ role: 'user', content: buildCoachPrompt(topic, coachSide, style, coachRounds, coachTone) }],
    function(err, text, tok) {
      btn.disabled = false;
      btn.textContent = 'Generate Arguments';
      if (err) {
        setCoachSt('err', 'Error: ' + err);
        document.getElementById('coachEmpty').style.display = 'block';
        return;
      }
      renderCoach(text, coachSide);
      setCoachSt('ok', 'Done - ' + (tok || '?') + ' tokens - Tone: ' + coachTone);
    }
  );
}

function renderCoach(text, side) {
  var lp = document.getElementById('leftPanel'),   rp = document.getElementById('rightPanel');
  var lb = document.getElementById('leftBody'),    rb = document.getElementById('rightBody');
  var lt = document.getElementById('leftTitle'),   vb = document.getElementById('verdictBox');
  var vt = document.getElementById('verdictTxt'),  pg = document.getElementById('panelsGrid');

  vb.style.display = 'none'; rp.style.display = 'none'; lp.style.display = 'none';

  if (side === 'both') {
    pg.className = 'panels';
    var pi = text.indexOf('##PRO##'), ci = text.indexOf('##CON##'), vi = text.indexOf('##VERDICT##');
    var proText = '', conText = '', verdict = '';
    if (pi !== -1 && ci !== -1) {
      proText = text.substring(pi + 7, ci).trim();
      conText = vi !== -1 ? text.substring(ci + 7, vi).trim() : text.substring(ci + 7).trim();
      verdict = vi !== -1 ? text.substring(vi + 11).trim() : '';
    } else {
      var h = text.indexOf('\n\n', Math.floor(text.length / 2));
      proText = text.substring(0, h !== -1 ? h : Math.floor(text.length / 2)).trim();
      conText = text.substring(h !== -1 ? h : Math.floor(text.length / 2)).trim();
    }
    lp.className = 'panel pp';
    lt.textContent = 'PRO - For';
    lb.textContent = proText || 'No PRO content';
    lp.style.display = 'block';
    rb.textContent = conText || 'No CON content';
    rp.style.display = 'block';
    if (verdict) { vt.textContent = verdict; vb.style.display = 'block'; }
  } else {
    pg.className = 'panels solo';
    lp.className = side === 'pro' ? 'panel pp' : 'panel cp';
    lt.textContent = side === 'pro' ? 'PRO - Arguing For' : 'CON - Arguing Against';
    lb.textContent = text;
    lp.style.display = 'block';
  }
  document.getElementById('coachResult').style.display = 'block';
}

// ── MULTIPLAYER ROOMS (server-backed) ─────────────────────────────
function genRoomCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function createRoom() {
  var topic = document.getElementById('debateTopic').value.trim();
  if (!topic) { alert('Enter a debate topic first.'); return; }
  var code = document.getElementById('roomInput').value.trim().toUpperCase() || genRoomCode();
  document.getElementById('roomInput').value = code;

  fetch('/api/room/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code:      code,
      topic:     topic,
      stance:    document.getElementById('debateStance').value,
      maxRounds: parseInt(document.getElementById('debateMaxR').value),
      tone:      debateTone,
      host:      currentUser ? currentUser.name : 'Player1'
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) { alert('Error: ' + d.error); return; }
    myRoom = code; myRoomRole = 'host';
    var st = document.getElementById('roomStatus');
    st.className = 'room-status show waiting';
    st.textContent = 'Room ' + code + ' created! Waiting for your friend...';
    var cl = document.getElementById('copyLink');
    cl.className = 'copy-link show';
    cl.textContent = 'Share code: ' + code;
    if (mpPollTimer) clearInterval(mpPollTimer);
    mpPollTimer = setInterval(function() { checkRoomForGuest(code); }, 2000);
  });
}

function joinRoom() {
  var code = document.getElementById('roomInput').value.trim().toUpperCase();
  if (!code) { alert('Enter a room code.'); return; }

  fetch('/api/room/' + code + '/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest: currentUser ? currentUser.name : 'Player2' })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.error) {
      var st = document.getElementById('roomStatus');
      st.className = 'room-status show err';
      st.textContent = 'Room ' + code + ' not found. Ask your friend to create it.';
      return;
    }
    myRoom = code; myRoomRole = 'guest';
    var st = document.getElementById('roomStatus');
    st.className = 'room-status show ready';
    st.textContent = 'Joined room ' + code + '! Starting...';
    document.getElementById('copyLink').className = 'copy-link';
    if (mpPollTimer) clearInterval(mpPollTimer);
    setTimeout(function() { launchMultiplayer(d.room, 'guest'); }, 1200);
  });
}

function checkRoomForGuest(code) {
  fetch('/api/room/' + code)
  .then(function(r) { return r.json(); })
  .then(function(room) {
    if (room.status === 'ready' && room.guest) {
      clearInterval(mpPollTimer);
      var st = document.getElementById('roomStatus');
      st.className = 'room-status show ready';
      st.textContent = room.guest + ' joined! Starting...';
      setTimeout(function() { launchMultiplayer(room, 'host'); }, 1200);
    }
  });
}

function copyRoomLink() {
  var code = document.getElementById('roomInput').value.trim().toUpperCase();
  navigator.clipboard.writeText('Room code: ' + code)
    .then(function() { alert('Copied: ' + code); })
    .catch(function() { alert('Room code: ' + code); });
}

function launchMultiplayer(room, role) {
  debateCfg = { topic: room.topic, userStance: room.stance, maxRounds: room.maxRounds, tone: room.tone, mode: 'multiplayer', roomCode: room.code, role: role };
  debateMsgs = []; debateRound = 0;
  document.getElementById('chatMsgs').innerHTML = '<div class="typing" id="typingEl"><div class="tdots"><span></span><span></span><span></span></div></div>';
  document.getElementById('arenaTopic').textContent = '"' + room.topic + '"';
  document.getElementById('debateSetup').style.display = 'none';
  document.getElementById('debateArena').className = 'arena visible';
  document.getElementById('analysisPanel').className = 'analysis-panel';
  document.getElementById('mpBadge').textContent = 'vs ' + (role === 'host' ? (room.guest || 'Friend') : (room.host || 'Host'));
  document.getElementById('mpBadge').className = 'mpbadge live';
  updateRoundBadge();
  addMsg('system', 'Multiplayer room: ' + room.code + '. ' + (role === 'host' ? 'You are HOST. Go first!' : 'You are GUEST. Wait for host.'));
  if (role === 'guest') startMPPoll();
}

function startMPPoll() {
  if (mpPollTimer) clearInterval(mpPollTimer);
  mpPollTimer = setInterval(pollMPMessages, 2000);
}

function pollMPMessages() {
  if (!myRoom) return;
  fetch('/api/room/' + myRoom)
  .then(function(r) { return r.json(); })
  .then(function(room) {
    var known = debateMsgs.filter(function(m) { return m.role !== 'system'; }).length;
    if (room.messages.length > known) {
      for (var i = known; i < room.messages.length; i++) {
        var m = room.messages[i];
        if (m.author !== myRoomRole) {
          addMsg('opponent', m.text);
          debateMsgs.push({ role: 'user', content: m.text });
          debateRound++; updateRoundBadge();
          document.getElementById('sendBtn').disabled = false;
          addMsg('system', 'Your turn!');
        }
      }
    }
    if (room.status === 'ended' && document.getElementById('analysisPanel').className === 'analysis-panel') {
      clearInterval(mpPollTimer);
      addMsg('system', 'Opponent ended the debate. Generating analysis...');
      endDebate();
    }
  });
}

function sendMPMessage(text) {
  if (!myRoom) return;
  fetch('/api/room/' + myRoom + '/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: myRoomRole, text: text })
  });
}

// ── LIVE DEBATE (AI MODE) ─────────────────────────────────────────
function startAIDebate() {
  var topic = document.getElementById('debateTopic').value.trim();
  if (!topic) { alert('Enter a debate topic first.'); return; }

  debateCfg = {
    topic:      topic,
    userStance: document.getElementById('debateStance').value,
    maxRounds:  parseInt(document.getElementById('debateMaxR').value),
    tone:       debateTone,
    mode:       'ai'
  };
  debateMsgs = []; debateRound = 0;

  document.getElementById('chatMsgs').innerHTML = '<div class="typing" id="typingEl"><div class="tdots"><span></span><span></span><span></span></div></div>';
  document.getElementById('arenaTopic').textContent = '"' + topic + '"';
  document.getElementById('debateSetup').style.display = 'none';
  document.getElementById('debateArena').className = 'arena visible';
  document.getElementById('analysisPanel').className = 'analysis-panel';
  document.getElementById('mpBadge').textContent = 'vs AI';
  document.getElementById('mpBadge').className = 'mpbadge';
  updateRoundBadge();

  var botStance = debateCfg.userStance === 'pro' ? 'AGAINST' : 'FOR';
  var td = toneDesc(debateTone);
  var sysMsg = 'You are a sharp debate opponent. Topic: "' + topic + '". '
    + 'You argue ' + botStance + '. Tone: ' + td + '. '
    + 'Be concise (2-3 sentences per turn), direct, intellectually challenging. '
    + 'Only respond with your debate argument. No meta-commentary.';
  debateMsgs.push({ role: 'system', content: sysMsg });

  showTyping(true);
  callAPI(
    debateMsgs.concat([{ role: 'user', content: 'Open with a strong ' + botStance + ' argument. 2-3 sentences. Tone: ' + td }]),
    function(err, text) {
      showTyping(false);
      if (err) { addMsg('bot', 'Error: ' + err); return; }
      debateMsgs.push({ role: 'assistant', content: text });
      addMsg('bot', text);
      debateRound = 1; updateRoundBadge();
    }
  );
}

function updateRoundBadge() {
  document.getElementById('roundBadge').textContent = 'Round ' + debateRound + '/' + (debateCfg.maxRounds || 5);
}

function addMsg(role, text) {
  var c = document.getElementById('chatMsgs');
  var t = document.getElementById('typingEl');
  var div = document.createElement('div');
  div.className = 'msg ' + role;
  var label = role === 'user' ? (currentUser ? currentUser.name.split(' ')[0] : 'You') : role === 'bot' ? 'DebateAI' : role === 'opponent' ? 'Opponent' : '';
  var bubble = '<div class="mbubble">' + esc(text) + '</div>';
  var meta   = label ? '<div class="mmeta">' + label + '</div>' : '';
  div.innerHTML = bubble + meta;
  if (t) c.insertBefore(div, t); else c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function esc(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
}

function showTyping(show) {
  var t = document.getElementById('typingEl');
  if (t) t.style.display = show ? 'block' : 'none';
  var c = document.getElementById('chatMsgs');
  if (c) c.scrollTop = c.scrollHeight;
}

function sendArg() {
  if (isSending) return;
  var input = document.getElementById('userInput').value.trim();
  if (!input) return;
  document.getElementById('userInput').value = '';

  addMsg('user', input);

  if (debateCfg.mode === 'multiplayer') {
    sendMPMessage(input);
    debateMsgs.push({ role: 'user', content: input });
    debateRound++; updateRoundBadge();
    document.getElementById('sendBtn').disabled = true;
    addMsg('system', 'Argument sent! Waiting for opponent...');
    startMPPoll();
    return;
  }

  if (debateRound >= debateCfg.maxRounds) { endDebate(); return; }
  debateMsgs.push({ role: 'user', content: input });
  debateRound++; updateRoundBadge();
  isSending = true;
  document.getElementById('sendBtn').disabled = true;
  showTyping(true);
  callAPI(debateMsgs, function(err, text) {
    showTyping(false); isSending = false;
    document.getElementById('sendBtn').disabled = false;
    if (err) { addMsg('bot', 'Error: ' + err); return; }
    debateMsgs.push({ role: 'assistant', content: text });
    addMsg('bot', text);
    if (debateRound >= debateCfg.maxRounds) setTimeout(endDebate, 900);
  });
}

function getHint() {
  var p = 'Give a short 1-2 sentence debate tip for arguing '
    + (debateCfg.userStance === 'pro' ? 'FOR' : 'AGAINST')
    + ' the topic: "' + debateCfg.topic + '". Be specific.';
  showTyping(true);
  callAPI([{ role: 'user', content: p }], function(err, text) {
    showTyping(false);
    addMsg('bot', 'HINT: ' + (err ? 'Could not get hint.' : text));
  });
}

function endDebate() {
  if (debateMsgs.length < 2) { alert('Have at least one exchange first.'); return; }
  if (myRoom) {
    fetch('/api/room/' + myRoom + '/end', { method: 'POST' });
  }
  if (mpPollTimer) clearInterval(mpPollTimer);
  showTyping(true);
  document.getElementById('sendBtn').disabled = true;

  var turns = debateMsgs.filter(function(m) { return m.role !== 'system'; });
  var transcript = '';
  turns.forEach(function(m, i) {
    transcript += '[Turn ' + (i+1) + '] ' + (m.role === 'user' ? 'HUMAN' : 'AI') + ': ' + m.content + '\n\n';
  });

  var name = currentUser ? currentUser.name : 'User';
  var userSide = debateCfg.userStance === 'pro' ? 'FOR' : 'AGAINST';

  var p = 'You are a debate judge. Score the HUMAN debater only.\n\n'
    + 'TOPIC: ' + debateCfg.topic + '\n'
    + 'HUMAN (' + name + ') argued: ' + userSide + '\n\n'
    + 'TRANSCRIPT:\n' + transcript
    + '\nRespond using EXACTLY these markers (one per line, value after the colon):\n\n'
    + 'SCORE_LOGIC: [integer 1-10]\n'
    + 'SCORE_PERSUASION: [integer 1-10]\n'
    + 'SCORE_OVERALL: [integer 1-10]\n'
    + 'SUMMARY: [2-3 sentences about how the human performed]\n'
    + 'STRENGTH_1: [specific strength of the human]\n'
    + 'STRENGTH_2: [another strength]\n'
    + 'STRENGTH_3: [another strength]\n'
    + 'WEAKNESS_1: [specific area to improve]\n'
    + 'WEAKNESS_2: [another area]\n'
    + 'WEAKNESS_3: [another area]\n'
    + 'VERDICT: [who won and why, 2 sentences]\n\n'
    + 'Output only the markers and values. No extra text.';

  callAPI([{ role: 'user', content: p }], function(err, text) {
    showTyping(false);
    document.getElementById('sendBtn').disabled = false;
    if (err) { alert('Analysis failed: ' + err); return; }
    renderAnalysis(text, name);
  }, 800);
}

function extractLine(text, marker) {
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.toUpperCase().indexOf(marker.toUpperCase() + ':') === 0) {
      return line.substring(marker.length + 1).trim();
    }
  }
  return '';
}

function renderAnalysis(text, userName) {
  function cleanScore(v) {
    var n = parseInt((v || '').replace(/[^0-9]/g, ''));
    return (isNaN(n) || n < 1 || n > 10) ? '?' : n;
  }

  document.getElementById('sLogic').textContent      = cleanScore(extractLine(text, 'SCORE_LOGIC'))      + '/10';
  document.getElementById('sPersuasion').textContent = cleanScore(extractLine(text, 'SCORE_PERSUASION')) + '/10';
  document.getElementById('sOverall').textContent    = cleanScore(extractLine(text, 'SCORE_OVERALL'))    + '/10';
  document.getElementById('aSummary').textContent    = extractLine(text, 'SUMMARY')  || 'N/A';
  document.getElementById('aVerdict').textContent    = extractLine(text, 'VERDICT')  || 'N/A';
  document.getElementById('analysisSub').textContent = (userName || 'Your') + ' performance';

  function makeItem(txt, dc) {
    if (!txt) return '';
    return '<div class="si"><div class="d ' + dc + '"></div><span>' + esc(txt) + '</span></div>';
  }
  document.getElementById('aStrengths').innerHTML =
    makeItem(extractLine(text,'STRENGTH_1'),'g') +
    makeItem(extractLine(text,'STRENGTH_2'),'g') +
    makeItem(extractLine(text,'STRENGTH_3'),'g');
  document.getElementById('aWeaknesses').innerHTML =
    makeItem(extractLine(text,'WEAKNESS_1'),'r') +
    makeItem(extractLine(text,'WEAKNESS_2'),'r') +
    makeItem(extractLine(text,'WEAKNESS_3'),'r');

  var ap = document.getElementById('analysisPanel');
  ap.className = 'analysis-panel visible';
  ap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetDebate() {
  debateMsgs = []; debateRound = 0; debateCfg = {}; myRoom = null; myRoomRole = null;
  if (mpPollTimer) clearInterval(mpPollTimer);
  document.getElementById('debateArena').className   = 'arena';
  document.getElementById('debateSetup').style.display = 'block';
  document.getElementById('analysisPanel').className = 'analysis-panel';
  document.getElementById('debateTopic').value = '';
  document.getElementById('roomInput').value   = '';
  document.getElementById('roomStatus').className = 'room-status';
  document.getElementById('copyLink').className   = 'copy-link';
}

// ── SPEECH ────────────────────────────────────────────────────────
function setMicState(state, msg) {
  var btn  = document.getElementById('micBtn');
  var hint = document.getElementById('speechHint');
  var states = {
    idle:       { cls: 'mic-btn',     icon: '&#x1F3A4;', txt: 'Click mic to speak (Chrome works best)' },
    listening:  { cls: 'mic-btn rec', icon: '&#x23F9;',  txt: 'Listening... speak now. Click to stop.' },
    processing: { cls: 'mic-btn',     icon: '&#x23F3;',  txt: 'Processing speech...' },
    done:       { cls: 'mic-btn',     icon: '&#x2705;',  txt: 'Done! Edit if needed, then send.' },
    error:      { cls: 'mic-btn',     icon: '&#x1F3A4;', txt: msg || 'Mic error. Try again.' },
    nosupport:  { cls: 'mic-btn',     icon: '&#x274C;',  txt: 'Speech not supported. Use Chrome.' }
  };
  var s = states[state] || states.idle;
  btn.className = s.cls;
  btn.innerHTML = s.icon;
  hint.textContent = msg || s.txt;
  hint.style.color = state === 'listening' ? '#f43f5e' : state === 'done' ? '#10b981' : state === 'error' ? '#f43f5e' : '';
}

function setupSpeech() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setMicState('nosupport');
    document.getElementById('micBtn').disabled = true;
    document.getElementById('micBtn').style.opacity = '0.4';
    return;
  }
  recognition = new SR();
  recognition.continuous     = false;
  recognition.interimResults = true;
  recognition.lang           = 'en-US';

  recognition.onstart = function() {
    isRecording = true;
    setMicState('listening');
  };

  recognition.onresult = function(e) {
    var interim = '', final = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final   += e.results[i][0].transcript;
      else                       interim += e.results[i][0].transcript;
    }
    document.getElementById('userInput').value = final || interim;
    if (interim) {
      setMicState('listening', 'Hearing: "' + interim.substring(0, 50) + (interim.length > 50 ? '...' : '"'));
    }
  };

  recognition.onend = function() {
    isRecording = false;
    var val = document.getElementById('userInput').value.trim();
    setMicState(val ? 'done' : 'idle');
  };

  recognition.onerror = function(e) {
    isRecording = false;
    var msgs = {
      'not-allowed': 'Mic permission denied. Allow access in browser settings.',
      'no-speech':   'No speech detected. Speak louder or closer to mic.',
      'network':     'Network error. Check your connection.',
      'aborted':     'Recording stopped.'
    };
    setMicState('error', msgs[e.error] || 'Mic error: ' + e.error);
  };
}

function toggleMic() {
  if (!recognition) { setMicState('nosupport'); return; }
  if (isRecording) {
    recognition.stop();
    isRecording = false;
    setMicState('idle');
  } else {
    try {
      recognition.start();
    } catch(e) {
      setMicState('error', 'Could not start mic: ' + e.message);
    }
  }
}

// ── INIT ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  showPage('login'); // Initial page
  var ta = document.getElementById('userInput');
  if (ta) {
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendArg(); }
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'Enter') generateDebate();
  });
  setupSpeech();
});
