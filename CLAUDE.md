# SpeakReview project rules

## Structure and deploy
- Website files live in `site/` (`site/index.html`, `site/css/styles.css`, `site/js/app.js`).
- Speech topics live in `site/js/topics.js` (global `TOPICS` array).
- GitHub Actions (`.github/workflows/deploy.yml`) deploys them with `aws s3 sync` whenever `site/**` changes.
- The approved design lives in design/ (reference only, never deployed). Follow design/DESIGN-NOTES.md for any visual change.

## Do not change unless asked
- `API_BASE`, AWS names, bucket names and the IAM role ARN.

## Security
- Every value from the API or typed by a user must go through `escapeHtml()` before being put into HTML.
- Topic text is user input (typed or returned by the API), so always escape it.
- Prefer `textContent` over `innerHTML`.
- Limits enforced on the page (file size, duration, etc.) must also be enforced on the server. The page checks are only for convenience.
- Wall of Fame data in localStorage is untrusted when read back: validate it and always escape it.
- The site runs under a strict Content Security Policy: no inline scripts, no inline event handlers, no style attributes (use classes or element.style.setProperty), no eval. The Content-Security-Policy and Permissions-Policy headers are added by the CloudFront Function `SpeakReviewSecurityHeaders` (viewer response, Default behavior on distribution `EF3O4X1L9YG15`), not by a response headers policy, because the CloudFront Free plan doesn't allow custom header policies. Any new external origin must be added to that function's code, then saved and published.

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
