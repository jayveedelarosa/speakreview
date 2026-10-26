# Feature set 3, stage 4: Playback in Your words

Approved design: **G, the console radio with word keys** (Round 14 on the design canvas), on laptop and phone.

Boards (reference only, never deployed):
- `F15WordsKeysLaptop.dc.html`, `F15WordsKeysPhone.dc.html`: the approved look. They show `F13WordsLaptop` / `F13WordsPhone` with `skin="console"` and `keys="words"`.
- `F13WordsLaptop.dc.html`, `F13WordsPhone.dc.html`: the shared board code. Only the parts behind `skinConsole` and `keysWords` matter. Ignore the other player styles in them (tabletop, plain player, footlights, round 12 layouts).
- `F13WordsLaptopGone.dc.html`, `F13WordsPhoneGone.dc.html`: a past show with no recording (the note instead of the player).

Copy looks, words and sizes from the boards into `styles.css` classes (the CSP allows no style attributes and no inline scripts; set changing values like the needle position with `element.style.setProperty`).

## 1. When the player shows

- Only for the speech just sent in this visit, while its recording is still in memory. The page keeps the exact WAV it sent (the recording or the converted upload) in memory only, tied to that speech's ID. It is never saved to storage and never sent anywhere again.
- Only the latest sent speech keeps its recording. Sending a new one replaces it.
- Opening that speech's notes again in the same visit (from the Wall of Fame, or Back to the stage then Backstage) still shows the player.
- After a reload, for any other Wall of Fame performance, and for a result shown through the Coming back note, there is no recording. Show the note instead of the player (section 6).
- If a performance has no word list, keep today's "The word-by-word view isn't available" message and show no player.

## 2. The console radio (top of the Your words tab, above the legend)

**Cabinet** (one wooden box, radius 12px):
- Walnut: `repeating-linear-gradient(100deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 9px), linear-gradient(180deg, #8E5428, #5E3215 60%, #4A2610)`, shadow `inset 0 1px 0 rgba(255,220,170,0.25), inset 0 -3px 6px rgba(0,0,0,0.4), 0 10px 22px rgba(0,0,0,0.5)`.
- Padding 10px 14px 12px (phone 8px 8px 10px), rows 8px apart (phone 6px).

**Row 1, the speaker cloth** (30px tall, phone 22px):
- 2px border `#C9A25A`, radius 4px, inner shadow, woven cloth: `repeating-linear-gradient(90deg, rgba(60,30,10,0.35) 0 1px, transparent 1px 4px), repeating-linear-gradient(0deg, rgba(60,30,10,0.2) 0 1px, transparent 1px 3px), #D8BF8A`.
- "SpeakReview" on the right in Fraunces italic 600, 16px (phone 13px), `#5A2A10`, turned -4deg. Decorative (`aria-hidden`).
- While playing, the cloth glows warm: add `radial-gradient(ellipse 70% 80% at 50% 50%, rgba(255,196,107,0.75), rgba(255,170,70,0.25) 60%, transparent 85%)` on top. No glow when paused. With reduced motion the glow simply switches on and off (no fade).

**Row 2: speed knob · tuning dial · play knob** (gap 12px, phone 8px)
- Knobs: 44px round buttons, aged brass `radial-gradient(circle at 38% 30%, #FFE9AE, #D9AE52 45%, #8C6224)`, 2px border `#3A2010`, shadow `0 3px 6px rgba(0,0,0,0.55), inset 0 -2px 3px rgba(0,0,0,0.2)`. Label under each: 9px, 800, uppercase, letter spacing 0.16em, `#F0CF86`.
- **Speed knob (left):** a 3px x 17px red pointer (`#7A1222`) that turns with the speed: -120deg at 0.5x, then 40deg per step. Each tap moves to the next speed: 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, then back to 0.5. Label "Speed 1×". Starts at 1× each visit (no need to remember it). Screen reader name: "Playback speed, 1×".
- **Play knob (right):** play or pause symbol in `#2A1406`. Label "Play" or "Pause".
- **Tuning dial (middle, fills the space):** 54px tall (phone 48px), radius 6px, 2px border `#C9A25A`, dark glass `linear-gradient(180deg, #24180C, #120A05)` with inner shadow.
  - The real waveform of the recording inside it. Played part amber `#FFC46B` with a soft glow; the rest `rgba(255,196,107,0.22)`.
  - Small gold scale ticks along the bottom (every 10px, `rgba(240,207,134,0.7)`).
  - A red needle (2px, `#FF5A3C`, glow) at the playing position.
  - Time in the top right corner: "0:06 / 0:42", mono 11px (phone 10px), `#FFC46B`, on a small dark tag so the bars never cover it.
  - Tap or drag anywhere on the dial to jump there. For keyboards it is a slider: arrow keys move 5 seconds, Home and End go to the start and end, and it reads the time.

**Row 3: the piano keys** (centered, 6px apart)
- Three keys, each exactly 60px x 36px, the same on laptop and phone: "−5s", "Play" (reads "Pause" while playing), "+5s".
- Dark wood `linear-gradient(180deg, #3A2418, #1A0F0A)`, 1px border `#B8893A`, radius 0 0 5px 5px, shadow `0 3px 0 #6E4A1E`. Text 800 11px, letter spacing 0.06em, `#F0CF86`.
- While playing, the Play key stays pressed: moved down 2px, shadow `0 1px 0 #6E4A1E`, background `linear-gradient(180deg, #24150E, #120905)`, text `#FFE7B0`.
- Screen reader names: "Back 5 seconds", "Play your speech" or "Pause", "Forward 5 seconds".

The Play knob and the Play key do the same thing and always show the same state.

## 3. The transcript while the player is there

- The word being heard gets a gold box: `box-shadow: 0 0 0 2px #D9AE52; background: rgba(217,174,82,0.3); color: #FFF6E3; border-radius: 3px`. Filler, used-as-filler and unclear marks keep their own look under it.
- The sentence being heard stays at full brightness. Plain words in the other sentences dim to `#B8A48C` (still above 4.5:1 on the panel). Marked words (fillers, unclear) keep their colors. A sentence ends at `.`, `!` or `?`.
- Before playing for the first time, the box sits on the first word and the first sentence is the bright one.
- Click or tap any word (or a long-pause chip) to jump there and keep playing (or stay paused if it was paused). The words are not separate Tab stops; keyboard users use the dial and keys.
- While playing, the transcript scrolls by itself only when the boxed word would leave the visible area, and puts it back in view without jumping around.
- If the visitor scrolls the transcript by hand while it plays, automatic scrolling pauses (so they can reread something). It starts again when they click or tap a word, press Play, or the boxed word comes back into view on its own.
- A short hint at the end of the legend row: "Tap any word to hear it" (laptop: "Click any word to hear it").
- The radio stays fixed at the top of the tab. Only the transcript under it scrolls, so the controls never scroll away on long speeches.

## 4. Behaviour

- Playback pauses when leaving Backstage, switching to Coach's notes or Review, opening the programme, or starting a new recording.
- When it reaches the end it stops, the needle stays at the end, and pressing Play again starts from the beginning.
- Word times come from the saved word list (start in hundredths of a second), which matches the WAV that was sent.
- The speed keeps the voice pitch normal.

## 5. Hide replay

- A quiet link, "Hide replay", at the right end of the legend row (laptop: after the "Click any word to hear it" hint; phone: on the hint line, on the right). Gold `#D9AE52`, 700 12px, underlined, at least 44px tap area on phone. Use the same quiet-button style family as the stopwatch's "Hide stopwatch".
- "Hide replay" removes the whole radio, pauses playback, and turns off the highlight, the dimming and clicking on words (the transcript looks like a past show's, but without the note). The hint disappears and the link reads "Show replay".
- "Show replay" brings the radio back where it was (same position and speed).
- The choice is remembered on the device, like the stopwatch (its own localStorage key, wrapped in try/catch, defaulting to shown).
- It only appears when there is a recording. Past shows never show it.
- The visible feature name is "replay" everywhere this needs a name (for example the screen reader name of the radio region: "Replay").

## 6. Past shows (no recording)

In place of the radio, a dashed box (1px dashed `rgba(246,234,211,0.3)`, radius 12px, 13px text `#D8C6AE`, phone 12px) with a muted-speaker icon and the text:

"Playback is only for the speech you just gave. Recordings are never saved, so past shows can be read but not played."

No highlight, no dimming, and the words are not clickable.

## 7. Sizes

- Laptop: the radio sits at the top of the Your words panel. The transcript below it keeps scrolling as today.
- Phone: the same radio at full width. It takes about 130px, so the transcript gets a few lines less. That is accepted.
- Check 1366x657 at 125% (1093x526) still fits the Backstage buttons, like earlier stages.
