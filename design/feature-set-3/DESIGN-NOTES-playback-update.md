# Feature set 3, stage 4 update: a shorter replay radio

Approved Oct 26 after testing the first version on laptop and Android. This updates `DESIGN-NOTES-playback.md`. Where they disagree, **this file wins**.

Boards (reference only, never deployed):
- `F17RoomyLaptop.dc.html`, `F17RoomyPhone.dc.html`: the approved look. They show `F13WordsLaptop` / `F13WordsPhone` with `skin="compactH2"`. In those shared files, only the parts behind `skinH2`, `infoOn` and `infoOpen` matter.
- On the boards the info card starts open so it can be seen. On the site it starts **closed**.

## Why

On a 1366x657 laptop window the transcript showed only one or two lines, and on phones changing the speed made "SPEED 0.75×" wider than "SPEED 1×", which pushed the dial and the knob around.

## 1. The radio (replaces section 2 of the first notes)

Same walnut cabinet, glow, dial look and colours as before. What changes:

**Cabinet:** padding 8px 12px (phone 7px 8px), radius 12px, rows 6px apart.

**Row 1, the speaker cloth with the skip keys** (38px tall):
- Same cloth, border and warm glow while playing.
- Inside it, a row with space between: the **−5s** key on the left, "SpeakReview" (Fraunces italic 600, 16px, phone 14px, `#5A2A10`, turned -3deg, `aria-hidden`) in the middle, the **+5s** key on the right.
- Keys: 52px x 30px, radius 5px, dark wood `linear-gradient(180deg, #3A2418, #1A0F0A)`, 1px border `#B8893A`, shadow `0 2px 0 #6E4A1E`, text 800 11px `#F0CF86`. At least a 44px tap area on phones (an invisible `::before`, like the show label). Screen reader names "Back 5 seconds" and "Forward 5 seconds".

**Row 2, speed knob · dial · play knob** (gap 12px, phone 8px):
- Each knob sits in a column exactly **56px wide**: the 44px brass knob, then 3px, then its label.
- Labels: 800 10px JetBrains Mono, letter spacing 0.08em, uppercase, `#F0CF86`, centered in the 56px. Speed knob: just the speed ("1×", "0.75×", "1.75×", no "Speed"). Play knob: "Play" or "Pause". Because the columns never change width, nothing moves when the speed or the play state changes.
- The speed knob keeps its red pointer that turns (-120deg at 0.5x, 40deg per step) and has nothing written on its face. The play knob shows the play or pause symbol.
- The dial: 48px tall, padding 4px 6px 10px, waveform bars at most 24px, time tag 10px. Everything else as before (amber played part, red needle, ticks, slider keys).

**Removed:**
- The row of piano keys under the dial. The play knob is the only Play button now.
- The "Click/Tap any word to hear it" hint row.
- "Hide replay" / "Show replay" and its remembered setting. Remove the code and the stored key (the radio always shows when there is a recording; it is short enough now).
- The earlier "compact radio on short screens" rule that dropped the speaker cloth. The cloth now holds the skip keys, so it always stays. If Backstage still doesn't fit on a short screen, the Your words panel scrolls as agreed before, and nothing covers the Backstage buttons.

Height: about 120px instead of about 150px on laptop.

## 2. The info button (replaces the grey note under the transcript, Backstage only)

- The grey note under the Backstage transcript ("Dotted words are only marked...") is removed.
- At the end of the legend row: a small round **i** button, 22px, 1px border `rgba(217,174,82,0.7)`, transparent, Fraunces italic 700 12px `#D9AE52`. 44px tap area on phones. Screen reader name "What the marks mean", with `aria-expanded`.
- It opens a small card under the legend (right-aligned and 340px wide on laptop, full width on phone): background `#2A1712`, 1px border `rgba(217,174,82,0.55)`, radius 8px, shadow `0 10px 24px rgba(0,0,0,0.6)`, padding 10px 12px, 12px text, line height 1.45, `#E8D8C0`. It sits on top of the transcript; it does not push it down.
- Card text:
  - **"Click any word to jump there in the replay."** (laptop) / **"Tap any word to jump there in the replay."** (phone), bold, `#FFF6E3`. Only shown when there is a replay.
  - Then a bulleted list:
    - Dotted words are marked only when used as filler.
    - Pauses of 3 seconds or more are shown, but they're not mistakes. A pause is better than saying "um".
    - Unclear words are ones the transcription wasn't sure about.
- It closes on the **i** button again, Escape, or a click or tap anywhere outside it. It starts closed every time Backstage opens.
- The Wall of Fame playbill (light paper) keeps its note exactly as it is today.
