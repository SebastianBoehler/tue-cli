# Examples

## Custom Cluster Profile

```bash
tue clusters add \
  --name vision-lab \
  --gateway login.vision.example.edu \
  --machines gpu01,gpu02,gpu03 \
  --default-machine gpu01 \
  --remote-root ~/remote \
  --vnc-vm xfce
```

Use it once:

```bash
tue run . --cluster vision-lab --cmd "python3 train.py"
```

Or make it the default:

```bash
tue clusters select --name vision-lab
```

## Remote Python Project

```bash
tue sync . --cluster vision-lab
tue run . --cluster vision-lab --cmd "python3 -m pytest -q"
tue run . --cluster vision-lab --cmd "python3 train.py --epochs 20" --detach
tue run logs --cluster vision-lab --follow
```

## CUDA Benchmark

```bash
tue build . --cluster vision-lab --preset release --no-download
tue cuda benchmark \
  --cluster vision-lab \
  --workdir "/home/<user>/remote/<project>" \
  --cmd "./build/bench --size 8192" \
  --warmup 3 \
  --runs 20
```

## Slurm Training Job

```bash
tue job submit \
  --cluster vision-lab \
  --cmd "python3 train.py --config configs/baseline.yaml" \
  --name baseline \
  --gpus 1 \
  --cpus 8 \
  --mem 32G \
  --time 08:00:00
```

```bash
tue job status --cluster vision-lab
tue job logs --cluster vision-lab --job-id <id> --follow
```

## VNC Desktop Session

```bash
tue vnc start --cluster vision-lab --display 2
tue tunnel open --cluster vision-lab --display 2 --local-port 5902
```

Connect your VNC client to `localhost:5902`.
