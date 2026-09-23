# Chart Creation Tool — Web Application Handoff Inventory

## 1. Scope and evidence

This inventory was derived from the two supplied RTF files. The attachments named `maincode.rtf` and `sidebar.rtf` are byte-for-byte identical and both contain the sidebar HTML/JavaScript. No separate Google Apps Script backend/chart-rendering implementation was supplied.

Consequently:

- **UI-wired** means the control is present in the sidebar and its value is collected into the update/export state.
- **Latent** means code and controls exist, but the feature is not reachable through the normal purpose-selection flow.
- **Dormant** means state/code references exist, but the required control is hidden, missing, or excluded from the allowed chart list.
- Actual Google Sheets chart generation, calculation rules, and visual output still require verification against the backend code.

## 2. Product model at a glance

The application is organized around an analytical **purpose**, with one or more chart types and purpose-specific enhancement controls.

| Purpose | User question | Data schema in state | Status |
|---|---|---|---|
| Trend / Show Trends | How is a measure changing over time? | `MATRIX_TIME_SERIES` | UI-wired |
| Comparison / Compare Values | How do categories or selected targets differ or rank? | `MATRIX_TIME_SERIES` | UI-wired |
| Composition / Show Composition | How large is each segment, and what share does it represent? | `MEKKO` | UI-wired |
| Contribution / Explain Change Drivers | What caused the movement from a starting value to an ending value? | `DRIVER_BRIDGE` | UI-wired |
| Relationship / Show Relationships | How are two measures related, and are there clusters or quadrants? | `BUBBLE` | UI-wired, potentially access-gated |
| Evaluate / Evaluate Performance | How do items perform across several metrics? | `EVALUATION` | **Latent:** feature code exists, but the purpose is omitted from the normal purpose selectors/start cards |

## 3. Chart and enhancement matrix

| Purpose | Chart type | Intended use / insight | Chart and data controls | Visual / insight enhancements | UI status |
|---|---|---|---|---|---|
| Trend | **Line** | Show direction, velocity, turning points, and patterns over time | Normal/swapped axis; select X-axis items; select series | Highlight one series; gridlines Off/Light/On; data labels Off/All; line markers On/Off | UI-wired |
| Trend | **Bar** | Compare time periods or ordered categories when horizontal labels are easier to read | Normal/swapped axis; select X-axis items; select series | Highlight; gridlines; data labels | UI-wired |
| Trend | **Column** | Compare values across time periods or categories with vertical bars | Normal/swapped axis; select X-axis items; select series | Highlight; gridlines; data labels | UI-wired |
| Comparison | **Bar** | Rank categories for one selected comparison target | Select comparison target; rank ascending/descending; normal/swapped axis; item/series selection | Highlight; gridlines; data labels | UI-wired |
| Comparison | **Column** | Compare category magnitudes for one selected target | Select comparison target; rank ascending/descending; normal/swapped axis; item/series selection | Highlight; gridlines; data labels | UI-wired |
| Comparison | **Clustered Column** | Compare two targets side by side across categories | Base target; comparison target; variance sort; normal/swapped axis; item/series selection | Difference labels On/Off; highlight; gridlines; data labels | UI-wired |
| Comparison | **Variance Bar** | Emphasize the absolute difference between a base and comparison target | Base target; comparison target; variance sort; normal/swapped axis; item/series selection | Difference labels On/Off; highlight; gridlines; data labels | UI-wired |
| Composition | **Mekko** | Show both segment share and total/category size in one view | Select items and series/metrics; axis fixed to Normal | Highlight; labels as % only, absolute + %, absolute only, or none | UI-wired |
| Contribution | **Waterfall** | Explain how positive and negative drivers bridge Start to End | Driver sort; include/exclude zero values; end mismatch handling | Value labels; connectors; gridlines; positive/negative color mode; number format | UI-wired |
| Contribution | **Driver Bar** | Rank drivers by impact and direction | Driver sort: impact descending/ascending, input order, positive first, negative first, custom order; include/exclude zero values; mismatch handling | Value labels; gridlines; positive/negative color mode; number format | UI-wired |
| Contribution | **Positive / Negative Bar** | Separate or compare positive and negative contributors | Driver sort; include/exclude zero values; mismatch handling | Value labels; gridlines; positive/negative color mode; number format | UI-wired |
| Relationship | **Scatter** | Show correlation, clusters, and outliers between two measures | Select labels and measures; normal/swapped axis | Data labels; highlight; gridlines; optional quadrants; X/Y split by median, average, or manual value | UI-wired |
| Relationship | **Bubble** | Show X/Y relationship with a third measure encoded as bubble size | Select labels and measures; normal/swapped axis; bubble sizing Auto/Fixed Scale | Data labels; highlight; gridlines; optional quadrants; X/Y split by median, average, or manual value | UI-wired |
| Relationship | **Scatter + Quadrants** | Classify points into four strategic segments | Intended X/Y split controls | Intended quadrant display/labels | **Dormant/inconsistent:** checkbox and state field exist, but this type is excluded from the allowed Relationship chart list and cannot be exported through the current logic |
| Evaluate | **Heatmap** | Scan strengths, weaknesses, and patterns across an item-by-metric matrix | Select items and metrics; axis fixed to Normal | Color scaling by column, row, or whole table; higher/lower-is-better direction; show values; gridlines; item sorting; number format | **Latent** |
| Evaluate | **Small Multiple Bars** | Compare each metric in its own compact bar panel | Select items and metrics; sort items; sort within each metric | Horizontal/vertical orientation; show values; gridlines; number format | **Latent** |
| Evaluate | **Metric Leaderboard** | Rank items across metrics for fast best/worst identification | Select items and metrics; sort items; sort within metric | Higher/lower-is-better direction; show values; number format | **Latent** |

### Chart count

- **14 chart types are included in the active purpose-to-chart mapping.**
- **1 additional type, Scatter + Quadrants, is present in UI/state code but is not reachable.**
- The three Evaluate chart types are mapped in code but the Evaluate purpose itself is not reachable from the normal user flow.

## 4. Enhancement control inventory

### Shared metadata and data selection

| Control | Purpose |
|---|---|
| Title, subtitle, source | Add presentation context and attribution |
| Unit | Format or contextualize measures; collected globally and through a hidden Relationship-specific field |
| Axis direction | Use rows or columns as the X axis; disabled for Mekko and Evaluate |
| Item and series/metric filters | Limit which categories, periods, labels, series, or metrics appear |
| Highlight target | Visually emphasize a selected series/item |
| Gridlines | Reduce clutter or improve value tracing; general choices are Off, Light, On |
| Data labels | Show or suppress point/bar values |

### Comparison-specific

| Control | Options | Insight enabled |
|---|---|---|
| Comparison target | Data-driven list | Choose the target used for a one-target ranking/comparison |
| Rank sort | Descending / Ascending | Surface top or bottom performers |
| Base target + comparison target | Data-driven lists | Define the two endpoints for variance analysis |
| Variance sort | Descending / Ascending | Prioritize largest positive or negative gaps |
| Difference labels | On / Off | Make deltas explicit on Clustered Column and Variance Bar |

### Composition-specific

| Control | Options | Insight enabled |
|---|---|---|
| Mekko labels | % only; Absolute (%); Absolute only; None | Balance share-of-total insight against precise values and visual density |

### Contribution-specific

| Control | Options | Insight enabled |
|---|---|---|
| Driver sort | Impact descending/ascending; input order; positive first; negative first; custom order | Prioritize the most material or directionally relevant causes |
| Show zero values | On / Off | Include or remove non-contributing drivers |
| End mismatch handling | Add adjustment item / Auto-fix End | Reconcile a bridge whose drivers do not sum to the stated ending value |
| Value labels | On / Off | Show exact driver impact |
| Connectors | On / Off | Make the Waterfall bridge sequence easier to follow |
| Positive/negative color | Default / Monochrome / High Contrast | Reinforce direction or support accessibility/presentation style |
| Number format | Auto / Raw / K / M / % | Improve scale readability |

### Relationship-specific

| Control | Options | Insight enabled |
|---|---|---|
| Data labels | On / Off | Identify points directly |
| Show quadrants | On / Off | Segment the field into four strategic groups |
| X-axis and Y-axis split | Median / Average / Manual | Define the quadrant boundaries |
| Bubble size | Auto / Fixed Scale | Control the third-measure size encoding |
| Relationship number format, unit, axis titles, size legend | Defined in state but hidden in the UI | Candidate controls for the web version after behavior is verified |

### Evaluation-specific

| Control | Options | Insight enabled |
|---|---|---|
| Color scale mode | By column / By row / Whole table | Normalize color comparison within a metric, within an item, or globally |
| Direction | Higher is better / Lower is better | Support metrics with opposite desirability |
| Show values | On / Off | Balance precision and visual scanning |
| Sort items | Input order / Highest average / Lowest average | Bring overall leaders or laggards to the top |
| Sort within metric | Input order / Descending / Ascending | Rank each metric independently |
| Small-multiple orientation | Horizontal / Vertical | Adapt layout to available screen space |
| Number format | Auto / Raw / K / M / % | Improve scale readability |
| Color palette | Default / Monochrome / High Contrast | Defined but hidden; candidate for the web version |

## 5. Export and workflow capabilities

| Capability | Current sidebar behavior |
|---|---|
| Preview | Update a chart preview from the collected UI state |
| Edit data | Navigate back to the Google Sheets data area |
| Multi-chart selection | More than one chart type can be enabled for a purpose |
| Slides export target | Export a single chart or all selected charts |
| Slides destination | Create new, overwrite the previous export, or append to a named master deck |
| Appendix | Optionally include a data-table appendix |
| Output format | 16:9 Google Slides with chart images |
| Project/version workflow | Create, rename, switch, and manage projects; duplicate/switch versions; some deletion/history actions are placeholders |
| Localization | English and Japanese UI text |

## 6. Gaps and decisions for the web development team

### Must resolve before implementation

1. **Obtain the backend source.** The supplied files do not contain the Google Sheets chart-building, transformation, validation, or export implementation. Do not infer calculation behavior solely from control names.
2. **Decide whether Evaluate is a launch feature.** Its charts and settings are coded, but `Evaluate` is absent from the purpose dropdown, purpose-start configuration, and allowed purpose options.
3. **Resolve Scatter + Quadrants.** Either make it a distinct chart type by adding it to the Relationship chart mapping and export logic, or remove it as a type and keep quadrants solely as an enhancement toggle on Scatter/Bubble.
4. **Define chart-specific applicability.** The sidebar displays some controls at purpose level even when only certain charts use them. The web UI should explicitly map every control to compatible chart types.
5. **Confirm multi-select behavior.** The current design allows multiple chart types to be selected. Decide whether the web app creates a dashboard/gallery of variants or edits one active chart at a time.

### Existing dormant or incomplete controls

- Start Label and End Label are collected in state, but their input elements are not present.
- `relationshipChartType` references a missing `sel-relationship-chart-type` control.
- `quadrantLabels` references a missing `sel-quadrant-labels` control.
- Relationship number format, unit, X/Y axis titles, and size legend are present but hidden.
- Evaluation color palette is present but hidden.
- The Evaluation section contains a duplicated section-header element.
- Home “Start with Chart Type” exposes only Line, Bar, Mekko, Waterfall, and Scatter—not the full chart catalog.
- Access/trial/beta logic may restrict purposes or chart entries and should be separated from visualization capability in the web architecture.

## 7. Recommended web configuration model

The web implementation should drive both the UI and rendering from a single chart registry rather than duplicating rules across checkboxes, purpose maps, export lists, and state collection.

```text
Purpose
  id
  label
  analyticalQuestion
  dataSchema
  chartTypes[]

ChartType
  id
  label
  purposeId
  requiredFields[]
  optionalFields[]
  controls[]
  defaults
  renderer
  exportSupport

Control
  id
  label
  type
  options
  defaultValue
  appliesToChartTypes[]
  validationRules
```

This registry can become the contract shared by the frontend, chart renderer, saved-project format, validation layer, and export service.

## 8. Suggested delivery priority

| Priority | Scope | Rationale |
|---|---|---|
| P0 | Trend: Line, Bar, Column; shared metadata/data selection; preview | Core and least specialized workflow |
| P0 | Comparison: Bar, Column, Clustered Column, Variance Bar | High-value decision-support use cases with clear controls |
| P1 | Composition: Mekko | Specialized renderer and width/share calculations |
| P1 | Contribution: Waterfall, Driver Bar, Positive/Negative Bar | Requires bridge validation, sorting, and mismatch rules |
| P1 | Relationship: Scatter, Bubble, quadrant enhancement | Requires multi-measure schema and sizing/split logic |
| P2 | Evaluate suite | Feature is coded but currently inaccessible; product decision needed first |
| P2 | Slides export parity and master-deck workflow | Separate integration concern after web rendering is stable |

