import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('1. Compiling Tailwind production CSS...');
execSync('npm run build:css', { stdio: 'inherit' });

console.log('2. Preparing dist/ directory...');
const dist = path.resolve('dist');
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('3. Copying production assets into dist/ ...');
fs.copyFileSync('index.html', path.join(dist, 'index.html'));
copyRecursive('css', path.join(dist, 'css'));
copyRecursive('js', path.join(dist, 'js'));

console.log('✓ Build complete! All static assets and bundles populated in dist/');
