#!/usr/bin/env node
/**
 * Cross-platform sleep utility for testing
 * Usage: node sleep.js <seconds>
 */

const seconds = parseFloat(process.argv[2] || "");

if (isNaN(seconds) || seconds < 0) {
  console.error('Error: Invalid sleep duration');
  process.exit(1);
}

// Sleep for the specified duration
setTimeout(() => {
  console.log(`Slept for ${seconds} seconds`);
  process.exit(0);
}, seconds * 1000);
