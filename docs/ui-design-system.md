# UI Design System

## Editorial direction

The prototype treats each piece of copy as reading material rather than a database row. The visual language borrows from a quiet editorial desk: warm paper surfaces, dark ink, measured rules, one desaturated taupe accent, and generous space around text. It deliberately avoids gradients, glass effects, neon color, decorative dashboards, and ambient motion.

## Foundations

| Variable | Value | Use |
| --- | --- | --- |
| Paper | `#f3efe7` | Application background |
| Deep paper | `#e9e3d8` | Quiet grouping and progress tracks |
| Surface | `#fbf9f4` | Reading cards and working surfaces |
| Ink | `#252521` | Primary text and decisive controls |
| Soft ink | `#62615b` | Supporting copy |
| Taupe accent | `#76685b` | Selection, progress, and restrained emphasis |
| Risk | `#884d45` | Blocked or unsafe content only |
| Success | `#53675b` | Confirmed states only |

Chinese reading text uses the local Song-style serif stack. Navigation, metadata, form controls, and measurements use the local system sans-serif stack. No external font or media asset is bundled.

## Type hierarchy

- Page display: 27–43 px serif, short line length, regular weight.
- Section title: 19–21 px serif.
- Reading copy: 18–24 px serif at 1.8–2.0 line height.
- Interface copy: 10–13 px sans-serif.
- Editorial metadata: 8–10 px sans-serif with restrained tracking.

Long text is never made illegibly small. List previews may clamp or ellipsize when the full text remains available in the next reading surface. Editor and review details preserve the complete text and expose length or capacity warnings.

## Components

- Primary buttons use dark ink and are reserved for one decisive action per surface.
- Secondary buttons use paper surfaces and thin rules.
- Status pills combine plain-language labels with borders; color is never the only signal.
- Content cards prioritize sentence rhythm, source context, and the next editorial action.
- Loading panels use low-contrast skeleton rules and an accessible busy announcement.
- Empty and error states explain both what happened and the safest next action.
- Blocked notices sit next to the disabled action and state the exact policy or prerequisite.

Keyboard focus uses a two-pixel taupe outline with an offset. Motion is limited to functional loading and preview progress, and reduced-motion preferences shorten all transitions and animations.

## Layout behavior

| Viewport | Behavior |
| --- | --- |
| 1440 px | Persistent editorial navigation, four-column dashboard metrics, full studio rails and canvas |
| 1024 px | Narrower navigation and rails; reading type remains unchanged; canvas keeps priority |
| 768 px | Drawer navigation, two-column content where useful, studio properties move below the canvas |
| 390 px | Single-column browsing and basic review; tables become cards; studio exposes template choice, preview, and a desktop editing notice |

The fixed video studio contains only three templates: 留白字幕, 电影独白, and 夜色情绪. Their visual backgrounds are CSS-authored abstractions and contain no external images, music, footage, or fonts.
