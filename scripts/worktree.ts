export {};

/**
 * Milestone worktrees, kept in one hidden place.
 *
 * Builders used to run `git worktree add ../bounds-mNN`, which strewed
 * bounds-* folders across ~/Projects, and a dev server still running in a
 * removed worktree rewrote its .vite cache and left an empty shell behind.
 * Every worktree now lives under ~/Projects/.worktrees/<repo>/<name>: outside
 * the repo, so `bun test` and the Vite watcher in the main checkout do not
 * see it, and hidden, so the Projects folder stays clean.
 *
 *   bun run wt add m71 [base]   new branch m71 from base (default main), deps installed
 *   bun run wt remove m71       refuses if unmerged, dirty or in use; deletes the folder
 *   bun run wt list
 */

import { existsSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const run = (cmd: string[], cwd = repo) => {
  const p = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: p.exitCode === 0, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
};

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const top = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], {
  cwd: import.meta.dir,
  stdout: "pipe",
});
const repo = dirname(top.stdout.toString().trim());
const home = join(dirname(repo), ".worktrees", basename(repo));
const pathFor = (name: string) => join(home, name);

const [cmd, name, base = "main"] = process.argv.slice(2);

if (cmd === "list") {
  console.log(run(["git", "worktree", "list"]).out);
  process.exit(0);
}

if (!name || !/^[\w.-]+$/.test(name)) {
  fail("usage: bun run wt add <name> [base] | remove <name> | list");
}
const where = pathFor(name!);

if (cmd === "add") {
  if (existsSync(where)) fail(`${where} already exists`);
  const add = run(["git", "worktree", "add", "-b", name!, where, base]);
  if (!add.ok) fail(add.err);
  const install = run(["bun", "install", "--frozen-lockfile"], where);
  if (!install.ok) fail(`worktree made at ${where}, but bun install failed:\n${install.err}`);
  console.log(where);
} else if (cmd === "remove") {
  const force = process.argv.includes("--force");
  if (!force) {
    const merged = run(["git", "merge-base", "--is-ancestor", name!, "main"]);
    if (!merged.ok) fail(`${name} has commits that are not on main; merge it or pass --force`);
    if (existsSync(where) && run(["git", "status", "--porcelain"], where).out) {
      fail(`${where} has uncommitted changes; commit them or pass --force`);
    }
    // A dev server or test run still inside the folder recreates it after removal.
    const cwds = run(["lsof", "-a", "-d", "cwd", "-Fpn"]).out.split("\n");
    const busy: string[] = [];
    for (let i = 0; i < cwds.length; i++) {
      const line = cwds[i]!;
      if (line.startsWith("n") && resolve(line.slice(1)).startsWith(where)) busy.push(cwds[i - 1]!.slice(1));
    }
    if (busy.length) fail(`processes are still running in ${where} (pid ${busy.join(", ")}); stop them first`);
  }
  if (existsSync(where)) {
    const rm = run(["git", "worktree", "remove", ...(force ? ["--force"] : []), where]);
    if (!rm.ok) fail(rm.err);
  }
  rmSync(where, { recursive: true, force: true });
  run(["git", "worktree", "prune"]);
  console.log(`removed ${where}; branch ${name} kept`);
} else {
  fail("usage: bun run wt add <name> [base] | remove <name> | list");
}
