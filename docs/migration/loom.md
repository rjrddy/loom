# Loom salvage provenance

No old repository contained a sequence CRDT or collaborative canvas implementation to salvage. The migration map's unrelated components remain in their existing projects. Loom's sequence tree, delete handling, field registers, displayed-draft adapter, browser outbox, relay, SQLite persistence, synthetic campaign and original React interface are new work.

Standalone Make/CI/proof conventions follow the already established projects, without importing their runtime code or reusing their metrics. Browser tooling uses the installed public Playwright runtime/cache as a local tool, not an application dependency on another repository. Every Loom measurement is rerun here. All pre-existing repositories remain untouched; no integration or deletion is performed.
