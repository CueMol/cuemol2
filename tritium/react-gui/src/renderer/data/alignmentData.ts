/**
 * @file data/alignmentData.ts
 * @description Sample animation timeline data for the bottom-panel
 * Animation tab. The MSA mock that previously lived here was removed
 * when SequencePanel was rewritten as a live UXP-parity sequence viewer
 * (`panel.btmpanel-holder.seq`).
 *
 * @module alignmentData
 */

import type { AnimationData } from "../types";

// --- Animation timeline sample data ---

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
