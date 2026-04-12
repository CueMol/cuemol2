/**
 * @file data/alignmentData.ts
 * @description Sample MSA (Multiple Sequence Alignment) data and animation
 * timeline data for demo purposes.
 *
 * The alignment data mimics a typical structural alignment result where
 * multiple chains from different PDB entries are aligned against a reference
 * sequence (e.g. UniProt P34897).
 *
 * @module alignmentData
 */

import type { AlignmentData, AnimationData } from "../types";

// ────────────────────────────────────────────────────────────
// MSA sample data
// ────────────────────────────────────────────────────────────

/** Sample multiple sequence alignment — structural overlay of SDH chains. */
export const SAMPLE_ALIGNMENT: AlignmentData = {
  name: "P34897 vs 5v7i alignment",
  startPosition: 48,
  entries: [
    {
      id: "aln-1",
      label: "A:P34897_0_poc",
      sequence:
        "ESLSDSDPEMWELLQREKDRQCRGELIASENFC" +
        "SRAALEALGSCLNNKYSEGYPGKRYYGGAEVVDEIE" +
        "SLSDSDPEMWELLQREKDRQCRGELIASENFC" +
        "SRAALEALGSCLNNKYSEGYPGKRYYGGAEVVDEIE",
    },
    {
      id: "aln-2",
      label: "L:P34897_0_poc",
      sequence:
        "---------------------------------" +
        "-----------------------------------" +
        "---------------------------------" +
        "-----------------------------------",
    },
    {
      id: "aln-3",
      label: "A:5v7i",
      sequence:
        "ESLSDSDPEMWELLQREKDRQCRGELIASENFC" +
        "SRAALEALGSCLNNKYSEGYPGKRYYGGAEVVDEIE" +
        "ESLSDSDPEMWELLQREKDRQCRGELIASENFC" +
        "SRAALEALGSCLNNKYSEGYPGKRYYGGAEVVDEIE",
    },
    {
      id: "aln-4",
      label: "B:5v7i",
      sequence:
        "ESLSDSDPEMWELLQREKDRQCRGELIASENFC" +
        "SRAALEALGSCLNNKYSEGYPGKRYYGGAEVVDEIE" +
        "ESLSDSDPEMWELLQREKDRQCRGELIASENFC" +
        "SRAALEALGSCLNNKYSEGYPGKRYYGGAEVVDEIE",
    },
  ],
};

// ────────────────────────────────────────────────────────────
// Animation timeline sample data
// ────────────────────────────────────────────────────────────

/** Sample animation — rotation and opacity keyframes over 300 frames at 30fps. */
export const SAMPLE_ANIMATION: AnimationData = {
  name: "morph_animation",
  totalFrames: 300,
  fps: 30,
  tracks: [
    {
      id: "trk-cam-pos",
      label: "Camera Position",
      icon: "camera",
      keyframes: [
        { frame: 0, value: "(0, 0, 50)" },
        { frame: 60, value: "(10, 5, 45)" },
        { frame: 150, value: "(0, 10, 40)" },
        { frame: 240, value: "(-5, 0, 50)" },
        { frame: 300, value: "(0, 0, 50)" },
      ],
    },
    {
      id: "trk-cam-rot",
      label: "Camera Rotation",
      icon: "camera",
      keyframes: [
        { frame: 0, value: "(0, 0, 0)" },
        { frame: 90, value: "(0, 90, 0)" },
        { frame: 180, value: "(0, 180, 0)" },
        { frame: 300, value: "(0, 360, 0)" },
      ],
    },
    {
      id: "trk-mol1-opacity",
      label: "1CRN Opacity",
      icon: "style",
      keyframes: [
        { frame: 0, value: "1.0" },
        { frame: 60, value: "0.3" },
        { frame: 120, value: "1.0" },
      ],
    },
    {
      id: "trk-mol2-opacity",
      label: "3J3Q Opacity",
      icon: "style",
      keyframes: [
        { frame: 60, value: "0.0" },
        { frame: 120, value: "1.0" },
        { frame: 240, value: "1.0" },
        { frame: 300, value: "0.0" },
      ],
    },
    {
      id: "trk-light-int",
      label: "Light Intensity",
      icon: "flash",
      keyframes: [
        { frame: 0, value: "0.8" },
        { frame: 150, value: "1.2" },
        { frame: 300, value: "0.8" },
      ],
    },
    {
      id: "trk-ribbon-width",
      label: "Ribbon Width",
      icon: "horizontal-distribution",
      keyframes: [
        { frame: 0, value: "1.0" },
        { frame: 100, value: "2.5" },
        { frame: 200, value: "0.5" },
        { frame: 300, value: "1.0" },
      ],
    },
  ],
};
