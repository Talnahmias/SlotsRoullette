/* ============================================================
 * Zombie Slots: Graveyard Defense — Game Engine
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------------- META (persistent) ---------------------- */
  const META_KEY = 'zombieSlots.meta.v1';
  const defaultMeta = () => ({ bestWave: 0, bank: 0, research: {} });

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (!raw) return defaultMeta();
      const m = Object.assign(defaultMeta(), JSON.parse(raw));
      m.research = m.research || {};
      return m;
    } catch (e) {
      return defaultMeta();
    }
  }
  function saveMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  let meta = loadMeta();

  /* ---------------------- DOM HELPERS ---------------------- */
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (n) => Math.floor(Math.random() * n);

  /* ---------------------- SCREENS ---------------------- */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $('#' + id).classList.add('active');
  }
  function showOverlay(id, on) { $('#' + id).classList.toggle('open', on); }

  /* ---------------------- RUN STATE ---------------------- */
  let run = null;
  let busy = false; // input lock during animations

  function researchLvl(id) { return meta.research[id] || 0; }

  function newRun() {
    const reels = 3 + (researchLvl('reel') > 0 ? 1 : 0);
    const baseHp = 100 + researchLvl('hp') * 20;
    const baseSpins = 6 + researchLvl('spins');
    run = {
      wave: 0,
      coins: 0,
      gateMaxHp: baseHp,
      gateHp: baseHp,
      armor: 0,
      poison: 0,
      spins: 0,
      reels: reels,
      lastSymbols: new Array(reels).fill('sword'),
      zombies: [],
      shopUpgrades: {}, // tracks purchased counts per upgrade id this run
      up: { sword: 1, bomb: 1, heart: 1, coin: 1, crit: 0, spins: 0, gate: 0 },
      startingSpins: baseSpins,
      endless: false,
    };
  }

  /* ---------------------- WEIGHTED SYMBOL ROLL ---------------------- */
  function rollSymbol() {
    const oddsLvl = researchLvl('odds');
    const attack = { sword: 1, bomb: 1, lightning: 1, skull: 1 };
    let total = 0;
    const cum = [];
    for (const id of SYMBOL_ORDER) {
      let w = SYMBOLS[id].weight;
      if (oddsLvl && attack[id]) w += oddsLvl * 3; // bias toward attack symbols
      total += w;
      cum.push([id, total]);
    }
    const r = Math.random() * total;
    for (const [id, c] of cum) if (r < c) return id;
    return 'sword';
  }

  /* ---------------------- COMBO RESOLUTION ---------------------- */
  // Returns an array of action descriptors from the landed symbols.
  function resolveSymbols(syms) {
    const c = {};
    SYMBOL_ORDER.forEach((s) => (c[s] = 0));
    syms.forEach((s) => (c[s]++));
    const t = SYMBOL_TABLES;
    const m3 = (n) => Math.min(n, 3);
    const actions = [];
    let hSword = false, hBomb = false, hHeart = false, hShield = false, hSkull = false, hCoin = false;

    // --- Named mixed combos (classic 3-reel patterns) ---
    if (c.heart >= 2 && c.shield >= 1) {
      actions.push({ kind: 'fullheal' });
      actions.push({ kind: 'armor', amount: t.shield[m3(c.shield)] });
      actions.push({ kind: 'banner', text: 'GUARDIAN! Full heal + armor', tone: 'good' });
      hHeart = true; hShield = true;
    }
    if (c.sword === 2 && c.bomb === 1) {
      actions.push({ kind: 'single', dmg: 50, mult: 'sword' });
      actions.push({ kind: 'aoe', dmg: 12, mult: 'bomb' });
      actions.push({ kind: 'banner', text: 'CLEAVE! 50 dmg + blast', tone: 'hit' });
      hSword = true; hBomb = true;
    } else if (c.sword === 1 && c.bomb === 2) {
      actions.push({ kind: 'single', dmg: 75, mult: 'sword' });
      actions.push({ kind: 'stunAll' });
      actions.push({ kind: 'banner', text: 'SHOCK & AWE! 75 dmg + stun', tone: 'hit' });
      hSword = true; hBomb = true;
    }
    if (c.skull >= 3) {
      actions.push({ kind: 'instakill' });
      actions.push({ kind: 'banner', text: 'DEATH ITSELF! Instakill', tone: 'crit' });
      hSkull = true;
    }
    if (c.coin >= 3) {
      actions.push({ kind: 'coin', amount: t.coin[3] + 75, jackpot: true });
      actions.push({ kind: 'banner', text: 'JACKPOT! 💰', tone: 'gold' });
      hCoin = true;
    }
    if (c.spin >= 3) {
      actions.push({ kind: 'banner', text: 'FREE SPINS! +5 🔄', tone: 'good' });
    }

    // --- Per-symbol fallbacks ---
    if (!hSword && c.sword > 0) actions.push({ kind: 'single', dmg: t.sword[m3(c.sword)], mult: 'sword' });
    if (!hBomb && c.bomb > 0) actions.push({ kind: 'aoe', dmg: t.bomb[m3(c.bomb)], mult: 'bomb' });
    if (!hHeart && c.heart > 0) actions.push({ kind: 'heal', amount: t.heart[m3(c.heart)], mult: 'heart' });
    if (!hCoin && c.coin > 0) actions.push({ kind: 'coin', amount: t.coin[m3(c.coin)], mult: 'coin' });
    if (c.lightning > 0) actions.push({ kind: 'chain', dmg: t.lightning[m3(c.lightning)], targets: LIGHTNING_TARGETS[m3(c.lightning)] });
    if (!hShield && c.shield > 0) actions.push({ kind: 'armor', amount: t.shield[m3(c.shield)] });
    if (!hSkull && c.skull > 0) actions.push({ kind: 'single', dmg: t.skull[m3(c.skull)], mult: 'skull', crit: true });
    if (c.spin > 0) actions.push({ kind: 'spins', amount: t.spin[m3(c.spin)] });

    return actions;
  }

  /* ---------------------- COMBAT APPLICATION ---------------------- */
  function aliveZombies() { return run.zombies.filter((z) => z.alive); }
  function onFieldZombies() { return run.zombies.filter((z) => z.alive && z.dist <= 102); }

  function frontmost(n) {
    return aliveZombies().sort((a, b) => a.dist - b.dist).slice(0, n);
  }
  function strongest() {
    const a = aliveZombies();
    if (!a.length) return null;
    return a.sort((x, y) => y.maxHp - x.maxHp)[0];
  }

  function rollCrit() { return Math.random() < run.up.crit; }

  function damageZombie(z, dmg, opts) {
    opts = opts || {};
    let d = dmg;
    let crit = opts.crit || false;
    if (!crit && rollCrit()) crit = true;
    if (crit) d *= 2;
    if (z.isBoss) d *= (1 + researchLvl('boss') * 0.15);
    d = Math.round(d);
    z.hp -= d;
    floatText(z, '-' + d, crit ? 'dmg crit' : 'dmg');
    flashZombie(z, crit);
    if (z.hp <= 0) killZombie(z);
  }

  function killZombie(z) {
    if (!z.alive) return;
    z.alive = false;
    const reward = Math.round(z.reward * (1 + researchLvl('coins') * 0.10) * run.up.coin);
    run.coins += reward;
    floatText(z, '+' + reward + '🪙', 'gold');
    spawnPoof(z);
  }

  function healGate(amount) {
    const before = run.gateHp;
    run.gateHp = clamp(run.gateHp + Math.round(amount), 0, run.gateMaxHp);
    const healed = run.gateHp - before;
    if (healed > 0) floatGate('+' + healed, 'heal');
  }

  function applyActions(actions) {
    const swing = [];
    for (const a of actions) {
      switch (a.kind) {
        case 'banner':
          showBanner(a.text, a.tone);
          break;
        case 'single': {
          const target = frontmost(1)[0];
          let dmg = a.dmg;
          if (a.mult) dmg *= run.up[a.mult] || 1;
          if (target) damageZombie(target, dmg, { crit: a.crit });
          break;
        }
        case 'aoe': {
          let dmg = a.dmg * (run.up.bomb || 1);
          spawnExplosion();
          onFieldZombies().slice().forEach((z) => damageZombie(z, dmg));
          break;
        }
        case 'chain': {
          let dmg = a.dmg;
          const targets = frontmost(a.targets);
          targets.forEach((z) => { spawnBolt(z); damageZombie(z, dmg); });
          break;
        }
        case 'instakill': {
          const z = strongest();
          if (z) { floatText(z, 'SLAIN', 'crit'); z.hp = 0; killZombie(z); }
          break;
        }
        case 'stunAll':
          onFieldZombies().forEach((z) => (z.stunUntil = 1.5));
          break;
        case 'heal':
          healGate((a.amount || 0) * (run.up.heart || 1));
          break;
        case 'fullheal':
          healGate(run.gateMaxHp);
          break;
        case 'armor': {
          run.armor += Math.round(a.amount || 0);
          floatGate('+' + Math.round(a.amount) + '🛡️', 'armor');
          break;
        }
        case 'coin': {
          let amt = a.amount;
          if (!a.jackpot) amt *= (run.up.coin || 1);
          amt = Math.round(amt * (1 + researchLvl('coins') * 0.10));
          run.coins += amt;
          floatGate('+' + amt + '🪙', 'gold');
          break;
        }
        case 'spins':
          run.spins += a.amount;
          break;
      }
    }
    return swing;
  }

  /* ---------------------- REAL-TIME GAME LOOP ---------------------- */
  // Zombies move toward the gate continuously (independent of player spins).
  const MOVE_SCALE = 0.42;      // multiplies a zombie's `speed` -> battlefield units/sec
  const SPIN_REGEN_SEC = 1.8;   // a spin recharges this often, up to the cap
  const POISON_TICK_SEC = 1.0;  // gate poison applies once per second
  let rafId = null;
  let running = false;
  let lastT = 0;
  let regenTimer = 0;
  let poisonTimer = 0;
  let autoSpin = false;

  function spinCap() { return run.startingSpins + run.up.spins; }

  function startLoop() {
    if (running) return;
    running = true;
    lastT = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function loop(now) {
    if (!running) return;
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switches / hitches)
    tick(dt);
    if (running) rafId = requestAnimationFrame(loop);
  }

  function tick(dt) {
    // Spins slowly recharge so the player can always act.
    regenTimer += dt;
    if (regenTimer >= SPIN_REGEN_SEC) {
      regenTimer -= SPIN_REGEN_SEC;
      if (run.spins < spinCap()) run.spins++;
    }

    // Gate poison (Toxic Giant) ticks over time.
    if (run.poison > 0) {
      poisonTimer += dt;
      while (poisonTimer >= POISON_TICK_SEC && run.poison > 0) {
        poisonTimer -= POISON_TICK_SEC;
        damageGate(6, true);
        run.poison--;
      }
    }

    // Move every zombie toward the gate; attack once it arrives.
    for (const z of run.zombies) {
      if (!z.alive) continue;

      // Summoners raise walkers on a timer.
      if (z.summons) {
        z.summonTimer = (z.summonTimer || 0) + dt;
        if (z.summonTimer >= 4 && z.dist <= 100 && aliveZombies().length < 30) {
          z.summonTimer = 0;
          spawnZombie('walker', 100 + rand(10), true);
        }
      }

      if (z.dist > 0) {
        if (z.stunUntil > 0) { z.stunUntil -= dt; continue; } // briefly frozen
        z.dist -= z.speed * MOVE_SCALE * dt;
        if (z.dist <= 0) {
          z.dist = 0;
          z.atGate = true;
          if (z.explodes) {
            floatGate('💥', 'dmg');
            damageGate(z.dmg);
            z.alive = false;
            spawnPoof(z);
          } else {
            z.attackTimer = z.attackInterval; // first hit lands on contact
          }
        }
      } else {
        // At the gate: attack on cooldown, chipping armor then HP.
        z.attackTimer = (z.attackTimer || 0) + dt;
        if (z.attackTimer >= z.attackInterval) {
          z.attackTimer = 0;
          damageGate(z.dmg);
          if (z.poison) run.poison += z.poison;
        }
      }
    }

    renderZombies();
    updateHud();

    // Auto-spin keeps firing whenever spins are available (real-time friendly).
    if (autoSpin && !busy && run.spins > 0) doSpin();

    if (run.gateHp <= 0) { gameOver(); return; }
    if (aliveZombies().length === 0) { waveCleared(); return; }
  }

  function damageGate(dmg, ignoreArmor) {
    let d = Math.round(dmg);
    if (!ignoreArmor && run.armor > 0) {
      const absorbed = Math.min(run.armor, d);
      run.armor -= absorbed;
      d -= absorbed;
    }
    if (d > 0) {
      run.gateHp = clamp(run.gateHp - d, 0, run.gateMaxHp);
      floatGate('-' + d, 'dmg');
      shakeGate();
    }
  }

  /* ---------------------- SPAWNING ---------------------- */
  let zid = 0;
  function spawnZombie(type, dist, summoned) {
    const def = ZOMBIE_TYPES[type];
    const cycle = Math.floor((run.wave - 1) / 5);
    const hpScale = 1 + cycle * 0.35;
    // Attack power and movement speed creep up slowly with each wave.
    const dmgScale = 1 + (run.wave - 1) * 0.06;
    const speedScale = 1 + (run.wave - 1) * 0.03;
    run.zombies.push({
      uid: ++zid,
      type: def.id,
      glyph: def.glyph,
      name: def.name,
      maxHp: Math.round(def.hp * hpScale),
      hp: Math.round(def.hp * hpScale),
      dmg: Math.max(1, Math.round(def.dmg * dmgScale)),
      speed: def.speed * speedScale,
      attackInterval: 1.2,
      attackTimer: 0,
      summonTimer: 0,
      reward: def.reward,
      explodes: !!def.explodes,
      summons: !!def.summons,
      dist: dist,
      lane: rand(3),
      alive: true,
      stunUntil: 0,
      atGate: false,
      isBoss: false,
      summoned: !!summoned,
    });
  }

  function spawnBoss(boss) {
    // Boss HP/damage already scale in buildWave; nudge speed up slightly by wave.
    const speedScale = 1 + (run.wave - 1) * 0.02;
    run.zombies.push({
      uid: ++zid,
      type: boss.id,
      glyph: boss.glyph,
      name: boss.name,
      maxHp: boss.hp,
      hp: boss.hp,
      dmg: boss.dmg,
      speed: boss.speed * speedScale,
      attackInterval: 1.4,
      attackTimer: 0,
      summonTimer: 0,
      reward: boss.reward,
      explodes: false,
      summons: !!boss.summons,
      poison: boss.poison || 0,
      dist: 100,
      lane: 1,
      alive: true,
      stunUntil: 0,
      atGate: false,
      isBoss: true,
      ability: boss.ability,
    });
  }

  /* ---------------------- WAVE FLOW ---------------------- */
  function startWave(n) {
    run.wave = n;
    run.zombies = [];
    zid = 0;
    run.armor = run.armor; // armor persists between waves
    run.poison = 0;
    // Spins refill to the cap at the start of each wave (and recharge over time).
    run.spins = spinCap();
    regenTimer = 0;
    poisonTimer = 0;

    const def = buildWave(n);
    if (def.isBoss) {
      spawnBoss(def.boss);
      // escorts
      let i = 0;
      def.list.forEach((item) => {
        if (item.boss) return;
        spawnZombie(item.type, 108 + i * 14);
        i++;
      });
      showBanner('BOSS: ' + def.boss.name + ' — ' + def.boss.ability, 'crit');
    } else {
      // Stagger spawns so zombies arrive in a flow.
      def.list.forEach((item, i) => {
        spawnZombie(item.type, 100 + i * 13);
      });
      if (n > 20 && !run.endless) { run.endless = true; }
      showBanner(run.endless ? ('ENDLESS WAVE ' + n) : ('WAVE ' + n), 'info');
    }

    busy = false;
    updateHud();
    renderZombies();
    renderReels(run.lastSymbols, false);
    updateSpinButtons();
    showScreen('game-screen');
    startLoop();
  }

  function waveCleared() {
    stopLoop();
    busy = true;
    // Wave clear bonus coins.
    const bonus = 20 + run.wave * 8;
    run.coins += bonus;
    openShop(bonus);
  }

  /* ---------------------- SPIN ---------------------- */
  function doSpin() {
    if (busy || !run || run.spins <= 0) return;
    busy = true;
    run.spins--;
    updateHud();
    clearBanner();

    const finals = [];
    for (let i = 0; i < run.reels; i++) finals.push(rollSymbol());

    animateReels(finals, () => {
      run.lastSymbols = finals;
      const actions = resolveSymbols(finals);
      applyActions(actions);
      renderZombies();
      updateHud();
      busy = false;
      // Wave-clear / game-over are detected by the real-time loop.
    });
  }

  function updateSpinButtons() {
    const spinBtn = $('#btn-spin');
    const waitBtn = $('#btn-wait');
    if (waitBtn) waitBtn.classList.add('hidden'); // brace mechanic retired in real-time mode
    spinBtn.classList.remove('hidden');
    spinBtn.disabled = run.spins <= 0;
  }

  function toggleAuto() {
    autoSpin = !autoSpin;
    updateAutoBtn();
    if (autoSpin && running && !busy && run && run.spins > 0) doSpin();
  }
  function updateAutoBtn() {
    const b = $('#btn-auto');
    const s = $('#auto-state');
    if (!b) return;
    b.classList.toggle('on', autoSpin);
    if (s) s.textContent = autoSpin ? 'ON' : 'OFF';
  }

  /* ---------------------- REELS UI ---------------------- */
  function buildReelEls() {
    const wrap = $('#reels');
    wrap.innerHTML = '';
    wrap.dataset.count = run.reels;
    for (let i = 0; i < run.reels; i++) {
      const reel = el('div', 'reel');
      reel.appendChild(el('div', 'reel-symbol', SYMBOLS.sword.glyph));
      wrap.appendChild(reel);
    }
  }

  function renderReels(syms, highlight) {
    const reels = document.querySelectorAll('.reel');
    syms.forEach((s, i) => {
      if (!reels[i]) return;
      const sym = reels[i].querySelector('.reel-symbol');
      sym.textContent = SYMBOLS[s].glyph;
      sym.style.color = SYMBOLS[s].color;
    });
  }

  function animateReels(finals, done) {
    const reels = document.querySelectorAll('.reel');
    let finished = 0;
    finals.forEach((finalSym, i) => {
      const reel = reels[i];
      const sym = reel.querySelector('.reel-symbol');
      reel.classList.add('spinning');
      // Kept short so the player can act often in real-time combat.
      const ticks = 8 + i * 3;
      let t = 0;
      const iv = setInterval(() => {
        const r = SYMBOL_ORDER[rand(SYMBOL_ORDER.length)];
        sym.textContent = SYMBOLS[r].glyph;
        sym.style.color = SYMBOLS[r].color;
        t++;
        if (t >= ticks) {
          clearInterval(iv);
          sym.textContent = SYMBOLS[finalSym].glyph;
          sym.style.color = SYMBOLS[finalSym].color;
          reel.classList.remove('spinning');
          reel.classList.add('landed');
          setTimeout(() => reel.classList.remove('landed'), 200);
          finished++;
          if (finished === finals.length) setTimeout(done, 90);
        }
      }, 45);
    });
  }

  /* ---------------------- HUD ---------------------- */
  function updateHud() {
    $('#hud-wave').textContent = run.wave;
    $('#hud-coins').textContent = run.coins;
    $('#hud-spins').textContent = run.spins;
    $('#gate-hp').textContent = Math.max(0, Math.round(run.gateHp));
    $('#gate-hp-max').textContent = run.gateMaxHp;
    const pct = clamp((run.gateHp / run.gateMaxHp) * 100, 0, 100);
    const fill = $('#gate-hp-fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('low', pct < 30);
    const armorChip = $('#gate-armor-chip');
    if (run.armor > 0) {
      armorChip.classList.remove('hidden');
      $('#gate-armor').textContent = run.armor;
    } else {
      armorChip.classList.add('hidden');
    }
    updateSpinButtons();
  }

  /* ---------------------- BATTLEFIELD RENDER ---------------------- */
  const zEls = new Map();
  function renderZombies() {
    const layer = $('#zombie-layer');
    const live = new Set();
    for (const z of run.zombies) {
      if (!z.alive || z.dist > 105) { continue; }
      live.add(z.uid);
      let node = zEls.get(z.uid);
      if (!node) {
        node = el('div', 'zombie' + (z.isBoss ? ' boss' : ''));
        node.innerHTML =
          '<div class="z-body">' + z.glyph + '</div>' +
          '<div class="z-hp"><div class="z-hp-fill"></div></div>';
        layer.appendChild(node);
        zEls.set(z.uid, node);
      }
      const top = clamp(17 + (100 - z.dist) * 0.55, 12, 72);
      const laneX = [22, 50, 78][z.lane];
      node.style.top = top + '%';
      node.style.left = laneX + '%';
      node.classList.toggle('stunned', (z.stunUntil || 0) > 0);
      node.classList.toggle('attacking', !!z.atGate);
      const hpFill = node.querySelector('.z-hp-fill');
      hpFill.style.width = clamp((z.hp / z.maxHp) * 100, 0, 100) + '%';
    }
    // Remove dead/offscreen nodes.
    for (const [uid, node] of zEls) {
      if (!live.has(uid)) {
        node.classList.add('dying');
        const n = node;
        setTimeout(() => n.remove(), 350);
        zEls.delete(uid);
      }
    }
    updateBossBar();
  }

  function updateBossBar() {
    const boss = aliveZombies().find((z) => z.isBoss);
    const bar = $('#boss-bar');
    if (boss) {
      bar.classList.remove('hidden');
      $('#boss-name').textContent = boss.glyph + '  ' + boss.name;
      $('#boss-hp').textContent = Math.max(0, Math.round(boss.hp));
      $('#boss-hp-max').textContent = boss.maxHp;
      $('#boss-hp-fill').style.width = clamp((boss.hp / boss.maxHp) * 100, 0, 100) + '%';
    } else {
      bar.classList.add('hidden');
    }
  }

  /* ---------------------- FX ---------------------- */
  function zPos(z) {
    const node = zEls.get(z.uid);
    if (node) {
      const bf = $('#battlefield').getBoundingClientRect();
      const r = node.getBoundingClientRect();
      return { x: r.left - bf.left + r.width / 2, y: r.top - bf.top + r.height / 2 };
    }
    const bf = $('#battlefield').getBoundingClientRect();
    return { x: bf.width / 2, y: bf.height / 2 };
  }
  function floatText(z, text, cls) {
    const p = zPos(z);
    const f = el('div', 'float ' + cls, text);
    f.style.left = p.x + 'px';
    f.style.top = p.y + 'px';
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  function floatGate(text, cls) {
    const bf = $('#battlefield').getBoundingClientRect();
    const f = el('div', 'float ' + cls, text);
    f.style.left = (bf.width / 2 + (rand(60) - 30)) + 'px';
    f.style.top = (bf.height * 0.82) + 'px';
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  function flashZombie(z, crit) {
    const node = zEls.get(z.uid);
    if (!node) return;
    node.classList.add(crit ? 'hit-crit' : 'hit');
    setTimeout(() => node.classList.remove('hit', 'hit-crit'), 220);
  }
  function spawnPoof(z) {
    const p = zPos(z);
    const f = el('div', 'poof', '💨');
    f.style.left = p.x + 'px';
    f.style.top = p.y + 'px';
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), 600);
  }
  function spawnExplosion() {
    const bf = $('#battlefield').getBoundingClientRect();
    const f = el('div', 'explosion', '💥');
    f.style.left = (bf.width / 2) + 'px';
    f.style.top = (bf.height * 0.4) + 'px';
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), 500);
  }
  function spawnBolt(z) {
    const p = zPos(z);
    const f = el('div', 'bolt', '⚡');
    f.style.left = p.x + 'px';
    f.style.top = p.y + 'px';
    $('#fx-layer').appendChild(f);
    setTimeout(() => f.remove(), 400);
  }
  function shakeGate() {
    const g = $('#gate');
    g.classList.add('shake');
    setTimeout(() => g.classList.remove('shake'), 300);
  }

  let bannerTimer = null;
  function showBanner(text, tone) {
    const b = $('#banner');
    b.textContent = text;
    b.className = 'banner show ' + (tone || '');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 1600);
  }
  function clearBanner() { $('#banner').classList.remove('show'); }

  /* ---------------------- SHOP ---------------------- */
  function upgradeCost(u) {
    const owned = run.shopUpgrades[u.id] || 0;
    return Math.round(u.baseCost * Math.pow(1.6, owned));
  }

  function openShop(bonus) {
    showOverlay('shop-overlay', true);
    $('#shop-wave').textContent = run.wave;
    const rewards = $('#shop-rewards');
    rewards.innerHTML =
      '<div class="reward-line">Wave clear bonus: <b>+' + bonus + ' 🪙</b></div>' +
      '<div class="reward-line">Total coins: <b>' + run.coins + ' 🪙</b></div>';

    // pick 3 random upgrade offers
    const pool = UPGRADE_POOL.slice();
    const offers = [];
    while (offers.length < 3 && pool.length) offers.push(pool.splice(rand(pool.length), 1)[0]);
    renderShop(offers);
    $('#shop-coins').textContent = run.coins;
  }

  function renderShop(offers) {
    const list = $('#shop-list');
    list.innerHTML = '';
    offers.forEach((u) => {
      const cost = upgradeCost(u);
      const card = el('div', 'shop-card');
      card.innerHTML =
        '<div class="sc-icon">' + u.icon + '</div>' +
        '<div class="sc-info"><div class="sc-name">' + u.name + '</div>' +
        '<div class="sc-desc">' + u.desc + '</div></div>' +
        '<button class="btn btn-buy">' + cost + ' 🪙</button>';
      const btn = card.querySelector('.btn-buy');
      btn.disabled = run.coins < cost;
      btn.addEventListener('click', () => buyUpgrade(u, card));
      list.appendChild(card);
    });
  }

  function buyUpgrade(u, card) {
    const cost = upgradeCost(u);
    if (run.coins < cost) return;
    run.coins -= cost;
    run.shopUpgrades[u.id] = (run.shopUpgrades[u.id] || 0) + 1;
    applyUpgrade(u);
    $('#shop-coins').textContent = run.coins;
    // re-render this card's price & disabled state
    const newCost = upgradeCost(u);
    const btn = card.querySelector('.btn-buy');
    btn.textContent = newCost + ' 🪙';
    card.classList.add('bought-flash');
    setTimeout(() => card.classList.remove('bought-flash'), 300);
    // refresh all buy buttons' disabled state
    document.querySelectorAll('#shop-list .shop-card').forEach((c) => {
      const b = c.querySelector('.btn-buy');
      const price = parseInt(b.textContent, 10);
      b.disabled = run.coins < price;
    });
    updateHud();
  }

  function applyUpgrade(u) {
    switch (u.stat) {
      case 'sword': run.up.sword += u.amount; break;
      case 'bomb': run.up.bomb += u.amount; break;
      case 'heart': run.up.heart += u.amount; break;
      case 'coin': run.up.coin += u.amount; break;
      case 'crit': run.up.crit += u.amount; break;
      case 'spins': run.up.spins += u.amount; break;
      case 'gate':
        run.gateMaxHp += u.amount;
        run.gateHp = clamp(run.gateHp + u.amount, 0, run.gateMaxHp);
        break;
    }
  }

  function nextWave() {
    showOverlay('shop-overlay', false);
    startWave(run.wave + 1);
  }

  /* ---------------------- GAME OVER ---------------------- */
  function gameOver() {
    stopLoop();
    busy = true;
    const wavesSurvived = Math.max(0, run.wave - 1) + (aliveZombies().length === 0 ? 1 : 0);
    const survived = run.wave; // reached this wave
    const banked = Math.round(run.coins * 0.25);
    meta.bank += banked;
    let isBest = false;
    if (survived > meta.bestWave) { meta.bestWave = survived; isBest = true; }
    saveMeta();

    $('#go-wave').textContent = survived;
    $('#go-coins').textContent = run.coins;
    $('#go-bank').textContent = banked;
    $('#go-best-wrap').style.display = isBest ? '' : 'none';
    $('#go-best').textContent = meta.bestWave;
    showOverlay('gameover-overlay', true);
  }

  /* ---------------------- RESEARCH SCREEN ---------------------- */
  function renderResearch() {
    $('#research-bank').textContent = meta.bank;
    const list = $('#research-list');
    list.innerHTML = '';
    RESEARCH_TREE.forEach((r) => {
      const lvl = researchLvl(r.id);
      const maxed = lvl >= r.max;
      const cost = maxed ? 0 : r.cost(lvl);
      const card = el('div', 'research-card');
      card.innerHTML =
        '<div class="rc-icon">' + r.icon + '</div>' +
        '<div class="rc-info"><div class="rc-name">' + r.name +
        ' <span class="rc-lvl">Lv ' + lvl + '/' + r.max + '</span></div>' +
        '<div class="rc-desc">' + r.desc + '</div></div>' +
        '<button class="btn btn-buy">' + (maxed ? 'MAX' : cost + ' 🪙') + '</button>';
      const btn = card.querySelector('.btn-buy');
      btn.disabled = maxed || meta.bank < cost;
      if (!maxed) btn.addEventListener('click', () => {
        if (meta.bank < cost) return;
        meta.bank -= cost;
        meta.research[r.id] = lvl + 1;
        saveMeta();
        renderResearch();
        refreshMenu();
      });
      list.appendChild(card);
    });
  }

  function refreshMenu() {
    $('#menu-best-wave').textContent = meta.bestWave;
    $('#menu-bank').textContent = meta.bank;
  }

  /* ---------------------- WIRING ---------------------- */
  function startGame() {
    newRun();
    autoSpin = false;
    updateAutoBtn();
    buildReelEls();
    zEls.clear();
    $('#zombie-layer').innerHTML = '';
    $('#fx-layer').innerHTML = '';
    showOverlay('gameover-overlay', false);
    showOverlay('shop-overlay', false);
    startWave(1);
  }

  function init() {
    refreshMenu();

    $('#btn-play').addEventListener('click', startGame);
    $('#btn-restart').addEventListener('click', startGame);
    $('#btn-menu').addEventListener('click', () => {
      showOverlay('gameover-overlay', false);
      refreshMenu();
      showScreen('menu-screen');
    });
    $('#btn-research').addEventListener('click', () => { renderResearch(); showScreen('research-screen'); });
    $('#btn-research-back').addEventListener('click', () => { refreshMenu(); showScreen('menu-screen'); });

    $('#btn-spin').addEventListener('click', doSpin);
    $('#btn-auto').addEventListener('click', toggleAuto);
    $('#btn-next-wave').addEventListener('click', nextWave);

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
