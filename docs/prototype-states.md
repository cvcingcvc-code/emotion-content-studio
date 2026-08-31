# Prototype UI State Matrix

## How to exercise states

Every primary page must make its non-happy paths visible during review. The prototype may expose a development-only state switcher or deterministic query parameter such as `?state=empty`, `?state=loading`, `?state=error`, `?state=long`, or `?state=blocked`. These controls are for visual verification only and must not imply production persistence.

State transitions must keep the page shell stable. Loading and localized errors should not erase navigation or unrelated content.

## Shared state language

| State | Presentation rule | Required action |
| --- | --- | --- |
| Normal | Realistic synthetic content with one clear primary action | Continue the intended flow |
| Empty | Explain why the view is empty and what creates the first item | Provide one direct next step |
| Loading | Preserve layout with restrained skeletons or progress copy | Do not show invented precise progress |
| Error | State what failed and whether existing work is safe | Offer retry or a corrective action |
| Long copy | Preserve full text in the detailed reading surface | Warn about capacity; never silently truncate saved text |
| Blocked | Explain the policy or prerequisite preventing the action | Disable the action and link to the resolution step |

Risk and status are never communicated by color alone. Labels use plain language and, where helpful, a restrained icon.

## Page matrix

### 1. Dashboard

| State | Expected behavior |
| --- | --- |
| Normal | Show review count, usable inspirations, draft count, and progress toward 20–30 test exports. Recent work links to its next meaningful action. |
| Empty | Replace metrics with an editorial welcome and a button leading to CSV Import. |
| Loading | Use fixed-height metric and card skeletons; keep the main navigation interactive. |
| Error | Isolate the failed summary panel and retain any successfully loaded panels. |
| Long copy | Recent cards clamp their preview visually and expose the full text through the editor route. |
| Blocked | Export progress remains visible, while restricted records show why they cannot contribute to the total. |

### 2. CSV Import

| State | Expected behavior |
| --- | --- |
| Normal | Present a staged upload, source metadata, authorization choice, preview, and simulated import confirmation. |
| Empty | Show a concise `text` column example and an accessible file-selection control. |
| Loading | Announce the current simulated validation stage and keep the user-provided source fields visible. |
| Error | Distinguish file, missing-field, and row-level failures; explain that no accepted source content was lost. |
| Long copy | Expand a row in place for reading while keeping preview columns aligned. |
| Blocked | Disable confirmation when authorization is `prohibited` or required source information is missing; explain the reason next to the control. |

### 3. Review Inbox

| State | Expected behavior |
| --- | --- |
| Normal | Use a reading-first split view with restrained filters and approve, reject, needs-edit, and reference-only actions. |
| Empty | Confirm that the inbox is clear and link to Import or the Inspiration Library. |
| Loading | Skeletonize both list and reading pane without shifting their widths. |
| Error | Retain the selected item when an action fails and offer retry without advancing the queue. |
| Long copy | Use a comfortable reading measure, section folding, and sticky decision controls. |
| Blocked | Hide approval for prohibited content; privacy or authorization warnings remain adjacent to the decision area. |

### 4. Inspiration Library

| State | Expected behavior |
| --- | --- |
| Normal | Show reading-oriented cards with theme, scenario, platform fit, favorite, edit, and studio actions. |
| Empty | Explain whether the library itself is empty or filters returned no matches; offer the appropriate reset or review action. |
| Loading | Preserve the responsive card grid with quiet card skeletons. |
| Error | Keep filter selections and allow a data reload. |
| Long copy | Use a considered preview with a clear continuation rather than shrinking typography. |
| Blocked | Reference-only cards, when explicitly shown, have no studio action and include a concise usage restriction. |

### 5. Copy Editor

| State | Expected behavior |
| --- | --- |
| Normal | Show source insight, editable draft, version choices, tone/length/platform controls, safety result, and separate save and confirm actions. |
| Empty | Prompt the user to select an approved inspiration and link back to the library. |
| Loading | Keep the current version editable while a simulated new version is being prepared. |
| Error | Preserve every typed character, explain the failed simulated operation, and allow retry. |
| Long copy | Show character count and estimated video capacity; suggest shortening without changing the text automatically. |
| Blocked | High similarity risk, missing human acknowledgement, or restricted authorization disables confirmation with a specific explanation. |

### 6. Three-template Video Studio

| State | Expected behavior |
| --- | --- |
| Normal | Display material rail, 9:16 preview canvas, and property rail with the three fixed templates: 留白字幕, 电影独白, and 夜色情绪. |
| Empty | Explain that a confirmed draft is required and link to the editor or library. |
| Loading | Keep project controls visible while the canvas shows a restrained simulated-preview state. |
| Error | Preserve template and property selections and offer preview retry. |
| Long copy | Flag overflow both on the canvas and in properties; do not reduce text below the legible template minimum. |
| Blocked | Disable simulated export for unconfirmed copy or restricted material and identify the exact prerequisite. |

At 390px, replace the three-column editor with a read-only canvas summary and basic actions. A clear desktop notice explains that template property editing requires a larger viewport.

### 7. Export Records

| State | Expected behavior |
| --- | --- |
| Normal | Show successful, processing, and failed simulated records with template, date, and context-appropriate actions. |
| Empty | Explain that confirmed studio projects create records and link to the library. |
| Loading | Keep column headers or card labels stable while rows load. |
| Error | Allow a failed simulated record to retry without duplicating the row. |
| Long copy | Use a compact title preview and provide full copy in the record detail. |
| Blocked | Restricted material has no download simulation and includes the authorization reason. |

## Responsive verification

### 1440px

- Full navigation and editorial spacing.
- Dashboard cards may share a row.
- Inbox uses list plus reading pane.
- Studio uses material rail, 9:16 canvas, and property rail simultaneously.

### 1024px

- Reduce outer margins without reducing reading type.
- Inbox list narrows but remains visible with the reading pane.
- Studio rails narrow and use grouped controls; the canvas remains the visual priority.

### 768px

- Navigation becomes compact.
- Two-column areas stack or use a selectable drawer.
- Dashboard and library use one or two columns based on content width.
- Studio may switch rails into tabs while preserving the 9:16 canvas.

### 390px

- Core browsing, favoriting, basic review, and navigation remain usable.
- Controls meet a minimum 44px touch target where possible.
- Tables become semantic cards; horizontal page scrolling is not permitted.
- The studio is a preview and basic-action surface, not a full editor.
- Long copy remains readable at normal size and never forces the page wider than the viewport.

## Accessibility checks

- Keyboard focus is visible and follows reading order.
- Dialogs return focus to their trigger.
- Loading and error messages use appropriate live-region behavior.
- Disabled actions remain discoverable with a nearby textual reason.
- Text and interactive controls meet WCAG AA contrast targets.
- Motion is minimal and respects reduced-motion preferences.
