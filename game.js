(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('gameShell');
  const $ = (id) => document.getElementById(id);
  const ui = {
    start: $('startModal'), end: $('endModal'), pause: $('pauseModal'), play: $('playBtn'), rematch: $('rematchBtn'),
    resume: $('resumeBtn'), quit: $('quitBtn'), pauseBtn: $('pauseBtn'), sound: $('soundBtn'),
    playerScore: $('playerScore'), botScore: $('botScore'), timer: $('timer'), status: $('matchStatus'),
    toast: $('toast'), finalPlayer: $('finalPlayer'), finalBot: $('finalBot'), resultTitle: $('resultTitle'),
    resultKicker: $('resultKicker'), resultCopy: $('resultCopy'), stickZone: $('stickZone'), knob: $('stickKnob'),
    shoot: $('shootBtn'), curve: $('curveBtn'), dash: $('dashBtn')
  };
  const input = { x: 0, y: 0, shoot: false, shootStarted: 0, curve: false, dash: false, keys: Object.create(null) };
  let W = 0, H = 0, dpr = 1, last = 0, elapsed = 0, seconds = 90, state = 'menu', soundOn = false;
  let playerScore = 0, botScore = 0, toastTimer = 0, goalPause = 0, particles = [], audioCtx = null;
  const field = { x: 0, y: 0, w: 0, h: 0 };
  const player = { x: .5, y: .77, vx: 0, vy: 0, faceX: 0, faceY: -1, stamina: 1, dashTime: 0, kickCooldown: 0, anim: 0, team: 'blue' };
  const bot = { x: .5, y: .23, vx: 0, vy: 0, faceX: 0, faceY: 1, kickCooldown: 0, anim: 0, team: 'orange' };
  const ball = { x: .5, y: .5, vx: 0, vy: 0, spin: 0, z: 0, vz: 0, lastTouch: 'none' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const rand = (a,b) => a+Math.random()*(b-a);

  function resize() {
    const rect = shell.getBoundingClientRect(); W = rect.width; H = rect.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
    const aspect = W/H;
    if (aspect < .8) { field.w = W*.91; field.h = Math.min(H*.72, field.w*1.48); }
    else if (aspect < 1.35) { field.w = Math.min(W*.78,H*.82*.64); field.h = field.w/0.64; }
    else { field.w = Math.min(W*.70,H*.78*.78); field.h = field.w/0.78; }
    field.x = (W-field.w)/2;
    field.y = (H-field.h)/2 + (aspect < .8 ? 0 : 6);
    if (field.h > H*.82) { field.h=H*.82; field.w=Math.min(field.w,field.h*.64);field.x=(W-field.w)/2; }
  }
  window.addEventListener('resize',resize,{passive:true}); resize();
  const sx = x => field.x+x*field.w, sy = y => field.y+y*field.h;
  const unit = () => ({x:rand(.16,.84),y:.5});

  function resetPositions() {
    player.x=.5; player.y=.77; player.vx=player.vy=0; player.faceX=0; player.faceY=-1; player.kickCooldown=0; player.dashTime=0;
    bot.x=.5; bot.y=.23; bot.vx=bot.vy=0; bot.faceX=0; bot.faceY=1; bot.kickCooldown=rand(.3,.7);
    ball.x=.5; ball.y=.5; ball.vx=ball.vy=0; ball.spin=0; ball.z=0; ball.vz=0; ball.lastTouch='none'; goalPause=0;
  }
  function startMatch() { playerScore=botScore=0; seconds=90; elapsed=0; particles=[]; resetPositions(); state='playing'; ui.start.classList.add('hidden');ui.end.classList.add('hidden');ui.pause.classList.add('hidden');ui.status.textContent='LIVE MATCH';updateHud(); }
  function updateHud() { ui.playerScore.textContent=playerScore;ui.botScore.textContent=botScore;const s=Math.ceil(seconds);ui.timer.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;ui.timer.style.color=seconds<=15?'#ff8b67':'var(--lime)'; }
  function announce(text) { ui.toast.textContent=text;ui.toast.classList.remove('show');void ui.toast.offsetWidth;ui.toast.classList.add('show');toastTimer=1.5; }
  function finish() { state='finished';ui.status.textContent='FULL TIME';ui.finalPlayer.textContent=playerScore;ui.finalBot.textContent=botScore;const won=playerScore>botScore;ui.resultTitle.textContent=won?'VICTORY':playerScore===botScore?'DRAW':'DEFEAT';ui.resultTitle.style.color=won?'var(--lime)':playerScore===botScore?'#f4f3e8':'var(--orange)';ui.resultKicker.textContent=won?'THE PITCH IS YOURS':playerScore===botScore?'ALL SQUARE':'SO CLOSE';ui.resultCopy.textContent=won?'The pitch remembers. Run it back?':playerScore===botScore?'One more goal would have done it.':'Every great run starts with a rematch.';ui.end.classList.remove('hidden'); }
  function goal(scoring) { if(state!=='playing'||goalPause>0)return; if(scoring==='player')playerScore++;else botScore++;updateHud();goalPause=1.65;ball.vx=ball.vy=0;ball.z=0;ball.vz=0;celebrate(scoring==='player'?field.x+field.w/2:field.x+field.w/2, scoring==='player'?field.y+field.h*.05:field.y+field.h*.95, scoring==='player'?'#d8ff54':'#ff744b');announce(scoring==='player'?'GOAL!':'THEY SCORED');sound('goal'); if(playerScore>=5||botScore>=5)goalPause=2.1; }
  function endGoalPause() { if(playerScore>=5||botScore>=5){finish();return;}resetPositions(); }
  function celebrate(x,y,color) { for(let i=0;i<42;i++){const a=rand(0,Math.PI*2),speed=rand(60,300);particles.push({x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,life:rand(.55,1.3),max:1.3,size:rand(2,5),color,gravity:rand(70,180)});} }

  function moveEntity(e,dx,dy,speed,dt,accel=11) {
    const mag=Math.hypot(dx,dy);if(mag>1){dx/=mag;dy/=mag;}
    const targetX=dx*speed,targetY=dy*speed;
    e.vx += (targetX-e.vx)*Math.min(1,accel*dt);e.vy += (targetY-e.vy)*Math.min(1,accel*dt);
    if(Math.hypot(e.vx,e.vy)>.045){const m=Math.hypot(e.vx,e.vy);e.faceX=e.vx/m;e.faceY=e.vy/m;}
    e.x=clamp(e.x+e.vx*dt,.045,.955);e.y=clamp(e.y+e.vy*dt,.07,.93);e.anim+=Math.hypot(e.vx,e.vy)*dt*13;
  }
  function shoot(e,who,power,curve) {
    if(e.kickCooldown>0)return false;
    const near=Math.hypot(e.x-ball.x,(e.y-ball.y)*.86);
    if(near>.135)return false;
    let dx=(.5-e.x)*.47 + e.vx*.12;
    if(Math.abs(dx)<.06)dx=(e.x<.5?.075:-.075);
    let dy=who==='player'?-1:1;
    const norm=Math.hypot(dx,dy);dx/=norm;dy/=norm;
    const strength=1.12+power*.82;
    ball.x=e.x+dx*.055;ball.y=e.y+dy*.045;ball.vx=dx*strength;ball.vy=dy*strength;ball.z=.012;ball.vz=.2+power*.28;
    ball.spin=curve?(input.x<-.14?-1:input.x>.14?1:(e.x<.5?1:-1))*2.2:0;
    ball.lastTouch=who;e.kickCooldown=.58;sound('kick');
    for(let i=0;i<8;i++)particles.push({x:sx(ball.x),y:sy(ball.y),vx:rand(-45,45),vy:rand(-45,45),life:.28,max:.28,size:rand(2,4),color:'#f5f4e8',gravity:0});
    return true;
  }
  function tryHumanShot(power) { if(state!=='playing'||goalPause>0)return;const ok=shoot(player,'player',clamp(power,0,1),input.curve||input.keys.Shift);if(!ok)announce('GET CLOSER');else{if(input.curve||input.keys.Shift)announce('BEND IT');} }
  function update(dt) {
    elapsed+=dt;if(toastTimer>0)toastTimer-=dt;
    particles=particles.filter(p=>p.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.gravity*dt;p.life-=dt;}
    if(state!=='playing')return;
    if(goalPause>0){goalPause-=dt;if(goalPause<=0)endGoalPause();return;}
    seconds-=dt;if(seconds<=0){seconds=0;updateHud();finish();return;} updateHud();
    player.kickCooldown=Math.max(0,player.kickCooldown-dt);bot.kickCooldown=Math.max(0,bot.kickCooldown-dt);
    let ix=input.x,iy=input.y;
    if(input.keys.ArrowLeft||input.keys.a||input.keys.A)ix-=1;if(input.keys.ArrowRight||input.keys.d||input.keys.D)ix+=1;
    if(input.keys.ArrowUp||input.keys.w||input.keys.W)iy-=1;if(input.keys.ArrowDown||input.keys.s||input.keys.S)iy+=1;
    const dashRequested=input.dash||input.keys.e||input.keys.E;
    if(dashRequested&&player.stamina>.12&&player.dashTime<=0&&Math.hypot(ix,iy)>.2){player.dashTime=.22;player.stamina-=.27;sound('dash');}
    player.dashTime=Math.max(0,player.dashTime-dt);player.stamina=Math.min(1,player.stamina+dt*.11);
    moveEntity(player,ix,iy,player.dashTime>0?1.12:.64,dt,player.dashTime>0?22:14);
    // The rival pressures the ball, but recovers toward its own half and shoots as soon as it can.
    let tx=ball.x,ty=ball.y;
    if(ball.y>.47&&ball.lastTouch==='player'){tx=lerp(ball.x,.5,.28);ty=.32;}
    if(ball.y<.34&&ball.lastTouch==='bot'){tx=lerp(ball.x,.5,.22);ty=.38;}
    let bx=tx-bot.x,by=ty-bot.y;const bdist=Math.hypot(bx,by);
    if(bdist>.09){bx/=Math.max(bdist,.001);by/=Math.max(bdist,.001);}else{bx=0;by=0;}
    moveEntity(bot,bx,by,.49,dt,8.5);
    const botNear=Math.hypot(bot.x-ball.x,(bot.y-ball.y)*.9);
    if(botNear<.095&&bot.kickCooldown<=0){const inRange=ball.y>.38&&ball.y<.93;if(inRange&&Math.random()<dt*2.7){shoot(bot,'bot',rand(.32,.68),Math.random()<.25);}else if(botNear<.06){ball.vx+=(ball.x-bot.x)*.9;ball.vy+=(ball.y-bot.y)*.9;}}
    // Soft player/ball contact turns movement into a close-control dribble.
    const pd=Math.hypot(player.x-ball.x,(player.y-ball.y)*.88);
    if(pd<.085&&Math.hypot(ball.vx,ball.vy)<1.22){const n=Math.max(pd,.001),nx=(ball.x-player.x)/n,ny=(ball.y-player.y)/n;ball.vx+= (player.vx*.95+nx*.17)*dt*9;ball.vy+=(player.vy*.95+ny*.17)*dt*9;ball.lastTouch='player';}
    const collision=Math.hypot(bot.x-ball.x,(bot.y-ball.y)*.88);
    if(collision<.075&&Math.hypot(ball.vx,ball.vy)<.7){ball.vx+=(ball.x-bot.x)*dt*4;ball.vy+=(ball.y-bot.y)*dt*4;}
    // Curvature is a real lateral force on a spinning shot.
    ball.vx += ball.spin*Math.abs(ball.vy)*dt*.38;
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.z+=ball.vz*dt;ball.vz-=1.55*dt;
    if(ball.z<0){ball.z=0;ball.vz=Math.abs(ball.vz)*.34;if(ball.vz<.075)ball.vz=0;}
    const friction=ball.z>0?.994:.986;ball.vx*=Math.pow(friction,dt*60);ball.vy*=Math.pow(friction,dt*60);ball.spin*=Math.pow(.985,dt*60);
    // Touchline rebound.
    if(ball.x<.025){ball.x=.025;ball.vx=Math.abs(ball.vx)*.58;ball.spin*=-.7;}
    if(ball.x>.975){ball.x=.975;ball.vx=-Math.abs(ball.vx)*.58;ball.spin*=-.7;}
    // Goals are open: the ball only scores when it clears the goal mouth.
    const goalMouth=Math.abs(ball.x-.5)<.225;
    if(ball.y<.045&&goalMouth&&ball.z<.18){goal('player');return;}
    if(ball.y>.955&&goalMouth&&ball.z<.18){goal('bot');return;}
    // A missed shot kisses the end wall and rolls back into play.
    if(ball.y<.035&&!goalMouth){ball.y=.035;ball.vy=Math.abs(ball.vy)*.58;}
    if(ball.y>.965&&!goalMouth){ball.y=.965;ball.vy=-Math.abs(ball.vy)*.58;}
    if(input.shoot&&performance.now()-input.shootStarted>520){input.shootCharged=true;ui.shoot.classList.add('pressed');}
  }

  function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
  function drawBackground(t) {
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#102d25');bg.addColorStop(.48,'#16382d');bg.addColorStop(1,'#071b16');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // floodlights and distant stands
    for(let i=0;i<5;i++){const x=W*(.1+i*.2);const gl=ctx.createRadialGradient(x,field.y-25,2,x,field.y-25,field.w*.22);gl.addColorStop(0,'rgba(226,255,177,.075)');gl.addColorStop(1,'rgba(226,255,177,0)');ctx.fillStyle=gl;ctx.fillRect(x-field.w*.22,field.y-90,field.w*.44,field.h+180);}
    for(let side=0;side<2;side++){const xx=side===0?field.x*.5:field.x+field.w+(W-field.x-field.w)*.5;for(let i=0;i<70;i++){const y=field.y-16+(field.h+32)*i/70;const flick=.45+.25*Math.sin(t*2+i*4);ctx.fillStyle=`rgba(${i%3===0?'255,126,82':'203,231,182'},${flick*.18})`;ctx.beginPath();ctx.arc(xx+Math.sin(i*2.2)*field.w*.018,y,1.2+(i%4)*.35,0,Math.PI*2);ctx.fill();}}
  }
  function drawField(t) {
    const {x,y,w,h}=field;
    // field shadow + painted surface
    ctx.save();ctx.shadowColor='#0009';ctx.shadowBlur=30;ctx.shadowOffsetY=14;roundedRect(ctx,x-5,y-5,w+10,h+10,10);ctx.fillStyle='#061610';ctx.fill();ctx.restore();
    const turf=ctx.createLinearGradient(x,y,x+w,y+h);turf.addColorStop(0,'#1d7145');turf.addColorStop(.5,'#155e3a');turf.addColorStop(1,'#104e34');roundedRect(ctx,x,y,w,h,7);ctx.fillStyle=turf;ctx.fill();ctx.save();roundedRect(ctx,x,y,w,h,7);ctx.clip();
    // alternating close-cut stripes
    for(let i=0;i<8;i++){ctx.fillStyle=i%2?'rgba(0,25,11,.055)':'rgba(183,255,134,.035)';ctx.fillRect(x,y+h*i/8,w,h/8+1);}
    for(let i=0;i<16;i++){ctx.fillStyle=`rgba(228,255,201,${.015+(i%3)*.008})`;ctx.fillRect(x+((i*71)%w),y+((i*139)%h),1,1);}
    ctx.strokeStyle='rgba(236,255,220,.61)';ctx.lineWidth=Math.max(1.1,w*.0021);ctx.lineCap='round';
    const inset=w*.055;ctx.strokeRect(x+inset,y+inset,w-inset*2,h-inset*2);
    ctx.beginPath();ctx.moveTo(x+inset,y+h/2);ctx.lineTo(x+w-inset,y+h/2);ctx.stroke();
    ctx.beginPath();ctx.arc(x+w/2,y+h/2,w*.115,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(240,255,220,.8)';ctx.beginPath();ctx.arc(x+w/2,y+h/2,2,0,Math.PI*2);ctx.fill();
    // penalty boxes and six-yard boxes
    const boxW=w*.49,boxH=h*.13,sixW=w*.27,sixH=h*.055;
    ctx.strokeRect(x+(w-boxW)/2,y+inset,boxW,boxH);ctx.strokeRect(x+(w-sixW)/2,y+inset,sixW,sixH);
    ctx.strokeRect(x+(w-boxW)/2,y+h-inset-boxH,boxW,boxH);ctx.strokeRect(x+(w-sixW)/2,y+h-inset-sixH,sixW,sixH);
    ctx.beginPath();ctx.arc(x+w/2,y+inset+boxH*.83,w*.075,.13*Math.PI,.87*Math.PI);ctx.stroke();ctx.beginPath();ctx.arc(x+w/2,y+h-inset-boxH*.83,w*.075,1.13*Math.PI,1.87*Math.PI);ctx.stroke();
    // subtle corner arcs
    for(const cy of [y+inset,y+h-inset])for(const cx of [x+inset,x+w-inset]){ctx.beginPath();ctx.arc(cx,cy,w*.025,0,Math.PI/2);ctx.stroke();}
    ctx.restore();
    drawGoal(x+w*.5,y+inset-2,w*.43,true);drawGoal(x+w*.5,y+h-inset+2,w*.43,false);
    // outer boundary glow
    ctx.strokeStyle='rgba(204,255,157,.12)';ctx.lineWidth=1;roundedRect(ctx,x-1,y-1,w+2,h+2,8);ctx.stroke();
  }
  function drawGoal(cx,y,width,top) {
    const x=cx-width/2,depth=Math.max(12,field.h*.018),dir=top?-1:1;
    ctx.save();ctx.fillStyle='rgba(7,22,17,.66)';ctx.fillRect(x,y,width,depth*dir);
    ctx.strokeStyle='rgba(236,249,221,.32)';ctx.lineWidth=1;
    for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(x+width*i/8,y);ctx.lineTo(x+width*i/8,y+depth*dir);ctx.stroke();}
    for(let j=1;j<=3;j++){ctx.beginPath();ctx.moveTo(x,y+depth*dir*j/4);ctx.lineTo(x+width,y+depth*dir*j/4);ctx.stroke();}
    ctx.strokeStyle='#e7f2dd';ctx.lineWidth=3;ctx.shadowColor='#e9ffd5';ctx.shadowBlur=6;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.stroke();ctx.restore();
  }
  function drawShadow(x,y,r,alpha=.25){ctx.fillStyle=`rgba(0,10,7,${alpha})`;ctx.beginPath();ctx.ellipse(x,y,r*1.2,r*.46,0,0,Math.PI*2);ctx.fill();}
  function drawPlayer(e,isBot,t) {
    const x=sx(e.x), y=sy(e.y), scale=field.w/440, r=field.w*.027;
    const run=Math.sin(e.anim)*Math.min(1,Math.hypot(e.vx,e.vy)*2.5), lean=Math.hypot(e.vx,e.vy)*.18;
    drawShadow(x,y+r*.73,r*1.22,.31);
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(e.faceX,-e.faceY));
    // foot streak / legs
    ctx.strokeStyle=isBot?'#ffb08d':'#bbf0ff';ctx.lineWidth=Math.max(3,r*.31);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-r*.28,r*.35);ctx.lineTo(-r*.32+run*r*.45,r*.82);ctx.moveTo(r*.28,r*.35);ctx.lineTo(r*.32-run*r*.45,r*.82);ctx.stroke();
    // jersey body
    ctx.save();ctx.translate(0,-lean*r);ctx.fillStyle=isBot?'#ff704b':'#59c7ee';ctx.beginPath();ctx.ellipse(0,0,r*.78,r*.78,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=isBot?'#ffd4c2':'#d7f6ff';ctx.globalAlpha=.72;ctx.beginPath();ctx.arc(-r*.26,-r*.19,r*.19,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.fillStyle=isBot?'#6c2c22':'#13526c';ctx.font=`800 ${Math.max(8,r*.72)}px Manrope`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(isBot?'9':'10',0,1);
    ctx.fillStyle=isBot?'#edb68d':'#bd8b63';ctx.beginPath();ctx.arc(0,-r*.88,r*.47,0,Math.PI*2);ctx.fill();
    // hair/headband
    ctx.fillStyle=isBot?'#472c28':'#182a34';ctx.beginPath();ctx.arc(0,-r*.99,r*.47,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle=isBot?'#fff4e8':'#eaffff';ctx.fillRect(-r*.33,-r*.88,r*.66,r*.09);
    ctx.restore();
    // selection marker
    if(!isBot){ctx.strokeStyle='rgba(216,255,84,.82)';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,r*1.4,r*1.08,0,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function drawBall(t) {
    const x=sx(ball.x),y=sy(ball.y)-ball.z*field.h*.23,r=Math.max(5,field.w*.013);
    drawShadow(sx(ball.x),sy(ball.y)+r*.45,r*(1+ball.z*.6),.35);
    ctx.save();ctx.translate(x,y);ctx.rotate(t*2+ball.x*8);
    ctx.fillStyle='#fffdf2';ctx.strokeStyle='#d5d9c9';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle='#1b2824';for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*r*.48,Math.sin(a)*r*.48,r*.19,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    if(Math.abs(ball.spin)>.3&&Math.hypot(ball.vx,ball.vy)>.5){ctx.strokeStyle=`rgba(216,255,84,${Math.min(.55,Math.abs(ball.spin)*.2)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r*2.1,ball.spin>0?-.8:2.3,ball.spin>0?.8:3.9);ctx.stroke();}
  }
  function drawParticles() { for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1; }
  function draw(t) {
    ctx.clearRect(0,0,W,H);drawBackground(t);drawField(t);
    // player stamina arc below the controlled avatar
    drawPlayer(bot,true,t);drawPlayer(player,false,t);drawBall(t);drawParticles();
    if(state==='playing'&&player.stamina<.98){const x=sx(player.x),y=sy(player.y)+field.w*.045;ctx.strokeStyle='#d8ff5440';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,field.w*.021,-Math.PI/2,Math.PI*1.5);ctx.stroke();ctx.strokeStyle='#d8ff54';ctx.beginPath();ctx.arc(x,y,field.w*.021,-Math.PI/2,-Math.PI/2+Math.PI*2*player.stamina);ctx.stroke();}
  }
  function frame(now) {const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw(now/1000);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);

  function sound(type) { if(!soundOn)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(audioCtx.destination);const now=audioCtx.currentTime;osc.type=type==='goal'?'triangle':'sine';osc.frequency.setValueAtTime(type==='goal'?520:type==='dash'?180:125,now);osc.frequency.exponentialRampToValueAtTime(type==='goal'?880:70,now+.12);gain.gain.setValueAtTime(type==='goal'?.13:.055,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);osc.start(now);osc.stop(now+.19);}catch(_){}}
  ui.play.addEventListener('click',startMatch);ui.rematch.addEventListener('click',startMatch);
  ui.pauseBtn.addEventListener('click',()=>{if(state==='playing'){state='paused';ui.pause.classList.remove('hidden');ui.status.textContent='PAUSED';}});
  ui.resume.addEventListener('click',()=>{state='playing';ui.pause.classList.add('hidden');ui.status.textContent='LIVE MATCH';last=performance.now();});
  ui.quit.addEventListener('click',()=>{state='menu';ui.pause.classList.add('hidden');ui.start.classList.remove('hidden');ui.status.textContent='KICK OFF';});
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.textContent=soundOn?'♫':'♪';ui.sound.style.color=soundOn?'var(--lime)':'';if(soundOn)sound('kick');});
  window.addEventListener('keydown',e=>{input.keys[e.key]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key===' '&&!input.shoot){input.shoot=true;input.shootStarted=performance.now();input.shootCharged=false;}if(e.key==='Escape'&&state==='playing')ui.pauseBtn.click();},{passive:false});
  window.addEventListener('keyup',e=>{input.keys[e.key]=false;if(e.key===' '&&input.shoot){const charge=clamp((performance.now()-input.shootStarted)/850,0,1);tryHumanShot(input.shootCharged?charge:.42);input.shoot=false;input.shootCharged=false;ui.shoot.classList.remove('pressed');}});
  function bindHold(button,kind) {button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);if(kind==='shoot'){input.shoot=true;input.shootStarted=performance.now();input.shootCharged=false;}else if(kind==='dash'){input.dash=true;button.classList.add('pressed');}else{input.curve=!input.curve;button.classList.toggle('pressed',input.curve);}});const end=e=>{if(kind==='shoot'&&input.shoot){const charge=clamp((performance.now()-input.shootStarted)/850,0,1);tryHumanShot(input.shootCharged?charge:.42);input.shoot=false;input.shootCharged=false;button.classList.remove('pressed');}if(kind==='dash'){input.dash=false;button.classList.remove('pressed');}};button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);}
  bindHold(ui.shoot,'shoot');bindHold(ui.curve,'curve');bindHold(ui.dash,'dash');
  let stickPointer=null,stickRect=null;
  function stickMove(e){if(stickPointer!==e.pointerId)return;const rect=ui.stickZone.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=rect.width*.36,d=Math.hypot(dx,dy),scale=d>max?max/d:1;input.x=dx*scale/max;input.y=dy*scale/max;ui.knob.style.transform=`translate(${dx*scale}px,${dy*scale}px)`;}
  ui.stickZone.addEventListener('pointerdown',e=>{e.preventDefault();stickPointer=e.pointerId;ui.stickZone.setPointerCapture(e.pointerId);stickMove(e);});ui.stickZone.addEventListener('pointermove',stickMove);function stickEnd(e){if(stickPointer===e.pointerId){stickPointer=null;input.x=input.y=0;ui.knob.style.transform='translate(0,0)';}}ui.stickZone.addEventListener('pointerup',stickEnd);ui.stickZone.addEventListener('pointercancel',stickEnd);
  // Avoid accidental page gestures while playing; keyboard can still be used on desktop.
  document.addEventListener('contextmenu',e=>e.preventDefault());
})();
