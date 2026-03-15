const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist', 'index.html');

console.log('Fixing paths in index.html for Electron...');

if (!fs.existsSync(indexPath)) {
  console.error('index.html not found at:', indexPath);
  process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');

// Replace ALL absolute paths with relative paths
// This includes _expo, node_modules, and any other absolute paths
html = html.replace(/href="\/_expo\//g, 'href="./_expo/');
html = html.replace(/src="\/_expo\//g, 'src="./_expo/');
html = html.replace(/href="\/favicon/g, 'href="./favicon');
html = html.replace(/src="\/favicon/g, 'src="./favicon');
html = html.replace(/href="\/node_modules\//g, 'href="./node_modules/');
html = html.replace(/src="\/node_modules\//g, 'src="./node_modules/');

// Fix any remaining absolute paths that start with /
html = html.replace(/href="\/([^"]+)"/g, 'href="./$1"');
html = html.replace(/src="\/([^"]+)"/g, 'src="./$1"');

// Add base tag to ensure all relative paths work correctly
if (!html.includes('<base')) {
  html = html.replace('<head>', '<head>\n  <base href="./">');
}

fs.writeFileSync(indexPath, html, 'utf8');

console.log('✓ Paths fixed successfully!');
console.log('  - Converted all absolute paths to relative paths');
console.log('  - Fixed _expo, node_modules, and asset paths');
console.log('  - Added base tag for proper path resolution');
