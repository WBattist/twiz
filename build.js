import { rimraf } from 'rimraf';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

// Read version from package.json and set environment variable
const pkg = JSON.parse(await readFile('package.json', 'utf-8'));
process.env.ULTRAVIOLET_VERSION = pkg.version;

const isDevelopment = process.argv.includes('--dev');

// Clean and create dist directory
await rimraf('dist');
await mkdir('dist', { recursive: true });

// Copy static files to dist directory
const filesToCopy = ['src/sw.js', 'src/uv.config.js'];
await Promise.all(filesToCopy.map(file => copyFile(file, `dist/${file.split('/').pop()}`)));

// Build with esbuild
const buildOptions = {
  platform: 'browser',
  sourcemap: true,
  minify: !isDevelopment,
  entryPoints: {
    'uv.bundle': './src/rewrite/index.js',
    'uv.client': './src/client/index.js',
    'uv.handler': './src/uv.handler.js',
    'uv.sw': './src/uv.sw.js',
  },
  define: {
    'process.env.ULTRAVIOLET_VERSION': JSON.stringify(process.env.ULTRAVIOLET_VERSION),
  },
  bundle: true,
  treeShaking: true,
  metafile: isDevelopment,
  logLevel: 'info',
  outdir: 'dist/',
};

const builder = await build(buildOptions);

if (isDevelopment) {
  await writeFile('metafile.json', JSON.stringify(builder.metafile, null, 2), 'utf-8');
}
