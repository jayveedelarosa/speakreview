# Feature set 3, stage 6: icon and share preview

Approved Nov 1. Boards (reference only, never deployed):
- `F21Icon.dc.html` with `kind="bubbleshape"`, shown in `F21IconsShapes.dc.html` (column N): the site icon.
- `F22Share.dc.html` with `kind="split"`, shown in `F22ShareSplit.dc.html`: the share preview picture (1200x630).
Ignore every other `kind` in those two files (not chosen).

## 1. The icon: "Speech bubble"

The icon is its own shape, not a square: a burgundy speech bubble with a gold edge and the logo's four gold bars, transparent around it. The drawing is the `bubbleshape` SVG in `F21Icon.dc.html` (viewBox 0 0 64 64). Copy it exactly.

Files to make (all in `site/`):
- `favicon.svg`: the bubble, transparent background. The main browser tab icon.
- `favicon.ico`: 16, 32 and 48 px versions in one file, transparent background (for older browsers and some bookmark menus).
- `apple-touch-icon.png`: 180x180. iPhones don't allow see-through icons, so put the bubble centred on a `#1A0B0A` square, about 75% of the width.
- `icon-192.png` and `icon-512.png`: for Android "Add to home screen", the bubble centred on `#1A0B0A`, about 70% of the width so nothing (the tail and the corners included) is cut off when Android puts it on a round tile ("maskable" safe zone).
- `manifest.json` (not `.webmanifest`, so S3 serves it with a normal content type): name "SpeakReview", short_name "SpeakReview", start_url "/", display "browser", background_color and theme_color `#1A0B0A`, the two Android icons (the 512 one also as `"purpose": "maskable"`).

In `<head>`: links for all of the above, plus `<meta name="theme-color" content="#1A0B0A">`.

At 16px the bubble outline must stay readable on both a light and a dark browser tab (the gold edge does this). Check it.

## 2. The share preview picture

- `site/og-image.png`, exactly 1200x630, matching `F22Share` `kind="split"`:
  - Left half (600px), dark `#1A0B0A` with a faint red glow in the top-left corner:
    - a small logo row: the four gold bars (26px), "SpeakReview" (Fraunces 600, 30px, "Review" in gold) and the BETA stamp (double gold border, 11px text, turned -6deg);
    - the headline "Practice your speech with an AI coach." (Fraunces 600, 66px, `#FFF6E3`, line height 1.06). This must be the first thing people read;
    - three lines with gold ticks (27px, 600, `#F1E2CC`): "Record or upload a speech", "Get notes from your coach", "Replay it, word by word".
  - Right half: the Stage. Red curtains at both sides with gold inner edges, a warm spotlight from above, the wooden floor along the bottom (150px), and **the site's own mic drawing** (the same SVG as `#micBtn` in index.html) standing on the floor, about 240px wide, with the gold glow and the floor shadow.
- Make it from an HTML page rendered with the test tools' Chrome at 1200x630 and saved as PNG. Keep the source page under `design/feature-set-3/` (never deployed) so it can be remade later. Keep the PNG under 600 KB.

## 3. The words around it (in `<head>`)

- `<title>`: SpeakReview: practice your speech with an AI coach
- `<meta name="description">`: Record or upload a speech and get coach's notes, a word-by-word replay and a nightly review. Free while in beta.
- Open Graph: `og:type` website, `og:site_name` SpeakReview, `og:url` https://speakreview.jayveedelarosa.dev/, `og:title` and `og:description` the same as above, `og:image` https://speakreview.jayveedelarosa.dev/og-image.png (full address), `og:image:width` 1200, `og:image:height` 630, `og:image:alt` "SpeakReview: practice your speech with an AI coach. A microphone on a theatre stage."
- Twitter/X: `twitter:card` summary_large_image, plus `twitter:title`, `twitter:description`, `twitter:image` and `twitter:image:alt` with the same values.
- Replace the old title, description and og tags; don't leave duplicates.
