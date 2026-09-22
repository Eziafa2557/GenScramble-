/* GenScramble — word bank.
   GenLayer-flavoured terms. Only words of 5..12 letters are ever used
   (see GS.wordsInRange) so every target fits the board on a phone. */

window.GS_WORDS = [
  "MUTATION",
  "INVARIANT",
  "LIVENESS",
  "FUZZING",
  "HARNESS",
  "AVIONICS",
  "SHRINKING",
  "SEEDED",
  "GRIEFING",
  "DIVERGENCE",
  "COVERAGE",
  "REGRESSION",
  "FLAKY",
  "ADVERSARIAL",
  "GENVM",
  "EQUIVALENCE",
  "VALIDATOR",
  "BRADBURY",
  "STUDIONET",
  "OPTIMISTIC",
  "ADJUDICATION",
  "GREYBOXING",
  "CONSENSUS",
  "INTELLIGENT",
  "CONTRACT",
  "ORACLE",
  "APPEAL",
  "LEADER",
  "FINALITY",
  "SANDBOX",
  "PROMPT",
  "NONDET",
  "TREEMAP",
  "ESCROW",
  "PORTAL",
  "FAUCET",
  "TESTNET",
  "ASIMOV",
  "ZKSYNC",
  "AGENTIC",
  "DISPUTE",
  "EVIDENCE",
  "EQUIVALENT",
  "REASONING",
  "VALIDATORS",
  "STUDIO",
  "COMPASS",
  "POINTS"
];

window.GS_WORDS_MIN = 5;
window.GS_WORDS_MAX = 12;

/* Every playable word, uppercased and length-filtered. */
window.GS_wordsInRange = function () {
  return window.GS_WORDS
    .map(function (w) { return String(w).toUpperCase(); })
    .filter(function (w) {
      return w.length >= window.GS_WORDS_MIN && w.length <= window.GS_WORDS_MAX;
    });
};
