import type { z } from "zod";
import type { configSchema } from "../config.js";

export type Config = z.infer<typeof configSchema>;
