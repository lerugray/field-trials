// sprt.js: paired-game SPRT for engine strength gates.
// Uses a normal approximation to the pentanomial pair score.

function eloToExpectedScore(elo) {
  return 1 / (1 + Math.pow(10, -elo / 400));
}

function makeSprt(options = {}) {
  const {
    elo0 = 0,
    elo1 = 50,
    alpha = 0.10,
    beta = 0.10,
    pairVariance = 0.35
  } = options;

  const mu0 = 2 * eloToExpectedScore(elo0);
  const mu1 = 2 * eloToExpectedScore(elo1);
  const boundaryA = Math.log(beta / (1 - alpha));
  const boundaryB = Math.log((1 - beta) / alpha);

  const scores = [];

  function update(pairScore) {
    scores.push(pairScore);
    const n = scores.length;
    const sum = scores.reduce((a, b) => a + b, 0);
    const llr = ((mu1 - mu0) / pairVariance) * (sum - n * (mu0 + mu1) / 2);
    if (llr >= boundaryB) return { status: 'accept', llr, n, pairScore, scores: scores.slice() };
    if (llr <= boundaryA) return { status: 'reject', llr, n, pairScore, scores: scores.slice() };
    return { status: 'continue', llr, n, pairScore, scores: scores.slice() };
  }

  function current() {
    const n = scores.length;
    const sum = scores.reduce((a, b) => a + b, 0);
    const llr = n > 0 ? ((mu1 - mu0) / pairVariance) * (sum - n * (mu0 + mu1) / 2) : 0;
    return { status: 'continue', llr, n, scores: scores.slice() };
  }

  return { update, current, options: { elo0, elo1, alpha, beta, pairVariance, boundaryA, boundaryB } };
}

function pairScore(gameA, gameB) {
  // gameA: A plays North, B plays South. Score from B's perspective.
  // gameB: B plays North, A plays South. Score from B's perspective.
  const a = gameA.result === 'South' ? 1 : (gameA.result === 'North' ? 0 : 0.5);
  const b = gameB.result === 'North' ? 1 : (gameB.result === 'South' ? 0 : 0.5);
  return a + b;
}

export { makeSprt, pairScore, eloToExpectedScore };
