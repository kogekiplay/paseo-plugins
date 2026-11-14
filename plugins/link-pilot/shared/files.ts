import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const revealLocalFile = defineRpc({
  name: "link-pilot.reveal-local-file",
  input: z.object({ url: z.string().url() }),
  output: z.object({}),
});

export const copyLocalFile = defineRpc({
  name: "link-pilot.copy-local-file",
  input: z.object({ url: z.string().url() }),
  output: z.object({}),
});

export const copyLocalFileAddress = defineRpc({
  name: "link-pilot.copy-local-file-address",
  input: z.object({ url: z.string().url() }),
  output: z.object({}),
});
