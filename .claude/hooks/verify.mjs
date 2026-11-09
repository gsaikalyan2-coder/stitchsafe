// Stop hook: Claude cannot finish a turn while typecheck or tests fail.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }
  if (data.stop_hook_active) process.exit(0); // second attempt: let Claude stop and explain

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) process.exit(0); // before the Phase 0 scaffold exists

  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {};
  } catch {
    process.exit(0);
  }
  if (!existsSync(join(root, "node_modules"))) process.exit(0); // deps not installed yet

  const steps = [];
  if (scripts.typecheck) steps.push("npm run typecheck");
  if (scripts.test) steps.push("npm test");
  if (steps.length === 0) process.exit(0);

  try {
    execSync(steps.join(" && "), { cwd: root, stdio: "pipe", timeout: 170_000 });
    process.exit(0);
  } catch (error) {
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(-4000);
    process.stderr.write(`Typecheck or tests failed. Fix them before finishing:\n${out}`);
    process.exit(2);
  }
});
