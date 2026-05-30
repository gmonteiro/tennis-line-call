/**
 * Compute the actual rendered rectangle of a video element
 * using object-fit: contain within its container.
 */
export interface VideoRect {
  /** Offset from left of container to start of video */
  offsetX: number;
  /** Offset from top of container to start of video */
  offsetY: number;
  /** Rendered width of the video */
  width: number;
  /** Rendered height of the video */
  height: number;
}

export function getVideoRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number
): VideoRect {
  const containerAspect = containerWidth / containerHeight;
  const videoAspect = videoWidth / videoHeight;

  let width: number;
  let height: number;

  if (videoAspect > containerAspect) {
    // Video is wider — letterbox top/bottom
    width = containerWidth;
    height = containerWidth / videoAspect;
  } else {
    // Video is taller — pillarbox left/right
    height = containerHeight;
    width = containerHeight * videoAspect;
  }

  return {
    offsetX: (containerWidth - width) / 2,
    offsetY: (containerHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Convert a click position (relative to container) to video pixel coordinates,
 * accounting for object-fit: contain.
 */
export function containerToVideoCoords(
  clickX: number,
  clickY: number,
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number
): { x: number; y: number } | null {
  const rect = getVideoRect(containerWidth, containerHeight, videoWidth, videoHeight);

  const x = clickX - rect.offsetX;
  const y = clickY - rect.offsetY;

  // Click is outside video area
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    return null;
  }

  return {
    x: (x / rect.width) * videoWidth,
    y: (y / rect.height) * videoHeight,
  };
}
