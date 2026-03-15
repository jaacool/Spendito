const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist', 'index.html');

console.log('Fixing paths in index.html for Electron...');

if (!fs.existsSync(indexPath)) {
  console.error('index.html not found at:', indexPath);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// Replace absolute paths with relative paths
// Expo generates paths like /_expo/static/... which don't work in Electron
html = html.replace(/href="\/_expo\//g, 'href="./_expo/');
html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
html = html.replace(/href="\/favicon/g, 'href="./favicon');
html = html.replace(/src="\/favicon/g, 'src="./favicon');

// Add base tag to ensure all relative paths work correctly
if (!html.includes('<base')) {
  html = html.replace('<head>', '<head>\n  <base href="./">');
}

fs.writeFileSync(indexPath, html, 'utf8');

console.log('✓ Paths fixed successfully!');
console.log('  - Converted absolute paths to relative paths');
console.log('  - Added base tag for proper path resolution');
