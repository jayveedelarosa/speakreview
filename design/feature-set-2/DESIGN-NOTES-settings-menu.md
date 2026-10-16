# Settings menu and topic buttons: approved design notes

Approved by Jayvee on Oct 16, 2026. This adds to DESIGN-NOTES-topic-ticket.md. The ticket itself does not change.

The approved look is the "dressed" option in F4StageLaptop.dc.html and F4StagePhone.dc.html (the prop `panel: "dressed"`). The "plain" option is how the site looks today. As always, never copy the design tool's runtime (support.js, x-dc, {{...}}, sc-if, sc-for, dc-import, DCLogic); rebuild in plain HTML, CSS and JavaScript and copy exact colors and sizes.

## 1. New wording (laptop panel and phone sheet)

- Speaking time line: "How long your speech should last. Going over is fine."
- Prep time line: "Thinking time before recording starts."
- Remove the bottom line completely ("Picking one closes this. Remembered on this device for next time." on laptop, "Remembered on this device for next time." on phone). Saving still works exactly as before; the menu just doesn't say so.

## 2. Dressed settings panel (laptop) and sheet (phone)

Same layout, same behaviour, same buttons as Stage 1. Only the look changes:

- Small label above the title: "RUNTIME" when Speaking time is open, "CURTAIN IN" when Prep time is open. 11px, weight 800, letter-spacing 0.24em, uppercase, color #D9AE52. Decoration only (aria-hidden), the title stays the dialog's name.
- Border: `3px double #C9A24E`. Laptop corner radius 10px. Phone sheet: the border on top, left and right only (no bottom), radius 18px 18px 0 0. The phone drag handle stays.
- Background (a soft spotlight from the top on warm wood):
  `radial-gradient(ellipse 80% 70% at 50% 0%, rgba(255,205,130,0.16), transparent 70%), repeating-linear-gradient(90deg, transparent 0 30px, rgba(0,0,0,0.12) 30px 31px), linear-gradient(180deg, #4A2914, #26130A)`
  On phone the stripe spacing is 26px / 27px instead of 30px / 31px.
- Laptop arrow (the little point toward the stub): 13px square, background #4A2914, left and top borders `3px double #C9A24E`, 9px above the panel.
- Gold divider between the help line and the choices: a 1px line fading in from the left, a 6px gold (#D9AE52) diamond (a square turned 45deg), and a 1px line fading out to the right, 8px gaps. Decoration only (aria-hidden).
- Choice buttons: corners 6px instead of fully round.
  - Not picked: `1px dashed rgba(217,174,82,0.6)` border, background rgba(0,0,0,0.18), text #F3E6D0, weight 600.
  - Picked: solid #D9AE52 background and border, text #1E1006, weight 800 (as now).
  - The Custom controls and the Done button keep their behaviour; give Done the same 6px corners so it matches.

## 3. Dressed topic buttons (under the ticket)

The order of importance stays: Roll a new topic is the one main button, the other two are lighter text buttons.

- Roll a new topic: corners 6px, border `3px double #C9A24E`, background `radial-gradient(ellipse 80% 90% at 50% 0%, rgba(255,205,130,0.16), transparent 70%), rgba(217,174,82,0.12)`. Text, icon, size and color stay as now.
- Write your own: keeps its pen icon on laptop and gets the same pen icon on phone (13px). Dashed gold underline: `text-decoration: underline dashed; text-decoration-thickness: 1px; text-underline-offset: 5px; text-decoration-color: rgba(217,174,82,0.65)`.
- Speak freely, no topic: a small microphone icon in front (15px laptop, 13px phone, same stroke style as the other icons, aria-hidden), and the same dashed gold underline. Keep its current text on laptop and phone.
- Keep the current hover, keyboard focus, disabled and locked states.

## Rules

- Text contrast stays at least 4.5:1, focus rings stay visible.
- No change to the ticket, the stub buttons, the curtains, the crowd or the mic.
- Everything in section 5 of DESIGN-NOTES-feature-set-2.md still applies (strict security rules: no inline styles or scripts).
