(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return '?';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var state = { q: '', category: '', chain: '', sort: 'implied', dir: -1, selected: null, pageSize: 50 };

  var searchInput = document.getElementById('search');
  var categorySelect = document.getElementById('category-filter');
  var chainSelect = document.getElementById('chain-filter');
  var sortSelect = document.getElementById('sort-by');
  var resetBtn = document.getElementById('reset-filters');
  var countDisplay = document.getElementById('count-display');
  var boardBody = document.getElementById('board-body');
  var loadMoreBtn = document.getElementById('load-more');
  var loadMoreWrap = document.getElementById('load-more-wrap');
  var detailPanel = document.getElementById('detail-panel');
  var detailContent = document.getElementById('detail-content');
  var closeDetail = document.getElementById('close-detail');

  // Populate filters
  var categories = Array.from(new Set(DATA.rows.map(function(r) { return r.category || 'Other'; }))).sort();
  categories.forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    categorySelect.appendChild(opt);
  });
  var chains = Array.from(new Set(DATA.rows.flatMap(function(r) { return r.chains || []; }))).sort();
  chains.forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    chainSelect.appendChild(opt);
  });

  // Update model params
  var m = DATA.model;
  document.getElementById('param-base').textContent = m.base_multiple;
  document.getElementById('param-growth').textContent = m.growth_weight;
  document.getElementById('param-growth-floor').textContent = m.growth_floor + '%';
  document.getElementById('param-growth-cap').textContent = m.growth_cap + '%';
  document.getElementById('param-mat-floor').textContent = m.maturity_floor;
  document.getElementById('param-mat-range').textContent = m.maturity_range;

  // Header meta
  document.getElementById('meta-as-of').textContent = 'Snapshot ' + DATA.as_of;
  document.getElementById('meta-protocols').textContent = DATA.protocols.length + ' protocols indexed';
  document.getElementById('meta-model').textContent = DATA.model_version + ' model';

  // Stats
  document.getElementById('stat-total').textContent = DATA.rows.length;
  document.getElementById('stat-top-tvl').textContent = fmtUsd(DATA.rows[0]?.tvl_usd || 0);
  document.getElementById('stat-top-implied').textContent = fmtUsd(DATA.rows[0]?.implied_value_usd || 0);
  document.getElementById('stat-model').textContent = DATA.model_version;

  function getFilteredRows() {
    return DATA.rows.filter(function(r) {
      if (state.category && r.category !== state.category) return false;
      if (state.chain && !(r.chains || []).includes(state.chain)) return false;
      if (state.q) {
        var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
  }

  function getSortedRows(list) {
    return list.slice().sort(function(a, b) {
      var av, bv;
      if (state.sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (state.sort === 'maturity') { av = a.maturity_multiplier || 0; bv = b.maturity_multiplier || 0; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function renderBoard() {
    var filtered = getFilteredRows();
    var sorted = getSortedRows(filtered);
    var page = sorted.slice(0, state.pageSize);
    countDisplay.textContent = filtered.length + ' of ' + DATA.rows.length + ' shown';
    
    boardBody.innerHTML = '';
    page.forEach(function(r) {
      var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'positive' : 'negative');
      var tr = document.createElement('tr');
      tr.innerHTML = '<td class="col-rank">' + r.rank + '</td>' +
        '<td class="col-name"><a href="#' + escapeHtml(r.slug) + '">' + escapeHtml(r.name) + '</a></td>' +
        '<td class="col-cat">' + escapeHtml(r.category || 'Other') + '</td>' +
        '<td class="col-chains">' + escapeHtml((r.chains || []).slice(0, 2).join(', ')) + '</td>' +
        '<td class="col-tvl">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="col-change ' + gc + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="col-age">' + fmtAge(r.age_days) + '</td>' +
        '<td class="col-implied">' + fmtUsd(r.implied_value_usd) + '</td>' +
        '<td class="col-action"><button class="btn-view" data-slug="' + escapeHtml(r.slug) + '">View</button></td>';
      tr.querySelector('.btn-view').addEventListener('click', function(e) { e.stopPropagation(); openDetail(r.slug); });
      tr.addEventListener('click', function() { openDetail(r.slug); });
      boardBody.appendChild(tr);
    });

    if (loadMoreWrap) {
      if (sorted.length > state.pageSize) {
        loadMoreWrap.style.display = 'block';
        loadMoreBtn.textContent = 'Load More (' + (sorted.length - state.pageSize) + ' more)';
      } else {
        loadMoreWrap.style.display = 'none';
      }
    }
  }

  function openDetail(slug) {
    var row = DATA.rows.find(function(r) { return r.slug === slug; });
    if (!row) return;
    state.selected = slug;
    var chain = (row.chains || [])[0] || 'its main chain';
    var capital = row.tvl_usd >= 5e9 ? 250 : row.tvl_usd >= 1e9 ? 150 : row.tvl_usd >= 1e8 ? 100 : 50;
    var holdDays = !row.age_days || row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
    var c = (row.category || '').toLowerCase();
    var actionText = 'Deposit $' + capital + ' of USDC into ' + row.name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) actionText = 'Supply $' + capital + ' of USDC to ' + row.name + ' on ' + chain + ' and keep the position open.';
    else if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) actionText = 'Provide $' + capital + ' of liquidity to ' + row.name + "'s main pool on " + chain + '.';
    else if (c.indexOf('bridge') >= 0) actionText = 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + row.name + '.';
    else if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) actionText = 'Stake $' + capital + ' of the chain staking asset through ' + row.name + ' and keep the receipt.';
    else if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) actionText = 'Deposit $' + capital + ' into a ' + row.name + ' vault on ' + chain + ' and keep the shares.';
    else if (c.indexOf('rwa') >= 0) actionText = 'Mint $' + capital + ' of the protocol yield asset on ' + chain + ' and hold it.';

    detailContent.innerHTML = '<div class="detail-header">' +
      '<div>' +
        '<span class="detail-slug">#' + row.rank + ' · ' + escapeHtml(row.slug) + '</span>' +
        '<h2 class="detail-name">' + escapeHtml(row.name) + '</h2>' +
        '<span class="detail-category">' + escapeHtml(row.category || 'Other') + '</span>' +
      '</div></div>' +
      '<div class="detail-stats">' +
        '<div class="detail-stat"><div class="detail-stat-label">TVL</div><div class="detail-stat-value">' + fmtUsd(row.tvl_usd) + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Implied Value</div><div class="detail-stat-value" style="color:var(--accent)">' + fmtUsd(row.implied_value_usd) + '</div></div>' +
        '<div class="detail-stat"><div class="detail-stat-label">Age</div><div class="detail-stat-value">' + fmtAge(row.age_days) + '</div></div>' +
      '</div>' +
      '<div class="detail-section"><h3>Key Metrics</h3><ul>' +
        '<li><span>7D Change</span><span class="' + (row.change_7d >= 0 ? 'positive' : 'negative') + '">' + fmtPct(row.change_7d) + '</span></li>' +
        '<li><span>Growth Multiplier</span><span>' + (row.growth_multiplier ?? 'n/a') + '</span></li>' +
        '<li><span>Maturity Multiplier</span><span>' + (row.maturity_multiplier ?? 'n/a') + '</span></li>' +
        '<li><span>Chains</span><span>' + escapeHtml((row.chains || []).join(', ')) + '</span></li>' +
      '</ul></div>' +
      '<div class="detail-section"><h3>Farm Plan</h3><div class="farm-steps">' +
        '<div class="farm-step"><span class="step-num">1</span><div><div class="step-text">Use a fresh wallet with only farm funds.</div><div class="step-meta">Cost: under $3 gas · Time: 5 min</div></div></div>' +
        '<div class="farm-step"><span class="step-num">2</span><div><div class="step-text">' + escapeHtml(actionText) + '</div><div class="step-meta">Cost: $' + capital + ' capital · Time: 15 min setup</div></div></div>' +
        '<div class="farm-step"><span class="step-num">3</span><div><div class="step-text">Make one qualifying action weekly.</div><div class="step-meta">Cost: ~$2 gas/week · Time: 10 min/week</div></div></div>' +
        '<div class="farm-step"><span class="step-num">4</span><div><div class="step-text">Hold for at least ' + holdDays + ' days across snapshots.</div><div class="step-meta">Time: ' + holdDays + ' days</div></div></div>' +
        '<div class="farm-step"><span class="step-num">5</span><div><div class="step-text">Claim rewards only from official links.</div><div class="step-meta">Cost: free · Time: 10 min</div></div></div>' +
        '<div class="farm-step"><span class="step-num">6</span><div><div class="step-text">Log wallet, dates, transactions.</div><div class="step-meta">Cost: free · Time: 5 min</div></div></div>' +
      '</div></div>';
    detailPanel.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDetailFn() {
    detailPanel.hidden = true;
    state.selected = null;
    document.body.style.overflow = '';
  }

  closeDetail.addEventListener('click', closeDetailFn);
  detailPanel.addEventListener('click', function(e) { if (e.target === detailPanel) closeDetailFn(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !detailPanel.hidden) closeDetailFn(); });

  searchInput.addEventListener('input', function() { state.q = searchInput.value; renderBoard(); });
  categorySelect.addEventListener('change', function() { state.category = categorySelect.value; renderBoard(); });
  chainSelect.addEventListener('change', function() { state.chain = chainSelect.value; renderBoard(); });
  sortSelect.addEventListener('change', function() { state.sort = sortSelect.value; state.dir = -1; renderBoard(); });
  resetBtn.addEventListener('click', function() {
    state = { q: '', category: '', chain: '', sort: 'implied', dir: -1, selected: null, pageSize: 50 };
    searchInput.value = ''; categorySelect.value = ''; chainSelect.value = ''; sortSelect.value = 'implied';
    renderBoard();
  });
  loadMoreBtn?.addEventListener('click', function() { state.pageSize += 50; renderBoard(); });

  renderBoard();
})();
