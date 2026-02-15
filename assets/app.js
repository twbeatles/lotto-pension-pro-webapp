/**
 * Lotto Pro Web App (v2.1)
 * Class-based Refactor for reliability
 */

const CONFIG = {
  KEYS: {
    FAV: 'lotto_pro_fav_v2',
    HIST: 'lotto_pro_hist_v2',
    SETTINGS: 'lotto_pro_settings_v2'
  },
  LIMITS: {
    MAX_SET: 20,
    RANGE: 45,
    MAX_HIST: 500,
    MAX_FIXED: 5
  }
};

// --- Utilities ---
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Draw schedule (KST cutoff) ----
const _tzParts = (timeZone) => {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(new Date());
  const get = (type) => Number(parts.find(p => p.type === type)?.value || 0);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    hh: get('hour'),
    mm: get('minute'),
    ss: get('second')
  };
};

const _nowKSTAsUtcDate = () => {
  const p = _tzParts('Asia/Seoul');
  return new Date(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss));
};

const estimateLatestDrawKST = (nowKstUtc = _nowKSTAsUtcDate()) => {
  const BASE_DRAW_NO = 1;
  const BASE_DATE_UTC = Date.UTC(2002, 11, 7, 0, 0, 0); // 2002-12-07 (KST interpreted as UTC for math)
  const INTERVAL_DAYS = 7;
  const CUTOFF_HOUR = 21; // Saturday 21:00 KST

  const daysDiff = Math.floor((nowKstUtc.getTime() - BASE_DATE_UTC) / 86400000);
  let estimated = Math.floor(daysDiff / INTERVAL_DAYS) + BASE_DRAW_NO;
  estimated = Math.max(BASE_DRAW_NO, estimated);

  const cutoffUtc = new Date(BASE_DATE_UTC + (estimated - BASE_DRAW_NO) * INTERVAL_DAYS * 86400000 + CUTOFF_HOUR * 3600000);
  if (nowKstUtc.getTime() < cutoffUtc.getTime()) estimated -= 1;

  return Math.max(BASE_DRAW_NO, estimated);
};

class UIManager {
  static toast(msg, type = 'info', duration = 2000) {
    const container = $('#toast-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  static getBallColor(n) {
    if (n <= 10) return 'yellow';
    if (n <= 20) return 'blue';
    if (n <= 30) return 'red';
    if (n <= 40) return 'gray';
    return 'green';
  }

  static renderBalls(nums, size = '') {
    return nums.map(n =>
      `<span class="ball ${this.getBallColor(n)} ${size}">${n}</span>`
    ).join('');
  }

  static formatNumbers(nums) {
    return (nums || []).map(n => String(n).padStart(2, '0')).join(' ');
  }

  static async copyNumbers(nums) {
    const text = this.formatNumbers(nums);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers / non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      UIManager.toast('복사 완료', 'success');
    } catch (e) {
      console.warn('Copy failed', e);
      UIManager.toast('복사 실패', 'error');
    }
  }

  static showQR(nums) {
    const modal = $('#qrModal');
    const container = $('#qrCanvasContainer');
    if (!modal || !container) return;
    container.innerHTML = '';

    const payload = `Lotto 6/45\nNumbers: ${this.formatNumbers(nums)}`;
    try {
      if (!window.QRCode?.toCanvas) throw new Error('QRCode library not loaded');
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      window.QRCode.toCanvas(canvas, payload, { width: 220, margin: 1 }, (err) => {
        if (err) {
          console.warn('QR render failed', err);
          UIManager.toast('QR 생성 실패', 'error');
          return;
        }
        modal.classList.add('active');
      });
    } catch (e) {
      console.warn('QR error', e);
      UIManager.toast('QR 기능을 사용할 수 없습니다.', 'error', 3000);
    }
  }
}

class DataManager {
  constructor() {
    this.state = {
      theme: 'dark',
      favorites: [],
      history: [],
      winningStats: [],
      generated: []
    };
  }

  load() {
    try {
      this.state.favorites = JSON.parse(localStorage.getItem(CONFIG.KEYS.FAV) || '[]');
      this.state.history = JSON.parse(localStorage.getItem(CONFIG.KEYS.HIST) || '[]');
      const settings = JSON.parse(localStorage.getItem(CONFIG.KEYS.SETTINGS) || '{}');
      this.state.theme = settings.theme || 'dark';
      this.state.customProxy = settings.customProxy || '';

      // UI sync if input exists
      const proxyInput = $('#customProxyUrl');
      if (proxyInput) proxyInput.value = this.state.customProxy;
    } catch (e) {
      console.error('Data load failed', e);
      UIManager.toast('데이터 로드 실패', 'error');
    }
  }

  save() {
    try {
      localStorage.setItem(CONFIG.KEYS.FAV, JSON.stringify(this.state.favorites));
      localStorage.setItem(CONFIG.KEYS.HIST, JSON.stringify(this.state.history));
      const proxyInput = $('#customProxyUrl');
      if (proxyInput) this.state.customProxy = proxyInput.value.trim();

      localStorage.setItem(CONFIG.KEYS.SETTINGS, JSON.stringify({
        theme: this.state.theme,
        customProxy: this.state.customProxy
      }));
    } catch (e) {
      console.error('Data save failed', e);
    }
  }

  async fetchWinningStats() {
    const statusEl = $('#syncStatus');
    const updateStatus = (text, color) => {
      if (statusEl) {
        statusEl.querySelector('.text') && (statusEl.querySelector('.text').textContent = text);
        statusEl.querySelector('.dot') && (statusEl.querySelector('.dot').style.background = color);
      }
    };

    try {
      updateStatus('Check Local', 'var(--warning)');

      // 1. Load from Static JSON (Basline)
      const res = await fetch('data/winning_stats.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const staticData = json.data || json || [];

      // 2. Load from LocalStorage (Updates)
      const localUpdates = JSON.parse(localStorage.getItem('lotto_pro_updates_v2') || '[]');

      // 3. Merge: Local Updates take precedence
      const mergedMap = new Map();
      staticData.forEach(d => mergedMap.set(Number(d.draw_no), d));
      localUpdates.forEach(d => mergedMap.set(Number(d.draw_no), d));

      this.state.winningStats = Array.from(mergedMap.values()).map(r => ({
        draw_no: Number(r.draw_no),
        numbers: (r.numbers || []).map(Number).sort((a, b) => a - b),
        bonus: Number(r.bonus),
        date: r.date,
        prize_amount: r.prize_amount ? Number(r.prize_amount) : 0,
        winners_count: r.winners_count ? Number(r.winners_count) : 0,
        total_sales: r.total_sales ? Number(r.total_sales) : 0
      })).sort((a, b) => b.draw_no - a.draw_no);

      const latestNo = this.state.winningStats[0]?.draw_no || 0;
      const estNo = estimateLatestDrawKST();

      if (latestNo > 0 && estNo > 0 && latestNo < estNo) {
        updateStatus(`Update Avail (+${estNo - latestNo})`, 'var(--warning)');
      } else {
        updateStatus('Latest', 'var(--success)');
      }
      return true;
    } catch (e) {
      console.warn('Winning stats fetch failed', e);
      updateStatus('Offline', 'var(--danger)');
      return false;
    }
  }

  async fetchLatestFromAPI() {
    const logEl = $('#syncLog');
    const btn = $('#syncDataBtn');
    if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = ''; }

    const log = (msg) => {
      if (logEl) {
        logEl.innerHTML += `<div>${msg}</div>`;
        logEl.scrollTop = logEl.scrollHeight;
      }
      console.log(`[Sync] ${msg}`);
    };

    if (btn) btn.disabled = true;

    try {
      const latestKnown = this.state.winningStats[0]?.draw_no || 1000;
      const estNo = estimateLatestDrawKST();

      if (latestKnown >= estNo) {
        log('✅ 이미 최신 데이터입니다.');
        return;
      }

      log(`🔍 최신 회차 검색: ${latestKnown + 1} ~ ${estNo}`);

      let updatedCount = 0;
      const newItems = [];

      for (let no = latestKnown + 1; no <= estNo; no++) {
        log(`📡 ${no}회차 데이터 요청 중...`);

        // Proxy Selection
        const customProxy = $('#customProxyUrl')?.value?.trim();
        const targetUrl = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${no}`;

        // If custom proxy has ?url= or similar, use it. Otherwise default to allorigins
        let fetchUrl;
        if (customProxy) {
          // Simple robust check: does it end with '='? if so append. else if it has no query, append param.
          // But let's assume user provides "https://.../?url=" prefix style for simplicity or we just append
          fetchUrl = customProxy + encodeURIComponent(targetUrl);
        } else {
          fetchUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        }

        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Proxy Error ${res.status}`);

        const wrapper = await res.json();
        // Handle different proxies: AllOrigins returns { contents: "..." }, others might return direct JSON
        let data;
        if (wrapper.contents && typeof wrapper.contents === 'string') {
          // AllOrigins style
          data = JSON.parse(wrapper.contents);
        } else {
          // Direct style
          data = wrapper;
        }

        if (data.returnValue === 'success') {
          const item = {
            draw_no: data.drwNo,
            date: data.drwNoDate,
            numbers: [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6],
            bonus: data.bnusNo,
            prize_amount: data.firstWinamnt,
            winners_count: data.firstPrzwnerCo,
            total_sales: data.totSellamnt
          };
          newItems.push(item);
          log(`✨ ${no}회차 확보 완료! (${item.date})`);
          updatedCount++;
          await sleep(500); // polite delay
        } else {
          log(`⚠️ ${no}회차 데이터 없음 (아직 추첨 전일 수 있음)`);
          break;
        }
      }

      if (updatedCount > 0) {
        // Save to LocalStorage
        const currentUpdates = JSON.parse(localStorage.getItem('lotto_pro_updates_v2') || '[]');
        const merged = [...currentUpdates, ...newItems];
        // Dedupe
        const unique = Array.from(new Map(merged.map(item => [item.draw_no, item])).values());
        localStorage.setItem('lotto_pro_updates_v2', JSON.stringify(unique));

        log(`💾 ${updatedCount}개 회차 정보 저장 완료.`);
        await this.fetchWinningStats(); // Reload to update memory & UI
        this.app?.refreshCurrentRoute();
        UIManager.toast(`${updatedCount}개 회차 업데이트 완료`, 'success');
      } else {
        log('ℹ️ 업데이트된 데이터가 없습니다.');
      }

    } catch (e) {
      log(`❌ 오류 발생: ${e.message}`);
      UIManager.toast('동기화 중 오류가 발생했습니다.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  addToFavorites(nums) {
    const key = nums.join(',');
    if (this.state.favorites.some(f => f.numbers.join(',') === key)) {
      UIManager.toast('이미 즐겨찾기에 있습니다.', 'warning');
      return false;
    }
    this.state.favorites.unshift({ numbers: nums, date: new Date().toISOString() });
    this.save();
    UIManager.toast('즐겨찾기 저장 완료', 'success');
    return true;
  }

  clearFavorites() {
    this.state.favorites = [];
    this.save();
  }

  clearHistory() {
    this.state.history = [];
    this.save();
  }
}

class GeneratorModule {
  constructor(app) {
    this.app = app;
    this.data = app.data;
    this.bindEvents();
  }

  bindEvents() {
    const btn = $('#generateBtn');
    if (btn) btn.addEventListener('click', () => this.generate());

    const resetBtn = $('#resetOptions');
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetOptions());

    const clearBtn = $('#clearResults');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      $('#genResultList').innerHTML = '';
      this.data.state.generated = [];
    });

    const saveAllBtn = $('#saveAllBtn');
    if (saveAllBtn) saveAllBtn.addEventListener('click', () => this.saveAll());
  }

  resetOptions() {
    $('#setCount').value = 5;
    $('#fixedNums').value = '';
    $('#excludeNums').value = '';
    $('#limitConsecutive').checked = true;
    $('#smartMode').checked = true;
    $('#preferHot').checked = true;
    $('#balanceMode').checked = true;
    UIManager.toast('옵션이 초기화되었습니다.');
  }

  generate() {
    const count = Number($('#setCount').value) || 5;
    const fixed = this.parseInput($('#fixedNums').value);
    const exclude = this.parseInput($('#excludeNums').value);

    if (fixed.length > CONFIG.LIMITS.MAX_FIXED) {
      return UIManager.toast(`고정수는 최대 ${CONFIG.LIMITS.MAX_FIXED}개입니다.`, 'error');
    }

    const options = {
      fixed,
      exclude,
      smart: $('#smartMode').checked,
      hot: $('#preferHot').checked,
      cold: false,
      balance: $('#balanceMode').checked,
      limitConsecutive: $('#limitConsecutive').checked
    };
    options.cold = options.smart && !options.hot;

    const listEl = $('#genResultList');
    listEl.innerHTML = '';
    this.data.state.generated = [];

    // Freq map for smart weighting (hot/cold)
    const freq = {};
    if (options.smart) {
      this.data.state.winningStats.forEach(w => w.numbers.forEach(n => freq[n] = (freq[n] || 0) + 1));
    }
    const maxFreq = Math.max(...Object.values(freq), 1);

    for (let i = 0; i < count; i++) {
      const nums = this.createSet(options, freq, maxFreq);
      if (nums) {
        this.data.state.generated.push(nums);
        this.renderResultItem(nums, i, listEl);
      }
    }
  }

  parseInput(val) {
    return [...new Set(val.split(/[^0-9]+/).filter(Boolean).map(Number).filter(n => n >= 1 && n <= 45))];
  }

  createSet(opts, freq, maxFreq) {
    let attempts = 0;
    while (attempts++ < 100) {
      let pool = Array.from({ length: 45 }, (_, i) => i + 1)
        .filter(n => !opts.exclude.includes(n) && !opts.fixed.includes(n));

      // Apply smart weighting (Hot or Cold)
      if (opts.smart && (opts.hot || opts.cold)) {
        const weightedPool = [];
        pool.forEach(n => {
          const c = (freq[n] || 0);
          const ratio = opts.hot
            ? (c / maxFreq)
            : ((maxFreq - c) / maxFreq);
          const w = Math.floor(ratio * 5) + 1; // 1~6
          for (let k = 0; k < w; k++) weightedPool.push(n);
        });
        pool = weightedPool;
      }

      const current = [...opts.fixed];
      while (current.length < 6 && pool.length > 0) {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!current.includes(pick)) current.push(pick);
      }

      if (current.length < 6) continue;
      current.sort((a, b) => a - b);

      // Filters
      if (opts.limitConsecutive) {
        let cons = 0;
        for (let k = 0; k < 5; k++) if (current[k + 1] === current[k] + 1) cons++;
        if (cons >= 2) continue;
      }

      if (opts.balance) {
        const odd = current.filter(n => n % 2).length;
        if (odd < 2 || odd > 4) continue;
        const high = current.filter(n => n > 23).length;
        if (high < 2 || high > 4) continue;
      }

      return current;
    }
    // Fallback random if filtering too strict
    return this.createRandomSet(opts);
  }

  createRandomSet(opts) {
    let pool = Array.from({ length: 45 }, (_, i) => i + 1)
      .filter(n => !opts.exclude.includes(n) && !opts.fixed.includes(n));
    const current = [...opts.fixed];
    while (current.length < 6 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      current.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return current.sort((a, b) => a - b);
  }

  renderResultItem(nums, index, container) {
    const el = document.createElement('div');
    el.className = 'result-item';
    el.innerHTML = `
            <div class="result-balls ball-container">${UIManager.renderBalls(nums)}</div>
            <div class="result-actions">
                <button class="icon-btn copy-btn" title="복사"><i class="ph ph-copy"></i></button>
                <button class="icon-btn qr-btn" title="QR"><i class="ph ph-qr-code"></i></button>
                <button class="icon-btn fav-btn" title="즐겨찾기"><i class="ph ph-star"></i></button>
            </div>
        `;

    // Event Delegation friendly, or direct bind
    el.querySelector('.copy-btn').onclick = () => UIManager.copyNumbers(nums);
    el.querySelector('.qr-btn').onclick = () => UIManager.showQR(nums);
    el.querySelector('.fav-btn').onclick = () => {
      this.app.data.addToFavorites(nums);
      this.app.renderDataLists(); // Refresh data tab if open
    };

    // Animation
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, index * 80);

    container.appendChild(el);
  }

  saveAll() {
    if (!this.data.state.generated.length) return;
    let count = 0;
    this.data.state.generated.forEach(nums => {
      // Check History dupes
      const key = nums.join(',');
      if (!this.data.state.history.some(h => h.numbers.join(',') === key)) {
        this.data.state.history.unshift({ numbers: nums, date: new Date().toISOString() });
        count++;
      }
    });
    if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
      this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
    }
    this.data.save();
    UIManager.toast(`${count}개 세트 히스토리 저장 완료`, 'success');
    this.app.renderDataLists();
  }
}

class StatsModule {
  constructor(app) {
    this.app = app;
    this.data = app.data;
  }

  render() {
    if (!this.data.state.winningStats.length) return;
    this.renderCharts();
    this.renderHotCold();
    this.renderPairs();
  }

  renderCharts() {
    // Range Chart
    const rangeCounts = [0, 0, 0, 0, 0];
    const oddEven = [0, 0]; // Even, Odd

    this.data.state.winningStats.forEach(d => {
      d.numbers.forEach(n => {
        // Range
        if (n <= 10) rangeCounts[0]++;
        else if (n <= 20) rangeCounts[1]++;
        else if (n <= 30) rangeCounts[2]++;
        else if (n <= 40) rangeCounts[3]++;
        else rangeCounts[4]++;

        // OddEven
        if (n % 2 === 0) oddEven[0]++; else oddEven[1]++;
      });
    });

    this.drawBarChart('#chartRange', [
      { l: '1-10', v: rangeCounts[0] },
      { l: '11-20', v: rangeCounts[1] },
      { l: '21-30', v: rangeCounts[2] },
      { l: '31-40', v: rangeCounts[3] },
      { l: '41-45', v: rangeCounts[4] }
    ]);

    this.drawBarChart('#chartOddEven', [
      { l: '짝수 (Even)', v: oddEven[0] },
      { l: '홀수 (Odd)', v: oddEven[1] }
    ]);
  }

  drawBarChart(selector, data) {
    const el = $(selector);
    if (!el) return;
    el.innerHTML = '';
    const max = Math.max(...data.map(d => d.v), 1);

    data.forEach(d => {
      const pct = (d.v / max) * 100;
      el.innerHTML += `
                <div class="bar-row">
                    <span class="label">${d.l}</span>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${pct}%"></div>
                    </div>
                    <span class="val">${d.v}</span>
                </div>
            `;
    });
  }

  renderHotCold() {
    const container = $('#hotColdContainer');
    if (!container) return;
    container.innerHTML = '';

    const freq = Array(46).fill(0);
    this.data.state.winningStats.forEach(d => d.numbers.forEach(n => freq[n]++));

    const indexed = freq.map((c, i) => ({ n: i, c })).slice(1).sort((a, b) => b.c - a.c);
    const hot = indexed.slice(0, 5);
    const cold = indexed.slice(-5).reverse();

    const mkCol = (title, items, cls) => {
      const div = document.createElement('div');
      div.className = `stat-col ${cls}`;
      div.innerHTML = `<h4>${title}</h4>`;
      items.forEach(({ n, c }) => {
        div.innerHTML += `
                    <div class="stat-row">
                        <span class="ball ${UIManager.getBallColor(n)} sm">${n}</span>
                        <span class="count">${c}회</span>
                    </div>`;
      });
      return div;
    };

    container.appendChild(mkCol('🔥 Hot Numbers', hot, 'hot'));
    container.appendChild(mkCol('❄️ Cold Numbers', cold, 'cold'));
  }

  renderPairs() {
    const container = $('#pairContainer');
    if (!container) return;
    container.innerHTML = '';

    const pairCounts = {};

    // Analyze all history
    this.data.state.winningStats.forEach(d => {
      const nums = d.numbers;
      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          const pair = `${nums[i]}-${nums[j]}`;
          pairCounts[pair] = (pairCounts[pair] || 0) + 1;
        }
      }
    });

    // Sort by frequency
    const sorted = Object.entries(pairCounts)
      .map(([k, v]) => ({ pair: k.split('-').map(Number), count: v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10

    sorted.forEach(({ pair, count }) => {
      const el = document.createElement('div');
      el.className = 'pair-card';
      el.innerHTML = `
        <div class="balls">
          <span class="ball sm ${UIManager.getBallColor(pair[0])}">${pair[0]}</span>
          <span class="ball sm ${UIManager.getBallColor(pair[1])}">${pair[1]}</span>
        </div>
        <div class="count"><strong>${count}회</strong> 출현</div>
      `;
      container.appendChild(el);
    });
  }
}

// --- Advanced AI Prediction (Ensemble Monte Carlo) ---
class AdvancedMonteCarlo {
  constructor(winningStats) {
    this.data = [...winningStats].sort((a, b) => a.draw_no - b.draw_no);
    this.totalDraws = this.data.length;
  }

  // Model 1: Frequency Weights (Hot/Cold)
  getModelFrequency() {
    const scores = Array(46).fill(0);
    const recentWindow = 10;

    // Global freq
    const freq = Array(46).fill(0);
    this.data.forEach(d => d.numbers.forEach(n => freq[n]++));

    // Recent freq
    const recentFreq = Array(46).fill(0);
    this.data.slice(-recentWindow).forEach(d => d.numbers.forEach(n => recentFreq[n]++));

    for (let n = 1; n <= 45; n++) {
      // Balance: 40% Global, 60% Recent Trend
      const sGlobal = freq[n] / this.totalDraws;
      const sRecent = recentFreq[n] / recentWindow;
      scores[n] = (sGlobal * 0.4) + (sRecent * 0.6);
    }
    return scores;
  }

  // Model 2: Pattern/Recency (Skipped Draws)
  getModelRecency() {
    const lastSeen = Array(46).fill(-1);
    this.data.forEach((d, i) => d.numbers.forEach(n => lastSeen[n] = i));

    const scores = Array(46).fill(0);
    const avgCycle = 8;

    for (let n = 1; n <= 45; n++) {
      const skipped = this.totalDraws - 1 - lastSeen[n];
      const cycleScore = Math.exp(-Math.pow(skipped - avgCycle, 2) / 20);
      const coldBoost = skipped > 20 ? 0.5 : 0;
      scores[n] = cycleScore + coldBoost + 0.1;
    }
    return scores;
  }

  // Model 3: Adjacency/Consecutive Proximity
  getModelAdjacency() {
    const scores = Array(46).fill(0.1);
    if (this.totalDraws < 1) return scores;

    const lastDraw = this.data[this.totalDraws - 1].numbers;
    lastDraw.forEach(n => {
      if (n > 1) scores[n - 1] += 0.5;
      if (n < 45) scores[n + 1] += 0.5;
      scores[n] += 0.2;
    });
    return scores;
  }

  static weightedSample(weights, k = 6) {
    const chosen = new Set();
    const pool = weights.map((w, i) => ({ n: i, w }));

    let limit = 0;
    while (chosen.size < k && limit++ < 100) {
      const total = pool.reduce((acc, p) => acc + (chosen.has(p.n) || p.n === 0 ? 0 : p.w), 0);
      let r = Math.random() * total;
      for (let i = 1; i <= 45; i++) {
        if (chosen.has(i)) continue;
        r -= pool[i].w;
        if (r <= 0) {
          chosen.add(i);
          break;
        }
      }
    }
    return [...chosen].sort((a, b) => a - b);
  }

  runSimulation() {
    // 1. Compute Base Weights from 3 Models
    const wFreq = this.getModelFrequency();
    const wRecency = this.getModelRecency();
    const wAdj = this.getModelAdjacency();

    // 2. Combine Weights (Ensemble)
    const ensembleWeights = Array(46).fill(0);
    for (let n = 1; n <= 45; n++) {
      // 50% Frequency, 30% Recency, 20% Adjacency
      ensembleWeights[n] = (wFreq[n] * 0.5) + (wRecency[n] * 0.3) + (wAdj[n] * 0.2);
    }

    // 3. Monte Carlo Simulation
    // Simulate 2000 future draws using the ensemble probabilities
    const simCounts = Array(46).fill(0);
    const SIMULATIONS = 2000;

    for (let i = 0; i < SIMULATIONS; i++) {
      const simSet = AdvancedMonteCarlo.weightedSample(ensembleWeights, 6);
      simSet.forEach(n => simCounts[n]++);
    }

    // 4. Final Selection
    return simCounts;
  }
}

class AiModule {
  constructor(app) {
    this.app = app;
    const btn = $('#aiPredictBtn');
    if (btn) btn.addEventListener('click', () => this.run());
  }

  async run() {
    const btn = $('#aiPredictBtn');
    const out = $('#aiOutput');
    const log = $('#aiLogArea');

    if (!this.app.data.state.winningStats.length) {
      UIManager.toast('당첨 데이터가 없습니다. (data/winning_stats.json)', 'error', 3000);
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 분석 중...';
    out.innerHTML = '';
    log.innerHTML = '';

    const LOGS = [
      '데이터 패턴 학습 (Frequency, Recency, Pattern)...',
      '앙상블 모델 가중치 병합...',
      '몬테카를로 시뮬레이션 (2,000회 수행)...',
      '최적 번호 조합 추출 중...'
    ];

    for (const msg of LOGS) {
      log.innerHTML += `<div>> ${msg}</div>`;
      await sleep(400);
      log.scrollTop = log.scrollHeight;
    }

    const mc = new AdvancedMonteCarlo(this.app.data.state.winningStats);
    await sleep(100);
    const finalWeights = mc.runSimulation();

    log.innerHTML += `<div style="color:var(--success)">> 분석 완료! 5개 추천 조합 생성.</div>`;
    log.scrollTop = log.scrollHeight;

    const results = [];

    // Set 1: Best
    const top6 = finalWeights
      .map((c, n) => ({ n, c }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 6)
      .map(x => x.n)
      .sort((a, b) => a - b);
    results.push(top6);

    // Set 2-5: Variation
    for (let k = 0; k < 4; k++) {
      results.push(AdvancedMonteCarlo.weightedSample(finalWeights, 6));
    }

    results.forEach((nums, i) => {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'result-item glass';
        el.innerHTML = `
          <div class="result-label">Set ${i + 1} ${i === 0 ? '<span class="badge ok">Best</span>' : ''}</div>
          <div class="ball-container">${UIManager.renderBalls(nums)}</div>
        `;
        out.appendChild(el);
      }, i * 150);
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="ph-bold ph-brain"></i> 재분석';
  }
}

class CheckModule {
  constructor(app) {
    this.app = app;
    this.data = app.data;
    this.source = 'favorites'; // 'favorites' | 'history'
    this.mode = 'latest'; // 'latest' | 'all'
    this.bindEvents();
  }

  bindEvents() {
    $$('.seg-btn[data-source]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const src = e.currentTarget.dataset.source;
        if (src !== 'favorites' && src !== 'history') return;
        this.source = src;
        $$('.seg-btn[data-source]').forEach(x => x.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.renderList();
        this.resetResult();
      });
    });

    $$('.seg-btn[data-checkmode]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.checkmode;
        if (mode !== 'latest' && mode !== 'all') return;
        this.mode = mode;
        $$('.seg-btn[data-checkmode]').forEach(x => x.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.resetResult();
      });
    });

    $('#doCheckBtn')?.addEventListener('click', () => this.run());
  }

  onEnter() {
    // Sync UI active state
    $$('.seg-btn[data-source]').forEach(x => {
      x.classList.toggle('active', x.dataset.source === this.source);
    });
    $$('.seg-btn[data-checkmode]').forEach(x => {
      x.classList.toggle('active', x.dataset.checkmode === this.mode);
    });
    this.renderList();
    this.resetResult();
  }

  getList() {
    return this.source === 'history' ? this.data.state.history : this.data.state.favorites;
  }

  renderList() {
    const listEl = $('#checkTargetList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const items = this.getList();
    items.forEach((item, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      const label = this.source === 'history' ? '히스토리' : '즐겨찾기';
      opt.textContent = `[${label}] ${item.numbers.join(', ')}`;
      listEl.appendChild(opt);
    });
  }

  resetResult() {
    const area = $('#checkResultArea');
    if (!area) return;
    area.classList.add('check-result-placeholder');
    area.innerHTML = `
      <i class="ph ph-magnifying-glass" style="font-size: 48px; color: var(--muted);"></i>
      <p>좌측에서 번호를 선택하고 확인 버튼을 누르세요.</p>
    `;
  }

  renderTicketBalls(nums, winSet) {
    return nums.map(n => {
      const hit = winSet.has(n) ? 'hit' : '';
      return `<span class="ball ${UIManager.getBallColor(n)} sm ${hit}">${n}</span>`;
    }).join('');
  }

  run() {
    if (!this.data.state.winningStats.length) {
      return UIManager.toast('당첨 데이터가 없습니다. (data/winning_stats.json)', 'error', 3000);
    }

    const listEl = $('#checkTargetList');
    const idx = listEl?.selectedIndex ?? -1;
    if (idx < 0) return UIManager.toast('비교할 번호를 선택하세요.', 'warning');

    const items = this.getList();
    const ticket = items[idx];
    if (!ticket) return UIManager.toast('선택 항목을 찾을 수 없습니다.', 'error');

    if (this.mode === 'all') return this.runAll(ticket);
    return this.runLatest(ticket);
  }

  _rank(matchCount, bonusHit) {
    if (matchCount === 6) return 1;
    if (matchCount === 5 && bonusHit) return 2;
    if (matchCount === 5) return 3;
    if (matchCount === 4) return 4;
    if (matchCount === 3) return 5;
    return 0;
  }

  runLatest(ticket) {
    const latest = this.data.state.winningStats[0];
    const winSet = new Set(latest.numbers);
    const matchCount = ticket.numbers.filter(n => winSet.has(n)).length;
    const bonusHit = ticket.numbers.includes(latest.bonus);
    const rank = this._rank(matchCount, bonusHit);

    const area = $('#checkResultArea');
    if (!area) return;
    area.classList.remove('check-result-placeholder');

    const rankText = rank ? `${rank}등` : '낙첨';
    const hitText = (rank === 2) ? '5+B' : `${matchCount}`;

    area.innerHTML = `
      <div class="check-result">
        <div class="check-head">
          <div class="title">${latest.draw_no}회 (${latest.date})</div>
          <div class="badge ${rank ? 'ok' : 'no'}">${rankText}</div>
        </div>
        <div class="check-actions">
          <button class="btn ghost sm check-copy"><i class="ph ph-copy"></i> 복사</button>
          <button class="btn ghost sm check-qr"><i class="ph ph-qr-code"></i> QR</button>
        </div>
        <div class="check-section">
          <div class="label">당첨 번호</div>
          <div class="ball-container sm">
            ${UIManager.renderBalls(latest.numbers, 'sm')}
            <span class="ball ${UIManager.getBallColor(latest.bonus)} sm" style="margin-left:8px; opacity:0.85">+${latest.bonus}</span>
          </div>
        </div>
        <div class="check-section">
          <div class="label">내 번호</div>
          <div class="ball-container sm">${this.renderTicketBalls(ticket.numbers, winSet)}</div>
          <div class="meta">적중: <b>${hitText}</b> / 보너스: <b>${bonusHit ? 'O' : 'X'}</b></div>
        </div>
      </div>
    `;

    area.querySelector('.check-copy')?.addEventListener('click', () => UIManager.copyNumbers(ticket.numbers));
    area.querySelector('.check-qr')?.addEventListener('click', () => UIManager.showQR(ticket.numbers));
  }

  runAll(ticket) {
    const results = [];
    for (const win of this.data.state.winningStats) {
      const winSet = new Set(win.numbers);
      const matchCount = ticket.numbers.filter(n => winSet.has(n)).length;
      if (matchCount < 3) continue;
      const bonusHit = ticket.numbers.includes(win.bonus);
      const rank = this._rank(matchCount, bonusHit);
      results.push({
        draw_no: win.draw_no,
        date: win.date,
        numbers: win.numbers,
        bonus: win.bonus,
        matchCount,
        bonusHit,
        rank,
        winSet
      });
    }

    results.sort((a, b) => (a.rank - b.rank) || (b.draw_no - a.draw_no));
    const limited = results.slice(0, 50);

    const area = $('#checkResultArea');
    if (!area) return;
    area.classList.remove('check-result-placeholder');

    if (!limited.length) {
      area.innerHTML = `
        <div class="check-result">
          <div class="check-head">
            <div class="title">전체 회차 검사</div>
            <div class="badge no">결과 없음</div>
          </div>
          <div class="check-actions">
            <button class="btn ghost sm check-copy"><i class="ph ph-copy"></i> 복사</button>
            <button class="btn ghost sm check-qr"><i class="ph ph-qr-code"></i> QR</button>
          </div>
          <div class="check-section">
            <div class="label">내 번호</div>
            <div class="ball-container sm">${UIManager.renderBalls(ticket.numbers, 'sm')}</div>
            <div class="meta">3개 이상 적중한 회차가 없습니다.</div>
          </div>
        </div>
      `;
      area.querySelector('.check-copy')?.addEventListener('click', () => UIManager.copyNumbers(ticket.numbers));
      area.querySelector('.check-qr')?.addEventListener('click', () => UIManager.showQR(ticket.numbers));
      return;
    }

    const note = results.length > 50 ? `<div class="meta">표시 제한: 상위 50개만 보여줍니다. (총 ${results.length}개)</div>` : `<div class="meta">총 ${results.length}개 회차에서 3개 이상 적중했습니다.</div>`;

    const cards = limited.map(r => {
      const rankText = `${r.rank}등`;
      const badgeCls = r.rank ? 'ok' : 'no';
      const hitText = (r.rank === 2) ? '5+B' : String(r.matchCount);
      return `
        <div class="check-card">
          <div class="check-head">
            <div class="title">${r.draw_no}회 (${r.date})</div>
            <div class="badge ${badgeCls}">${rankText}</div>
          </div>
          <div class="check-section">
            <div class="label">당첨 번호</div>
            <div class="ball-container sm">
              ${UIManager.renderBalls(r.numbers, 'sm')}
              <span class="ball ${UIManager.getBallColor(r.bonus)} sm" style="margin-left:8px; opacity:0.85">+${r.bonus}</span>
            </div>
          </div>
          <div class="check-section">
            <div class="label">내 번호</div>
            <div class="ball-container sm">${this.renderTicketBalls(ticket.numbers, r.winSet)}</div>
            <div class="meta">적중: <b>${hitText}</b> / 보너스: <b>${r.bonusHit ? 'O' : 'X'}</b></div>
          </div>
        </div>
      `;
    }).join('');

    area.innerHTML = `
      <div class="check-result">
        <div class="check-head">
          <div class="title">전체 회차 검사</div>
          <div class="badge ok">${limited.length}개 표시</div>
        </div>
        <div class="check-actions">
          <button class="btn ghost sm check-copy"><i class="ph ph-copy"></i> 복사</button>
          <button class="btn ghost sm check-qr"><i class="ph ph-qr-code"></i> QR</button>
        </div>
        <div class="check-section">
          <div class="label">내 번호</div>
          <div class="ball-container sm">${UIManager.renderBalls(ticket.numbers, 'sm')}</div>
          ${note}
        </div>
        <div class="check-cards">${cards}</div>
      </div>
    `;

    area.querySelector('.check-copy')?.addEventListener('click', () => UIManager.copyNumbers(ticket.numbers));
    area.querySelector('.check-qr')?.addEventListener('click', () => UIManager.showQR(ticket.numbers));
  }
}

class DataIOModule {
  constructor(app) {
    this.app = app;
    this.data = app.data;
    this.bindEvents();
  }

  bindEvents() {
    $('#exportAll')?.addEventListener('click', () => this.exportAll());
    $('#importAllTrigger')?.addEventListener('click', () => $('#importInput')?.click());
    $('#importInput')?.addEventListener('change', (e) => this.importAll(e));
  }

  exportAll() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      favorites: this.data.state.favorites,
      history: this.data.state.history,
      settings: { theme: this.data.state.theme }
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `lotto_pro_backup_v1_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    UIManager.toast('백업 파일을 내보냈습니다.', 'success');
  }

  normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(x => x && Array.isArray(x.numbers))
      .map(x => ({
        numbers: [...new Set(x.numbers.map(Number).filter(n => n >= 1 && n <= 45))]
          .slice(0, 6)
          .sort((a, b) => a - b),
        date: typeof x.date === 'string' ? x.date : new Date().toISOString()
      }))
      .filter(x => x.numbers.length === 6);
  }

  mergeByNumbers(existing, incoming) {
    const seen = new Set(existing.map(x => x.numbers.join(',')));
    const merged = [...existing];
    // Put new (non-duplicate) items on top
    incoming.forEach(x => {
      const k = x.numbers.join(',');
      if (seen.has(k)) return;
      seen.add(k);
      merged.unshift(x);
    });
    return merged;
  }

  async importAll(e) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json || typeof json !== 'object' || json.version !== 1) {
        UIManager.toast('가져오기 실패: 지원하지 않는 백업 파일 형식입니다.', 'error', 3500);
        return;
      }

      const incomingFav = this.normalizeItems(json.favorites);
      const incomingHist = this.normalizeItems(json.history);
      const incomingTheme = json.settings?.theme === 'light' ? 'light' : 'dark';

      const merge = confirm('기존 데이터를 유지하고 병합할까요? (확인=병합 / 취소=덮어쓰기)');
      if (merge) {
        this.data.state.favorites = this.mergeByNumbers(this.data.state.favorites, incomingFav);
        this.data.state.history = this.mergeByNumbers(this.data.state.history, incomingHist);
        // Keep current theme on merge
      } else {
        this.data.state.favorites = incomingFav;
        this.data.state.history = incomingHist;
        this.data.state.theme = incomingTheme;
        this.app.applyTheme();
      }

      // Clamp history size
      if (this.data.state.history.length > CONFIG.LIMITS.MAX_HIST) {
        this.data.state.history = this.data.state.history.slice(0, CONFIG.LIMITS.MAX_HIST);
      }

      this.data.save();
      this.app.renderDataLists();
      UIManager.toast('가져오기 완료', 'success');
    } catch (err) {
      console.error('Import failed', err);
      UIManager.toast('가져오기 실패: JSON 파싱 오류', 'error', 3500);
    } finally {
      // allow re-importing same file
      input.value = '';
    }
  }
}

class BacktestModule {
  constructor(app) {
    this.app = app;
    this.data = app.data;
    this.MAX_QTY = 1000;
    this.worker = null;
    this.bindEvents();
  }

  bindEvents() {
    $('#runBacktest')?.addEventListener('click', () => this.run());
  }

  onEnter() {
    this.resetUI();
  }

  resetUI() {
    const sum = $('#btSummaryList');
    if (sum) sum.innerHTML = '<li>실행 대기중...</li>';
    const tbody = $('#btResultTable tbody');
    if (tbody) tbody.innerHTML = '';
  }

  renderSummary(stats) {
    const el = $('#btSummaryList');
    if (!el) return;
    const pct = (n, d) => d ? ((n / d) * 100).toFixed(2) : '0.00';
    const roi = stats.cost > 0 ? (((stats.totalPrize - stats.cost) / stats.cost) * 100) : 0;

    el.innerHTML = `
      <li><b>회차 수</b>: ${stats.draws}</li>
      <li><b>총 티켓</b>: ${stats.tickets}</li>
      <li><b>총 비용</b>: ${stats.cost.toLocaleString()}원</li>
      <li><b>총 상금(추정)</b>: ${stats.totalPrize.toLocaleString()}원</li>
      <li><b>순이익</b>: ${(stats.totalPrize - stats.cost).toLocaleString()}원</li>
      <li><b>ROI</b>: ${roi.toFixed(2)}%</li>
      <li><b>1등</b>: ${stats.counts[1]} / <b>2등</b>: ${stats.counts[2]} / <b>3등</b>: ${stats.counts[3]}</li>
      <li><b>4등</b>: ${stats.counts[4]} / <b>5등</b>: ${stats.counts[5]} / <b>낙첨</b>: ${stats.counts[0]}</li>
      <li><b>당첨률(5등+)</b>: ${pct(stats.counts[1] + stats.counts[2] + stats.counts[3] + stats.counts[4] + stats.counts[5], stats.tickets)}%</li>
    `;
  }

  appendWinRow(row) {
    const tbody = $('#btResultTable tbody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.drawNo}</td>
      <td>${row.rank}등</td>
      <td>${row.hitText}</td>
      <td><div class="ball-container sm">${UIManager.renderBalls(row.nums, 'sm')}</div></td>
    `;
    tbody.appendChild(tr);
  }

  async run() {
    if (!this.data.state.winningStats.length) {
      return UIManager.toast('당첨 데이터를 불러오지 못했습니다.', 'error', 3500);
    }

    const start = Number($('#btStart')?.value);
    const end = Number($('#btEnd')?.value);
    let qty = Number($('#btQty')?.value);
    const strategy = ($('#btStrategy')?.value || 'random');

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      return UIManager.toast('회차 범위를 확인하세요. (start <= end)', 'warning', 2500);
    }
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    qty = Math.min(qty, this.MAX_QTY);

    const btn = $('#runBacktest');
    const original = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> 실행 중...';
    }

    this.resetUI();

    if (this.worker) this.worker.terminate();
    this.worker = new Worker('assets/backtest.worker.js');

    this.worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'PROGRESS' || type === 'DONE') {
        this.renderSummary(payload);
      }
      if (type === 'WINS') {
        payload.forEach(w => this.appendWinRow(w));
      }
      if (type === 'DONE') {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = original;
        }
        UIManager.toast('백테스팅 완료', 'success');
        this.worker.terminate();
        this.worker = null;
      }
    };

    this.worker.onerror = (err) => {
      console.error(err);
      UIManager.toast('오류 발생', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
      }
      this.worker.terminate();
      this.worker = null;
    };

    this.worker.postMessage({
      type: 'START',
      payload: {
        statsData: this.data.state.winningStats,
        startDraw: start,
        endDraw: end,
        qty,
        strategy
      }
    });

    UIManager.toast('백그라운드에서 실행 중...');
  }
}

class LottoApp {
  constructor() {
    this.data = new DataManager();
    this.generator = null;
    this.stats = null;
    this.ai = null;
    this.check = null;
    this.dataIO = null;
    this.backtest = null;
    this.currentRoute = 'gen';
  }

  async init() {
    // Load Data
    this.data.load();
    this.applyTheme();

    // Modules
    this.generator = new GeneratorModule(this);
    this.stats = new StatsModule(this);
    this.ai = new AiModule(this);
    this.check = new CheckModule(this);
    this.dataIO = new DataIOModule(this);
    this.backtest = new BacktestModule(this);

    // Bind Global Events
    this.bindNav();
    this.bindThemeToggle();
    this.bindDataEvents();

    // Initial Route (fast paint)
    this.route('gen');

    // Async Load
    await this.data.fetchWinningStats();
    this.updateLatestWin();
    this.refreshCurrentRoute();

    console.log('LottoApp Initialized');
  }

  bindNav() {
    // Desktop & Mobile Nav
    $$('.nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const target = e.currentTarget.dataset.target;
        this.route(target);
      });
    });
  }

  bindThemeToggle() {
    const toggle = () => {
      this.data.state.theme = this.data.state.theme === 'light' ? 'dark' : 'light';
      this.applyTheme();
      this.data.save();
    };
    $('#themeToggle')?.addEventListener('click', toggle);
    $('#mobileThemeToggle')?.addEventListener('click', toggle);
  }

  bindDataEvents() {
    $('#clearFavorites')?.addEventListener('click', () => {
      if (confirm('즐겨찾기를 모두 삭제하시겠습니까?')) {
        this.data.clearFavorites();
        this.renderDataLists();
      }
    });

    $('#clearHistory')?.addEventListener('click', () => {
      if (confirm('히스토리를 모두 삭제하시겠습니까?')) {
        this.data.clearHistory();
        this.renderDataLists();
      }
    });

    $('#syncDataBtn')?.addEventListener('click', () => {
      this.data.fetchLatestFromAPI();
    });
  }

  applyTheme() {
    document.body.setAttribute('data-theme', this.data.state.theme);
    // Update icons if needed
    const icon = this.data.state.theme === 'light' ? 'ph-moon' : 'ph-sun';
    const btns = $$('#themeToggle i, #mobileThemeToggle i');
    btns.forEach(i => i.className = `ph ${icon}`);
  }

  route(target) {
    this.currentRoute = target;
    // Active Nav
    $$('.nav-item').forEach(el => el.classList.remove('active'));
    $$(`.nav-item[data-target="${target}"]`).forEach(el => el.classList.add('active'));

    // Active Page
    $$('.page').forEach(el => el.classList.remove('active'));
    const page = $(`#page-${target}`);
    if (page) page.classList.add('active');

    // Page specific renders
    if (target === 'stats') this.stats.render();
    if (target === 'data') this.renderDataLists();
    if (target === 'check') this.check.onEnter();
    if (target === 'bt') this.backtest.onEnter();
  }

  refreshCurrentRoute() {
    const t = this.currentRoute;
    if (t === 'gen') this.updateLatestWin();
    if (t === 'stats') this.stats.render();
    if (t === 'data') this.renderDataLists();
    if (t === 'check') this.check.onEnter();
    if (t === 'bt') this.backtest.resetUI();
  }

  updateLatestWin() {
    const latest = this.data.state.winningStats[0];
    if (!latest) return;

    $('#latestDrawNo').textContent = `${latest.draw_no}회`;
    $('#latestWinBalls').innerHTML = UIManager.renderBalls(latest.numbers) +
      `<span class="ball ${UIManager.getBallColor(latest.bonus)}" style="margin-left:8px; opacity:0.8; transform:scale(0.9)">+${latest.bonus}</span>`;
    $('#latestWinMeta').innerHTML = `
            <span>${latest.date} 추첨</span>
        `;
  }

  renderDataLists() {
    const fill = (id, list, emptyText) => {
      const el = $(id);
      if (!el) return;
      el.innerHTML = '';
      if (!list.length) {
        el.innerHTML = `<div class="empty-state">${emptyText}</div>`;
        return;
      }
      list.slice(0, 50).forEach(item => {
        const div = document.createElement('div');
        div.className = 'result-item';
        const dateStr = item.date || item.created_at || '';
        div.innerHTML = `
                    <div class="ball-container sm">${UIManager.renderBalls(item.numbers, 'sm')}</div>
                    <span class="result-meta">${dateStr ? new Date(dateStr).toLocaleDateString() : ''}</span>
                    <div class="result-actions">
                      <button class="icon-btn copy-btn" title="복사"><i class="ph ph-copy"></i></button>
                      <button class="icon-btn qr-btn" title="QR"><i class="ph ph-qr-code"></i></button>
                    </div>
                `;
        div.querySelector('.copy-btn').onclick = () => UIManager.copyNumbers(item.numbers);
        div.querySelector('.qr-btn').onclick = () => UIManager.showQR(item.numbers);
        el.appendChild(div);
      });
    };

    fill('#favList', this.data.state.favorites, '저장된 즐겨찾기가 없습니다.');
    fill('#historyList', this.data.state.history, '생성 기록이 없습니다.');
  }

  // Check list is handled by CheckModule
}

// --- Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LottoApp();
  window.app.init();
});
