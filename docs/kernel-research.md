# Kernel Research

The kernel-research workflow is an optional local control loop for Triton/CUDA optimization experiments.

It copies a project into a scratch workspace, profiles or benchmarks candidate code on a selected remote machine, stores all generated candidates, and requires explicit approval before any winning candidate is promoted back into the real project tree.

## Install

Install Python dependencies once:

```bash
python3 -m pip install -r requirements-kernel-research.txt
```

Set the provider key locally:

```bash
export OPENROUTER_API_KEY=...
```

## Run

```bash
tue kernel-research run \
  --machine cgpool1907 \
  --project-root . \
  --editable-paths kernels/matmul.py,src/my_kernel.cu \
  --benchmark-cmd "./build/my_kernel_bench --size 8192" \
  --verify-cmd "ctest --output-on-failure" \
  --build-cmd "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j" \
  --profile-cmd "python scripts/profile_model.py --emit-json" \
  --profile-report-path workspace/profile_report.json \
  --hotspot-map-path hotspot-map.json \
  --llm-model openrouter/anthropic/claude-3.7-sonnet
```

Check status and approve a winning candidate:

```bash
tue kernel-research status --run-id <id>
tue kernel-research approve --run-id <id> --yes
```

## Scratch Workspace

Runs copy the project into:

```text
.tue-kernel-research/runs/<id>/workspace/
```

Candidate artifacts stay under the run directory. The source project is not modified until `approve` is called with `--yes`.

## Profile Reports

Structured profile reports should be JSON. The runner accepts:

```json
{"hotspots":[{"name":"triton_matmul","pct_total":61.2,"source_path":"kernels/matmul.py","op_type":"matmul"}]}
```

It also accepts AutoKernel-style keys:

```json
{"top_kernels":[{"kernel_name":"triton_matmul","pct_total":61.2,"source_path":"kernels/matmul.py","op_type":"matmul"}]}
```

## Hotspot Mapping

Use a hotspot map when kernel names do not naturally map to file names:

```json
{"mappings":{"matmul":"kernels/matmul.py","layernorm":"src/layernorm.cu"}}
```

The mapping file stays local in the project and is copied into the scratch workspace for the run.

## Safety Model

- The LLM control loop runs locally.
- Remote machines only execute the sync, build, profile, verify, and benchmark commands you provide.
- Candidate promotion requires an explicit approval command.
- Failed build, profile, verify, or benchmark commands are surfaced as errors instead of silently falling back.
