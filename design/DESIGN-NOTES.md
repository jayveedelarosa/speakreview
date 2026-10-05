# SpeakReview Theatre Design Notes

This folder is the approved design for SpeakReview. It is a reference only and is never deployed (only `site/` is deployed).

- `theatre-laptop.dc.html`: the laptop design (Stage, recording state, Intermission, Backstage, Wall of Fame), approved.
- `theatre-phone.dc.html`: the phone design ("Phone v2"), approved. The `screen` prop switches between `stage`, `backstage` and `wall`.

These files were made in a design tool. They use a small templating runtime (`support.js`, `<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`, `class Component extends DCLogic`). Do NOT copy that runtime or its syntax into the site. Read them only for layout, sizes, colors, SVG shapes, text and behavior, and rebuild them in plain HTML, CSS and JavaScript. All sample text in them (feedback, history entries, numbers) is placeholder content.

## Concept

The app is a theatre.
- **Stage** (practice): red velvet curtains frame the sides, a warm gold spotlight shines from the top, a seated audience sits in rows across the back of the stage, and a wooden stage floor runs along the bottom. The topic is the hero, large and centered.
- **Backstage** (your feedback): a dressing room mirror framed in warm wood and lined with glowing bulbs. The speech summary is on the left, Coach's notes on the right.
- **Wall of Fame** (past performances): framed playbills hanging on a red wall, plus a trophy shelf. Built in a later stage.
- **Intermission**: while the AI works, the curtains close and an "Intermission" screen shows.

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

## Fonts (Google Fonts)

- **Fraunces** (500 and 600): logo, topic, big headings, big numbers.
- **Manrope** (400 to 800): everything else.
- **JetBrains Mono** (500 and 600): times and the stopwatch.

## Shapes to copy exactly from the design files

- **Seated audience**: the `<svg>` with red seat backs and dark heads and shoulders, three rows, sitting across the back of the stage. Its bottom edge sits exactly on the top edge of the wooden floor. Nothing in it touches the floor. Copy the SVG markup as it is.
- **Curtains**: side curtains with rounded tied-back bottoms (`border-bottom-*-radius: 136px 300px` on laptop), the top valance with a gold bottom border, the scalloped edge under it, and the two gold tiebacks.
- **Mic** (Stage 3 only): the chrome stage mic SVG on a stand.
- **Bulbs, mirror, playbills, trophies, medals**: as drawn.

## Layout

Laptop: content centered between the curtains (about 200px in from each side at 1280px wide). From top to bottom: header (logo left, menu right), topic row (label, type badge, hint), the big topic, topic buttons, the settings strip (thin lines above and below, columns split by thin vertical lines), the audience band, the main action standing on the stage floor, and the text under it.

Phone (about 390 by 780): curtains become thin strips at the sides, the top valance stays, the menu becomes a bottom tab bar (Stage, Backstage, Wall of Fame with icons). The Stage screen must fit on one screen with no page scrolling on a typical Android phone. Backstage: the page does not scroll, only the Coach's notes scroll inside the mirror. Wall of Fame: only the frames area scrolls.

Stage layout rules (laptop and phone):
- **Privacy**: behind a "Privacy" link with a small lock icon at the top right on all screens (laptop: in the header, right of the menu). It is a quiet, muted button, not a menu item, and brightens on hover and focus. It opens a small panel right under it with the privacy note; the panel closes on a second click, a click outside it, or Escape (focus returns to the link).
- **Main action**: always stacked and centered on the wooden floor: "Your turn on stage", the line under it, the Upload button, then the file name and length line, "Begin the performance", the status and the wait note. The floor grows to hold it. It never overlaps the audience.
- **Audience**: always fully between the bottom of the settings strip (with a small gap) and the top of the floor. On shorter windows and when zoomed in it scales down proportionally to fit that space, down to about 70 percent of its normal height. If there is still not enough room, the stage grows and the page scrolls (scrollbar hidden). No button, label, line or text ever sits on top of it.

## Rules

- **No visible scrollbars anywhere.** Scrolling areas scroll by swiping or the mouse wheel, hide the scrollbar (`scrollbar-width: none` and `::-webkit-scrollbar { display: none }`), and show a soft fade at the bottom edge so people know there is more.
- **Reduced motion:** when `prefers-reduced-motion: reduce` is on, skip every animation (curtains switch instantly, no topic roll, bulbs stay lit, no spotlight fade).
- **Bulbs:** alternate softly (odd and even bulbs fade between full and 35 percent brightness, about one change per second), for 3 cycles when Backstage opens, then stay fully lit. Never fully off, never fast.
- **Touch targets:** buttons at least 34px tall on phones with at least 8px between them; 44px on laptop where space allows.
- **Text over the wood floor** gets a soft dark text shadow so it stays readable.
- **Accessibility:** real `<button>` elements, visible focus outlines, labels on inputs, `aria-live` on status text, screen readers hear only the final topic after a roll.
- **Time status colors:** green with "under" or "on time", orange with "over". Color is never the only signal.

## What gets built when

| Stage | Adds |
| --- | --- |
| Theatre redesign | Stage screen (topic, speaking time, upload in the mic's spot), Backstage with Coach's notes, curtain transitions, Intermission, phone layout. Wall of Fame tab hidden. Prep time and stopwatch controls hidden. |
| Stage 3 | The mic replaces the upload button as the main action (upload moves under it), ON AIR light, live sound wave, stopwatch, prep time. |
| Stage 4 | Wall of Fame tab, playbills, trophy shelf. |
