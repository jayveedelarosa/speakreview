# Feature set 2: approved design notes

Approved by Jayvee on Oct 15, 2026. These notes ADD to design/DESIGN-NOTES.md. Where they disagree, these win.

The approved mockups are the .dc.html files in this folder. They were made in a design tool with its own templating (support.js, x-dc, {{...}}, sc-if, sc-for, dc-import, DCLogic). Never copy that runtime. Rebuild in plain HTML, CSS and JavaScript, and copy exact colors, sizes, spacing and SVG shapes. Sample text and numbers in them are placeholders.

| File | Shows |
|---|---|
| F2StageLaptop.dc.html | Laptop Stage: new curtains, ticket stubs, arrow signs, no top menu (prop startOpen shows a ticket open) |
| F2StagePhone.dc.html | Phone Stage: ticket stubs and the bottom sheet for one setting |
| F2PhoneNav.dc.html | Final phone nav bar |
| F2Backstage.dc.html | Laptop Backstage: narrower mirror, Stage sign, Coach's notes / Your words tabs, critic's review clipping |
| F2BackstagePhone.dc.html | Phone Backstage: Notes / Your words / Review tabs |
| F2Wall.dc.html | Laptop Wall of Fame: Your run so far with filters and tap-a-dot charts, Stage sign |
| F2WallPhone.dc.html | Phone Wall of Fame: filters, one measurement at a time, early state (prop early) |

## 1. Stage look (laptop and phone)

- **Crowd and mic stay exactly as they are live.** Do not change the audience drawing or the mic size.
- **New curtains (laptop):** each side curtain is about 12% of the window width and is tied back: full width at the top, pinched inward around the gold tieback (about 60% down), flaring toward the floor. Use clip-path (left curtain: `polygon(0 0, 100% 0, 100% 50%, 52% 63%, 78% 100%, 0 100%)`, right curtain mirrored). Gold tieback bar across each curtain, tilted about 14 degrees.
- **Ticket stubs replace the Speaking time and Prep time button rows.**
  - Two cream paper tickets side by side (laptop about 246 x 76 px, phone about 161 x 66 px), with a dashed perforation, a small stub on the right holding an icon (clock for time, hourglass for prep), and two round notches at the perforation.
  - Each ticket prints its label (SPEAKING TIME / PREP TIME, small red caps), its current value in Fraunces (for example "No limit", "3 minutes", "2 min 30 sec", "None", "30 seconds"), and "Click to change" (laptop) or "Tap to change" (phone).
  - Each ticket is a real button with aria-expanded and an accessible name like "Speaking time: 3 minutes. Click to change".
  - Clicking a ticket opens ONLY that setting: laptop shows a wooden panel under the tickets with a small arrow pointing at the open ticket; phone shows a bottom sheet with a dimmed backdrop. Both have a title, a one-line explanation, and the choices.
    - Speaking time: No limit, 1 minute, 3 minutes, 5 minutes, Custom. Help: "How long you aim to speak. You can still go over: the timer just shows it."
    - Prep time: None, 30 seconds, 1 minute, 2 minutes. Help: "Thinking time after you click the mic, before recording starts."
  - Picking a choice updates the ticket and closes the panel. Custom keeps it open with the minus and plus controls (0:30 to 10:00) and a Done button.
  - Escape, clicking outside, or Done closes it; focus returns to the ticket.
  - The last choice is remembered on the device (localStorage, wrapped in try/catch).
  - The line under the mic follows the prep choice ("Click the mic to begin." or "Click the mic. You get 30 seconds to prepare, then recording starts.").

## 2. Navigation

### Laptop (wider than the phone breakpoint)
- **Remove the Stage / Backstage / Wall of Fame menu from the top.** Keep the SpeakReview logo (left) and the Privacy link (right).
- **Marquee arrow signs** are the navigation. Each is a real link or button with an accessible name like "Go to Backstage, your feedback".
  - Shape: an arrow (rectangle plus a 22 px pointed tip) with a gold (#B8893A) border, a near-black (#1E0806) face, small lit bulbs along the top and bottom edges, the room name in Fraunces caps (#FFE7B0 with a soft glow) and a small subtitle.
  - Bulbs are lit and still. No chasing animation. With reduced motion, nothing changes.
  - **Stage:** a left-pointing "Backstage / Your feedback" sign on the left curtain and a right-pointing "Wall of Fame / Past shows" sign on the right curtain, at about 42% of the stage height. Sign width is the curtain width minus 14 px.
  - **Backstage:** one right-pointing "Stage / Back to practice" sign on the wall to the right of the mirror. The mirror is narrower (150 px gap from each window edge on a 1280 px window) so the sign never covers the frame or bulbs.
  - **Wall of Fame:** one left-pointing "Stage / Back to practice" sign on the left wall.
  - Backstage and the Wall of Fame do not link to each other directly (the Stage is the lobby).
  - Signs must stay readable on a 1366 x 657 window at 125% zoom. On short windows the page scrolls; signs never overlap content.

### Phone
- Bottom bar: dark (#24100C to #120806) with a 2 px gold top border.
- **Stage** is a raised round sign in the middle (about 76 px), red velvet with a gold border, ringed by 12 small bulbs, sticking up above the bar. Bulbs lit when on the Stage, dim when not.
- **Backstage** (left) and **Wall of Fame** (right): icon plus label. When active, the label sits on a brass name plate (gold gradient, dark text) with a small arc of three bulbs above the icon. Inactive labels are muted cream.
- aria-current="page" on the active item. Keep tap targets at least the current size.

## 3. Backstage: transcript and critic's review

- Coach's notes area gets tabs: **Coach's notes | Your words** on laptop; **Notes | Your words | Review** on phone (pill-style tab group).
- **Your words** shows the transcript with a legend and counts:
  - Filler (um, uh): orange highlight `rgba(255,176,102,0.24)`, text #FFE2C2, 2 px solid #FFB066 underline.
  - Word used as filler (like, so, actually, basically, you know, only when judged a filler): 2 px dotted #D9AE52 underline, no highlight.
  - Long pause (3 seconds or more only): a small neutral pill with a pause icon and the length ("3.4s"), dashed light border, muted cream text. Not styled as a mistake.
  - Unclear word (very low transcription confidence): faint italic #A8977F with a thin dashed underline, explained as "a word the transcription was unsure about".
  - Note under it: dotted words are only marked when used as filler; pauses are not a mistake.
  - Color is never the only signal (each mark also has its own underline or shape).
- **Critic's review ("The Nightly Review")**: a cream newspaper clipping pinned with a brass pin, slightly rotated (about -1 deg). Masthead "THE NIGHTLY REVIEW", subtitle "Your coach's rating. A rough guide, not a grade." Four rows: Structure, Clarity of message, Staying on topic, Word choice. Each row: name, level word in italic Fraunces (Developing, Solid, Strong, Outstanding), a 4-segment meter, and a one-line reason. Laptop: left column under the numbers. Phone: the Review tab. Hidden if the data is missing.

## 4. Wall of Fame: Your run so far

- A "box office board": wooden frame, dark felt inside with faint horizontal lines, title "YOUR RUN SO FAR" in JetBrains Mono caps, subtitle "Measured, not judged. The same speeches always give the same numbers."
- Filters (radio buttons): **Last vs previous · Last 5 · Last 10 · All**.
- Three measurements, all plain math on the device (no AI):
  - **Fillers per minute**: um and uh only, from the saved filler breakdown divided by speaking time.
  - **Pace**: words per minute, with a shaded comfortable band of 130 to 160.
  - **Time accuracy**: seconds away from the time limit, timed speeches only.
- Each chart: gold line, one dot per performance. Dots are real buttons (aria-label with the show number, date and value). Tapping one selects that show in all charts and fills a "Selected" bar: show number, date, topic, the three values, and "Open its playbill".
- Charts never grow wider or scroll sideways. Up to 30 points each get a dot. Above that, "All" groups into one dot per week (weekly averages) and says so under the board.
- Tag rule (deterministic): compare the average of the earlier half with the later half. 10% or more better = "Improving", 10% or more worse = "Slipping", else "Steady". Pace uses the band instead ("In range", "A bit fast", "A bit slow"). Tags always include a word and an icon, not just color.
- Sentences are fixed templates, for example "From 3.2 to 2.0 across your last 10 shows." Last vs previous shows "previous → latest".
- Laptop: three charts side by side. Phone: one measurement at a time with a Fillers / Pace / Timing switcher.
- Before 3 performances: "Your trends light up after 3 performances. 2 of 3 done, one more to go." with three bulbs (lit for each done).

## 5. What was built (decisions after the mockups)

These were decided while building and checked in the live site. Where they differ from sections 1 to 4, these win.

**Navigation and layout**
- **Laptop signs from 1280px.** Below 1280px the curtain signs (12vw minus 14 px) are too narrow for "BACKSTAGE" (measured: it first fits at 1280). So the bottom bar from F2PhoneNav is the navigation below 1280px, on laptop-style layouts too. The phone layout itself still starts at 600px.
- **One-column Backstage below 990px.** Below 990px the two-column mirror no longer fits properly (measured), so Backstage uses its phone layout there: Notes / Your words / Review tabs and the short number labels. When the window widens past 990px while Review is open, the Notes tab opens instead.
- **Backstage number row.**
  - On laptops the three numbers sit in one compact row under the time line.
  - "Back to the stage" (gold, the most prominent) and "Try this topic again" sit at the bottom right, under the notes. They wrap neatly when the column is narrow, and they are always visible.
  - The left column scrolls on its own when it doesn't fit, with "Scroll for the review" and a fade.
- **Label gold #E3BA60.** Small gold caps on dark panels (for example the settings menu kicker) use #E3BA60 instead of #D9AE52. Under the panel's spotlight, #D9AE52 measured just under 4.5:1.
- **Dressed settings menu.** The Speaking time and Prep time panel follows DESIGN-NOTES-settings-menu.md in this folder (the wooden panel with the kicker, the divider and the choices).

**Your run so far**
- **Fillers chart title:** "Fillers per minute · um, uh". Screen readers hear "Fillers per minute (um and uh)". The switcher pill stays "Fillers".
- **The sentences use the same half averages as the tag.**
  - The middle show is left out when the count is odd. The change is rounded first, so exactly 10% counts.
  - The wording follows the tag: "Down from 2.0 to 1.8 on average across your last 4 shows." (Improving), "Up from ..." (Slipping) or "About the same, 1.9 on average, across ..." (Steady).
  - Pace keeps its band sentence, and Last vs previous keeps "Last time 2.0, this time 1.5."
- No subtitle on the board, and no note under it except the weekly-grouping note above 30 shows.

**Trophies and fillers**
- **Long run trophy:** "5 min+ at a speaking pace". It needs 5 minutes or more of speaking at 60 words per minute or more, and the speech must not be too short. A long silent recording doesn't count.
- **Filler judging is steady and done on the server.**
  - Which "like", "so", "you know" and so on were used as filler is decided on the server, set up so the same speech gets the same marks.
  - The page shows only the marks it is sent (filler_flags, when fillers_judged is true) and never judges on its own.

**Phones**
- **Stable heights on phones.**
  - Room heights use one stable height (`--stable-h`: 100svh, with 100vh for older browsers), never dvh or a height measured by JavaScript. Nothing resizes while the browser toolbar slides in or out.
  - The short-phone mic size is chosen from that same height, not from a max-height media query.
- **Scenery under the scene.** When the toolbar hides, the extra space above the bottom bar shows the room's scenery, never an empty dark band: the page background continues the Stage floor (at its darkest shade) and the Backstage and Wall stripes.
- **No pull past the end.** The page has overscroll-behavior-y: none, and the panels that scroll inside have overscroll-behavior: contain. This also turns off pull-to-refresh on the site.
- **Top fade.** A scrolling panel with a bottom fade also gets a soft 16 px fade at its top while it is scrolled down, so the top line is never cut in half.
- **Text sizes.** The hint reads "Scroll for more" everywhere, on one line. The number labels in the one-column Backstage are 11px, the minimum.

**Security sweep (stage 7)**
- Every piece of text from outside the page was tested with HTML, script tags, quotes and very long strings without spaces. The text came from the topic, coach's notes, words, filler flags, review reasons, stored Wall entries, file names and API messages. All of it shows as plain text and runs nothing.
- One layout fix came out of it: the status line under the mic wraps long words (overflow-wrap: anywhere), so a long API message can't widen the page.
- The tests are in tests/ (see tests/README.md).

## 6. Rules that still apply

No visible scrollbars. Reduced motion respected. Every value from the API, the user or localStorage goes through escapeHtml() or textContent. No inline styles, scripts or event handlers (strict CSP). No new outside addresses. No em dashes in visible text.
