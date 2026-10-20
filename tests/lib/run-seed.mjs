// Seeded Wall of Fame entries for "Your run so far" tests. Entry i is saved i days after the start (oldest first).
export function seedEntries(n, opts = {}) {
  const start = Date.UTC(2026, 7, 17, 12);
  const topics = ["Is failure a better teacher than success?", "Describe a time when patience paid off.", "What makes a good apology?", "If you could invent anything, what would it be?"];
  const list = [];
  for (let i = 0; i < n; i++) {
    const day = opts.spacing ? Math.round(i * opts.spacing) : i;
    const speaking = 180 + (i % 5) * 12;
    const um = Math.max(0, 6 - Math.floor(i / 2)), uh = i % 3;
    list.push({
      id: `run${i + 1}`, savedAt: new Date(start + day * 86400000).toISOString(),
      topic: topics[i % topics.length], topic_type: "persuade",
      time_limit_seconds: opts.untimed ? null : 180, speaking_seconds: speaking, source: "recording", cut_off: false, too_short: null,
      wpm: 168 - i * 2, filler_word_total: um + uh + 2, filler_word_breakdown: { um, uh, like: 2 }, avg_confidence: 0.85,
      ai_feedback: "Strengths:\n1. Clear.", words: null, filler_flags: null, fillers_judged: null, review: null
    });
  }
  return list.reverse();   // the wall is saved newest first
}
