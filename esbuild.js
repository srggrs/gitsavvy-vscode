const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  });
  copyWebviewAssets();
  if (watch) {
    const webviewDir = path.join(__dirname, 'src', 'views', 'webview');
    fs.watch(webviewDir, (_eventType, filename) => {
      if (filename === 'status.js' || filename === 'status.css') {
        copyWebviewAssets();
      }
    });
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

function copyWebviewAssets() {
  const srcDir = path.join(__dirname, 'src', 'views', 'webview');
  const destDir = path.join(__dirname, 'dist');
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of ['status.js', 'status.css']) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
