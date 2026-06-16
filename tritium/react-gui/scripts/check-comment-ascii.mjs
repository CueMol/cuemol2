#!/usr/bin/env node
// check-comment-ascii.mjs
//
// Lint guard: forbid box-drawing / arrow / ellipsis glyphs (and similar
// decorative non-ASCII) inside source-code COMMENTS in react-gui TypeScript.
//
// Project convention (CLAUDE.md): source-code comments must be ASCII. UI
// string literals may legitimately contain scientific symbols such as the
// degree sign or the angstrom sign, so this check must NOT touch strings,
// template literals, JSX text, or regex literals -- only comments.
//
// Strategy (pragmatic, low false-positive):
//   1. Walk a line-oriented state machine over each file, tracking whether we
//      are inside a string, template literal, regex, line comment, or block
//      comment. This lets us collect ONLY the text that belongs to comments.
//   2. Flag any disallowed glyph that appears in the collected comment text.
//      A small allow-list keeps the degree and angstrom signs legal even if
//      they ever appear in a comment.
//
// This file is intentionally dependency-free (plain Node, no packages) and
// kept ASCII so it does not trip its own rule.
//
// Exit code:
//   0  no disallowed comment glyphs found
//   1  at least one disallowed comment glyph found
//   2  internal / usage error

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(SCRIPT_DIR, "..", "src");

// Glyphs that are explicitly allowed even inside comments. These are scientific
// convention symbols (degree sign, angstrom sign) and are exempt by project
// rule. Listed by code point to keep this source file ASCII-only.
const ALLOWED = new Set([
  0x00b0, // degree sign
  0x00c5, // angstrom sign (capital A with ring above)
  0x212b, // angstrom sign (dedicated unicode code point)
  0x00d7, // multiplication sign, used in dimension notation (1280x720)
]);

// Disallowed glyph predicate. We flag the well-known decorative ranges that the
// sweep removed: box-drawing, block elements, arrows, plus a few stray
// punctuation glyphs (em/en dash, ellipsis) commonly pasted into comments.
// Everything outside ASCII is reported except the ALLOWED set; this keeps the
// check strict and future-proof against new decorative glyphs.
function isDisallowed(code) {
  if (code <= 0x7f) return false; // plain ASCII is always fine
  if (ALLOWED.has(code)) return false;
  return true;
}

// Collect comment text from a single file using a small scanner. Returns an
// array of { line, col, char, code } for each disallowed glyph found inside a
// comment. Columns and lines are 1-based for human-friendly output.
function scanFile(text) {
  const findings = [];

  // Scanner states.
  const NORMAL = 0;
  const LINE_COMMENT = 1;
  const BLOCK_COMMENT = 2;
  const STRING = 3; // '...' or "..."
  const TEMPLATE = 4; // `...`
  const REGEX = 5; // /.../

  let state = NORMAL;
  let stringQuote = ""; // active quote char while in STRING
  let line = 1;
  let col = 0;

  // Tracks the previous significant (non-space) character in NORMAL state, used
  // to disambiguate a regex literal from a division operator.
  let prevSignificant = "";

  const len = text.length;
  let i = 0;

  while (i < len) {
    const ch = text[i];
    const next = i + 1 < len ? text[i + 1] : "";
    const code = text.codePointAt(i);

    // Advance line/col bookkeeping for newlines.
    if (ch === "\n") {
      if (state === LINE_COMMENT) state = NORMAL;
      line += 1;
      col = 0;
      i += 1;
      continue;
    }
    col += 1;

    switch (state) {
      case NORMAL: {
        if (ch === "/" && next === "/") {
          state = LINE_COMMENT;
          i += 2;
          col += 1;
          continue;
        }
        if (ch === "/" && next === "*") {
          state = BLOCK_COMMENT;
          i += 2;
          col += 1;
          continue;
        }
        if (ch === '"' || ch === "'") {
          state = STRING;
          stringQuote = ch;
          i += 1;
          continue;
        }
        if (ch === "`") {
          state = TEMPLATE;
          i += 1;
          continue;
        }
        if (ch === "/") {
          // Decide regex vs division. A regex can start when the previous
          // significant token is empty or an operator / opening bracket.
          if (canStartRegex(prevSignificant)) {
            state = REGEX;
            i += 1;
            continue;
          }
        }
        if (!/\s/.test(ch)) {
          prevSignificant = ch;
        }
        i += 1;
        continue;
      }

      case LINE_COMMENT: {
        if (isDisallowed(code)) {
          findings.push({ line, col, code });
        }
        i += charWidth(code);
        continue;
      }

      case BLOCK_COMMENT: {
        if (ch === "*" && next === "/") {
          state = NORMAL;
          prevSignificant = "/";
          i += 2;
          col += 1;
          continue;
        }
        if (isDisallowed(code)) {
          findings.push({ line, col, code });
        }
        i += charWidth(code);
        continue;
      }

      case STRING: {
        if (ch === "\\") {
          // Skip escaped char.
          i += 2;
          col += 1;
          continue;
        }
        if (ch === stringQuote) {
          state = NORMAL;
          prevSignificant = stringQuote;
        }
        i += 1;
        continue;
      }

      case TEMPLATE: {
        if (ch === "\\") {
          i += 2;
          col += 1;
          continue;
        }
        if (ch === "`") {
          state = NORMAL;
          prevSignificant = "`";
        }
        // Note: template expression spans ${...} are left inside TEMPLATE for
        // simplicity. Any glyphs there are ignored (treated as string), which
        // is acceptable for this comment-only check.
        i += 1;
        continue;
      }

      case REGEX: {
        if (ch === "\\") {
          i += 2;
          col += 1;
          continue;
        }
        if (ch === "/") {
          state = NORMAL;
          prevSignificant = "/";
        }
        i += 1;
        continue;
      }

      default:
        i += 1;
    }
  }

  return findings;
}

// True when a '/' following the given previous significant char begins a regex
// literal rather than a division. Conservative: when in doubt we allow regex,
// since misclassifying a division as regex only risks skipping a few chars of
// code (never a comment), and we never want to misread code as a comment.
function canStartRegex(prev) {
  if (prev === "") return true;
  // Operators / separators after which a regex is the natural reading.
  return "(,=:[!&|?{};+-*%^~<>".includes(prev);
}

// Number of UTF-16 code units a code point occupies (1 or 2). Needed so the
// index advances correctly past astral-plane glyphs.
function charWidth(code) {
  return code > 0xffff ? 2 : 1;
}

// Recursively collect *.ts / *.tsx files under a directory.
function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  let files;
  try {
    files = collectFiles(SRC_DIR);
  } catch (err) {
    console.error(`check-comment-ascii: cannot read src dir: ${err.message}`);
    process.exit(2);
  }

  let total = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const findings = scanFile(text);
    if (findings.length === 0) continue;
    const rel = relative(join(SRC_DIR, ".."), file);
    for (const f of findings) {
      const hex = f.code.toString(16).toUpperCase().padStart(4, "0");
      console.error(
        `${rel}:${f.line}:${f.col}: non-ASCII glyph U+${hex} in comment`
      );
      total += 1;
    }
  }

  if (total > 0) {
    console.error(
      `\ncheck-comment-ascii: FAILED -- ${total} disallowed comment glyph(s) found.`
    );
    console.error(
      "Comments must be ASCII (degree and angstrom signs excepted)."
    );
    process.exit(1);
  }

  console.log(
    `check-comment-ascii: OK -- scanned ${files.length} file(s), no disallowed comment glyphs.`
  );
  process.exit(0);
}

main();
