from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


MARKER_PAIRS = [
    ("TUE_PROFILE_JSON_BEGIN", "TUE_PROFILE_JSON_END"),
    ("PROFILE_JSON_BEGIN", "PROFILE_JSON_END"),
    ("HOTSPOTS_JSON_BEGIN", "HOTSPOTS_JSON_END"),
]


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip().rstrip("%")
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def _first_non_empty(item: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def extract_json_payloads(text: str) -> list[Any]:
    payloads: list[Any] = []
    stripped = _normalize_text(text)
    if not stripped:
        return payloads

    try:
        payloads.append(json.loads(stripped))
        return payloads
    except json.JSONDecodeError:
        pass

    for start_marker, end_marker in MARKER_PAIRS:
        pattern = re.compile(
            rf"{re.escape(start_marker)}\s*(.*?)\s*{re.escape(end_marker)}",
            re.DOTALL,
        )
        for match in pattern.finditer(text):
            block = match.group(1).strip()
            try:
                payloads.append(json.loads(block))
            except json.JSONDecodeError:
                continue

    fenced_pattern = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
    for match in fenced_pattern.finditer(text):
        block = match.group(1).strip()
        try:
            payloads.append(json.loads(block))
        except json.JSONDecodeError:
            continue

    return payloads


def _candidate_hotspot_lists(payload: Any) -> list[list[dict[str, Any]]]:
    if isinstance(payload, list):
        if all(isinstance(item, dict) for item in payload):
            return [payload]
        return []

    if not isinstance(payload, dict):
        return []

    candidates: list[list[dict[str, Any]]] = []
    for key in ("hotspots", "top_kernels", "kernels", "operators", "ops"):
        value = payload.get(key)
        if isinstance(value, list) and all(isinstance(item, dict) for item in value):
            candidates.append(value)

    for key in ("profile", "report", "summary", "results"):
        nested = payload.get(key)
        if isinstance(nested, dict):
            candidates.extend(_candidate_hotspot_lists(nested))

    return candidates


def _normalize_hotspot(item: dict[str, Any]) -> dict[str, Any] | None:
    name = _first_non_empty(item, ["name", "kernel_name", "op_name", "operator", "id"])
    if not name:
        return None

    source_path = _first_non_empty(
        item,
        ["source_path", "source_file", "file", "path", "module", "target_file"],
    )
    kind = _first_non_empty(item, ["op_type", "kind", "type", "category"])
    bottleneck = _first_non_empty(item, ["bottleneck", "bound_type", "classification"])

    time_ms = (
        _safe_float(item.get("time_ms"))
        or _safe_float(item.get("gpu_time_ms"))
        or _safe_float(item.get("self_cuda_time_ms"))
    )
    if time_ms is None:
        gpu_time_us = (
            _safe_float(item.get("gpu_time_us"))
            or _safe_float(item.get("cuda_time_us"))
            or _safe_float(item.get("self_cuda_time_total"))
        )
        if gpu_time_us is not None:
            time_ms = gpu_time_us / 1000.0

    pct_total = (
        _safe_float(item.get("pct_total"))
        or _safe_float(item.get("percent_total"))
        or _safe_float(item.get("percentage"))
        or _safe_float(item.get("self_cuda_pct"))
    )

    throughput = _safe_float(item.get("throughput_tflops")) or _safe_float(item.get("tflops"))
    score = pct_total if pct_total is not None else (time_ms if time_ms is not None else 0.0)

    return {
        "name": name,
        "source_path": source_path,
        "kind": kind,
        "bottleneck": bottleneck,
        "time_ms": round(time_ms, 6) if time_ms is not None else None,
        "pct_total": round(pct_total, 4) if pct_total is not None else None,
        "throughput_tflops": round(throughput, 4) if throughput is not None else None,
        "score": round(float(score), 6),
        "raw": item,
    }


def parse_hotspots_from_payload(payload: Any) -> list[dict[str, Any]]:
    hotspots: list[dict[str, Any]] = []
    seen: set[tuple[str, str | None]] = set()

    for candidate_list in _candidate_hotspot_lists(payload):
        for item in candidate_list:
            normalized = _normalize_hotspot(item)
            if normalized is None:
                continue
            key = (normalized["name"], normalized["source_path"])
            if key in seen:
                continue
            seen.add(key)
            hotspots.append(normalized)

    hotspots.sort(key=lambda item: item["score"], reverse=True)
    return hotspots


def parse_hotspots_from_text(text: str) -> list[dict[str, Any]]:
    hotspots: list[dict[str, Any]] = []
    for payload in extract_json_payloads(text):
        parsed = parse_hotspots_from_payload(payload)
        if parsed:
            hotspots.extend(parsed)

    deduped: dict[tuple[str, str | None], dict[str, Any]] = {}
    for hotspot in hotspots:
        key = (hotspot["name"], hotspot["source_path"])
        current = deduped.get(key)
        if current is None or hotspot["score"] > current["score"]:
            deduped[key] = hotspot

    result = sorted(deduped.values(), key=lambda item: item["score"], reverse=True)
    return result


def _tokenize(value: str | None) -> set[str]:
    if not value:
        return set()
    return {
        token
        for token in re.split(r"[^a-z0-9]+", value.lower())
        if len(token) >= 2
    }


def _normalize_mapping_payload(payload: Any) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []

    if isinstance(payload, dict):
        direct = payload.get("mappings")
        if isinstance(direct, list):
            for item in direct:
                if isinstance(item, dict):
                    entries.extend(_normalize_mapping_payload(item))
        elif isinstance(direct, dict):
            for key, value in direct.items():
                if isinstance(key, str) and isinstance(value, str):
                    entries.append({"match": key, "path": value})

        if "match" in payload and "path" in payload:
            match = payload.get("match")
            path = payload.get("path")
            if isinstance(match, str) and isinstance(path, str):
                entries.append({"match": match, "path": path})

    elif isinstance(payload, list):
        for item in payload:
            entries.extend(_normalize_mapping_payload(item))

    return entries


def load_hotspot_mapping(path: Path | None) -> list[dict[str, str]]:
    if path is None or not path.exists():
        return []
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError:
        return []
    return _normalize_mapping_payload(payload)


def _match_mapping(
    hotspot: dict[str, Any],
    editable_paths: list[str],
    mappings: list[dict[str, str]],
) -> tuple[str | None, float]:
    hotspot_text = " ".join(
        [
            str(hotspot.get("name") or ""),
            str(hotspot.get("source_path") or ""),
            str(hotspot.get("kind") or ""),
        ]
    ).lower()

    for mapping in mappings:
        match = mapping["match"].strip().lower()
        path = mapping["path"].strip().replace("\\", "/")
        if match and match in hotspot_text and path in editable_paths:
            return path, 1.0

    source_path = str(hotspot.get("source_path") or "").replace("\\", "/")
    if source_path:
        for editable_path in editable_paths:
            if source_path.endswith(editable_path) or editable_path.endswith(source_path):
                return editable_path, 1.0
            if Path(source_path).name == Path(editable_path).name:
                return editable_path, 0.9

    hotspot_tokens = (
        _tokenize(str(hotspot.get("name") or ""))
        | _tokenize(str(hotspot.get("source_path") or ""))
        | _tokenize(str(hotspot.get("kind") or ""))
    )
    if not hotspot_tokens:
        return None, 0.0

    best_path: str | None = None
    best_score = 0.0
    for editable_path in editable_paths:
        path_tokens = _tokenize(editable_path)
        overlap = len(hotspot_tokens & path_tokens)
        if overlap == 0:
            continue
        score = overlap / max(len(hotspot_tokens), 1)
        if score > best_score:
            best_path = editable_path
            best_score = score

    if best_path:
        return best_path, round(min(0.8, best_score + 0.2), 4)

    if len(editable_paths) == 1:
        return editable_paths[0], 0.25

    return None, 0.0


def rank_targets(
    hotspots: list[dict[str, Any]],
    editable_paths: list[str],
    mappings: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    mappings = mappings or []
    target_buckets: dict[str, dict[str, Any]] = {
        path: {
            "relative_path": path,
            "score": 0.0,
            "max_confidence": 0.0,
            "matched_hotspots": [],
            "target_kind": infer_target_kind(path),
        }
        for path in editable_paths
    }
    unmapped: list[dict[str, Any]] = []

    for hotspot in hotspots:
        matched_path, confidence = _match_mapping(hotspot, editable_paths, mappings)
        enriched = dict(hotspot)
        if matched_path is None:
            enriched["match_confidence"] = 0.0
            unmapped.append(enriched)
            continue

        enriched["match_confidence"] = confidence
        bucket = target_buckets[matched_path]
        bucket["matched_hotspots"].append(enriched)
        bucket["score"] += float(hotspot.get("score") or 0.0) * max(confidence, 0.1)
        bucket["max_confidence"] = max(bucket["max_confidence"], confidence)

    ranked_targets = sorted(
        target_buckets.values(),
        key=lambda item: (item["score"], item["max_confidence"]),
        reverse=True,
    )

    for item in ranked_targets:
        item["score"] = round(float(item["score"]), 6)

    return {
        "ranked_targets": ranked_targets,
        "unmapped_hotspots": unmapped,
        "hotspots": hotspots,
    }


def infer_target_kind(relative_path: str) -> str:
    suffix = Path(relative_path).suffix.lower()
    if suffix == ".py":
        return "triton_or_python"
    if suffix in {".cu", ".cuh"}:
        return "cuda"
    if suffix in {".cpp", ".cc", ".cxx", ".hpp", ".h"}:
        return "cuda_cpp"
    return "unknown"
