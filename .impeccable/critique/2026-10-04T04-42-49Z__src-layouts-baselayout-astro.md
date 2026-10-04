---
target: navigation and information architecture
total_score: 26
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 1
timestamp: 2026-10-04T04-42-49Z
slug: src-layouts-baselayout-astro
---
Method: dual-agent (A: 609155b6-457d-431e-81c2-0c4fe74419be · B: 5976414a-4d4e-46af-890f-abaf79aa479e)

## Overall impression

**The navigation has a sound structure. The main gap is the connection between lessons and reference sheets.** Keep the current visual identity and freely browsable families. Improve contextual links and lookup tools rather than add more top-level navigation or a prescribed learning path.

## Design specificity

The observatory treatment serves this product: the observation rail communicates location, the atlas chart groups mechanisms, and family pages start with familiar data structures. It is not a generic documentation template.

The deterministic scan found **99 advisory findings across 65 markup files: 96 type-size mismatches and 3 demo-radius mismatches**. Navigation-adjacent examples include `AtlasTerritory.astro:64,129`, `FooterNavigation.astro:58`, and `sheet.css:81,94`. These are token-consistency findings, not proof of an IA problem; the demo radii are outside this review.

Desktop and mobile browser inspection covered Home, Structures, G-counter, Reference atlas, and Multi-value registers. All sampled pages fit without horizontal overflow. Browser detector injection succeeded, but the browser was headless: **no user-visible overlay is available**. Its only finding was a non-navigation line-length issue on G-counter. The two assessments independently confirmed the glossary lookup gap; browser inspection also found small link targets and repeated contents landmarks.

## Design health: 26/36 - Good

Scores run from 0 (poor) to 4 (excellent). This score covers navigation and IA, not the demos or the whole site's accessibility.

| Heuristic | Score | Main finding |
|---|---:|---|
| Visibility of system status | 4 | Active section and breadcrumbs clearly show location. |
| Match with the real world | 3 | "Requires" overstates optional background. |
| User control and freedom | 3 | Home, ancestor, family, and lab-return links are available. |
| Consistency and standards | 2 | Background labels and lesson-to-reference links vary. |
| Error prevention | 4 | Unpublished destinations are not actionable links. |
| Recognition rather than recall | 2 | Mechanism discovery and glossary lookup need more visible support. |
| Flexibility and efficiency | 2 | Known-term lookup relies on scrolling or browser Find. |
| Aesthetic and minimalist design | 3 | Clear grouping; the footer is comprehensive but long. |
| Error recovery | n/a | Navigation failure states were not assessed. |
| Help and documentation | 3 | Summaries, local contents, and background links provide useful context. |
| **Total** | **26/36** | **Good foundation; targeted changes needed.** |

## What works

- **Orientation:** `Structures -> Counters -> G-counter` and `Reference atlas -> Structures -> Multi-value registers` make the hierarchy explicit. Ancestors remain links.
- **Two clear entry modes:** Home offers structure browsing and reference lookup without forcing a starting lesson. The four primary links remain visible on mobile.
- **Meaningful grouping:** Six structure families and four reference territories separate distinct purposes. Systems correctly remains a distinct "Inside the Atlas" section within the reference index.

## Priority issues

### 1. [P1] Lessons do not consistently expose their related reference sheets

**Evidence:** The shared lesson ending provides family and catalogue links, while only selected lessons add reference links manually (`src/components/StructureLessonLayout.astro:44-45`; `src/lib/structure-demo/structure-navigation.ts:82-101`).

**Why it matters:** A reader can understand the structure but must then work out which mechanism sheet explains it. This weakens the structure-first approach.

**Fix:** Give lessons a consistent, optional **Related reference sheets** block with one to three relevant links and a short reason to open each. Keep it separate from family navigation; do not call it "next." **Command:** `/impeccable shape`.

### 2. [P2] The glossary is harder to scan than it needs to be

**Evidence:** All **51 terms** appear in one alphabetical definition list, with no local jump index (`src/pages/glossary.astro:15-28`).

**Why it matters:** Returning readers know the term they want but still need to scroll or use browser Find, especially on mobile.

**Fix:** Add an alphabetical jump index for letters that contain entries. Search is not necessary at this size, and the 10-entry bibliography does not need the same treatment. **Command:** `/impeccable layout`.

### 3. [P2] "Requires" and "Background, if needed" make different promises

**Evidence:** The atlas index uses **Requires**, while sheets describe those links as optional background (`src/components/AtlasTerritory.astro:39-41`; `src/layouts/SheetLayout.astro:74-76`).

**Why it matters:** First-time readers can mistake useful background for a mandatory reading sequence.

**Fix:** Use **Helpful background** consistently unless a genuine prerequisite exists. **Command:** `/impeccable clarify`.

### 4. [P2] Secondary navigation misses the site's 44px touch-target goal

**Evidence:** The home/site-name link is about **33px** high; footer family-heading links are about **20px**; "Compare by need" links are about **21-23px** (`SiteHeader.astro:9`; `FooterNavigation.astro:25,82-85`; `structures/index.astro:22-26`). The primary links already reach 44px.

**Why it matters:** These useful shortcuts are less forgiving to tap. This is a mismatch with the site's stated target, not a blanket claim of WCAG failure.

**Fix:** Extend the clickable area without enlarging the typography or changing the layout model. **Command:** `/impeccable adapt`.

### 5. [P2] Repeated desktop contents landmarks have identical names

**Evidence:** The sampled reference sheet exposes two desktop navigation landmarks named **On this sheet**, each containing the same seven links (`src/layouts/SheetLayout.astro:79-89`).

**Why it matters:** Landmark navigation does not distinguish the opening contents from the continuation after the lab.

**Fix:** Keep the repeated navigation if it helps long-form reading, but give each landmark a distinct, meaningful name. **Command:** `/impeccable harden`.

## Cognitive load and reader journey

**Moderate avoidable load:** six of the eight checklist areas are sound: focus, grouping, hierarchy, one decision at a time, contextual choice counts, and progressive disclosure. The weak areas are glossary chunking and the recall needed to move from lessons to mechanisms.

The **43-link footer is not inherently overloaded**: it is grouped and follows the main content. It should remain a fallback sitemap, not compensate for missing contextual links.

- **Jordan, first-time reader:** Gets a clear start, then meets inconsistent guidance about related mechanisms and prerequisites.
- **Alex, returning reader:** Can reach Glossary immediately, but has no quick local route to a known term.
- **Casey, mobile reader:** Keeps full access and clear location; small secondary targets and long lookup lists add friction.

The emotional high point is clear orientation. The low point is having to return to an index after finishing a lesson to find the explanation behind its behavior.

## Minor observations

"Compare by need" covers only three of six families: complete it or rename it **Common starting points** (`structures/index.astro:22-27`). The atlas describes planned sheets although all eight current sheets are published (`atlas/index.astro:56`). The breadcrumb landmark label **Sheet position** should work for non-sheet pages too (`ObservationRail.astro:31`).

**No UI code changed.**
