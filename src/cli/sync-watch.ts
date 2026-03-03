import { watch } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import { executeAll } from "./execution";
import type { CommandRuntimeOptions } from "./types";

type WatchSyncLoopOptions = {
  localPath: string;
  commands: string[];
  dryRun: boolean;
  runtimeOptions?: CommandRuntimeOptions;
  debounceMs?: number;
};

const DEFAULT_DEBOUNCE_MS = 600;

function toRelativePath(
  basePath: string,
  filePath?: string | Buffer | null,
): string | undefined {
  if (!filePath) {
    return undefined;
  }

  const fileToken =
    typeof filePath === "string" ? filePath : filePath.toString("utf8");

  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const absolute = resolve(basePath, fileToken);

  if (absolute === basePath) {
    return ".";
  }

  if (!absolute.startsWith(normalizedBase)) {
    return fileToken;
  }

  return absolute.slice(normalizedBase.length);
}

function shouldIgnoreWatchPath(relativePath?: string): boolean {
  if (!relativePath || relativePath === ".") {
    return false;
  }

  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return false;
  }

  const ignoredSegments = new Set([
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    ".idea",
    ".vscode",
    ".DS_Store",
    "dist",
    "build",
    ".tue-artifacts",
  ]);

  return segments.some((segment) => ignoredSegments.has(segment));
}

export async function runSyncWatchLoop(
  options: WatchSyncLoopOptions,
): Promise<void> {
  const watchRoot = resolve(options.localPath);
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const runtimeOptions = options.runtimeOptions;

  let syncInFlight = false;
  let pendingSync = false;
  let pendingReason = "changes";
  let debounceTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

  const runSync = (reason: string): void => {
    if (syncInFlight) {
      pendingSync = true;
      pendingReason = reason;
      return;
    }

    syncInFlight = true;

    try {
      console.log(`tue-cli sync: ${reason}`);
      executeAll(options.commands, options.dryRun, runtimeOptions);
      console.log("tue-cli sync: completed");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`tue-cli sync: failed (${message})`);
    } finally {
      syncInFlight = false;

      if (pendingSync) {
        pendingSync = false;
        const reasonToRun = pendingReason;
        pendingReason = "changes";
        runSync(reasonToRun);
      }
    }
  };

  runSync("initial");

  console.log(`Watching ${watchRoot} for file changes... Press Ctrl+C to stop.`);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const cleanup = (): void => {
      if (debounceTimer) {
        globalThis.clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }

      watcher.close();
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    };

    const onSignal = (): void => {
      cleanup();
      console.log("Stopped sync watch.");
      resolvePromise();
    };

    const watcher = watch(
      watchRoot,
      {
        recursive: true,
      },
      (_eventType, filename) => {
        const changedRelative = toRelativePath(watchRoot, filename);

        if (shouldIgnoreWatchPath(changedRelative)) {
          return;
        }

        if (debounceTimer) {
          globalThis.clearTimeout(debounceTimer);
        }

        debounceTimer = globalThis.setTimeout(() => {
          debounceTimer = undefined;
          runSync(
            changedRelative ? `change detected in ${changedRelative}` : "change detected",
          );
        }, debounceMs);
      },
    );

    watcher.on("error", (error) => {
      cleanup();
      rejectPromise(error);
    });

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}
