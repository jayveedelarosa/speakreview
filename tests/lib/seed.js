(() => {
  const ago = (days, hour, minute) => {
    const d = new Date();
    if (days === 0) { d.setSeconds(d.getSeconds() - hour); return d.toISOString(); }   // today: "hour" = seconds ago
    d.setDate(d.getDate() - days); d.setHours(hour, minute, 0, 0); return d.toISOString();
  };
  const notes = "Strengths:\n1. **Clear position:** You took a side in your first sentence.\n2. **Steady pace:** Every point was easy to follow.\n\nWeaknesses:\n1. **Fillers at transitions:** Most \"um\" sounds came before a new point.\n\nImprovement tips:\n1. **Pause instead of filling:** Breathe for a second before each point.\n\nTime management:\nYou went a little over. Trim the second example.";
  const xss = "<img src=x onerror=alert('hacked')>";
  const entries = [
    { id: "seed-1", savedAt: ago(0, 30), topic: "Is failure a better teacher than success?", topic_type: "persuade", time_limit_seconds: 180, speaking_seconds: 222, source: "recording", cut_off: false, wpm: 132, filler_word_total: 4, filler_word_breakdown: { um: 3, uh: 1 }, avg_confidence: 0.76, ai_feedback: notes },
    { id: "seed-2", savedAt: ago(0, 60), topic: "Why my grandmother's garden still matters", topic_type: null, time_limit_seconds: 180, speaking_seconds: 168, source: "upload", cut_off: null, wpm: 118, filler_word_total: 2, filler_word_breakdown: { like: 2 }, avg_confidence: 0.81, ai_feedback: notes },
    { id: "seed-xss", savedAt: ago(0, 90), topic: xss, topic_type: "story", time_limit_seconds: 60, speaking_seconds: 75, source: "recording", cut_off: false, wpm: 140, filler_word_total: 1, filler_word_breakdown: { [xss]: 1 }, avg_confidence: 0.7, ai_feedback: "Strengths:\n1. **" + xss + "** bold test\n" + xss + "\n- " + xss },
    { id: "seed-3", savedAt: ago(1, 18, 30), topic: "If you could invent anything, what would it be?", topic_type: "imagine", time_limit_seconds: null, speaking_seconds: 250, source: "recording", cut_off: false, wpm: 126, filler_word_total: 5, filler_word_breakdown: { um: 4, so: 1 }, avg_confidence: 0.72, ai_feedback: notes },
    { id: "seed-4", savedAt: ago(1, 9, 5), topic: null, topic_type: null, time_limit_seconds: 60, speaking_seconds: 60, source: "upload", cut_off: null, wpm: 150, filler_word_total: 0, filler_word_breakdown: {}, avg_confidence: 0.88, ai_feedback: notes },
    { id: "seed-5", savedAt: ago(3, 20, 15), topic: "What does courage mean to you?", topic_type: "reflect", time_limit_seconds: 300, speaking_seconds: 600, source: "recording", cut_off: true, wpm: 121, filler_word_total: 9, filler_word_breakdown: { um: 6, uh: 3 }, avg_confidence: 0.69, ai_feedback: notes },
    { id: "seed-6", savedAt: ago(3, 11, 40), topic: "What makes a good apology?", topic_type: "explain", time_limit_seconds: 150, speaking_seconds: 141, source: null, cut_off: null, wpm: 129, filler_word_total: 3, filler_word_breakdown: { um: 3 }, avg_confidence: 0.8, ai_feedback: notes }
  ];
  localStorage.setItem("speakreview.wall.v1", JSON.stringify(entries));
  if (currentView === "wall") { loadWall(); renderWall(); }
  return "Seeded " + entries.length + " entries. Open the Wall of Fame tab.";
})();
