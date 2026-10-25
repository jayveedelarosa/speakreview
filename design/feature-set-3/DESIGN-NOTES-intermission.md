# Feature set 3, stage 3: Intermission progress and Coming back

Approved boards (reference only, never deployed):
- `F12IntermissionLaptop.dc.html`, `F12IntermissionPhone.dc.html`: Intermission with three acts on a marquee board
- `F12ReadyLaptop.dc.html`, `F12ReadyPhone.dc.html`: the "Coming back" note shown when a visitor returns after leaving during Intermission

The boards are design files with their own small preview script. Copy the look, words, sizes and colors into the real site using classes in `styles.css` (the site's CSP allows no style attributes and no inline scripts).

## 1. Intermission: the three acts

Keeps the current curtains, the "SpeakReview" kicker, the big "Intermission" title and the line "Your coach is reviewing your speech." Below them sits one marquee board.

**Board frame**
- Wooden frame: `linear-gradient(160deg, #8A5A2E, #4A2A14 55%, #6E4522)`, radius 14px, padding 14px (13px phone), shadow `0 18px 40px rgba(0,0,0,0.6)` plus `inset 0 0 0 1px rgba(240,207,134,0.35)`.
- Small marquee bulbs along the top and bottom edge of the frame: 9px (8px phone) circles, `radial-gradient(circle at 40% 35%, #FFFFFF, #FFDFA0 60%)`, glow `0 0 6px 2px rgba(255,200,120,0.6)`. Laptop 17 per row, phone 9 per row. Decorative only (`aria-hidden`).
- Inner panel: radius 6px, `radial-gradient(ellipse 80% 70% at 50% 0%, rgba(255,220,170,0.08), transparent 70%), linear-gradient(180deg, #1C0E0B, #0F0705)`, inner shadow `inset 0 0 20px rgba(0,0,0,0.7)`.
- Laptop: board 786px wide, acts side by side (200px each) joined by 64px lines. Phone: full width minus 18px each side, acts stacked, joined by short vertical lines on the left.

**Each act**
- A round bulb (34px laptop, 30px phone) with a small brass base under it (`linear-gradient(180deg, #B8893A, #6E4A1E)`).
- Kicker (11px, 800, uppercase, wide letter spacing): "Act I", "Act II", "Act III".
- Title (15px, 700) and one line under it (12px).
- State word (11px, 800, uppercase): "Done", "Now playing" or "Next". Laptop: under the line. Phone: on the right of the kicker row.

| Act | Title | Line under it |
|---|---|---|
| Act I, while sending | Sending | Sending your recording to your coach |
| Act I, once sent | Arrived | Your coach has it |
| Act II | Transcribing | Writing down every word |
| Act III | Coach's notes | Reading and writing your feedback |

**Bulb states**
- Done: `radial-gradient(circle at 40% 35%, #FFF3D6, #F0CF86 55%, #C9963E)`, glow `0 0 10px 3px rgba(255,200,120,0.5)`, dark tick inside (`#3A1E08`).
- Now playing: `radial-gradient(circle at 40% 35%, #FFFFFF, #FFE7B0 45%, #E8A84A)` with a slow glow pulse (1.8s). No pulse when the visitor prefers reduced motion.
- Next: `radial-gradient(circle at 40% 35%, #8A6A4A, #3A2416 70%)`, 1px border `rgba(246,234,211,0.22)`, no glow.
- Lines between acts: solid `#D9AE52` once reached, dashed `rgba(246,234,211,0.3)` before.

**Text colors**
- Kicker: `#F0CF86` done or now, `#A8977F` next.
- Title: `#FFF6E3` now, `#EFE2CF` done, `#BCA992` next.
- Line under: `#D8C6AE` done or now, `#A8977F` next.
- State: `#F0CF86` Done, `#FFE7B0` Now playing, `#A8977F` Next.
- All of these must stay at 4.5:1 contrast or better on the dark panel. Darken or lighten slightly if a check fails.

**Footer line** under the board (14px laptop, 13px phone, `#F1E2CC`):
- Laptop: "Usually under a minute. You can switch tabs or close the page: your notes will be waiting."
- Phone: "Usually under a minute. You can switch apps or close the page: your notes will be waiting."
- During Act I only (the recording has not arrived yet), show instead: "Keep this page open until your recording is sent." Closing during Act I really does lose the recording, so the page must not promise otherwise.

**What moves the acts**
- Act I: from the moment Intermission opens until the upload finishes. Then Act I turns Done and reads "Arrived / Your coach has it".
- Act II: from the end of the upload until the server says the coach has started.
- Act III: once `/result` replies with `"progress": "coach"`.
- Done: a real result arrives (`wpm` or `too_short`, as today) and the curtains open on Backstage as they do now.
- Acts only move forward, never back. If a reply jumps straight to the result, the page goes straight to Backstage.
- Screen readers: announce each new act once, politely (for example "Act II, Transcribing. Writing down every word.").

## 2. Tab title
- If the notes arrive while the tab or app is in the background, the tab title becomes "Your notes are ready · SpeakReview". It goes back to the normal title as soon as the visitor returns.

## 3. Coming back note

Shown when the visitor left (closed or reloaded the page) after Act I finished, and comes back on the same device while the result is ready.

- Dim layer over the Stage: `rgba(8,3,2,0.55)` laptop, `rgba(8,3,2,0.62)` phone.
- A paper card in the same style as Tonight's programme: cream `linear-gradient(180deg, #F7ECD3, #EAD9B6)` with the faint ruled lines, a brass pin at the top centre, turned -0.8deg, shadow `0 18px 40px rgba(0,0,0,0.7), inset 0 0 30px rgba(120,80,30,0.18)`. Laptop 450px wide, phone full width minus 18px each side.
- Inside, one ruled box (1.5px `#2A1A0E`):
  - Header row (light tint `rgba(42,26,14,0.05)`): kicker "A note from backstage" (11px, 800, uppercase, `#7A1222`), title "Your last performance is ready." (Fraunces 600, 22px laptop, 19px phone).
  - Body row: "The coach finished your notes while you were away." (13px / 12px, `#5A4330`), then a small "Topic" label, the topic in Fraunces 600 (18px / 16px), then the date, time and length in mono (`#5A4330`), for example "Today, 9:41 pm · 2:47". Use "Today", "Yesterday", or a short date like "Oct 20". With no topic, show "Speak freely" or "Open mic", matching how the Wall of Fame names it.
  - Button row: "Not now" on the left (600, grey `#5A4330`, underlined) and "See your notes" with an arrow on the right (800, 15px / 14px, `#7A1222`, underlined). Both at least 44px tall.
- "See your notes" opens Backstage on that performance. "Not now" (and Escape) closes the note. Either way the performance is already saved on the Wall of Fame, and the note never shows again for it.
- It is a dialog: focus moves into it, Tab stays inside, focus returns to where it was when it closes.

## 4. Ticket show label (Stage 2 fix)
- The show label on the ticket ("Jayvee's show", "Tonight's show") has **no box** around it, in any state: no dashed border, and no solid border or ring when the programme is open on Cast. It is plain text with the small pen icon, which is what tells visitors it can be tapped.
- RUNTIME and CURTAIN IN keep their dashed boxes as they are.
- Keep the keyboard focus outline (it only shows for keyboard users).
