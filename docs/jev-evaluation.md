# Evaluating JEV thresholds

MatMetrics uses JEV decisions to suggest a session type, assess whether a log has useful category-relevant detail, flag clear conflicts between written effort and the selected effort rating, identify fatigue or injury mentions, review saved technique tags against the session text, and check transformed prose for unsupported details. The current category confidence (`0.8`), category-fit probability (`0.8`), technique-verification probability (`0.9`), useful-detail probability (`0.5`), effort-conflict probability (`0.8`), injury probability (`0.5`), fatigue score (`1`), and transformation-fidelity probability (`0.5`) cutoffs are provisional. Evaluate them on representative, human-labeled examples before changing them or expanding their use.

## Prepare labeled outcomes

Collect predictions from one resolved JEV model version. For a Choice question, record the suggested category, its confidence, the probability that a supported category fits, and the category a reviewer considers correct. For a Noul question, record the returned probability and whether a reviewer considers the proposition true. For a Score question, record the returned score and whether a reviewer considers the fatigue signal high enough to warrant the nudge. Do not include descriptions, notes, names, or other session text in this evaluation file.

```json
{
  "kind": "choice",
  "outcomes": [
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Technical",
      "actualCategory": "Technical",
      "confidence": 0.91,
      "categoryFitProbability": 0.94
    },
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Randori",
      "actualCategory": "Technical",
      "confidence": 0.62,
      "categoryFitProbability": 0.87
    }
  ]
}
```

For a Noul question such as category fit or technique verification, use `"kind": "noul"` and rows shaped like `{"resolvedModel":"typesafe/jev-1.13-20260917","probability":0.96,"actual":true}`. For fatigue, use `"kind": "score"` and rows shaped like `{"resolvedModel":"typesafe/jev-1.13-20260917","score":1.2,"actual":true}`. `actual` records the reviewer’s binary decision for the behavior being gated. Keep the JSON file outside the repository if it contains private evaluation records. The evaluator rejects files with mixed or partially recorded model versions.

## Compare thresholds

Run the evaluator with the path to the labeled JSON file:

```bash
npm run jev:evaluate-thresholds -- /path/to/labeled-predictions.json
```

For Choice questions without category-fit scores, each confidence threshold reports:

- `accepted`: predictions at or above the threshold
- `accuracy`: the share of accepted predictions that match the reviewer label
- `coverage`: the share of all examples accepted at that threshold

For Noul questions, the output reports accepted count, precision, recall, and coverage. Precision helps measure false-positive tags; recall shows how many reviewer-positive candidates remain above the cutoff.

For Score questions, the output reports the same binary metrics after applying each score cutoff. For category outcomes that include `categoryFitProbability` on every row, the evaluator reports a grid of confidence and category-fit cutoffs. A row is accepted only when both cutoffs pass. The default grid uses `0.5`, `0.6`, `0.7`, `0.8`, and `0.9` for both axes. To compare a smaller or different grid, include `confidenceThresholds` and/or `categoryFitThresholds` arrays in the JSON input. For example:

```json
{
  "kind": "choice",
  "confidenceThresholds": [0.7, 0.8, 0.9],
  "categoryFitThresholds": [0.6, 0.8, 0.9],
  "outcomes": [
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Technical",
      "actualCategory": "Technical",
      "confidence": 0.91,
      "categoryFitProbability": 0.94
    }
  ]
}
```

The output includes both cutoffs, accepted count, accuracy, and coverage for every pair. Older category files without fit probabilities continue to evaluate confidence alone.

Choose a threshold based on the tradeoff between accepted accuracy and coverage. The tool reports evaluation metrics; it does not choose or update a production threshold automatically.

## Evaluate recurring training themes

The optional history review asks JEV four bounded Noul questions for each reviewed session: kumi-kata, ne-waza, transitions, and competition tactics. JEV returns one probability per theme. MatMetrics applies the provisional `0.7` probability threshold in policy code, then deterministically counts matches across the five most recent successfully assessed sessions. The UI only labels a theme recurring when it appears in at least two of those sessions. Counts and session ordering are application logic; JEV does not calculate them.

Theme probabilities and counts exist only in the current history-review UI state. They are not written to session files, preferences, or analytics records; re-running the review derives them again from the selected sessions.

Use a separate `kind: "noul"` evaluation file for each theme so one theme's calibration does not hide another's. Label examples from the session description and notes, using the theme definition in `src/lib/jev-client.ts`. Positive labels include successful practice as well as difficulty. Theme presence is separate from whether the athlete reports a problem; difficulty classification is not part of this first implementation.

```json
{
  "kind": "noul",
  "outcomes": [
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "probability": 0.88,
      "actual": true
    },
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "probability": 0.24,
      "actual": false
    }
  ]
}
```

Keep descriptions, notes, names, and session IDs out of evaluation files. The existing Noul evaluator reports precision, recall, and coverage over its threshold grid. The production theme threshold remains provisional until reviewed examples show a useful precision/coverage tradeoff for each theme.

## Future semantic opportunities

### Training-goal relevance

Current training-plan preferences set weekly or monthly targets for broad session categories; they do not represent an athlete-defined technical goal such as improving left-v-right grip fighting. If MatMetrics later adds explicit goals, the existing session assessment path could add a bounded per-session goal-relevance probability and let application code aggregate the recent matches. Do not infer personal goals from category targets.

### Log Doctor semantic review

Log Doctor's file validation and audit rules are deterministic checks. Markdown structure, frontmatter, dates, categories, IDs, schemas, empty fields, and arithmetic checks must continue to work without JEV. A future optional semantic review could run only after a file parses into a valid session, reuse the existing category-fit, useful-detail, and saved-technique assessments, and show review findings without changing the session. Before connecting the plugin, verify that its UI can use the authenticated assessment endpoint and preserve the existing opt-in data notice.

### Semantic history search

History search currently performs literal matching over techniques, categories, descriptions, notes, and dates. If broader search is added, retrieve a small candidate set with text or embedding search first, then use JEV as a bounded relevance judge for a query such as “When did I struggle with taller opponents?”. Do not send the full archive as one prompt or use JEV as the initial search engine. A relevance threshold, candidate cap, and any decision caching need evaluation before this becomes a product feature.
