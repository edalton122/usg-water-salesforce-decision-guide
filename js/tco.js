/*
 * computeTCO: the only place cost math happens. The calculator, the one-pager
 * and the PDF export all call this function.
 *
 * Guardrails enforced here:
 *  - Every input is clamped to its lever range and snapped to its step; anything
 *    that is not a valid value falls back to the default preset.
 *  - Prices are never inputs. They come only from data/pricing.js.
 *  - Salesforce is always modeled at its contractual worst case: flat for the
 *    36-month term, then the full 5% cap at the first renewal.
 */
(function (root) {
  function snap(value, lever, fallback) {
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n)) n = fallback;
    n = Math.min(lever.max, Math.max(lever.min, n));
    return Math.round((n - lever.min) / lever.step) * lever.step + lever.min;
  }

  function pick(value, allowed, fallback) {
    for (var i = 0; i < allowed.length; i++) if (allowed[i] === value || String(allowed[i]) === String(value)) return allowed[i];
    return fallback;
  }

  function sanitize(raw, P) {
    var d = P.presets[P.defaults.preset];
    raw = raw && typeof raw === 'object' ? raw : {};
    var option = pick(raw.option, P.levers.option, d.option);
    var allowedOos = P.hubspot.outOfScope
      .filter(function (o) { return o.appliesTo.indexOf(option) !== -1; })
      .map(function (o) { return o.id; });
    var oos = Array.isArray(raw.outOfScope) ? raw.outOfScope : d.outOfScope;
    return {
      option: option,
      horizon: pick(raw.horizon, P.levers.horizon, d.horizon),
      servicesEstimate: pick(raw.servicesEstimate, P.levers.servicesEstimate, d.servicesEstimate),
      overrunPct: snap(raw.overrunPct, P.levers.overrunPct, d.overrunPct),
      listChangePct: snap(raw.listChangePct, P.levers.listChangePct, d.listChangePct),
      outOfScope: allowedOos.filter(function (id) { return oos.indexOf(id) !== -1; })
    };
  }

  function sum(list, key) {
    return list.reduce(function (t, x) { return t + x[key]; }, 0);
  }

  function computeTCO(rawInputs, P) {
    P = P || root.USG_PRICING;
    var inp = sanitize(rawInputs, P);
    var sfOpt = P.salesforce.options[inp.option];
    var hs = P.hubspot;

    var sfAnnual = sfOpt.annual + (sfOpt.keepsHubSpotMarketing ? P.salesforce.hubspotMarketingProAnnual : 0);
    var sfRenewalAnnual = sfAnnual * (1 + P.salesforce.firstRenewalCapPct / 100);
    var sfCapex = sfOpt.implementation;

    var hsLicenses = sum(hs.licenseLines, 'annual');
    var hsAnnual = hsLicenses + hs.middlewareAnnual;
    var hsRenewalAnnual = hsLicenses * (1 + inp.listChangePct / 100) + hs.middlewareAnnual;
    var hsServicesBase = hs.services[inp.servicesEstimate];
    var hsServices = hsServicesBase * (1 + inp.overrunPct / 100);
    var hsOnboarding = sum(hs.onboarding, 'amount');
    var oosItems = hs.outOfScope.filter(function (o) { return inp.outOfScope.indexOf(o.id) !== -1; })
      .map(function (o) { return { id: o.id, label: o.label, hours: o.hours, amount: o.hours * hs.services.rate }; });
    var hsOos = sum(oosItems, 'amount');
    var hsCapex = hsServices + hsOnboarding + hsOos;

    var years = [];
    var sfCum = 0, hsCum = 0;
    for (var y = 1; y <= inp.horizon; y++) {
      var sfOpex = y <= P.salesforce.termYears ? sfAnnual : sfRenewalAnnual;
      var hsOpex = y <= hs.initialTermYears ? hsAnnual : hsRenewalAnnual;
      var sfYear = sfOpex + (y === 1 ? sfCapex : 0);
      var hsYear = hsOpex + (y === 1 ? hsCapex : 0);
      sfCum += sfYear;
      hsCum += hsYear;
      years.push({
        year: y,
        renewal: y > P.salesforce.termYears,
        sf: { opex: sfOpex, total: sfYear, cumulative: sfCum },
        hs: { opex: hsOpex, total: hsYear, cumulative: hsCum }
      });
    }

    var termYears = Math.min(3, inp.horizon);
    var threeYear = {
      sf: sfCapex + sfAnnual * termYears,
      hs: hsCapex + hsAnnual * termYears
    };

    return {
      inputs: inp,
      option: { id: inp.option, short: sfOpt.short, label: sfOpt.label },
      years: years,
      totals: { sf: sfCum, hs: hsCum, savings: hsCum - sfCum },
      threeYear: { sf: threeYear.sf, hs: threeYear.hs, savings: threeYear.hs - threeYear.sf },
      opex: {
        sf: sfAnnual, hs: hsAnnual,
        sfRenewal: sfRenewalAnnual, hsRenewal: hsRenewalAnnual
      },
      capex: {
        sf: { fixedFee: sfCapex },
        hs: { services: hsServices, servicesBase: hsServicesBase, onboarding: hsOnboarding, outOfScope: oosItems, total: hsCapex }
      },
      breakdown: {
        sf: {
          included: [
            { label: 'Salesforce licenses, ' + sfOpt.short + ' (per year)', amount: sfOpt.annual },
            { label: 'SMBHD implementation, fixed fee (one time)', amount: sfCapex }
          ],
          separately: sfOpt.keepsHubSpotMarketing
            ? [{ label: 'HubSpot Marketing Hub Professional, kept for marketing (per year, list)', amount: P.salesforce.hubspotMarketingProAnnual }]
            : []
        },
        hs: {
          included: [{ label: 'RevOps HQ services, ' + inp.servicesEstimate + ' estimate' + (inp.overrunPct ? ' + ' + inp.overrunPct + '% overrun' : ''), amount: hsServices }],
          separately: hs.licenseLines.map(function (l) { return { label: l.label + ' (per year, list)', amount: l.annual }; })
            .concat([{ label: 'RevOps Connect middleware (per year)', amount: hs.middlewareAnnual }])
            .concat(hs.onboarding.map(function (o) { return { label: o.label + ' (one time)', amount: o.amount }; }))
            .concat(oosItems.map(function (o) { return { label: o.label + ' (estimate, ' + o.hours + ' hrs)', amount: o.amount }; }))
        }
      },
      goLive: { sf: P.salesforce.goLiveWeek, hs: hs.goLiveWeek, hsTimeline: hs.timelineWeeks }
    };
  }

  var api = { computeTCO: computeTCO, sanitize: sanitize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.USG_TCO = api;
})(typeof window !== 'undefined' ? window : this);
