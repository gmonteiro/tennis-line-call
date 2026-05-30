import type { Point, CourtPoint } from "@/types";

/**
 * Compute a 3x3 homography matrix from 4 point correspondences
 * using Direct Linear Transform (DLT).
 *
 * Maps source (pixel) points to destination (court) points.
 */
export function computeHomography(
  src: [Point, Point, Point, Point],
  dst: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
): number[][] {
  // Build the 8x9 matrix A for the DLT
  const A: number[][] = [];

  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];

    A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
    A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
  }

  // Solve Ah = 0 using simplified SVD for 8x9 matrix
  // We can solve the 8x8 system by setting h9 = 1
  const A8: number[][] = [];
  const b8: number[] = [];

  for (let i = 0; i < 8; i++) {
    A8.push(A[i].slice(0, 8));
    b8.push(-A[i][8]);
  }

  const h = solveLinear8x8(A8, b8);
  if (!h) {
    throw new Error("Failed to compute homography — points may be collinear");
  }

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

/**
 * Apply homography to map a pixel point to court coordinates
 */
export function applyHomography(
  H: number[][],
  point: Point
): CourtPoint {
  const { x, y } = point;
  const w = H[2][0] * x + H[2][1] * y + H[2][2];

  if (Math.abs(w) < 1e-10) {
    return { x: 0, y: 0 };
  }

  return {
    x: (H[0][0] * x + H[0][1] * y + H[0][2]) / w,
    y: (H[1][0] * x + H[1][1] * y + H[1][2]) / w,
  };
}

/**
 * Compute inverse homography (court coords → pixel coords)
 */
export function invertHomography(H: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = H;

  const det =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);

  if (Math.abs(det) < 1e-10) {
    throw new Error("Homography matrix is singular");
  }

  const invDet = 1 / det;

  return [
    [
      (e * i - f * h) * invDet,
      (c * h - b * i) * invDet,
      (b * f - c * e) * invDet,
    ],
    [
      (f * g - d * i) * invDet,
      (a * i - c * g) * invDet,
      (c * d - a * f) * invDet,
    ],
    [
      (d * h - e * g) * invDet,
      (b * g - a * h) * invDet,
      (a * e - b * d) * invDet,
    ],
  ];
}

/**
 * Solve 8x8 linear system using Gaussian elimination with partial pivoting
 */
function solveLinear8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]]);

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(M[col][col]);
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) {
        maxVal = Math.abs(M[row][col]);
        maxRow = row;
      }
    }

    if (maxVal < 1e-10) return null;

    // Swap rows
    if (maxRow !== col) {
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= M[i][j] * x[j];
    }
    x[i] /= M[i][i];
  }

  return x;
}
