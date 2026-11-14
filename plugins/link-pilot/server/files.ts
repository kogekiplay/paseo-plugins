import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

function localFilePath(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "file:" || (parsed.hostname && parsed.hostname !== "localhost"))
    throw new Error("Only local file URLs can be revealed");
  return fileURLToPath(parsed);
}

export async function revealFile({ url }: { url: string }) {
  const path = localFilePath(url);
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-R", path]);
  } else if (process.platform === "win32") {
    await execFileAsync("explorer.exe", [`/select,${path}`]);
  } else {
    await execFileAsync("xdg-open", [path]);
  }
  return {};
}
