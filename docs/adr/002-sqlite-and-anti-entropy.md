# One relay, committed ACKs, full union on reconnect

Use Node's built-in SQLite with explicit exclusive locking, DELETE journal mode and FULL synchronous transactions. The OS-backed SQLite lock fences competing processes and releases after process death; do not invent a heartbeat file lock. The operation insert commits before broadcast/ACK. Duplicate replay is a successful no-op; conflicting content under one ID fails.

Browser state stores the union and pending operations together; reconnect downloads the full retained union and resends pending IDs. Chunked asynchronous snapshot flushing avoids synchronously queueing the full workspace into the socket. This is simpler than vector-clock/delta optimization and deliberately bounded. It needs one durable local file/volume. Free ephemeral web hosting and multi-host HA are not covered. The exact Node/SQLite runtime is recorded; the built-in API is experimental on the measured local runtime.
