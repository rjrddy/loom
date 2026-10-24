"""Independent tracked-source clone, real gates and actual one-command demo."""

import hashlib
import json
import os
import signal
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/results/fresh-clone"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    with tempfile.TemporaryDirectory(prefix="loom-fresh-") as temp:
        clone = Path(temp) / "loom"
        subprocess.run(
            ["git", "clone", "--no-hardlinks", str(ROOT), str(clone)],
            check=True,
            capture_output=True,
        )
        assert not (clone / "node_modules").exists() and not (clone / ".cache").exists()
        with (OUT / "checks.log").open("w") as log:
            subprocess.run(
                ["make", "setup", "build", "lint", "test", "bench"],
                cwd=clone,
                stdout=log,
                stderr=log,
                check=True,
            )
        (OUT / "benchmark.json").write_bytes((clone / "docs/results/benchmark.json").read_bytes())
        with (OUT / "demo.log").open("w") as log:
            child = subprocess.Popen(
                ["make", "demo"],
                cwd=clone,
                env={**os.environ, "PORT": "18115"},
                stdout=log,
                stderr=log,
                start_new_session=True,
            )
            try:
                for _ in range(500):
                    if child.poll() is not None:
                        raise RuntimeError((OUT / "demo.log").read_text())
                    try:
                        with urllib.request.urlopen("http://127.0.0.1:18115/", timeout=1) as r:
                            assert b"Loom" in r.read()
                        break
                    except OSError:
                        time.sleep(0.2)
                else:
                    raise RuntimeError("make demo readiness timeout")
                req = urllib.request.Request(
                    "http://127.0.0.1:18115/api/metrics",
                    headers={"Authorization": "Bearer local-edit"},
                )
                with urllib.request.urlopen(req, timeout=3) as r:
                    metrics = json.load(r)
                assert metrics["operations"] > 0
                files = subprocess.check_output(
                    [
                        "git",
                        "ls-files",
                        "src",
                        "scripts",
                        "tests",
                        "package.json",
                        "package-lock.json",
                        "tsconfig.node.json",
                        "tsconfig.web.json",
                        "vite.config.ts",
                        "index.html",
                        "Makefile",
                        "Dockerfile",
                        ".github/workflows/ci.yml",
                    ],
                    cwd=clone,
                    text=True,
                ).splitlines()
                manifest = {
                    name: hashlib.sha256((clone / name).read_bytes()).hexdigest() for name in files
                }
                (OUT / "verification.json").write_text(
                    json.dumps(
                        {
                            "head": head,
                            "passed": True,
                            "copied_ignored_artifacts": False,
                            "commands": [
                                "git clone --no-hardlinks",
                                "make setup build lint test bench",
                                "make demo",
                            ],
                            "actual_http_metrics": metrics,
                            "source_manifest": manifest,
                        },
                        indent=2,
                    )
                    + "\n"
                )
                print(json.dumps({"head": head, "fresh_clone": "pass", "actual_make_demo": "pass"}))
            finally:
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGTERM)
                    child.wait(timeout=15)


if __name__ == "__main__":
    main()
