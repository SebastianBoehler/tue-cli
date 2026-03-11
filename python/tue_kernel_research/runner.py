from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .hotspots import (
    load_hotspot_mapping,
    parse_hotspots_from_text,
    rank_targets,
)
from .models import RunPaths, load_manifest, resolve_run_paths


IGNORE_NAMES = shutil.ignore_patterns(
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    ".tue-kernel-research",
)


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def _safe_relative(path: str) -> str:
    normalized = path.strip().replace("\\", "/")
    if normalized.startswith("/") or normalized.startswith("../") or "/../" in normalized:
        raise ValueError(f"Editable path must stay inside the scratch project: {path}")
    return normalized


def _extract_benchmark_metrics(stdout: str) -> dict[str, Any]:
    summary_match = re.search(
        r"\[BENCH\] summary: runs=(?P<runs>\d+) warmup=(?P<warmup>\d+) avg=(?P<avg>[0-9.]+) ms min=(?P<min>[0-9.]+) ms max=(?P<max>[0-9.]+) ms",
        stdout,
    )
    if not summary_match:
        return {}
    return {
        "runs": int(summary_match.group("runs")),
        "warmup": int(summary_match.group("warmup")),
        "latency_ms": float(summary_match.group("avg")),
        "min_latency_ms": float(summary_match.group("min")),
        "max_latency_ms": float(summary_match.group("max")),
    }


def _extract_nsys_metadata(stdout: str) -> dict[str, Any]:
    report_match = re.search(r"\[NSYS\] report: (?P<path>\S+)", stdout)
    sqlite_match = re.search(r"\[NSYS\] sqlite: (?P<path>\S+)", stdout)
    result: dict[str, Any] = {}
    if report_match:
        result["report"] = report_match.group("path")
    if sqlite_match:
        result["sqlite"] = sqlite_match.group("path")
    return result


@dataclass
class StepResult:
    name: str
    returncode: int
    stdout_path: str
    stderr_path: str
    timed_out: bool = False
    metadata: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "returncode": self.returncode,
            "stdout_path": self.stdout_path,
            "stderr_path": self.stderr_path,
            "timed_out": self.timed_out,
            "metadata": self.metadata or {},
        }


class KernelResearchToolbox:
    def __init__(self, manifest: dict[str, Any], paths: RunPaths):
        self.manifest = manifest
        self.paths = paths
        self.status = _read_json(paths.status_path)
        self.iteration = int(self.status.get("iteration_count", 0))

    def save_status(self) -> None:
        self.status["updated_at"] = self.status.get("updated_at") or ""
        _write_json(self.paths.status_path, self.status)

    def set_phase(self, phase: str, status: str | None = None) -> None:
        self.status["current_phase"] = phase
        if status is not None:
            self.status["status"] = status
        self.status["updated_at"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
        self.save_status()

    @property
    def hotspot_mapping_path(self) -> Path | None:
        relative_path = (
            self.manifest.get("profiling", {}).get("hotspotMapPath")
            if isinstance(self.manifest.get("profiling"), dict)
            else None
        )
        if not isinstance(relative_path, str) or not relative_path.strip():
            return None
        return self.paths.workspace_root / relative_path

    @property
    def profile_report_path(self) -> Path | None:
        relative_path = (
            self.manifest.get("profiling", {}).get("profileReportPath")
            if isinstance(self.manifest.get("profiling"), dict)
            else None
        )
        if not isinstance(relative_path, str) or not relative_path.strip():
            return None
        return self.paths.workspace_root / relative_path

    @property
    def editable_paths(self) -> list[str]:
        return [str(_safe_relative(path)) for path in self.manifest["workspace"]["editablePaths"]]

    def render_command(self, command: str) -> str:
        return command.replace("__PROJECT_ROOT__", str(self.paths.workspace_root))

    def setup_workspace(self) -> None:
        self.paths.logs_root.mkdir(parents=True, exist_ok=True)
        self.paths.reports_root.mkdir(parents=True, exist_ok=True)
        self.paths.candidates_root.mkdir(parents=True, exist_ok=True)
        self.paths.baseline_root.mkdir(parents=True, exist_ok=True)
        self.paths.workspace_root.parent.mkdir(parents=True, exist_ok=True)

        original_root = Path(self.manifest["workspace"]["projectRoot"]).resolve()
        if self.paths.workspace_root.exists():
            shutil.rmtree(self.paths.workspace_root)

        shutil.copytree(original_root, self.paths.workspace_root, ignore=IGNORE_NAMES)

        for relative_path in self.editable_paths:
            source = self.paths.workspace_root / relative_path
            target = self.paths.baseline_root / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)

        self.status["workspace_root"] = str(self.paths.workspace_root)
        self.status["editable_paths"] = self.editable_paths
        self.save_status()

    def _run_shell_step(
        self,
        name: str,
        command: str,
        *,
        timeout_seconds: int = 7200,
    ) -> StepResult:
        rendered = self.render_command(command)
        stdout_path = self.paths.logs_root / f"{name}.stdout.log"
        stderr_path = self.paths.logs_root / f"{name}.stderr.log"
        proc = subprocess.run(
            rendered,
            shell=True,
            cwd=self.paths.run_root,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
            env=os.environ.copy(),
        )
        stdout_path.write_text(proc.stdout)
        stderr_path.write_text(proc.stderr)
        metadata: dict[str, Any] = {}
        if name.endswith("benchmark"):
            metadata.update(_extract_benchmark_metrics(proc.stdout))
        if "nsys" in name:
            metadata.update(_extract_nsys_metadata(proc.stdout))
        return StepResult(
            name=name,
            returncode=proc.returncode,
            stdout_path=str(stdout_path.relative_to(self.paths.run_root)),
            stderr_path=str(stderr_path.relative_to(self.paths.run_root)),
            metadata=metadata,
        )

    def _run_step_group(self, prefix: str, commands: list[str]) -> list[StepResult]:
        results: list[StepResult] = []
        for index, command in enumerate(commands, start=1):
            result = self._run_shell_step(f"{prefix}-{index}", command)
            results.append(result)
            if result.returncode != 0:
                break
        return results

    def _load_hotspots_from_project_profile(
        self,
        project_profile: list[dict[str, Any]],
        fetched_report: dict[str, Any] | None,
    ) -> dict[str, Any]:
        parsed_hotspots: list[dict[str, Any]] = []
        sources: list[dict[str, Any]] = []

        if fetched_report and fetched_report.get("returncode") == 0:
            stdout_path = self.paths.run_root / str(fetched_report["stdout_path"])
            payload_text = stdout_path.read_text() if stdout_path.exists() else ""
            fetched_hotspots = parse_hotspots_from_text(payload_text)
            if fetched_hotspots:
                parsed_hotspots.extend(fetched_hotspots)
                sources.append(
                    {
                        "kind": "profile_report_fetch",
                        "stdout_path": str(fetched_report["stdout_path"]),
                        "count": len(fetched_hotspots),
                    }
                )

        for result in project_profile:
            if result.get("returncode") != 0:
                continue
            stdout_path = self.paths.run_root / str(result["stdout_path"])
            stderr_path = self.paths.run_root / str(result["stderr_path"])
            combined = ""
            if stdout_path.exists():
                combined += stdout_path.read_text()
            if stderr_path.exists():
                combined += "\n" + stderr_path.read_text()
            profile_hotspots = parse_hotspots_from_text(combined)
            if profile_hotspots:
                parsed_hotspots.extend(profile_hotspots)
                sources.append(
                    {
                        "kind": "project_profile_stdout",
                        "stdout_path": str(result["stdout_path"]),
                        "count": len(profile_hotspots),
                    }
                )

        deduped: dict[tuple[str, str | None], dict[str, Any]] = {}
        for hotspot in parsed_hotspots:
            key = (hotspot["name"], hotspot.get("source_path"))
            current = deduped.get(key)
            if current is None or float(hotspot["score"]) > float(current["score"]):
                deduped[key] = hotspot
        hotspots = sorted(deduped.values(), key=lambda item: float(item["score"]), reverse=True)

        mappings = load_hotspot_mapping(self.hotspot_mapping_path)
        ranked = rank_targets(hotspots, self.editable_paths, mappings)
        ranked["sources"] = sources
        ranked["mapping_entries"] = len(mappings)
        return ranked

    def collect_hotspot_summary(self) -> dict[str, Any]:
        return {
            "profile_mode": self.manifest["execution"]["profileMode"],
            "project_profile_logs": self.status.get("project_profile"),
            "nsys_profile": self.status.get("nsys_profile"),
            "baseline": self.status.get("baseline"),
            "structured_hotspots": self.status.get("hotspot_summary", {}).get("hotspots", []),
            "ranked_targets": self.status.get("hotspot_summary", {}).get("ranked_targets", []),
            "unmapped_hotspots": self.status.get("hotspot_summary", {}).get("unmapped_hotspots", []),
            "note": (
                "Targets are ranked from structured project profiling output first, then aligned to editable files "
                "using explicit mappings, source-path matches, and token-overlap heuristics."
            ),
        }

    def show_run_context(self) -> dict[str, Any]:
        return {
            "run_id": self.manifest["runId"],
            "project_root": self.manifest["workspace"]["projectRoot"],
            "scratch_project_root": str(self.paths.workspace_root),
            "editable_paths": self.editable_paths,
            "remote": self.manifest["remote"],
            "inputs": self.manifest["inputs"],
            "baseline": self.status.get("baseline"),
            "ranked_targets": self.status.get("hotspot_summary", {}).get("ranked_targets", []),
            "best_candidate": self.status.get("best_candidate"),
            "approval_required": self.manifest["promotion"]["requireApproval"],
        }

    def read_hotspots(self) -> dict[str, Any]:
        return self.collect_hotspot_summary()

    def read_ranked_targets(self) -> dict[str, Any]:
        hotspot_summary = self.status.get("hotspot_summary", {})
        return {
            "ranked_targets": hotspot_summary.get("ranked_targets", []),
            "unmapped_hotspots": hotspot_summary.get("unmapped_hotspots", []),
        }

    def read_editable_file(self, relative_path: str) -> dict[str, Any]:
        normalized = _safe_relative(relative_path)
        if normalized not in self.editable_paths:
            raise PermissionError(f"Path is not editable: {relative_path}")
        path = self.paths.workspace_root / normalized
        return {
            "path": normalized,
            "content": path.read_text(),
        }

    def write_editable_file(self, relative_path: str, content: str) -> dict[str, Any]:
        normalized = _safe_relative(relative_path)
        if normalized not in self.editable_paths:
            raise PermissionError(f"Path is not editable: {relative_path}")
        path = self.paths.workspace_root / normalized
        path.write_text(content)
        return {"path": normalized, "bytes": len(content.encode("utf-8"))}

    def restore_best_candidate(self) -> dict[str, Any]:
        source_root = self.paths.baseline_root
        best_candidate = self.status.get("best_candidate")
        if isinstance(best_candidate, dict) and best_candidate.get("snapshot_root"):
            source_root = self.paths.run_root / str(best_candidate["snapshot_root"])

        restored: list[str] = []
        for relative_path in self.editable_paths:
            source = source_root / relative_path
            target = self.paths.workspace_root / relative_path
            if source.exists():
                shutil.copy2(source, target)
                restored.append(relative_path)
        return {"restored": restored}

    def _snapshot_current_files(self, candidate_id: str) -> Path:
        snapshot_root = self.paths.candidates_root / candidate_id / "files"
        snapshot_root.mkdir(parents=True, exist_ok=True)
        for relative_path in self.editable_paths:
            source = self.paths.workspace_root / relative_path
            target = snapshot_root / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
        return snapshot_root

    def _compare_latency(self, metrics: dict[str, Any]) -> float | None:
        latency = metrics.get("latency_ms")
        baseline = self.status.get("baseline") or {}
        baseline_latency = baseline.get("latency_ms") if isinstance(baseline, dict) else None
        if latency is None or baseline_latency is None:
            return None
        return round(float(baseline_latency) / float(latency), 4) if float(latency) > 0 else None

    def run_baseline(self) -> dict[str, Any]:
        self.set_phase("baseline", "running")
        baseline_results: dict[str, Any] = {}

        sync_results = [result.to_dict() for result in self._run_step_group("baseline-sync", self.manifest["commands"]["sync"])]
        baseline_results["sync"] = sync_results
        if sync_results and sync_results[-1]["returncode"] != 0:
            self.status["status"] = "failed"
            self.status["baseline"] = baseline_results
            self.save_status()
            return baseline_results

        build_commands = list(self.manifest["commands"].get("build") or [])
        if build_commands:
            build_results = [result.to_dict() for result in self._run_step_group("baseline-build", build_commands)]
            baseline_results["build"] = build_results
            if build_results[-1]["returncode"] != 0:
                self.status["status"] = "failed"
                self.status["baseline"] = baseline_results
                self.save_status()
                return baseline_results

        if self.manifest["execution"]["profileMode"] in {"project", "both"} and (
            self.manifest["commands"].get("projectProfile")
            or self.manifest["commands"].get("profileReportFetch")
        ):
            project_profile: list[dict[str, Any]] = []
            if self.manifest["commands"].get("projectProfile"):
                project_profile = [
                    result.to_dict()
                    for result in self._run_step_group(
                        "baseline-project-profile",
                        list(self.manifest["commands"]["projectProfile"]),
                    )
                ]
            baseline_results["project_profile"] = project_profile
            self.status["project_profile"] = project_profile
            fetched_report: dict[str, Any] | None = None
            if self.manifest["commands"].get("profileReportFetch"):
                fetched_report = self._run_shell_step(
                    "baseline-profile-report-fetch",
                    str(self.manifest["commands"]["profileReportFetch"]),
                ).to_dict()
                baseline_results["profile_report_fetch"] = fetched_report
                self.status["profile_report_fetch"] = fetched_report

            hotspot_summary = self._load_hotspots_from_project_profile(
                project_profile,
                fetched_report,
            )
            baseline_results["hotspot_summary"] = hotspot_summary
            self.status["hotspot_summary"] = hotspot_summary
            _write_json(self.paths.reports_root / "hotspots.json", hotspot_summary)

        if self.manifest["execution"]["profileMode"] in {"nsys", "both"}:
            nsys_result = self._run_shell_step("baseline-nsys", self.manifest["commands"]["nsysProfile"])
            baseline_results["nsys_profile"] = nsys_result.to_dict()
            self.status["nsys_profile"] = nsys_result.to_dict()

        verify_result = self._run_shell_step("baseline-verify", self.manifest["commands"]["verify"])
        baseline_results["verify"] = verify_result.to_dict()
        if verify_result.returncode != 0:
            self.status["status"] = "failed"
            self.status["baseline"] = baseline_results
            self.save_status()
            return baseline_results

        benchmark_result = self._run_shell_step("baseline-benchmark", self.manifest["commands"]["benchmark"])
        baseline_results["benchmark"] = benchmark_result.to_dict()
        baseline_results.update(benchmark_result.metadata or {})
        self.status["baseline"] = baseline_results
        self.save_status()
        return baseline_results

    def run_candidate_iteration(self, description: str, profile_candidate: bool = False) -> dict[str, Any]:
        self.iteration += 1
        candidate_id = f"candidate-{self.iteration:03d}"
        self.set_phase(candidate_id, "running")

        iteration_result: dict[str, Any] = {
            "candidate_id": candidate_id,
            "description": description,
        }

        sync_results = [result.to_dict() for result in self._run_step_group(f"{candidate_id}-sync", self.manifest["commands"]["sync"])]
        iteration_result["sync"] = sync_results
        build_commands = list(self.manifest["commands"].get("build") or [])
        if sync_results[-1]["returncode"] == 0 and build_commands:
            iteration_result["build"] = [
                result.to_dict()
                for result in self._run_step_group(f"{candidate_id}-build", build_commands)
            ]

        build_returncode = 0
        if iteration_result.get("build"):
            build_returncode = iteration_result["build"][-1]["returncode"]
        if sync_results[-1]["returncode"] != 0 or build_returncode != 0:
            self.restore_best_candidate()
            iteration_result["accepted"] = False
            self.status["iteration_count"] = self.iteration
            self.status.setdefault("iterations", []).append(iteration_result)
            self.save_status()
            return iteration_result

        verify_result = self._run_shell_step(f"{candidate_id}-verify", self.manifest["commands"]["verify"])
        iteration_result["verify"] = verify_result.to_dict()
        if verify_result.returncode != 0:
            self.restore_best_candidate()
            iteration_result["accepted"] = False
            self.status["iteration_count"] = self.iteration
            self.status.setdefault("iterations", []).append(iteration_result)
            self.save_status()
            return iteration_result

        benchmark_result = self._run_shell_step(f"{candidate_id}-benchmark", self.manifest["commands"]["benchmark"])
        iteration_result["benchmark"] = benchmark_result.to_dict()
        iteration_result.update(benchmark_result.metadata or {})

        if profile_candidate:
            nsys_result = self._run_shell_step(f"{candidate_id}-nsys", self.manifest["commands"]["nsysProfile"])
            iteration_result["nsys_profile"] = nsys_result.to_dict()

        speedup_vs_baseline = self._compare_latency(iteration_result)
        if speedup_vs_baseline is not None:
            iteration_result["speedup_vs_baseline"] = speedup_vs_baseline

        baseline = self.status.get("baseline") or {}
        baseline_latency = baseline.get("latency_ms") if isinstance(baseline, dict) else None
        current_latency = iteration_result.get("latency_ms")
        improved = (
            benchmark_result.returncode == 0
            and baseline_latency is not None
            and current_latency is not None
            and float(current_latency) < float(baseline_latency)
        )

        if improved:
            snapshot_root = self._snapshot_current_files(candidate_id)
            iteration_result["accepted"] = True
            iteration_result["snapshot_root"] = str(snapshot_root.relative_to(self.paths.run_root))
            self.status["best_candidate_id"] = candidate_id
            self.status["best_candidate"] = iteration_result
            self.status["winning_files"] = {
                relative_path: str((snapshot_root / relative_path).relative_to(self.paths.run_root))
                for relative_path in self.editable_paths
            }
        else:
            self.restore_best_candidate()
            iteration_result["accepted"] = False

        self.status["iteration_count"] = self.iteration
        self.status.setdefault("iterations", []).append(iteration_result)
        self.save_status()
        return iteration_result


def build_root_agent(toolbox: KernelResearchToolbox, model_name: str, max_iterations: int):
    from google.adk.agents import LlmAgent, LoopAgent, ParallelAgent, SequentialAgent
    from google.adk.agents.readonly_context import ReadonlyContext
    from google.adk.models.lite_llm import LiteLlm

    model = LiteLlm(model=model_name)

    def context_instruction(_: ReadonlyContext) -> str:
        return (
            "You are the kernel research context reader. "
            "Use only the read-only tools to inspect the run context, hotspot summary, ranked targets, "
            "and current editable files. Summarize the likely bottlenecks, identify the highest-value "
            "editable target, note whether it is Triton or CUDA/C++, and identify one bounded optimization idea."
        )

    def planner_instruction(ctx: ReadonlyContext) -> str:
        return (
            "You are the kernel research planner. Build one bounded change plan based on the gathered context.\n\n"
            f"Context:\n{ctx.state.get('context_report', 'Unavailable')}\n\n"
            "Rules:\n"
            "1. Change only one editable file.\n"
            "2. Prefer the highest-ranked editable target unless the ranking is obviously weak.\n"
            "3. Prefer localized tuning or memory-access improvements.\n"
            "4. Do not change benchmark or verification commands.\n"
            "5. Keep correctness first.\n"
            "Return a short plan with target file, exact intent, and success criteria."
        )

    def executor_instruction(ctx: ReadonlyContext) -> str:
        return (
            "You are the kernel research executor. Follow the plan exactly.\n\n"
            f"Plan:\n{ctx.state.get('iteration_plan', 'Unavailable')}\n\n"
            "Use read_editable_file before editing. After your edit, run one candidate iteration with a concise description. "
            "Do not edit multiple files. If the result regresses, the tool will restore the previous best automatically."
        )

    def evaluator_instruction(ctx: ReadonlyContext) -> str:
        return (
            "You are the kernel research evaluator.\n\n"
            f"Execution report:\n{ctx.state.get('execution_report', 'Unavailable')}\n\n"
            "Decide whether the candidate materially improved latency without breaking verification. "
            "If it did not, explain why. If there is still obvious headroom, recommend one next bounded direction."
        )

    context_reader = LlmAgent(
        name="kernel_research_context",
        model=model,
        tools=[
            toolbox.show_run_context,
            toolbox.read_hotspots,
            toolbox.read_ranked_targets,
            toolbox.read_editable_file,
        ],
        instruction=context_instruction,
        output_key="context_report",
    )

    planner = LlmAgent(
        name="kernel_research_planner",
        model=model,
        tools=[
            toolbox.show_run_context,
            toolbox.read_hotspots,
            toolbox.read_ranked_targets,
        ],
        instruction=planner_instruction,
        output_key="iteration_plan",
    )

    executor = LlmAgent(
        name="kernel_research_executor",
        model=model,
        tools=[
            toolbox.read_editable_file,
            toolbox.write_editable_file,
            toolbox.run_candidate_iteration,
            toolbox.restore_best_candidate,
        ],
        instruction=executor_instruction,
        output_key="execution_report",
    )

    evaluator = LlmAgent(
        name="kernel_research_evaluator",
        model=model,
        tools=[toolbox.show_run_context],
        instruction=evaluator_instruction,
        output_key="evaluation_report",
    )

    workflow = SequentialAgent(
        name="kernel_research_workflow",
        description="Context, plan, execute, and evaluate one bounded kernel optimization iteration.",
        sub_agents=[
            ParallelAgent(
                name="kernel_research_context_stage",
                description="Gather bounded context before planning.",
                sub_agents=[context_reader],
            ),
            planner,
            executor,
            evaluator,
        ],
    )

    return LoopAgent(
        name="kernel_research_loop",
        description="Bounded local ADK workflow for Triton/CUDA kernel research.",
        sub_agents=[workflow],
        max_iterations=max_iterations,
    )


async def run_manifest(manifest_path: str | Path) -> dict[str, Any]:
    manifest = load_manifest(manifest_path)
    paths = resolve_run_paths(manifest, manifest_path)
    toolbox = KernelResearchToolbox(manifest, paths)
    toolbox.set_phase("setup", "running")
    toolbox.setup_workspace()
    baseline = toolbox.run_baseline()

    if baseline.get("benchmark", {}).get("returncode", 0) != 0:
        toolbox.set_phase("baseline_failed", "failed")
        return toolbox.status

    toolbox.set_phase("adk", "running")
    try:
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai.types import Content, Part
    except Exception as exc:
        toolbox.status["status"] = "blocked"
        toolbox.status["error"] = f"google-adk is unavailable: {exc}"
        toolbox.save_status()
        return toolbox.status

    root_agent = build_root_agent(
        toolbox,
        manifest["provider"]["model"],
        manifest["execution"]["maxIterations"],
    )
    session_service = InMemorySessionService()
    app_name = "tue-kernel-research"
    user_id = "local-operator"
    session_id = manifest["runId"]
    await session_service.create_session(app_name=app_name, user_id=user_id, session_id=session_id)
    runner = Runner(agent=root_agent, app_name=app_name, session_service=session_service)
    prompt = (
        "Optimize the allowed Triton/CUDA kernel files using the provided profiling context. "
        "Keep changes bounded, verification-first, and pursue lower benchmark latency. "
        "Only artifacts in this run workspace may be modified."
    )

    final_messages: list[str] = []
    async for event in runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=Content(role="user", parts=[Part(text=prompt)]),
    ):
        content = getattr(event, "content", None)
        if not content:
            continue
        parts = getattr(content, "parts", None) or []
        for part in parts:
            text = getattr(part, "text", None)
            if text:
                final_messages.append(text)

    report_path = paths.reports_root / "adk-final-report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n\n".join(final_messages).strip() + "\n")

    if toolbox.status.get("best_candidate"):
        toolbox.set_phase("awaiting_approval", "awaiting_approval")
    else:
        toolbox.set_phase("complete", "complete")
    return toolbox.status


def run_manifest_sync(manifest_path: str | Path) -> dict[str, Any]:
    return asyncio.run(run_manifest(manifest_path))
