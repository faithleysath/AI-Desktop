import { rm } from "node:fs/promises";
import tailwind from "bun-plugin-tailwind";

await rm("dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./server/index.ts"],
  outdir: "./dist",
  target: "bun",
  minify: true,
  sourcemap: "external",
  plugins: [tailwind],
  naming: {
    entry: "[name].[ext]",
    chunk: "[name]-[hash].[ext]",
    asset: "[name]-[hash].[ext]",
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

for (const log of result.logs) {
  console.error(log);
}

if (!result.success) {
  process.exit(1);
}

console.log(`Built ${result.outputs.length} output files.`);
