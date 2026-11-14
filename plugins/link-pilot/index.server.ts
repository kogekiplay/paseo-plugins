import type { PluginServerContext } from "@getpaseo/plugin/server";
import { copyAddress, copyFile, revealFile } from "./server/files";
import { copyLocalFile, copyLocalFileAddress, revealLocalFile } from "./shared/files";
import { preferences } from "./shared/preferences";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  server.handle(revealLocalFile, revealFile);
  server.handle(copyLocalFile, copyFile);
  server.handle(copyLocalFileAddress, copyAddress);
  return () => {};
}
