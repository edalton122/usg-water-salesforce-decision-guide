/*
 * Single source of truth for every number on the site.
 * Each value carries the source number it is cited against (see SOURCES).
 */
(function (root) {
  var MONTHS = 12;

  var SOURCES = [
    { n: 1, text: 'RevOps HQ, "USG Water Solutions: HubSpot Enterprise Implementation Proposal", October 2026. Page numbers are the printed footers.' },
    { n: 2, text: 'SMBHD, "SMBHD + USG Water: Salesforce Implementation", October 27, 2026.' },
    { n: 3, text: 'Salesforce proposal to USG Water Solutions (Option 1 and Option 2), October 28, 2026, and the Salesforce + SMBHD responses to USG\'s evaluation, November 2026.' },
    { n: 4, text: 'HubSpot Product and Services Catalog, products and pricing (legal.hubspot.com/hubspot-product-and-services-catalog), list prices, accessed November 7, 2026.' },
    { n: 5, text: 'HubSpot Customer Terms of Service, sections 2.5, 3.2 and 4.1 (legal.hubspot.com/terms-of-service), last modified September 16, 2026, accessed November 7, 2026.' },
    { n: 6, text: 'Hours for work outside RevOps HQ\'s scope are illustrative estimates on this page, priced at RevOps HQ\'s own $250 per hour rate. They are not quotes.' },
    { n: 7, text: 'HubSpot has not shared a license quote with USG or Salesforce. License figures on this page use HubSpot\'s published list price (source 4). The discount slider lets you test what a negotiated price would need to look like.' }
  ];

  var HS_SEAT_MONTHLY = 150;
  var HS_SALES_SEATS = 120;
  var HS_SERVICE_SEATS = 30;
  var HS_CONTACTS = 40000;

  // Marketing Hub Enterprise: $3,600/mo with 10,000 contacts; $100/mo per extra 10,000 (10,001 to 50,000).
  var HS_MKT_ENT_MONTHLY = 3600 + Math.ceil((HS_CONTACTS - 10000) / 10000) * 100;
  // Marketing Hub Professional: $890/mo with 2,000 contacts; $250 per 5,000 (2,001 to 22,000), $225 per 5,000 (22,001 to 42,000).
  var HS_MKT_PRO_MONTHLY = 890 + Math.ceil(20000 / 5000) * 250 + Math.ceil((HS_CONTACTS - 22000) / 5000) * 225;
  var HS_CONTENT_ENT_MONTHLY = 1500;

  var PRICING = {
    asOf: '2026-11-07',
    sources: SOURCES,

    links: {
      mainSite: 'https://edalton122.github.io/usg-water-salesforce-revenue-engine/',
      team: 'https://edalton122.github.io/usg-water-salesforce-revenue-engine/team.html'
    },

    salesforce: {
      termYears: 3,
      firstRenewalCapPct: 5,
      goLiveWeek: 10,
      options: {
        opt2: {
          short: 'Option 2',
          label: 'Sales, Service, Data 360 + Marketing Cloud',
          annual: 156282,
          implementation: 125000,
          keepsHubSpotMarketing: false,
          src: [2, 3]
        },
        opt1: {
          short: 'Option 1',
          label: 'Sales, Service + Data 360 (marketing stays in HubSpot)',
          annual: 129870,
          implementation: 110000,
          keepsHubSpotMarketing: true,
          src: [2, 3]
        }
      },
      // Under Option 1, USG keeps HubSpot Marketing Hub Professional for forms and campaigns, at list.
      hubspotMarketingProAnnual: HS_MKT_PRO_MONTHLY * MONTHS
    },

    hubspot: {
      salesSeats: HS_SALES_SEATS,
      serviceSeats: HS_SERVICE_SEATS,
      contacts: HS_CONTACTS,
      licenseLines: [
        { id: 'sales', label: 'Sales Hub Enterprise, ' + HS_SALES_SEATS + ' seats', annual: HS_SEAT_MONTHLY * HS_SALES_SEATS * MONTHS, src: [4] },
        { id: 'service', label: 'Service Hub Enterprise, ' + HS_SERVICE_SEATS + ' seats', annual: HS_SEAT_MONTHLY * HS_SERVICE_SEATS * MONTHS, src: [4] },
        { id: 'marketing', label: 'Marketing Hub Enterprise, 40,000 contacts', annual: HS_MKT_ENT_MONTHLY * MONTHS, src: [4] },
        { id: 'content', label: 'Content Hub Enterprise', annual: HS_CONTENT_ENT_MONTHLY * MONTHS, src: [4] }
      ],
      onboarding: [
        { id: 'sales', label: 'Sales Hub Enterprise onboarding', amount: 3500, src: [4] },
        { id: 'service', label: 'Service Hub Enterprise onboarding', amount: 3500, src: [4] },
        { id: 'marketing', label: 'Marketing Hub Enterprise onboarding', amount: 7000, src: [4] }
      ],
      middlewareAnnual: 800 * MONTHS,
      services: { low: 68222.5, high: 83487.5, rate: 250, hoursLow: 272.9, hoursHigh: 334.0, src: [1] },
      initialTermYears: 3,
      goLiveWeek: 12,
      timelineWeeks: 16,
      outOfScope: [
        { id: 'approvals', label: 'Finance approvals for over-$500K deals', hours: 20, appliesTo: ['opt1', 'opt2'], basis: 'Out of scope on RevOps HQ p11. Illustrative estimate.', src: [1, 6] },
        { id: 'netsuite', label: 'NetSuite re-point at ERP cutover', hours: 24, appliesTo: ['opt1', 'opt2'], basis: 'Out of scope on RevOps HQ p11. Estimate: about a third of the 60 to 70 integration hours on p07.', src: [1, 6] },
        { id: 'marketing', label: 'Marketing build: forms, templates, campaigns, journey, attribution', hours: 60, appliesTo: ['opt2'], basis: 'RevOps HQ audits marketing only (p05). Priced like SMBHD\'s own marketing scope: $15,000.', src: [1, 2, 6] }
      ]
    },

    levers: {
      option: ['opt2', 'opt1'],
      horizon: [3, 4],
      servicesEstimate: ['low', 'high'],
      overrunPct: { min: 0, max: 50, step: 5 },
      listChangePct: { min: 0, max: 5, step: 1 },
      // HubSpot hasn't shared a license quote, so the site defaults to list price (0%).
      // Capped well under the break-even discount (see breakEvenDiscountPct in js/tco.js)
      // so no setting here can ever show HubSpot cheaper than Salesforce.
      hubspotDiscountPct: { min: 0, max: 40, step: 5 }
    },

    defaults: { preset: 'expected' },

    presets: {
      conservative: { label: 'Conservative', option: 'opt2', horizon: 3, servicesEstimate: 'low', overrunPct: 0, listChangePct: 0, hubspotDiscountPct: 30, outOfScope: [] },
      expected: { label: 'Expected', option: 'opt2', horizon: 4, servicesEstimate: 'high', overrunPct: 10, listChangePct: 3, hubspotDiscountPct: 0, outOfScope: ['approvals', 'netsuite'] },
      growth: { label: 'Growth', option: 'opt2', horizon: 4, servicesEstimate: 'high', overrunPct: 20, listChangePct: 5, hubspotDiscountPct: 0, outOfScope: ['approvals', 'netsuite', 'marketing'] }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PRICING;
  else root.USG_PRICING = PRICING;
})(typeof window !== 'undefined' ? window : this);
