// Generate extension icons using Canvas (run with Node.js)
// Requires: npm install canvas

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const iconsDir = path.join(__dirname);

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background circle
  const center = size / 2;
  const radius = size * 0.42;

  // Dark background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, size, size);

  // Rounded rectangle background
  const r = size * 0.2;
  ctx.beginPath();
  ctx.roundRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9, r);
  ctx.fillStyle = '#222244';
  ctx.fill();

  // Red recording dot
  const dotRadius = size * 0.18;
  ctx.beginPath();
  ctx.arc(center, center - size * 0.05, dotRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#e74c3c';
  ctx.fill();

  // White highlight on dot
  ctx.beginPath();
  ctx.arc(center - dotRadius * 0.3, center - size * 0.05 - dotRadius * 0.3, dotRadius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fill();

  // Small text "REC" below for larger icons
  if (size >= 48) {
    ctx.fillStyle = '#888';
    ctx.font = `bold ${Math.round(size * 0.12)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('REC', center, size * 0.88);
  }

  const filename = `icon${size}.png`;
  const filepath = path.join(iconsDir, filename);
  fs.writeFileSync(filepath, canvas.toBuffer('image/png'));
  console.log(`Generated ${filename}`);
}

console.log('Done!');
