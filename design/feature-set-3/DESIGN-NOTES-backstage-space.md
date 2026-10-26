# Feature set 3, stage 4 update 2: more room in Backstage

Approved Oct 26 after testing the shorter radio on laptop and Android. Adds to `DESIGN-NOTES-playback.md` and `DESIGN-NOTES-playback-update.md` (where they disagree, this file wins). The radio itself does not change.

Boards (reference only, never deployed):
- `F18SpacePhone.dc.html`, `F18SpacePhoneNotes.dc.html`, `F18SpacePhoneReview.dc.html`: phone, the same design on all three tabs. They show `F13WordsPhone` with `skin="compactH3"` (only the parts behind `h3`, `fullHeadNew`, `wordsTab`, `notesTab` and `reviewTab` matter; the transcript is the sample repeated so there is something to scroll).
- `F18SpaceLaptop.dc.html`: laptop, the one-line legend (`F13WordsLaptop` with `skin="compactH3"`).

## Why

On a phone, "Tonight's performance" (about 300px) plus the tabs, radio and legend left the transcript about 2 lines. On a laptop the legend was a little too wide, so the "i" fell onto its own line.

## 1. Phone: the header scrolls away (single-column Backstage, below 990px)

Applies to all three tabs (Notes, Your words, Review), so the tabs always sit in the same place.

- **Header unchanged except one line:** "Tonight's performance" keeps its full design on every tab (time, untimed or over/under, the source tag, the big numbers, the clarity bar). Only the 3-line "How clearly your words came through" under Clarity is removed in this layout. The laptop two-column layout keeps it.
- **One scrolling area:** the header, the tab bar and the tab's content scroll together inside the mirror. "Back to the stage" and "Try this topic again" stay fixed at the bottom, outside it, as now.
- **Sticky block:** when the header has scrolled away, the tab bar sticks to the top of the scrolling area. On Your words, the radio and the legend row (with the "i") stick together with it, right under the tabs. The rest (the transcript, the notes, the review) scrolls underneath.
  - The sticky block has the panel's background (`#1E0F0C`) so text never shows through, and a soft shadow under it: `0 10px 10px -8px rgba(0,0,0,0.7)`.
  - With no recording (no radio), only the tabs and the legend stick.
- **Switching tabs never moves the tabs:** if the header has scrolled away, the new tab opens with the header still away (scroll position = the smaller of the current position and the header's height). If the header is showing, it stays showing.
- **Auto-scroll while playing** uses this same scrolling area and keeps the gold box visible below the sticky block (treat the sticky block's height as the top margin). Scrolling by hand still pauses auto-scroll, as before.
- **The "i" card** opens over the content below the sticky block and is never hidden behind it.
- **Nothing else moves:** the scrollbar stays hidden (as on the rest of the site), and "Scroll for more" / the top fades keep working on this scrolling area.

## 2. Laptop: the legend on one line

- Use the phone's shorter legend labels on laptop too: "Filler 5", "As filler 6", "Pause 1", "Unclear 1" (number after a space, no comma), with gaps of 6px 12px.
- The "i" button then stays at the end of the same row at 1280x800 and at 1093x526 (1366x657 at 125%).
- Nothing else on laptop changes.
