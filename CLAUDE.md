# SpeakReview project rules

## Structure and deploy
- Website files live in `site/` (`site/index.html`, `site/css/styles.css`, `site/js/app.js`).
- GitHub Actions (`.github/workflows/deploy.yml`) deploys them with `aws s3 sync` whenever `site/**` changes.

## Do not change unless asked
- `API_BASE`, AWS names, bucket names and the IAM role ARN.

## Security
- Every value from the API or typed by a user must go through `escapeHtml()` before being put into HTML.
- Prefer `textContent` over `innerHTML`.
- Limits enforced on the page (file size, duration, etc.) must also be enforced on the server. The page checks are only for convenience.

## Code style
- Plain HTML, CSS and JavaScript only. No frameworks, build tools or modules (`type="module"`).
- `displayResult()` and `escapeHtml()` stay global functions so they can be called from the browser console.

## Visible text
- Use a neutral point of view (no "we").
- Never use em dashes.

## Workflow
- Always show a plan with line numbers before editing.
- Make one commit per change.
- Never push.
