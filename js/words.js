/* GenScramble — word bank.
   The GenLayer vocabulary, one entry per term, uppercase and unspaced.
   Every word of 3..20 letters is playable (see GS.wordsInRange), which is the
   whole list: LLM is the shortest at 3, EQUIVALENCEPRINCIPLE the longest at 20. */

window.GS_WORDS = [
  "GENLAYER",
  "INTELLIGENTCONTRACT",
  "VALIDATOR",
  "LEADER",
  "CONSENSUS",
  "EQUIVALENCEPRINCIPLE",
  "OPTIMISTICDEMOCRACY",
  "NONDETERMINISTIC",
  "ADJUDICATION",
  "GENVM",
  "BRADBURY",
  "APPEAL",
  "FINALITY",
  "TRIBUNAL",
  "ORACLE",
  "LLM",
  "DELEGATION",
  "STAKING",
  "DETERMINISTIC",
  "PROPOSAL"
];

window.GS_WORDS_MIN = 3;
window.GS_WORDS_MAX = 20;

/* Every playable word: uppercased, stripped to letters only, length-filtered.
   Multi-word terms are stored unspaced ("INTELLIGENTCONTRACT") because a space
   has no tile and no slot; anything else non-alphabetic is dropped here too, so
   a stray punctuation mark can never reach the board. Duplicates collapse to
   one, so a race can never hold the same target twice. */
window.GS_wordsInRange = function () {
  var seen = {};
  return window.GS_WORDS
    .map(function (w) { return String(w).toUpperCase().replace(/[^A-Z]/g, ""); })
    .filter(function (w) {
      if (w.length < window.GS_WORDS_MIN || w.length > window.GS_WORDS_MAX) return false;
      if (seen[w]) return false;
      seen[w] = true;
      return true;
    });
};
