# SpeakReview Theatre Design Notes

This folder is the approved design for SpeakReview. It is a reference only and is never deployed (only `site/` is deployed).

- `theatre-laptop.dc.html`: the laptop design (Stage, recording state, Intermission, Backstage, Wall of Fame), approved.
- `theatre-phone.dc.html`: the phone design ("Phone v2"), approved. The `screen` prop switches between `stage`, `backstage` and `wall`.

These files were made in a design tool. They use a small templating runtime (`support.js`, `<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`, `class Component extends DCLogic`). Do NOT copy that runtime or its syntax into the site. Read them only for layout, sizes, colors, SVG shapes, text and behavior, and rebuild them in plain HTML, CSS and JavaScript. All sample text in them (feedback, history entries, numbers) is placeholder content.

## Concept

The app is a theatre.
- **Stage** (practice): red velvet curtains frame the sides, a warm gold spotlight shines from the top, a seated audience sits in rows across the back of the stage, and a wooden stage floor runs along the bottom. The topic is the hero, large and centered. A chrome stage mic stands center stage on the floor line, and an ON AIR sign sits in the middle of the top valance.
- **Backstage** (your feedback): a dressing room mirror framed in warm wood and lined with glowing bulbs. The speech summary is on the left, Coach's notes on the right. The summary shows the topic, the time line (with a small "Live recording" or "Uploaded MP3" label beside it when the result says where the speech came from, and "Recording stopped at the 10:00 maximum." under it when a recording was cut off), then Words per minute, Filler words and **Clarity** (with the muted hint "How clearly your words came through" under it; same value and bar as the old "Confidence score").
- **Wall of Fame** (past performances): framed playbills hanging on a red wall, plus a trophy shelf. Built in a later stage.
- **Intermission**: as soon as "Take a bow" (the send button) passes the page checks, the curtains close and an "Intermission" screen shows. It reads "Taking your speech backstage..." while the file uploads, then "Your coach is reviewing your speech..." (pulsing dots and the keep-this-page-open note) while the AI works. If the upload fails, the curtains open back on the Stage with the error.

Menu labels: **Stage** (small subtitle "Practice"), **Backstage** ("Your feedback"), **Wall of Fame** ("Past performances").

## Colors

| Use | Value |
| --- | --- |
| Page background | `#1A0B0A` |
| Main text | `#EFE2CF` |
| Headings, topic | `#FFF6E3` |
| Secondary text | `#D8C6AE` |
| Muted labels | `#BCA992` |
| Gold accent | `#D9AE52` |
| Light gold (button text on dark) | `#F0CF86` |
| Text on gold buttons | `#1E1006` |
| Lines and dividers | `rgba(246,234,211,0.16)` |
| Chip borders | `rgba(246,234,211,0.26)` |
| Good / under time / strengths | `#8FE0B0` |
| Over time / weaknesses | `#FFB066` (orange, never red, and always with the word "over") |
| Improvement tips heading | `#9CCBFF` |
| Curtain velvet | `#4A0812`, `#8C1426`, `#B8283A` (repeating vertical folds) |
| Curtain trim, tiebacks | `#D9AE52`, gradient to `#A97D2B` |
| Wood floor | `#6B3F22`, `#43260F`, `#7A4A2A`, top edge `#A0703F` |
| Spotlight | `rgba(255,214,150,0.30)` radial glow from the top center |
| Backstage wall | `#3A0E14` with `#2A080D` stripes |
| Mirror frame | gradient `#B07A44` to `#8A5A2E` |
| Mirror glass | `#1E0F0C` |
| Bulbs | `#FFDFA0`, glow `rgba(255,200,120,0.7)` |
| Playbill paper | `#F4E7CC`, frame gradient `#E6C277`, `#9C7232`, `#D8B062` |
| ON AIR sign (lit) | `#E5383B` with glow `0 0 20px rgba(229,56,59,0.7)`; unlit `#2A0A0E` with 40% white text |
| Mic glow | gold `rgba(217,174,82,0.22)`, red `rgba(229,56,59,0.28)` while recording |
| Stopwatch | limit text `#8E7E6C`; pills: "left" `#8FE0B0` on `rgba(143,224,176,0.14)`, "over" `#FFB066` on `rgba(255,176,102,0.16)`, "untimed" `#D8C6AE` on `rgba(246,234,211,0.1)` |
| "Send to the coach" under "Take a bow" | solid `#4A3010` on the gold (about 5.9 to 1 contrast) |

The recording red is only for the ON AIR sign and the live mic. Time status never uses it.

## Fonts (Google Fonts)

- **Fraunces** (500 and 600): logo, topic, big headings, big numbers.
- **Manrope** (400 to 800): everything else.
- **JetBrains Mono** (500 and 600): times and the stopwatch.

## Shapes to copy exactly from the design files

- **Seated audience**: the `<svg>` with red seat backs and dark heads and shoulders, three rows, sitting across the back of the stage. Its bottom edge sits exactly on the top edge of the wooden floor. Nothing in it touches the floor. Copy the SVG markup as it is.
- **Curtains**: side curtains with rounded tied-back bottoms (`border-bottom-*-radius: 136px 300px` on laptop), the top valance with a gold bottom border, the scalloped edge under it, and the two gold tiebacks.
- **Mic**: the chrome stage mic SVG on a stand. It is the main action on the Stage.
- **Bulbs, mirror, playbills, trophies, medals**: as drawn.

## Layout

Laptop: content centered between the curtains (about 200px in from each side at 1280px wide). From top to bottom: header (logo left, menu right), topic row (label, type badge, hint), the big topic, topic buttons, the settings strip (Speaking time, Prep time and Stopwatch while speaking columns, thin lines above and below, columns split by thin vertical lines; Speaking time and Prep time are as wide as their chips so the chips never wrap, and below 1150px wide Speaking time gets its own row with Prep time and the stopwatch under it), the audience band with the mic standing in front of it on the floor line, and the text under the mic on the floor.

Phone (about 390 by 780): curtains become thin strips at the sides, the top valance stays, the menu becomes a bottom tab bar (Stage, Backstage, Wall of Fame with icons). The Stage screen must fit on one screen with no page scrolling on a typical Android phone. Backstage: the page does not scroll, only the Coach's notes scroll inside the mirror. Wall of Fame: only the frames area scrolls.

Stage layout rules (laptop and phone):
- **Privacy**: behind a "Privacy" link with a small lock icon at the top right on all screens (laptop: in the header, right of the menu). It is a quiet, muted button, not a menu item, and brightens on hover and focus. It opens a small panel right under it with the privacy note; the panel closes on a second click, a click outside it, or Escape (focus returns to the link).
- **Main action: the mic**. The chrome mic is a real button, centered, its stand's foot on the floor line and its head standing in front of the audience (120 x 156 on laptop, 88 x 114 on short laptop windows, 96 x 125 on phones, 74 x 96 on short phones). It never reaches the settings strip: the audience row is always at least the mic's height plus a small gap.
- **Under the mic**, stacked and centered on the wooden floor: "Step up to the mic", "Tap the mic to begin." plus the prep time when one is set ("You get 30 seconds to prepare, then recording starts."), then the secondary upload button ("or upload an MP3", smaller, dashed outline) with "Up to 10 minutes and 25 MB" beside it, then the file name and length line, the MP3 player (shown once a file is picked), the "Take a bow" button, the status and the wait note. The floor grows to hold it. It never overlaps the audience.
- **No recording support** (no microphone access or no AudioWorklet): the mic, ON AIR, Prep time and the stopwatch switch are hidden and the Stage keeps the upload-first layout ("Your turn on stage", "Upload an MP3 of your speech. Up to 10 minutes and 25 MB.", full-size Upload button).
- **Audience**: always fully between the bottom of the settings strip (with a small gap) and the top of the floor. On shorter windows and when zoomed in it scales down proportionally to fit that space, down to about 70 percent of its normal height. If there is still not enough room, the stage grows and the page scrolls (scrollbar hidden). Only the mic's head may stand in front of it. No other button, label, line or text ever sits on top of it.

### Recording states (on the Stage, under the mic)

- **Idle**: as above. Prep time choices: Off (default), 30 sec, 1 min, 2 min.
- **Prep** (only when Prep time is not Off): the topic stays visible, a big countdown ("0:30", JetBrains Mono), "Prepare your speech", then "Start now" (gold) and "Cancel". Tapping the mic also starts now.
- **Countdown**: "Recording starts in", a big 3, 2, 1 (a small pop per number), and "Cancel".
- **Recording**: the ON AIR sign lights up red with a soft glow and the mic glow turns red. The settings strip is replaced, in the same row, by the live panel (stopwatch and sound wave, below). Under the mic: "Recording", "Tap the mic or Finish speech when done. Recording stops automatically at 10:00.", then "Finish speech" (gold) and "Start over" (restarts the 3, 2, 1). The mic button stops the recording.
- **Review**: "Your take", the player (below), the length line (Length / Limit with over or under), then "Take a bow" (gold, two lines), "Re-record" (outline) and "Discard take" (text button, back to Idle). The mic is dimmed and can't be tapped.
- While preparing, counting down or recording, the topic, time and prep controls, the menu, the file picker and drag and drop are locked, the screen is kept awake, and leaving the page asks first. Leaving also asks while a take has not been sent.
- Takes under 15 seconds show "Recordings need at least 15 seconds." and can't be sent. At 9:30 the status says "30 seconds left before recording stops." At exactly 10:00 recording stops by itself and Review notes "Recording stopped at the 10:00 maximum." If the mic is cut off (or the page is hidden on a phone), Review notes "Recording was interrupted. You can listen back, re-record, or use what you have."
- Screen readers hear each state change once (prep start, "Recording starts in 3 seconds.", "Recording.", the take's length), never every second.
- Reduced motion: the mic glow doesn't pulse, the countdown numbers don't pop, and the sound wave becomes a plain level meter. Everything else works the same.
- Idle, prep, countdown and recording fit without page scrolling on laptop and phone. Review (and Idle with a picked MP3) may scroll on short screens; Review scrolls itself into view, above the phone tab bar.

### Stopwatch

- **Setting**: "Stopwatch while speaking" (phones: "Stopwatch"), an on/off switch, on by default. Locked while preparing, counting down and recording, like the other settings. On phones it sits to the right of Prep time.
- **While recording** (in the live panel): large JetBrains Mono "elapsed / limit", for example "2:15 / 3:00". Elapsed is green under the limit and orange when over; the limit is muted. A pill beside it says "0:45 left" (green), "+0:15 over" (orange, always with the word "over") or "untimed" (neutral, and no limit is shown). A "Hide stopwatch" text button sits next to it; hidden shows "Stopwatch hidden. Just speak." with "Show stopwatch". The switch and these buttons change the same choice.
- Elapsed comes from the recorded samples, so it matches the take exactly. It is display only: the official time comes from the server.
- `role="timer"` with no live announcements (it is never read out every second). The 9:30 warning still shows in the status line when the stopwatch is hidden.
- Sizes: on laptops one row with the wave beside it (48px, or 36px on windows up to 820px tall) so the panel is no taller than the settings strip; on phones 30px with the wave under it.

### Sound wave

- In the live panel, beside the stopwatch on laptops and under it on phones: gold bars driven by the real mic level, newest on the right, so it scrolls left as you speak. Older bars are dimmer. A flat line means the mic hears nothing. 44 bars on laptop, the newest 28 on phones.
- Decorative (`aria-hidden`). It only runs while recording and stops whenever recording ends, restarts, is cancelled, interrupted or fails.
- Reduced motion: the bars are replaced by a single horizontal level meter.

### Players (Review and a picked MP3)

- One compact player: "Back 5 seconds", play/pause, "Forward 5 seconds" (round icon buttons, 34px or more on phones), a seek slider and "current / total" in JetBrains Mono.
- The slider looks like the thin bar: gold up to the current position, a small round light-gold thumb. Click or drag to any point; the time text follows while dragging. Keyboard: arrow keys move 5 seconds, Home and End jump to the start and end. Its name is "Position in your take" (or "your MP3") and it reads "1:05 of 2:14".
- Never autoplays. Playback pauses when sending, re-recording, discarding, or switching to Backstage.
- A picked MP3 shows the same player above "Take a bow" so it can be heard before sending. Its audio is released when the picked file changes or is cleared.

### Send button: "Take a bow"

- Both send buttons (Review and picked MP3) are gold with two lines: "Take a bow" (bold) and "Send to the coach" under it (smaller, solid dark brown). Screen readers hear "Take a bow, send to the coach".
- Laptop: 15px and 12px, at least 44px tall. Phones: 13px and 11px, at least 40px tall. Neither line wraps, even at 360px wide.

## Rules

- **No visible scrollbars anywhere.** Scrolling areas scroll by swiping or the mouse wheel, hide the scrollbar (`scrollbar-width: none` and `::-webkit-scrollbar { display: none }`), and show a soft fade at the bottom edge so people know there is more.
- **Reduced motion:** when `prefers-reduced-motion: reduce` is on, skip every animation (curtains switch instantly, no topic roll, bulbs stay lit, no spotlight fade).
- **Bulbs:** alternate softly (odd and even bulbs fade between full and 35 percent brightness, about one change per second), for 3 cycles when Backstage opens, then stay fully lit. Never fully off, never fast.
- **Touch targets:** buttons at least 34px tall on phones with at least 8px between them; 44px on laptop where space allows.
- **Text size:** new text is at least 11px on phones and 12px on laptop.
- **Text over the wood floor** gets a soft dark text shadow so it stays readable.
- **Accessibility:** real `<button>` elements, visible focus outlines, labels on inputs, `aria-live` on status text, screen readers hear only the final topic after a roll.
- **Time status colors:** green with "under" or "on time", orange with "over". Color is never the only signal.

## What gets built when

| Stage | Adds |
| --- | --- |
| Theatre redesign | Stage screen (topic, speaking time, upload in the mic's spot), Backstage with Coach's notes, curtain transitions, Intermission, phone layout. Wall of Fame tab hidden. Prep time and stopwatch controls hidden. |
| Stage 3, part 1 | The mic replaces the upload button as the main action (upload moves under it), ON AIR light, prep time, live recording to a 16 kHz WAV, listen back and send. |
| Stage 3, part 2 | Stopwatch while speaking, live sound wave, seekable players (take and picked MP3), "Take a bow" send button, Clarity, the recording source and the 10:00 cut-off on Backstage. |
| Stage 4 | Wall of Fame tab, playbills, trophy shelf. |
