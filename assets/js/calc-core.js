/* Student loan plan calculations — pure functions, no DOM.
 * Sources: OBBBA §80503 (RAP), HEA IBR rules, HHS 2026 Poverty Guidelines.
 * Shared by the browser (window.LoanCalc) and Node tests (module.exports). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.LoanCalc = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var RAP_TIERS = [
    [0, 120, 0],
    [10000, 120, 0.01],
    [20000, 320, 0.02],
    [30000, 620, 0.03],
    [40000, 1020, 0.04],
    [50000, 1520, 0.05],
    [60000, 2120, 0.06],
    [70000, 2820, 0.07],
    [80000, 3620, 0.08],
    [90000, 4520, 0.09],
    [100000, 5420, 0.10]
  ];

  var RAP_PRINCIPAL = [
    [10000, 50], [20000, 40], [30000, 30], [40000, 20], [50000, 10], [Infinity, 0]
  ];

  var POVERTY_2026 = {
    '48': { base: 16480, inc: 5840 },
    'AK': { base: 20580, inc: 7300 },
    'HI': { base: 18950, inc: 6710 }
  };

  function rapAnnualPayment(agi) {
    var a = Math.max(0, Number(agi) || 0);
    var tier = RAP_TIERS[0];
    for (var i = 0; i < RAP_TIERS.length; i++) {
      if (a >= RAP_TIERS[i][0]) { tier = RAP_TIERS[i]; }
    }
    return tier[1] + tier[2] * Math.max(0, a - tier[0]);
  }

  function rapMonthlyPayment(agi, dependents) {
    var dep = Math.max(0, Math.min(10, Number(dependents) || 0));
    var monthly = rapAnnualPayment(agi) / 12 - 50 * dep;
    return Math.max(10, monthly);
  }

  function rapPrincipalReduction(agi) {
    var a = Math.max(0, Number(agi) || 0);
    for (var i = 0; i < RAP_PRINCIPAL.length; i++) {
      if (a <= RAP_PRINCIPAL[i][0]) { return RAP_PRINCIPAL[i][1]; }
    }
    return 0;
  }

  function povertyLine150(familySize, stateGroup) {
    var g = POVERTY_2026[stateGroup] || POVERTY_2026['48'];
    var n = Math.max(1, Math.min(10, Number(familySize) || 1));
    return 1.5 * (g.base + (n - 1) * g.inc);
  }

  function standardPayment(balance, annualRate, months) {
    var m = months || 120;
    var r = (Number(annualRate) || 0) / 100 / 12;
    var pv = Math.max(0, Number(balance) || 0);
    if (pv === 0) { return 0; }
    if (r === 0) { return pv / m; }
    return r * pv / (1 - Math.pow(1 + r, -m));
  }

  function ibrPayment(inputs) {
    var agi = Math.max(0, Number(inputs.agi) || 0);
    var disc = agi - povertyLine150(inputs.familySize, inputs.stateGroup);
    var pct = inputs.oldBorrower ? 0.15 : 0.10;
    var std = standardPayment(inputs.balance, inputs.rate, 120);
    if (disc <= 0) {
      return { monthly: 0, discretionary: disc, eligible: true, capped: false };
    }
    var monthly = disc * pct / 12;
    var eligible = monthly < std;
    return { monthly: Math.min(monthly, std), discretionary: disc, eligible: eligible, capped: monthly >= std };
  }

  function simulate(inputs) {
    var plan = inputs.plan;
    var balance = Math.max(0, Number(inputs.balance) || 0);
    var r = (Number(inputs.rate) || 0) / 100 / 12;
    var maxMonths = plan === 'RAP' ? 360 : (inputs.oldBorrower ? 300 : 240);
    var monthly = inputs.monthly;
    var principalSub = plan === 'RAP' ? rapPrincipalReduction(inputs.agi) : 0;
    var paid = 0, negative = false, m = 0;
    while (m < maxMonths && balance > 0) {
      m++;
      var interest = balance * r;
      var newBalance;
      if (plan === 'RAP') {
        newBalance = balance - principalSub;
        if (monthly > interest) { newBalance -= (monthly - interest); paid += monthly; }
        else if (monthly > 0) { paid += monthly; }
        if (newBalance < 0) { newBalance = 0; }
      } else {
        newBalance = balance + interest - monthly;
        if (monthly > interest) { paid += monthly; }
        else { paid += monthly; if (monthly > 0 && interest > monthly) { negative = true; } }
        if (newBalance < 0) { newBalance = 0; }
      }
      balance = newBalance;
    }
    return { months: m, paid: Math.round(paid * 100) / 100, forgiven: Math.round(balance * 100) / 100, negativeAmortization: negative };
  }

  return {
    RAP_TIERS: RAP_TIERS,
    POVERTY_2026: POVERTY_2026,
    rapAnnualPayment: rapAnnualPayment,
    rapMonthlyPayment: rapMonthlyPayment,
    rapPrincipalReduction: rapPrincipalReduction,
    povertyLine150: povertyLine150,
    standardPayment: standardPayment,
    ibrPayment: ibrPayment,
    simulate: simulate
  };
});
