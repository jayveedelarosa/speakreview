# Feature set 3, Stage 2: Stage name and Tonight's programme (approved Oct 21, 2026)

This REPLACES the Stage 1 / 1b settings panel (laptop) and settings sheet (phone).
Approved mockups: `F11StageLaptop.dc.html` and `F11StagePhone.dc.html` (Round 10 on the canvas).
They use a design tool's runtime. Never copy it. Rebuild in plain HTML, CSS and JavaScript.
Ignore every other F6 to F10 file or option: only the Round 10 "paper form" is approved.

## 1. What changes for the visitor

- The ticket keeps its look. Three things on it open ONE panel, "Tonight's programme":
  - the show label at the top left of the ticket (TONIGHT'S SHOW / JAYVEE'S SHOW),
  - the RUNTIME stub button,
  - the CURTAIN IN stub button.
- The panel opens on the section that was clicked (its number turns red, see 4).
- Every change shows on the ticket right away. Nothing is "saved" with a button.
- The panel closes with DONE, Escape, or clicking outside it (laptop) / tapping the dark backdrop (phone).
  Closing never undoes anything.

## 2. Stage name on the ticket

- Optional. Saved on the device only. Never sent to the server.
- Allowed: letters (any language), numbers, spaces, apostrophes ( ' and ’ ) and hyphens. Anything else is removed as typed.
  Runs of spaces become one space. Leading and trailing spaces are dropped when used. Max 16 characters.
- Ticket label (uppercase by CSS, same 11px / 800 / 0.24em burgundy #7A1222 as today):
  - no name: "Tonight's show" (unchanged)
  - name: "<Name>'s show" (always 's, also for names ending in s: "James's show")
  - Speak freely, no name: "Open mic night" (unchanged)
  - Speak freely, with name: "<Name>'s open mic"
- The label becomes a real button: same text style, a small pen icon after the text (11px, stroke 2.4),
  a 1px dashed outline rgba(122,18,34,0.42), 4px radius, padding 0 7px, height 28px, nudged left by 7px so the text stays aligned.
  While the panel is open on Cast: 1px solid #7A1222 with box-shadow 0 0 0 2px rgba(122,18,34,0.16).
  Phone: the label may wrap to two lines for long names (16 chars + "'s open mic"); the serial "No. 0347" stays on the right.
- Accessible name: "No stage name yet. Click to open tonight's programme" or "Stage name: Jayvee. Click to open tonight's programme" ("Tap" on phone).

## 3. The panel ("Tonight's programme", a paper form)

### Paper (laptop)
- Absolute, left 236px, top 140px of the stage, width 500px, padding 20px, radius 2px, rotate(-0.8deg).
- Background: `repeating-linear-gradient(0deg, rgba(110,80,40,0.03) 0 1px, rgba(0,0,0,0) 1px 4px), linear-gradient(180deg, #F7ECD3, #EAD9B6)`.
- Shadow: `0 18px 40px rgba(0,0,0,0.7), inset 0 0 30px rgba(120,80,30,0.18)`.
- Brass pin: 16px circle centred on the top edge (top -7px), `radial-gradient(circle at 35% 35%, #F5D891, #8C6224)`, shadow 0 3px 5px rgba(0,0,0,0.45).
- No tilt with reduced motion. Above the mic and audience, below the scene-change curtains.

### Paper (phone)
- Bottom sheet over a backdrop rgba(8,3,2,0.62). Full width, padding 22px 14px 14px, radius 4px 4px 0 0, same paper, shadow `0 -12px 30px rgba(0,0,0,0.6), inset 0 0 30px rgba(120,80,30,0.18)`.
- Pin 14px at top 4px. Covers the bottom tab bar. Page behind does not scroll. Focus stays inside.
- Must fit 390x780 and 360x740 without scrolling; scrolls inside only on very short screens.

### The form box
- Everything sits in one box: 1.5px solid #2A1A0E. Sections are divided by full-width lines (header: 1.5px, others: 1px #2A1A0E).
- Text colours: ink #2A1A0E, notes #5A4330, accent #7A1222. Fonts: Manrope for text, Fraunces for the title, JetBrains Mono for numbers.

**Header row** (padding 12px 16px 10px, background rgba(42,26,14,0.05)):
- Left: "The SpeakReview Players" (11px / 800 / 0.2em, uppercase, #7A1222), then the title "Tonight's programme" (Fraunces 23px / 600 / 0.06em, uppercase). Phone title 19px.
- Right: "Form no." (11px / 700 / 0.12em uppercase #5A4330) above "0347" (JetBrains Mono 13px / 600), the ticket's serial.

**Section 1, Cast** (padding 10px 16px 14px):
- Head row: number box "1", label "CAST", note "Your stage name"; on the right the counter "6 / 16" (JetBrains Mono 11px #5A4330).
- A rectangular field: height 46px (44 on phone), 1px solid #2A1A0E, background rgba(255,255,255,0.45), no radius, padding 0 44px 0 12px.
  Text in handwriting: font Caveat 600, 30px (28 on phone), colour #141210 (black pen). Placeholder "Write your name".
  Load Caveat 600 from Google Fonts (already an allowed address).
- A × button (44x44, burgundy #7A1222, 14px icon) inside the right end of the field, only when there is a name. Accessible name "Remove my name".

**Section 2, Runtime** (padding 10px 16px 14px):
- Head row: number box "2", label "RUNTIME", note "Speaking time".
- Line: "How long your speech should last. Going over is fine." (12px #5A4330)
- Controls row (gap 6px): check box "No limit", the word "or" (12px italic #5A4330), then the time group:
  `[−]  [mm] : [ss]  [+]`
  - − and + : 44x44 square, 1px solid #2A1A0E, no radius, transparent, Manrope 700 18px.
  - mm and ss: 52x44 (44x44 on phone) boxes like the Cast field, centred handwritten digits Caveat 28px (26 on phone) #141210, numeric keyboard (inputmode="numeric"), 2 digits max.
    "min" and "sec" printed under the boxes (11px #5A4330). The colon is printed between them (not typed).
  - When "No limit" is ticked, the time group shows at 50% opacity but still works (using it ticks off No limit).

**Section 3, Curtain in** (padding 10px 16px 12px):
- Head row: number box "3", label "CURTAIN IN", note "Prep time".
- Line: "Thinking time before recording starts."
- Three check boxes in a row: None, 30 sec, 1 min (one at a time, like radios).

**Last row** (padding 12px 16px, space-between):
- Left: lock icon (13px) + "Your stage name stays on this device. It is never sent anywhere." (12px #5A4330).
- Right: DONE as a rubber stamp: height 46px, padding 0 24px, radius 4px, `border: 3px double #7A1222`, background rgba(122,18,34,0.04), inset shadow 0 0 0 1px rgba(122,18,34,0.12), rotate(-3deg) (none with reduced motion), Fraunces 17px / 700 / 0.24em uppercase, colour #7A1222.
- Phone: the privacy line on top, DONE centred under it (min-width 160px).

### Section numbers and red highlight
- Number box: 18x18 (17 on phone), 1px solid #2A1A0E, Manrope 800 11px.
- The section being worked on: number box filled #7A1222 with #FFF6E3 text, and its label turns #7A1222. Others: transparent box, label #5A4330.
- It follows the last thing touched: opening from the label = Cast, from RUNTIME = Runtime, from CURTAIN IN = Curtain in;
  focusing or typing in the name = Cast; focusing the time boxes, −, +, No limit = Runtime; a prep box = Curtain in.

### Check boxes
- 18x18 square (17 on phone), 1.5px solid #2A1A0E, background rgba(255,255,255,0.45), inside a 44px-tall button with the label (Manrope 600 14px, 13 on phone).
- Ticked: a hand-drawn tick in black pen #141210 that slightly overflows the box:
  SVG 24x24 at left -2px, top -8px, path `M2.5 13.5 C4.5 15, 6.5 17.2, 8.2 20.2 C11 13.5, 15.5 6.8, 23 0.8`, stroke-width 2.4, round caps.
- Screen readers: "No limit" is a toggle button (aria-pressed); the prep boxes are a radiogroup (role="radio", aria-checked).
- Focus rings must stay visible on paper (use burgundy #7A1222, like the ticket).

## 4. Behaviour of the time

- No limit and a set time are two states. The set time is remembered while No limit is ticked.
  Unticking No limit brings back the last set time (default 3:00 if none was ever set).
- − and + move 30 seconds and snap to the nearest half minute (3:15 → + gives 3:30, − gives 3:00). Range 0:30 to 10:00.
- Typing: any whole seconds 0 to 59, minutes 0 to 10, total 0:30 to 10:00.
  Typing a valid time ticks off No limit and updates the ticket. While what is typed is not valid, show
  "Pick a time from 0:30 to 10:00." (12px 700 #7A1222, role="alert") and keep the last valid time.
  On close or leaving the boxes, they go back to the last valid time, written with two digits ("03", "00").
- After 2 minute digits, the cursor moves to the seconds box by itself.
- The ticket stub shows "No limit", "3 minutes", "1 minute", "45 seconds" or "2 min 30 sec".

## 5. Prep time

- Choices are now None, 30 sec, 1 min. The 2 minutes option is gone.
- The line under the mic follows it as today.

## 6. Saving on the device

- Keep the key `speakreview.settings.v1`. Add a `name` field: `{"time":"180","prep":"30","name":"Jayvee"}`.
- Strict checks on load, each field on its own (a bad field falls back, the others still load):
  - time: "" or a whole number 30 to 600 (any seconds now, not only steps of 30)
  - prep: "0", "30", "60"; a saved "120" becomes "60"; anything else becomes "0"
  - name: a string, cleaned with the same rules as typing; anything else becomes ""
- Never put stored or typed text into innerHTML. textContent only.
- Storage blocked: everything works, nothing is remembered.

## 7. Wording (no "we", no em dashes)

Title "Tonight's programme"; labels "Cast", "Runtime", "Curtain in"; notes "Your stage name", "Speaking time", "Prep time";
lines "How long your speech should last. Going over is fine." and "Thinking time before recording starts.";
privacy line "Your stage name stays on this device. It is never sent anywhere."; error "Pick a time from 0:30 to 10:00.".
Privacy page: add one sentence that an optional stage name can be saved on this device and is never sent.
