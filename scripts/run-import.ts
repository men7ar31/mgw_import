import "dotenv/config";
import { runImportOnce, startImport, resumeImport, stopImport } from "../src/lib/mgw/importer";

async function main() {
  const action = process.argv[2] || "run";
  if (action === "start") {
    const cursor = await startImport();
    console.log("Start OK", cursor);
    return;
  }
  if (action === "resume") {
    const cursor = await resumeImport();
    console.log("Resume OK", cursor);
    return;
  }
  if (action === "stop") {
    const cursor = await stopImport();
    console.log("Stop OK", cursor);
    return;
  }

  const result = await runImportOnce();
  console.log("Run result", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
