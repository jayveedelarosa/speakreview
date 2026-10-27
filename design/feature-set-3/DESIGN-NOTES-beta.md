# Feature set 3, stage 5: Beta tools

Approved Oct 27. Boards (reference only, never deployed):
- `F19BetaStageLaptop.dc.html`, `F19BetaStagePhone.dc.html`: the Beta stamp, its first-visit light and its note (copies of the F11 Stage boards with the stamp added; only the stamp, its light and its note are new).
- `F19Rate.dc.html` with `look="line"`, shown in `F20LineLaptop.dc.html` and `F20LinePhone.dc.html`: the rating at the end of the coach's notes. Ignore the `color` and `meter` looks in that file (not chosen).

Copy looks into `styles.css` classes (the CSP allows no style attributes or inline scripts).

## 1. The Beta stamp

- Right after the "SpeakReview" name in the site header (laptop and phone, every view that shows the name).
- A small button reading "Beta": 22px tall, padding 0 7px, `border: 3px double #D9AE52`, radius 3px, transparent, text `#F0CF86`, 800 10px Manrope, letter spacing 0.22em, uppercase, turned -6deg, soft glow `0 0 10px rgba(217,174,82,0.25)`. At least a 44px tap area on phones (an invisible `::before`).
- **First-visit light:** a 10px red light on its top-right corner (`top: -6px; right: -6px`), `radial-gradient(circle at 40% 35%, #FFB0A0, #FF4A36 55%, #A3161E)`, 1px border `#3A0A0A`, gently pulsing glow (1.6s). Steady (no pulse) with reduced motion. It shows until the note has been opened once, then never again on that device (its own localStorage key, try/catch; if storage is blocked, it shows each visit until opened). `aria-hidden`; the button's name says "Beta, new note from the producer" while the light shows and "Beta. What this means" after.

## 2. The note from the producer

- Opens under the stamp. Same paper as Tonight's programme: cream gradient with faint ruled lines, brass pin at the top centre, turned -0.6deg, 300px wide (on phone, fully inside the screen with 18px sides), one ruled box (1.5px `#2A1A0E`).
- Text:
  - kicker "A note from the producer" (10px, 800, uppercase, `#7A1222`)
  - "SpeakReview is in beta." (Fraunces 600, 18px)
  - "It's free while it's being tested. Some things may change or break, and your feedback shapes what comes next." (12px, `#4A3423`)
  - bottom row: "Got it" (left, 600 13px `#5A4330`, underlined, closes) and "Share feedback" with an arrow (right, 800 13px `#7A1222`, underlined) opening the Google Form in a new tab (`rel="noopener"`).
- It's a dialog: focus moves in, Tab stays inside, Escape and a click outside close it, focus goes back to the stamp.
- **One paper note at a time:** opening the Beta note closes Tonight's programme and the Coming back note; opening either of those closes the Beta note.

## 3. The rating: "How was the coach tonight?"

- At the very end of the Coach's notes (after the last section), on laptop and phone, only for a speech that got real coaching (not for too-short speeches or "AI feedback unavailable").
- A box: 1px dashed `rgba(217,174,82,0.45)`, radius 12px, `rgba(0,0,0,0.25)` background, padding 14px 16px, centred.
- Title "How was the coach tonight?" (Fraunces 500, 18px, phone 16px, `#FFF6E3`). No line under it.
- Three buttons, wrapping on narrow screens: **Bravo!** (rose), **Polite clap** (clapping hands), **Boo** (tomato). Each: inline-flex, gap 6px, min height 44px, padding 0 14px, radius 999px, 1px border `rgba(217,174,82,0.6)`, transparent, text and icon `#F0CF86`, 700 13px. Icons are **thin gold line drawings** (`currentColor`, stroke 1.6) exactly as in `F19Rate` with `look="line"`, `aria-hidden`.
- After a tap the box shows: "Thanks for the review!" (same title style), "Your verdict: **Bravo!**" (12px `#BCA992`, answer in `#F0CF86`), and the link "Say more in a short form" (700 13px `#D9AE52`, underlined, min height 40px) opening the Google Form in a new tab. Announce the thanks politely to screen readers.
- One answer per speech: after a tap the buttons are replaced by the thanks. (The server keeps only the latest answer anyway, so a repeat can never count twice.)
- Saved on the device with that speech (in its Wall of Fame entry), so reopening the speech in Backstage shows the thanks state, not the question again.
- Sent to `POST /rating` with JSON `{"speech_id": "...", "rating": "bravo" | "clap" | "boo"}`. If sending fails (offline, 429, 5xx), keep the thanks state anyway and try once more after a few seconds; never show an error for this.

## 4. Device code

- On first use, the page makes a random code with `crypto.randomUUID()` and keeps it in localStorage (its own key, try/catch). If storage is blocked, it uses a new code for that visit only.
- It is sent as `device=<code>` with every `GET /upload-url` request, nothing else. It is never tied to a name or anything typed.

## 5. Privacy note

Add, in the site's own plain wording (no "we", no em dashes), that:
- each upload sends a random code made by this browser, used only to count how many people come back; it isn't linked to a name, and clearing site data resets it;
- the "How was the coach tonight?" answer is saved with that speech's results and deleted with them after 30 days;
- the Beta feedback form is run by Google Forms, separately from SpeakReview, and asks for no name or email.
