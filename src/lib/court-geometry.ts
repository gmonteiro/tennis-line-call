// ITF Tennis Court Dimensions (meters)
// Origin (0,0) = bottom-left corner of doubles court (near baseline, left sideline)
// Y-axis points toward the far baseline (away from camera)
// X-axis points right

export const COURT = {
  // Full court
  doublesWidth: 10.97,
  singlesWidth: 8.23,
  length: 23.77,

  // Derived positions
  sidelineDoubles: { left: 0, right: 10.97 },
  sidelineSingles: {
    left: (10.97 - 8.23) / 2, // 1.37
    right: (10.97 - 8.23) / 2 + 8.23, // 9.60
  },

  // Baselines (y positions)
  nearBaseline: 0,
  farBaseline: 23.77,

  // Net
  net: 23.77 / 2, // 11.885

  // Service lines
  nearServiceLine: 23.77 / 2 - 6.40, // 5.485
  farServiceLine: 23.77 / 2 + 6.40, // 18.285

  // Center service line (x position)
  centerServiceLine: 10.97 / 2, // 5.485

  // Service boxes (for the far side - where serves from near side land)
  serviceBoxDeuce: {
    left: (10.97 - 8.23) / 2, // 1.37 (singles sideline)
    right: 10.97 / 2, // 5.485 (center)
    near: 23.77 / 2, // 11.885 (net)
    far: 23.77 / 2 + 6.40, // 18.285 (service line)
  },
  serviceBoxAd: {
    left: 10.97 / 2, // 5.485 (center)
    right: (10.97 - 8.23) / 2 + 8.23, // 9.60 (singles sideline)
    near: 23.77 / 2, // 11.885 (net)
    far: 23.77 / 2 + 6.40, // 18.285 (service line)
  },
} as const;

// The 4 calibration target points in court coordinates (meters)
// These are the corners the user taps, mapped to real-world positions.
// We calibrate for the FAR half of the court (the side away from camera)
// since that's where the camera sees bounces most clearly.
export const CALIBRATION_TARGETS: [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] = [
  { x: COURT.sidelineSingles.left, y: COURT.farBaseline }, // Far-left baseline
  { x: COURT.sidelineSingles.right, y: COURT.farBaseline }, // Far-right baseline
  { x: COURT.sidelineSingles.right, y: COURT.net }, // Near-right (net)
  { x: COURT.sidelineSingles.left, y: COURT.net }, // Near-left (net)
];

// Court line segments for overlay drawing (in court coordinates)
export const COURT_LINES = {
  singles: [
    // Baselines
    [
      { x: COURT.sidelineSingles.left, y: COURT.nearBaseline },
      { x: COURT.sidelineSingles.right, y: COURT.nearBaseline },
    ],
    [
      { x: COURT.sidelineSingles.left, y: COURT.farBaseline },
      { x: COURT.sidelineSingles.right, y: COURT.farBaseline },
    ],
    // Sidelines
    [
      { x: COURT.sidelineSingles.left, y: COURT.nearBaseline },
      { x: COURT.sidelineSingles.left, y: COURT.farBaseline },
    ],
    [
      { x: COURT.sidelineSingles.right, y: COURT.nearBaseline },
      { x: COURT.sidelineSingles.right, y: COURT.farBaseline },
    ],
    // Service lines
    [
      { x: COURT.sidelineSingles.left, y: COURT.nearServiceLine },
      { x: COURT.sidelineSingles.right, y: COURT.nearServiceLine },
    ],
    [
      { x: COURT.sidelineSingles.left, y: COURT.farServiceLine },
      { x: COURT.sidelineSingles.right, y: COURT.farServiceLine },
    ],
    // Center service line
    [
      { x: COURT.centerServiceLine, y: COURT.nearServiceLine },
      { x: COURT.centerServiceLine, y: COURT.farServiceLine },
    ],
    // Net
    [
      { x: COURT.sidelineDoubles.left, y: COURT.net },
      { x: COURT.sidelineDoubles.right, y: COURT.net },
    ],
  ],
};
