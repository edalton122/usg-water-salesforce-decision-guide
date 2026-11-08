(function () {
  'use strict';
  var P = window.USG_PRICING;
  var computeTCO = window.USG_TCO.computeTCO;
  var sanitize = window.USG_TCO.sanitize;
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DRAFT = !P.isConfirmed();

  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var short = function (n) {
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 2).replace(/\.?0+$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var sup = function (src) {
    return src && src.length ? '<sup class="src">' + src.map(function (n) { return '<a href="#s' + n + '">' + n + '</a>'; }).join(',') + '</sup>' : '';
  };
  var pendingTag = function (ids) {
    var open = (ids || []).filter(function (id) { return !P.isConfirmed([id]); });
    return DRAFT && open.length ? '<span class="pending" title="Pending confirmation">Pending</span>' : '';
  };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  var state = clone(P.presets[P.defaults.preset]);
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ── Controls ── */
  function seg(el, items, current, onPick) {
    el.innerHTML = items.map(function (it) {
      return '<button type="button" data-v="' + esc(it.v) + '" aria-pressed="' + (String(it.v) === String(current)) + '">' + it.html + '</button>';
    }).join('');
    el.onclick = function (e) {
      var b = e.target.closest('button');
      if (b) onPick(b.getAttribute('data-v'));
    };
  }

  function setRange(input, lever, value, out, onInput) {
    input.min = lever.min; input.max = lever.max; input.step = lever.step; input.value = value;
    var paint = function () {
      input.style.setProperty('--fill', ((input.value - lever.min) / (lever.max - lever.min) * 100) + '%');
      out.textContent = input.value + '%';
    };
    paint();
    input.oninput = function () { paint(); onInput(+input.value); };
  }

  function presetMatch() {
    var keys = Object.keys(P.presets);
    for (var i = 0; i < keys.length; i++) {
      var p = sanitize(P.presets[keys[i]], P), s = sanitize(state, P);
      if (JSON.stringify(p) === JSON.stringify(s)) return keys[i];
    }
    return null;
  }

  function renderControls() {
    var hs = P.hubspot;
    seg($('seg-preset'), Object.keys(P.presets).map(function (k) { return { v: k, html: P.presets[k].label }; }), presetMatch(), function (k) {
      state = clone(P.presets[k]); renderControls(); update();
    });
    seg($('seg-option'), P.levers.option.map(function (k) {
      var o = P.salesforce.options[k];
      return { v: k, html: o.short + '<small>' + (o.keepsHubSpotMarketing ? 'Keep HubSpot marketing' : 'With Marketing Cloud') + '</small>' };
    }), state.option, function (v) { state.option = v; renderControls(); update(); });
    seg($('seg-horizon'), P.levers.horizon.map(function (h) {
      return { v: h, html: h + ' years<small>' + (h === 3 ? 'The term' : 'Term + first renewal') + '</small>' };
    }), state.horizon, function (v) { state.horizon = +v; renderControls(); update(); });
    seg($('seg-services'), P.levers.servicesEstimate.map(function (k) {
      return { v: k, html: (k === 'low' ? 'Low' : 'High') + '<small>' + money(hs.services[k]) + '</small>' };
    }), state.servicesEstimate, function (v) { state.servicesEstimate = v; renderControls(); update(); });

    setRange($('rng-overrun'), P.levers.overrunPct, state.overrunPct, $('out-overrun'), function (v) { state.overrunPct = v; syncPreset(); update(); });
    setRange($('rng-list'), P.levers.listChangePct, state.listChangePct, $('out-list'), function (v) { state.listChangePct = v; syncPreset(); update(); });

    var oos = hs.outOfScope.filter(function (o) { return o.appliesTo.indexOf(state.option) !== -1; });
    $('oos-list').innerHTML = oos.map(function (o) {
      var on = state.outOfScope.indexOf(o.id) !== -1;
      return '<label class="switch' + (on ? ' on' : '') + '"><input type="checkbox" data-id="' + o.id + '"' + (on ? ' checked' : '') + '><span class="knob"></span>' +
        '<span class="sw-text">' + esc(o.label) + '<small>' + money(o.hours * hs.services.rate) + ' estimate (' + o.hours + ' hrs at $' + hs.services.rate + '/hr). ' + esc(o.basis) + sup(o.src) + '</small></span></label>';
    }).join('');
    $('oos-list').onchange = function (e) {
      var id = e.target.getAttribute('data-id');
      if (!id) return;
      state.outOfScope = state.outOfScope.filter(function (x) { return x !== id; });
      if (e.target.checked) state.outOfScope.push(id);
      e.target.closest('.switch').classList.toggle('on', e.target.checked);
      syncPreset(); update();
    };
  }

  function syncPreset() {
    var m = presetMatch();
    Array.prototype.forEach.call($('seg-preset').children, function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === m)); });
  }

  function renderAssumptions() {
    var lic = P.hubspot.licenseLines.map(function (l) { return l.label + ' ' + money(l.annual); }).join('; ');
    $('assume-list').innerHTML = [
      P.hubspot.salesSeats + ' Sales and ' + P.hubspot.serviceSeats + ' Service users on both sides.',
      P.hubspot.contacts.toLocaleString('en-US') + ' marketing contacts.',
      'HubSpot licenses at published list price, per year: ' + lic + '. This is the lowest-cost reading of &ldquo;Enterprise licenses for all four hubs.&rdquo;' + sup([1, 4]),
      'HubSpot on a ' + P.hubspot.initialTermYears + '-year initial term at list, then renewal at list plus the change you set.' + sup([5]),
      'Salesforce at the same price each year of the 36-month term, and the full 5% cap in year 4.' + sup([3]),
      'Option 1 includes HubSpot Marketing Hub Professional at list (' + money(P.salesforce.hubspotMarketingProAnnual) + ' a year), since forms and campaigns stay in HubSpot.' + sup([2, 4])
    ].map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }

  /* ── Results ── */
  var shown = { savings: 0, sf: 0, hs: 0 };
  function countTo(key, el, target, fmt) {
    var from = shown[key], t0 = performance.now(), dur = REDUCED ? 0 : 700;
    shown[key] = target;
    (function step(now) {
      var t = dur ? Math.min(1, (now - t0) / dur) : 1;
      el.textContent = fmt(from + (target - from) * ease(t));
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }

  var lastResult = null;
  function update() {
    var r = computeTCO(state, P);
    lastResult = r;
    countTo('savings', $('sv-num'), r.totals.savings, money);
    countTo('sf', $('tot-sf'), r.totals.sf, money);
    countTo('hs', $('tot-hs'), r.totals.hs, money);
    $('sv-sub').innerHTML = 'over ' + r.inputs.horizon + ' years (' + esc(r.option.short) + '), compared with HubSpot at list price. Salesforce costs ' +
      Math.round(r.totals.sf / r.totals.hs * 100) + '% of HubSpot over the same period.';
    $('m-hs').style.width = '100%';
    $('m-sf').style.width = (r.totals.sf / r.totals.hs * 100).toFixed(1) + '%';
    $('rn-sf').textContent = money(r.opex.sfRenewal);
    $('rn-hs').textContent = money(r.opex.hsRenewal);
    drawChart(r);
    renderBreakdown(r);
    renderOnePager(r);
  }

  /* ── Chart ── */
  var NS = 'http://www.w3.org/2000/svg';
  var C = { W: 720, H: 290, L: 62, R: 18, T: 14, B: 34 };
  var chart = { sf: [0], hs: [0], max: 1 };
  var nodes = {};

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function initChart() {
    var svg = $('chart');
    var defs = el('defs', {}, svg);
    [['gSf', '#0176D3'], ['gHs', '#B5707B']].forEach(function (g) {
      var lg = el('linearGradient', { id: g[0], x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': g[1], 'stop-opacity': .22 }, lg);
      el('stop', { offset: '100%', 'stop-color': g[1], 'stop-opacity': 0 }, lg);
    });
    nodes.grid = el('g', { 'class': 'grid' }, svg);
    nodes.xaxis = el('g', { 'class': 'xaxis' }, svg);
    nodes.areaHs = el('path', { fill: 'url(#gHs)' }, svg);
    nodes.areaSf = el('path', { fill: 'url(#gSf)' }, svg);
    nodes.lineHs = el('path', { fill: 'none', stroke: '#B5707B', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    nodes.lineSf = el('path', { fill: 'none', stroke: '#0176D3', 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    nodes.guide = el('line', { 'class': 'guide', y1: C.T, y2: C.H - C.B }, svg);
    nodes.dots = el('g', {}, svg);
    nodes.hits = el('g', {}, svg);
  }

  function niceMax(v) {
    var step = Math.pow(10, Math.floor(Math.log10(v / 4)));
    var m = [1, 2, 2.5, 5, 10].map(function (k) { return k * step; }).filter(function (s) { return s * 4 >= v; })[0] || step * 10;
    return m * 4;
  }

  function x(i, n) { return C.L + i * (C.W - C.L - C.R) / n; }
  function y(v, max) { return C.T + (1 - v / max) * (C.H - C.T - C.B); }

  function paint(sf, hs, max, n) {
    var g = nodes.grid; g.innerHTML = '';
    for (var k = 0; k <= 4; k++) {
      var val = max * k / 4, yy = y(val, max);
      el('line', { x1: C.L, x2: C.W - C.R, y1: yy, y2: yy }, g);
      var t = el('text', { x: C.L - 10, y: yy + 4, 'text-anchor': 'end' }, g); t.textContent = short(val);
    }
    var xa = nodes.xaxis; xa.innerHTML = '';
    for (var i = 0; i <= n; i++) {
      var tx = el('text', { x: x(i, n), y: C.H - 10, 'text-anchor': 'middle' }, xa);
      tx.textContent = i === 0 ? 'Start' : 'Year ' + i + (i > P.salesforce.termYears ? ' (renewal)' : '');
    }
    var line = function (vals) { return vals.map(function (v, i) { return (i ? 'L' : 'M') + x(i, n).toFixed(1) + ' ' + y(v, max).toFixed(1); }).join(' '); };
    var area = function (vals) { return line(vals) + ' L' + x(n, n) + ' ' + y(0, max) + ' L' + x(0, n) + ' ' + y(0, max) + ' Z'; };
    nodes.lineSf.setAttribute('d', line(sf)); nodes.areaSf.setAttribute('d', area(sf));
    nodes.lineHs.setAttribute('d', line(hs)); nodes.areaHs.setAttribute('d', area(hs));
    var d = nodes.dots; d.innerHTML = '';
    for (var j = 1; j <= n; j++) {
      el('circle', { cx: x(j, n), cy: y(hs[j], max), r: 4.5, fill: '#fff', stroke: '#B5707B', 'stroke-width': 2.5 }, d);
      el('circle', { cx: x(j, n), cy: y(sf[j], max), r: 5, fill: '#fff', stroke: '#0176D3', 'stroke-width': 3 }, d);
    }
  }

  function drawChart(r) {
    var n = r.inputs.horizon;
    var toSf = [0].concat(r.years.map(function (yy) { return yy.sf.cumulative; }));
    var toHs = [0].concat(r.years.map(function (yy) { return yy.hs.cumulative; }));
    var toMax = niceMax(Math.max.apply(null, toHs) * 1.05);
    var pad = function (arr) { var out = arr.slice(0, n + 1); while (out.length < n + 1) out.push(out[out.length - 1]); return out; };
    var fromSf = pad(chart.sf), fromHs = pad(chart.hs), fromMax = chart.max > 1 ? chart.max : toMax;
    var t0 = performance.now(), dur = REDUCED ? 0 : 650;
    chart = { sf: toSf, hs: toHs, max: toMax };
    (function step(now) {
      var t = dur ? Math.min(1, (now - t0) / dur) : 1, e = ease(t);
      var mix = function (a, b) { return a.map(function (v, i) { return v + (b[i] - v) * e; }); };
      paint(mix(fromSf, toSf), mix(fromHs, toHs), fromMax + (toMax - fromMax) * e, n);
      if (t < 1) requestAnimationFrame(step);
    })(t0);
    buildHits(r);
  }

  function buildHits(r) {
    var n = r.inputs.horizon, h = nodes.hits, tip = $('tip'), svg = $('chart');
    h.innerHTML = '';
    var w = (C.W - C.L - C.R) / n;
    r.years.forEach(function (yr) {
      var rect = el('rect', { 'class': 'hit', x: x(yr.year, n) - w / 2, y: C.T, width: w, height: C.H - C.T - C.B }, h);
      var show = function () {
        nodes.guide.setAttribute('x1', x(yr.year, n)); nodes.guide.setAttribute('x2', x(yr.year, n)); nodes.guide.style.opacity = 1;
        tip.innerHTML = '<div><b>Year ' + yr.year + '</b>' + (yr.renewal ? ' · first renewal' : yr.year === 1 ? ' · includes one-time costs' : '') + '</div>' +
          '<div>Salesforce + SMBHD: <b>' + money(yr.sf.cumulative) + '</b></div>' +
          '<div>HubSpot + RevOps HQ: <b>' + money(yr.hs.cumulative) + '</b></div>' +
          '<div class="gap">Salesforce ahead by ' + money(yr.hs.cumulative - yr.sf.cumulative) + '</div>';
        var box = svg.getBoundingClientRect(), card = svg.parentNode.getBoundingClientRect();
        var px = (x(yr.year, n) / C.W) * box.width + (box.left - card.left);
        tip.classList.add('show');
        var tw = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(card.width - tw - 8, px - tw / 2)) + 'px';
        tip.style.top = (box.top - card.top + 18) + 'px';
      };
      rect.addEventListener('mouseenter', show);
      rect.addEventListener('click', show);
      rect.addEventListener('mouseleave', function () { tip.classList.remove('show'); nodes.guide.style.opacity = 0; });
    });
  }

  /* ── Breakdown ── */
  var bdVendor = 'sf';
  function renderBreakdown(r) {
    var b = r.breakdown[bdVendor];
    var line = function (it, cls) { return '<div class="bd-line ' + (cls || '') + '"><span>' + esc(it.label) + '</span><span>' + money(it.amount) + '</span></div>'; };
    var html = '<div class="bd-group">' + (bdVendor === 'sf' ? 'In the Salesforce and SMBHD proposals' : 'In RevOps HQ&rsquo;s quote') + '</div>' +
      b.included.map(function (it) { return line(it); }).join('');
    html += '<div class="bd-group">Billed separately</div>';
    html += b.separately.length ? b.separately.map(function (it) { return line(it, 'sep'); }).join('')
      : '<div class="bd-empty">No new middleware to buy and no onboarding fees in this proposal.</div>';
    $('bd-body').innerHTML = html;
  }
  document.querySelector('.bd-tabs').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    bdVendor = btn.getAttribute('data-v');
    Array.prototype.forEach.call(this.children, function (c) { c.setAttribute('aria-pressed', String(c === btn)); });
    renderBreakdown(lastResult);
  });

  /* ── One-pager ── */
  function onePager(r) {
    var opt = P.salesforce.options[r.inputs.option];
    var hs = P.hubspot;
    var lic = hs.licenseLines.reduce(function (t, l) { return t + l.annual; }, 0);
    var onboard = hs.onboarding.reduce(function (t, o) { return t + o.amount; }, 0);
    var sfYear = opt.annual + (opt.keepsHubSpotMarketing ? P.salesforce.hubspotMarketingProAnnual : 0);
    return [
      { title: 'Functionality', rows: [
        { topic: 'Forecasting', sfHead: 'Revenue cockpit, built for USG', hsHead: 'About 3 hours of build', hsMark: 'warn',
          sf: 'Revenue cockpit: pipeline velocity, Best Case and Committed by month, win and loss.', sfSrc: [2],
          hs: 'Pipelines and forecasting: 2.9 to 3.5 hours of build (p06).', hsSrc: [1] },
        { topic: 'Big-deal approvals', sfHead: 'One approval per deal, on mobile', hsHead: 'Out of scope', hsMark: 'x',
          sf: 'One approval per deal by line of business, with a note to finance and approval from the mobile app.', sfSrc: [2],
          hs: 'Finance approval modeling for over-$500K deals is out of scope (p11).', hsSrc: [1] },
        { topic: 'Customer success', sfHead: 'Response times tracked on every case', hsHead: 'About 8 to 11 hours of build', hsMark: 'warn',
          sf: '72-hour standard and 24-hour emergency response tracked on every case, with survey follow-ups sent to sellers as cross-sell signals.', sfSrc: [2],
          hs: 'Service Hub build: 8.0 to 10.8 hours (p06).', hsSrc: [1] },
        { topic: 'Adoption', sfHead: 'Reviews at 30, 60 and 90 days', hsHead: 'No change management', hsMark: 'x',
          sf: 'Change management with adoption reviews at 30, 60 and 90 days. Every role trained, pricing team included.', sfSrc: [2],
          hs: 'No change management workstream. 38 hours of training, none listed for the pricing team (p09).', hsSrc: [1] },
        { topic: 'Go-live', sfHead: 'Week 10', hsHead: 'Week 12, subject to IT availability', hsMark: 'warn',
          sf: 'Week 10, then 30 days of support alongside your team.', sfSrc: [2], confirm: ['smbhd-sow'],
          hs: 'End of week 12 of a 16-week plan, about 4 months from kickoff, “subject to IT availability” (p10, p11).', hsSrc: [1] }
      ] },
      { title: 'Integration', rows: [
        { topic: 'Snowflake', sfHead: 'Reads Snowflake in place', hsHead: 'Not in the proposal', hsMark: 'x',
          sf: 'Data 360 reads Snowflake in place, with zero copy, so sellers see the numbers finance sees.', sfSrc: [2],
          hs: 'Snowflake is not mentioned anywhere in the proposal (pp. 01 to 12).', hsSrc: [1] },
        { topic: 'Middleware', sfHead: 'Uses the Oracle middleware USG owns', hsHead: money(hs.middlewareAnnual) + ' a year, extra', hsMark: 'warn',
          sf: 'Live links use Oracle Integration Cloud, which USG already owns. No new middleware to buy.', sfSrc: [3],
          hs: 'RevOps Connect integration platform: $800 a month, billed separately from project hours (p07).', hsSrc: [1] },
        { topic: 'ERP change', sfHead: 'A mapping project, not a rebuild', hsHead: 'Re-point listed as out of scope', hsMark: 'x',
          sf: 'ERP data reaches Salesforce through Snowflake, so an ERP change is a mapping project scoped with USG, not a CRM rebuild.', sfSrc: [3], confirm: ['erp-position'],
          hs: 'Calls a NetSuite cutover “a re-point, not a rebuild” (p07), then lists “NetSuite integration or re-pointing at cutover” as out of scope (p11).', hsSrc: [1] }
      ] },
      { title: 'CapEx', rows: [
        { topic: 'Implementation', sfHead: money(opt.implementation) + ' fixed fee', hsHead: short(hs.services.low) + ' to ' + short(hs.services.high) + ' estimate, not a cap', hsMark: 'warn',
          sf: money(opt.implementation) + ' fixed fee (' + opt.short + '), with migration from Oracle, training, change management and 30 days of support included.', sfSrc: [2], confirm: ['smbhd-sow'],
          hs: money(hs.services.low) + ' to ' + money(hs.services.high) + ' estimate, time and materials at $250 an hour: “Estimates for budgeting; TCV is not a cap.” Added scope goes through a written change order (p04, p11).', hsSrc: [1] },
        { topic: 'One-time license fees', sfHead: 'No onboarding fees', hsHead: money(onboard) + ' required onboarding', hsMark: 'warn',
          sf: 'No onboarding fees in the Salesforce proposal.', sfSrc: [3], confirm: ['sf-quotes'],
          hs: money(onboard) + ' in required HubSpot onboarding for Sales, Service and Marketing Hub Enterprise.', hsSrc: [4] },
        { topic: 'Scope', sfHead: opt.keepsHubSpotMarketing ? 'One fixed fee, marketing stays in HubSpot' : 'Everything above, one fixed fee', hsHead: 'Approvals, ERP re-point, marketing excluded', hsMark: 'x',
          sf: opt.keepsHubSpotMarketing ? 'Sales, Service and Data 360 under one fixed fee. Forms and campaigns stay in HubSpot.' : 'Sales, Service, Data 360 and Marketing Cloud under one fixed fee.', sfSrc: [2],
          hs: 'Out of scope: over-$500K finance approvals, the NetSuite re-point, marketing content and CMS work, licenses and middleware fees (p11).', hsSrc: [1] }
      ] },
      { title: 'OpEx', rows: [
        { topic: 'Every year of the term', sfHead: money(sfYear) + ' a year, flat', hsHead: money(r.opex.hs) + ' a year at list', hsMark: 'warn',
          sf: opt.keepsHubSpotMarketing
            ? money(opt.annual) + ' a year for Salesforce, the same each year of the 36-month term, plus ' + money(P.salesforce.hubspotMarketingProAnnual) + ' a year at list to keep HubSpot Marketing Hub Professional.'
            : money(opt.annual) + ' a year, the same in each year of the 36-month term.', sfSrc: opt.keepsHubSpotMarketing ? [3, 4] : [3], confirm: ['sf-quotes'],
          hs: money(r.opex.hs) + ' a year at list: four Enterprise hubs (' + money(lic) + ') plus RevOps Connect (' + money(hs.middlewareAnnual) + ').', hsSrc: [1, 4] },
        { topic: 'At renewal', sfHead: 'Capped at 5%', hsHead: 'Up to then-current list price', hsMark: 'warn',
          sf: 'First renewal capped at 5%: at most ' + money(r.opex.sfRenewal) + ' in year 4.', sfSrc: [3], confirm: ['renewal-clause'],
          hs: '“Upon renewal, we may increase your Subscription Fees up to our then-current list price.” With a ' + r.inputs.listChangePct + '% list change: ' + money(r.opex.hsRenewal) + ' in year 4.', hsSrc: [5] },
        { topic: 'During the term', sfHead: 'Swap licenses as needs change', hsHead: 'No downgrades until renewal', hsMark: 'x',
          sf: 'License swap clause: USG can exchange licenses as its needs change.', sfSrc: [3], confirm: ['renewal-clause'],
          hs: '“You are not permitted to downgrade your Subscription Service during your Current Term.” Marketing contact tiers can’t be downgraded until renewal.', hsSrc: [4, 5] }
      ] }
    ];
  }

  var ICON = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v7.5M12 18h.01"/></svg>'
  };
  var MARK_LABEL = { ok: 'Covered', x: 'Not included', warn: 'Limited or extra cost' };
  var mark = function (kind) { return '<i class="mk ' + kind + '" role="img" aria-label="' + MARK_LABEL[kind] + '">' + ICON[kind] + '</i>'; };
  var CHEV = '<svg class="op-chev" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var op = { tab: 0, open: {}, all: false, seen: false, bandSeen: false, scored: false };

  function renderOnePager(r, animate) {
    var quads = onePager(r);
    var rows = quads.reduce(function (a, q) { return a.concat(q.rows); }, []);
    var nx = rows.filter(function (x) { return x.hsMark === 'x'; }).length;
    var nw = rows.length - nx;

    if (!op.scored) {
      op.scored = true;
      $('op-score').innerHTML =
        '<div class="sc-side sf"><div class="ring"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15.9155"/><circle class="fg" cx="18" cy="18" r="15.9155" pathLength="100"/></svg><b>' + rows.length + '/' + rows.length + '</b></div>' +
        '<div><div class="sc-who">Salesforce + SMBHD</div><div class="sc-big">Covers all ' + rows.length + ' areas</div><div class="sc-sub">Inside the fixed fee or the contract terms</div></div></div>' +
        '<div class="sc-vs" aria-hidden="true">VS</div>' +
        '<div class="sc-side hs"><div class="sc-who">HubSpot + RevOps HQ</div>' +
        '<div class="sc-counts"><span class="x">' + mark('x') + '<em>' + nx + '</em> not included</span><span class="w">' + mark('warn') + '<em>' + nw + '</em> limited or extra cost</span></div>' +
        '<div class="sc-bar"><i class="x" style="--w:' + (nx / rows.length * 100).toFixed(1) + '%"></i><i class="w" style="--w:' + (nw / rows.length * 100).toFixed(1) + '%"></i></div></div>';
      $('op-legend').innerHTML = ['ok', 'x', 'warn'].map(function (k) { return '<span>' + mark(k) + MARK_LABEL[k] + '</span>'; }).join('');
    }

    $('op-tabs').innerHTML = quads.map(function (q, i) {
      var dots = function (kinds) { return '<span class="dots">' + kinds.map(function (k) { return '<i class="' + k + '"></i>'; }).join('') + '</span>'; };
      return '<button class="op-tab" type="button" role="tab" id="op-tab-' + i + '" aria-selected="' + (i === op.tab) + '" tabindex="' + (i === op.tab ? 0 : -1) + '" data-i="' + i + '">' +
        '<span class="t-top"><span class="t-num">' + (i + 1) + '</span>' + q.title + '</span>' +
        '<span class="t-dots"><span>SF</span>' + dots(q.rows.map(function () { return 'ok'; })) +
        '<span>HS</span>' + dots(q.rows.map(function (x) { return x.hsMark; })) + '</span></button>';
    }).join('');

    var q = quads[op.tab];
    var panel = $('op-panel');
    panel.setAttribute('aria-labelledby', 'op-tab-' + op.tab);
    panel.innerHTML =
      '<div class="op-cols"><span></span><span class="c-sf"><img src="assets/salesforce-logo.svg" alt="">Salesforce + SMBHD</span><span class="c-hs">HubSpot + RevOps HQ</span><span></span></div>' +
      q.rows.map(function (row, i) {
        var key = q.title + '|' + row.topic, open = op.all || op.open[key];
        return '<div class="op-row' + (open ? ' open' : '') + '" style="--i:' + i + '" data-k="' + esc(key) + '">' +
          '<button class="op-line" type="button" aria-expanded="' + !!open + '">' +
            '<span class="op-topic">' + esc(row.topic) + pendingTag(row.confirm) + '</span>' +
            '<span class="op-v sf">' + mark('ok') + '<span>' + esc(row.sfHead) + '</span></span>' +
            '<span class="op-v hs">' + mark(row.hsMark) + '<span>' + esc(row.hsHead) + '</span></span>' + CHEV +
          '</button>' +
          '<div class="op-detail"><div><div class="d-grid"><span class="d-src">Detail and source</span>' +
            '<p class="sf">' + esc(row.sf) + sup(row.sfSrc) + '</p><p class="hs">' + esc(row.hs) + sup(row.hsSrc) + '</p><span></span></div></div></div>' +
        '</div>';
      }).join('');
    $('op-more').textContent = op.all ? 'Hide details' : 'Show all details';

    panel.classList.remove('anim');
    if (animate && !REDUCED) { void panel.offsetWidth; panel.classList.add('anim'); }
    paintBand(r);
  }

  function paintBand(r) {
    var sfPct = r.threeYear.sf / r.threeYear.hs * 100;
    $('b-sf-who').textContent = 'Salesforce + SMBHD, ' + r.option.short;
    if (op.bandSeen) {
      countTo('bandSav', $('b-sav'), r.threeYear.savings, money);
      countTo('bandSf', $('b-sf'), r.threeYear.sf, money);
      countTo('bandHs', $('b-hs'), r.threeYear.hs, money);
      $('b-sf-bar').style.width = sfPct.toFixed(1) + '%';
      $('b-hs-bar').style.width = '100%';
    } else {
      shown.bandSav = 0; shown.bandSf = 0; shown.bandHs = 0;
      $('b-sav').textContent = money(r.threeYear.savings);
      $('b-sf').textContent = money(r.threeYear.sf);
      $('b-hs').textContent = money(r.threeYear.hs);
    }
  }

  function selectTab(i, focus) {
    op.tab = (i + 4) % 4;
    renderOnePager(lastResult, true);
    if (focus) $('op-tab-' + op.tab).focus();
  }
  $('op-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.op-tab');
    if (b) selectTab(+b.getAttribute('data-i'));
  });
  $('op-tabs').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); selectTab(op.tab + 1, true); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); selectTab(op.tab - 1, true); }
  });
  $('op-panel').addEventListener('click', function (e) {
    var line = e.target.closest('.op-line');
    if (!line) return;
    var row = line.parentNode, key = row.getAttribute('data-k');
    var open = !row.classList.contains('open');
    op.open[key] = open;
    if (!open && op.all) { op.all = false; $('op-more').textContent = 'Show all details'; }
    row.classList.toggle('open', open);
    line.setAttribute('aria-expanded', String(open));
  });
  $('op-more').addEventListener('click', function () {
    op.all = !op.all;
    if (!op.all) op.open = {};
    renderOnePager(lastResult, false);
  });
  function watchOnePager() {
    var startPanel = function () { if (!op.seen) { op.seen = true; renderOnePager(lastResult, true); } };
    var startBand = function () { if (!op.bandSeen) { op.bandSeen = true; paintBand(lastResult); } };
    if (REDUCED || !('IntersectionObserver' in window)) { startPanel(); startBand(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        if (en.target.id === 'band') startBand(); else startPanel();
      });
    }, { threshold: .25 });
    io.observe($('op-card'));
    io.observe($('band'));
  }

  /* ── PDF export ── */
  function rasterize(src, h) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var scale = 4, w = img.naturalWidth / img.naturalHeight * h;
        var c = document.createElement('canvas');
        c.width = w * scale; c.height = h * scale;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ data: c.toDataURL('image/png'), w: w, h: h });
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function exportPdf() {
    if (!window.jspdf) { alert('The PDF tool is still loading. Please try again in a moment.'); return; }
    var r = lastResult, quads = onePager(r);
    Promise.all([rasterize('assets/usg-water-logo-white.png', 30), rasterize('assets/salesforce-logo.svg', 24)]).then(function (logos) {
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
      var W = 612, H = 792, M = 36, cw = [86, 232, 222];
      var NAVY = [10, 27, 63], SKY = [1, 118, 211], ROSE = [181, 112, 123], INK = [30, 41, 59], MUTED = [91, 100, 120];
      var refs = function (src) { return src && src.length ? ' [' + src.join(', ') + ']' : ''; };

      function layout(fs, draw) {
        var lh = fs * 1.28, yy = 128;
        if (draw) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, SKY);
          doc.text('SALESFORCE + SMBHD', M + cw[0], yy - 8);
          doc.setTextColor.apply(doc, ROSE); doc.text('HUBSPOT + REVOPS HQ', M + cw[0] + cw[1], yy - 8);
        }
        quads.forEach(function (q) {
          if (draw) {
            doc.setFillColor(234, 243, 253); doc.rect(M, yy, W - 2 * M, 15, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, NAVY);
            doc.text(q.title.toUpperCase(), M + 6, yy + 10.5);
          }
          yy += 19;
          q.rows.forEach(function (row) {
            doc.setFontSize(fs);
            doc.setFont('helvetica', 'bold');
            var t = doc.splitTextToSize(row.topic + (DRAFT && row.confirm && !P.isConfirmed(row.confirm) ? ' (pending)' : ''), cw[0] - 8);
            doc.setFont('helvetica', 'normal');
            var a = doc.splitTextToSize(row.sf + refs(row.sfSrc), cw[1] - 12);
            var b = doc.splitTextToSize(row.hs + refs(row.hsSrc), cw[2] - 4);
            var rows = Math.max(t.length, a.length, b.length);
            if (draw) {
              doc.setFont('helvetica', 'bold'); doc.setTextColor.apply(doc, INK); doc.text(t, M + 4, yy + fs);
              doc.setFont('helvetica', 'normal'); doc.setTextColor.apply(doc, INK); doc.text(a, M + cw[0], yy + fs);
              doc.setTextColor(91, 74, 78); doc.text(b, M + cw[0] + cw[1], yy + fs);
              doc.setDrawColor(233, 237, 244); doc.line(M, yy + rows * lh + 4, W - M, yy + rows * lh + 4);
            }
            yy += rows * lh + 8;
          });
          yy += 4;
        });
        return yy;
      }

      var fs = 8.2;
      while (layout(fs, false) > H - 150 && fs > 6.2) fs -= 0.2;

      doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 78, 'F');
      doc.setFillColor(36, 145, 235); doc.rect(0, 78, W, 3, 'F');
      var lx = M;
      if (logos[0]) { doc.addImage(logos[0].data, 'PNG', lx, 24, logos[0].w, logos[0].h); lx += logos[0].w + 14; }
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5); doc.line(lx, 26, lx, 52); lx += 14;
      if (logos[1]) doc.addImage(logos[1].data, 'PNG', lx, 27, logos[1].w, logos[1].h);
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
      doc.text('Salesforce and HubSpot, on level footing', W - M, 40, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 214, 235);
      doc.text('USG Water Solutions  ·  Functionality, Integration, CapEx and OpEx', W - M, 56, { align: 'right' });
      doc.setTextColor.apply(doc, MUTED); doc.setFontSize(8);
      var preset = Object.keys(P.presets).filter(function (k) { return JSON.stringify(sanitize(P.presets[k], P)) === JSON.stringify(r.inputs); })[0];
      doc.text('Scenario: ' + (preset ? P.presets[preset].label : 'Custom') + ', ' + r.option.short + ' (' + r.option.label + '), ' + r.inputs.horizon + '-year view. HubSpot at published list price.', M, 102);

      var yEnd = layout(fs, true);

      var by = Math.max(yEnd + 4, H - 140);
      doc.setFillColor.apply(doc, NAVY); doc.roundedRect(M, by, W - 2 * M, 50, 8, 8, 'F');
      doc.setTextColor(197, 224, 67); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      doc.text('OVER THE 36-MONTH TERM', M + 14, by + 18);
      doc.setTextColor(255, 255, 255); doc.setFontSize(15);
      doc.text('Salesforce saves ' + money(r.threeYear.savings), M + 14, by + 37);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 214, 235);
      doc.text('Salesforce + SMBHD', 330, by + 20); doc.text('HubSpot + RevOps HQ, at list', 452, by + 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(255, 255, 255);
      doc.text(money(r.threeYear.sf), 330, by + 37); doc.text(money(r.threeYear.hs), 452, by + 37);

      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor.apply(doc, MUTED);
      var foot = P.sources.map(function (s) { return '[' + s.n + '] ' + s.text; }).join('  ');
      doc.text(doc.splitTextToSize(foot, W - 2 * M), M, by + 64);
      doc.text('Prepared for USG Water Solutions · Confidential · Figures as of November 7, 2026.', M, H - 22);

      if (DRAFT) {
        doc.setTextColor(226, 232, 240); doc.setFont('helvetica', 'bold'); doc.setFontSize(84);
        doc.text('DRAFT', W / 2, H / 2 + 40, { align: 'center', angle: 32 });
      }
      doc.save('USG-Water_Salesforce-vs-HubSpot_One-Pager.pdf');
    });
  }

  /* ── Sources, draft state, video, reveal ── */
  function renderSources() {
    $('sources').innerHTML = P.sources.map(function (s) { return '<li id="s' + s.n + '">' + esc(s.text) + '</li>'; }).join('');
  }

  function markPending() {
    if (!DRAFT) return;
    $('draft-pill').hidden = false;
    document.querySelectorAll('[data-confirm]').forEach(function (n) {
      var ids = n.getAttribute('data-confirm').split(',');
      n.insertAdjacentHTML('beforeend', pendingTag(ids));
    });
  }

  function initReveal() {
    var items = document.querySelectorAll('.reveal:not(.in)');
    if (REDUCED || !('IntersectionObserver' in window)) { items.forEach(function (n) { n.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: .12 });
    items.forEach(function (n) { io.observe(n); });
  }

  $('vid').addEventListener('ended', function () { $('cue').classList.add('lit'); });
  $('pdf-btn').addEventListener('click', exportPdf);

  renderSources();
  renderAssumptions();
  renderControls();
  initChart();
  update();
  markPending();
  initReveal();
  watchOnePager();
})();
