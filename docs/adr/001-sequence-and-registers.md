# Stable identities before mutable offsets

Use an owned RGA-style character tree, retained delete tombstones and a deterministic logical-clock/actor order. Out-of-order anchors and deletes remain in the union until their dependencies arrive. Canvas objects use independent max registers for each field. Same-field conflicts can lose a value by rule; document text is merged by sequence identities.

The core trades memory/CPU and finite operation capacity for simple inspection and offline replay. No tombstone GC, rich text, shared selection, grapheme/IME correctness or general intention-preservation guarantee is claimed. The concrete focused-draft regression is preserved, and the adapter now diffs against displayed IDs rather than unseen remote content.
