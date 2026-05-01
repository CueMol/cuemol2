#!/usr/bin/env node
/**
 * Cross-platform directory listing utility for testing
 * Usage: node ls.js [options] [path]
 */

import fs from 'fs';
import path from 'path';

// Parse arguments
const args = process.argv.slice(2);
let showDetails = false;
let targetPath = '.';

// Simple argument parsing (-la flag and path)
for (const arg of args) {
  if (arg.startsWith('-')) {
    if (arg.includes('l')) showDetails = true;
  } else {
    targetPath = arg;
  }
}

try {
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (showDetails) {
      const fullPath = path.join(targetPath, entry.name);
      const stats = fs.statSync(fullPath);
      const type = entry.isDirectory() ? 'd' : '-';
      const size = stats.size;
      const name = entry.name;
      
      console.log(`${type} ${size.toString().padStart(10)} ${name}`);
    } else {
      console.log(entry.name);
    }
  }
  
  process.exit(0);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
