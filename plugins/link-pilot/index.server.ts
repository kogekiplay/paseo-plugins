import type { PluginServerContext } from "@getpaseo/plugin/server";
import { revealFile } from "./server/files";
import { revealLocalFile } from "./shared/files";
import { preferences } from "./shared/preferences";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  server.handle(revealLocalFile, revealFile);
  return () => {};
}
