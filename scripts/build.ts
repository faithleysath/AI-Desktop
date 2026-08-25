await Bun.$`rm -rf dist`;

const result = await Bun.build({
  entrypoints: ["./server/index.ts"],
  outdir: "./dist",
  target: "bun",
  minify: true,
  sourcemap: "external",
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

export {};
