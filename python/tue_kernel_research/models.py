from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
import json


@dataclass
class RunPaths:
    manifest_path: Path
    run_root: Path
    status_path: Path
    workspace_root: Path
    artifacts_root: Path
    baseline_root: Path
    candidates_root: Path
    logs_root: Path
    reports_root: Path


def load_manifest(path: str | Path) -> dict[str, Any]:
    manifest_path = Path(path).resolve()
    return json.loads(manifest_path.read_text())


def resolve_run_paths(manifest: dict[str, Any], manifest_path: str | Path) -> RunPaths:
    resolved_manifest_path = Path(manifest_path).resolve()
    run_root = Path(manifest["workspace"]["runRoot"]).resolve()
    return RunPaths(
      manifest_path=resolved_manifest_path,
      run_root=run_root,
      status_path=run_root / "status.json",
      workspace_root=Path(manifest["workspace"]["scratchProjectRoot"]).resolve(),
      artifacts_root=run_root / "artifacts",
      baseline_root=run_root / "artifacts" / "baseline",
      candidates_root=run_root / "artifacts" / "candidates",
      logs_root=run_root / "artifacts" / "logs",
      reports_root=run_root / "artifacts" / "reports",
    )
