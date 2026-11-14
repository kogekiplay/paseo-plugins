import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

function localFilePath(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "file:" || (parsed.hostname && parsed.hostname !== "localhost"))
    throw new Error("Only local file URLs can be revealed");
  return fileURLToPath(parsed);
}

function run(command: string, args: string[], input?: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}`));
    });
    child.stdin.end(input);
  });
}

function appleScriptString(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
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

export async function copyFile({ url }: { url: string }) {
  const path = localFilePath(url);
  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      `set the clipboard to POSIX file ${appleScriptString(path)}`,
    ]);
  } else {
    await copyAddress({ url });
  }
  return {};
}

export async function copyAddress({ url }: { url: string }) {
  const path = localFilePath(url);
  if (process.platform === "darwin") await run("pbcopy", [], path);
  else if (process.platform === "win32") await run("clip", [], path);
  else await run("xclip", ["-selection", "clipboard"], path);
  return {};
}
