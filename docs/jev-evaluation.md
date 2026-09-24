# Evaluating JEV thresholds

MatMetrics uses JEV confidence and semantic signals to decide when to show an optional category action or a training-note nudge. The category apply threshold is currently a provisional `0.8`, and the technique-verification threshold is a provisional `0.9`; check both against representative, human-labeled examples before changing them.

## Prepare labeled outcomes

Collect predictions from one resolved JEV model version. For a Choice question, record the suggested category, its confidence, and the category a reviewer considers correct. For a Noul question, record the returned probability and whether a reviewer considers the proposition true. Do not include descriptions, notes, names, or other session text in this evaluation file.

```json
{
  "kind": "choice",
  "outcomes": [
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Technical",
      "actualCategory": "Technical",
      "confidence": 0.91
    },
    {
      "resolvedModel": "typesafe/jev-1.13-20260917",
      "predictedCategory": "Randori",
      "actualCategory": "Technical",
      "confidence": 0.62
    }
  ]
}
```

For a Noul question such as technique verification, use `"kind": "noul"` and rows shaped like `{"resolvedModel":"typesafe/jev-1.13-20260917","probability":0.96,"actual":true}`. Keep the JSON file outside the repository if it contains private evaluation records. The evaluator rejects files with mixed or partially recorded model versions.

## Compare thresholds

Run the evaluator with the path to the labeled JSON file:

```bash
npm run jev:evaluate-thresholds -- /path/to/labeled-predictions.json
```

For Choice questions, each threshold reports:

- `accepted`: predictions at or above the threshold
- `accuracy`: the share of accepted predictions that match the reviewer label
- `coverage`: the share of all examples accepted at that threshold

For Noul questions, the output reports accepted count, precision, recall, and coverage. Precision helps measure false-positive tags; recall shows how many reviewer-positive candidates remain above the cutoff.

Choose a threshold based on the tradeoff between accepted accuracy and coverage. The tool reports evaluation metrics; it does not choose or update a production threshold automatically.
