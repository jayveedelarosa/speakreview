# Topic ticket: approved design notes

Approved by Jayvee on Oct 15, 2026. This REPLACES the "Ticket stubs" part of section 1 in DESIGN-NOTES-feature-set-2.md. Everything else in that file still applies (curtains, navigation, transcript, Wall of Fame, section 5 rules).

The approved mockups are F4StageLaptop.dc.html and F4StagePhone.dc.html in this folder. Only the "ticket" variant with color "ivory" and wording "theatre" is approved. The same files also contain unused "props", "chips" and "orange" options: ignore those. As always, never copy the design tool's runtime (support.js, x-dc, {{...}}, sc-if, sc-for, dc-import, DCLogic); rebuild in plain HTML, CSS and JavaScript and copy exact colors, sizes and shapes.

## What it is

The topic itself is printed on a paper theatre ticket. The two settings (Speaking time and Prep time) are printed on the ticket's stub, like the seat details on a real ticket. The two separate cream ticket stubs from Stage 1 go away.

## Paper and print

- Paper: aged ivory, `linear-gradient(180deg, #E2CFA6, #C9B086)`, with a soft light patch (`radial-gradient(ellipse 70% 90% at 42% 30%, rgba(255,244,214,0.45), transparent 70%)`) and a very faint grain (two thin repeating-linear-gradients at about 3% opacity, see the mockup).
- Edge darkening: an inner shadow `inset 0 0 46px rgba(70,35,10,0.42)` so the ticket looks lit by the stage, not glowing.
- Printed border: `3px double rgba(122,18,34,0.5)`, inset 10px (laptop) / 7px (phone), radius 4px.
- Ink: labels `#7A1222` (burgundy), topic and values `#2A1206` (near black), secondary text `#5E3A1C`. All of these pass 4.5:1 on the paper.
- Drop shadow under the whole ticket: `drop-shadow(0 16px 22px rgba(0,0,0,0.6))` on laptop, `0 12px 18px` on phone (on a wrapper, because the cut corners use a mask).
- Tilt: the whole ticket is rotated -0.8deg. No tilt when the user prefers reduced motion.

## Shape

- Four corners cut inward with small curves: a CSS mask of four radial gradients, radius 13px on laptop and 9px on phone (exact mask in the mockup). No big circles anywhere.
- Tear line between the main part and the stub: a 4px column of small punched dots (`radial-gradient(circle, rgba(70,35,10,0.55) 1.6px, transparent 2.1px) 0 4px / 4px 9px repeat-y`), with only a tiny 10px notch where it meets the top and bottom edges.

## Laptop layout (main part, then tear line, then stub, then "Admit one")

- Ticket width 860px (shrinks with the window, never wider than the space between the curtains), centered where the topic is today, top about 120px.
- Main part (padding 24px 30px 26px 34px):
  - One row: "TONIGHT'S SHOW" (11px, 800, letter-spacing 0.24em, burgundy), the type badge (Persuade, Story...; 1px burgundy outline pill), the hint ("Take a side and back it up"), and on the far right a small serial "No. 0347" in JetBrains Mono 12px. The serial is decoration only (aria-hidden) and can stay fixed.
  - The topic in Fraunces 600, 40px, line-height 1.12, up to 3 lines.
- Stub (196px wide): the two settings stacked, each a real button:
  - "RUNTIME" (11px caps, burgundy) with a small chevron, the value in Fraunces 21px (for example "No limit", "3 minutes", "2 min 30 sec"), and "Speaking time" in 11px under it.
  - "CURTAIN IN", the value ("None", "30 seconds", "1 minute", "2 minutes"), and "Prep time" under it.
  - Each button has a thin dashed outline at rest and a solid burgundy outline with a soft ring when its panel is open. Accessible names use the plain words: "Speaking time: 3 minutes. Click to change" / "Prep time: None. Click to change".
- "ADMIT ONE" printed sideways at the far right (vertical text, 11px, 800, letter-spacing 0.34em), separated by a thin vertical rule. Decoration only (aria-hidden).
- Clicking a stub button opens the existing wooden settings panel from Stage 1 under the ticket, right-aligned with it, with its small arrow pointing at the stub. Everything about the panel stays as built in Stage 1 (one setting at a time, pick closes it, Custom shows the controls and Done, Esc and outside click close it, focus returns).
- Below the ticket, as now: Roll a new topic, Write your own, Speak freely, no topic.

## Phone layout

- The SpeakReview logo sits directly above the ticket (14px gap) and moves with it. Privacy stays fixed in the top right corner, above everything (keep it clickable).
- The logo, ticket and the buttons under it form one block that is vertically centered in the space between the top of the page and the top of the audience, so the empty space is shared above and below. On short phones the block simply moves up; it never overlaps the audience.
- Ticket: full width (left and right 22px gutters), main part on the left, punched-dot tear line, stub on the right (116px):
  - Main part: "TONIGHT'S SHOW" and the serial on one line, the type badge under it, the topic in Fraunces 600 22px (up to 4 lines), the hint in 11px.
  - Stub: RUNTIME and CURTAIN IN stacked, values in Fraunces 15px, "Speaking time" / "Prep time" in 11px. No "Admit one" on phone.
- Tapping a stub button opens the existing Stage 1 bottom sheet for that setting.

## Open mic night

When "Speak freely, no topic" is chosen, the ticket stays and reads:
- Label: "OPEN MIC NIGHT" instead of "TONIGHT'S SHOW", no type badge.
- Topic: "Speak on anything you like".
- Line under it: "No topic tonight. Talk about anything you like." (phone: "No topic tonight. Talk about anything.")
Rolling or writing a topic turns it back into "Tonight's show".

## Write your own

Typing a topic happens on the ticket: the topic area becomes the existing editable field (same id, 120 characters, Enter does not add a line), styled in the ticket's ink on the paper.

## Rules

- The topic roll animation stays, now inside the ticket.
- Locked (stub buttons disabled) while preparing, recording, uploading and during Intermission, like the Stage 1 tickets.
- Everything else from section 5 of DESIGN-NOTES-feature-set-2.md still applies.
