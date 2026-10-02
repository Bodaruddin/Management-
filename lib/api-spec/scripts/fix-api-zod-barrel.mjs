import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const barrelPath = path.resolve(scriptDirectory, "../../api-zod/src/index.ts");
const barrel = await readFile(barrelPath, "utf8");
const fixedBarrel = barrel
  .split(/\r?\n/)
  .filter((line) => !/^\s*export\s+\*\s+from\s+['"]\.\/generated\/types['"];\s*$/.test(line))
  .join("\n");

if (fixedBarrel !== barrel) {
  await writeFile(barrelPath, fixedBarrel, "utf8");
}