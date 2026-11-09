// Blocks Claude from editing secrets, generated migrations and git internals.
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data = {};
  try {
    data = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }
  const file = String(data?.tool_input?.file_path ?? "").replace(/\\/g, "/");
  const base = file.split("/").pop() ?? "";
  const isSecretEnv = base.startsWith(".env") && base !== ".env.example";
  const isServiceKey = base === "firebase-sa.json" || base.includes("-firebase-adminsdk-");
  const isMigration = file.includes("/prisma/migrations/");
  const isGitInternal = file.includes("/.git/");
  if (isSecretEnv || isServiceKey || isMigration || isGitInternal) {
    process.stderr.write(
      `Blocked: ${file} is protected (secrets, generated migrations or git internals). ` +
        "Add new variable NAMES to .env.example and ask the user to put real values in .env / .env.demo.",
    );
    process.exit(2);
  }
  process.exit(0);
});
