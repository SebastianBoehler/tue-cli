from __future__ import annotations

import argparse
import json
from pathlib import Path

from .runner import run_manifest_sync


def main() -> int:
    parser = argparse.ArgumentParser(prog="tue-kernel-research")
    sub = parser.add_subparsers(dest="command", required=True)

    run_parser = sub.add_parser("run", help="Run a kernel research manifest")
    run_parser.add_argument("--manifest", required=True, help="Path to manifest.json")

    status_parser = sub.add_parser("status", help="Print a manifest status file")
    status_parser.add_argument("--status-file", required=True, help="Path to status.json")

    args = parser.parse_args()

    if args.command == "status":
      status_path = Path(args.status_file).resolve()
      payload = json.loads(status_path.read_text())
      print(json.dumps(payload, indent=2))
      return 0

    result = run_manifest_sync(args.manifest)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
