# Relation Classification Report: rule_baseline (all)

- **Timestamp**: 2026-07-19T13:10:41.182Z
- **Accuracy**: 43.14%
- **Macro-F1**: 0.2304
- **Invalid Output Rate**: 0.00% (0/51)
- **Average Latency**: 0.12 ms
- **Token Usage**: 0 prompt / 0 completion
- **Estimated Cost**: $0

## Per-Class Metrics

| Class | Precision | Recall | F1-Score | Support |
| --- | --- | --- | --- | --- |
| superseded | 0.4091 | 1.0000 | 0.5806 | 18 |
| complementary | 0.6000 | 0.1875 | 0.2857 | 16 |
| conditional_difference | 0.5000 | 0.2000 | 0.2857 | 5 |
| conflicting | 0.0000 | 0.0000 | 0.0000 | 9 |
| duplicate | 0.0000 | 0.0000 | 0.0000 | 3 |

## Confusion Matrix

| Gold \ Pred | superseded | complementary | conditional_difference | conflicting | duplicate |
| --- | --- | --- | --- | --- | --- |
| superseded | 18 | 0 | 0 | 0 | 0 |
| complementary | 13 | 3 | 0 | 0 | 0 |
| conditional_difference | 4 | 0 | 1 | 0 | 0 |
| conflicting | 9 | 0 | 0 | 0 | 0 |
| duplicate | 0 | 2 | 1 | 0 | 0 |
