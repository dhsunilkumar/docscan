export interface Point {
  x: number;
  y: number;
}

declare global {
  interface Window {
    cv: any;
    Module: any;
    __errors: any[];
  }
}

let opencvPromise: Promise<any> | null = null;

export const loadOpenCV = (): Promise<any> => {
  if (opencvPromise) return opencvPromise;

  opencvPromise = new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) {
      resolve(window.cv);
      return;
    }

    // Prepare global Module callback
    window.Module = {
      onRuntimeInitialized: () => {
        console.log('OpenCV.js ready via onRuntimeInitialized');
        resolve(window.cv);
      }
    };

    const script = document.createElement('script');
    script.id = 'opencv-js';
    script.src = 'opencv.js';
    script.async = true;
    script.defer = true;
    script.type = 'text/javascript';

    script.onload = () => {
      console.log('opencv.js script loaded. Polling for WASM compilation...');
      let pollCount = 0;
      const pollInterval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(pollInterval);
          console.log('OpenCV.js ready via polling compilation check');
          resolve(window.cv);
        }
        pollCount++;
        // Timeout after 25 seconds (250 * 100ms)
        if (pollCount > 250) {
          clearInterval(pollInterval);
          if (window.__errors) {
            window.__errors.push({
              message: 'Timeout: OpenCV.js loaded but WebAssembly compilation timed out (did not initialize cv.Mat). Check if WebAssembly is supported/enabled in this browser.',
              time: new Date().toLocaleTimeString()
            });
          }
          reject(new Error('OpenCV.js WASM compilation timed out.'));
        }
      }, 100);
    };

    script.onerror = (e) => {
      console.error('Failed to load local opencv.js script:', e);
      if (window.__errors) {
        window.__errors.push({
          message: 'Failed to load script "opencv.js". The server might have returned a 404, CORS block, or MIME type block.',
          time: new Date().toLocaleTimeString()
        });
      }
      reject(new Error('Failed to load OpenCV.js'));
    };

    document.body.appendChild(script);
  });

  return opencvPromise;
};

// Sort 4 points: top-left, top-right, bottom-right, bottom-left
export function orderPoints(pts: Point[]): Point[] {
  if (pts.length !== 4) return pts;
  
  // Sort points by X coordinate
  const sortedByX = [...pts].sort((a, b) => a.x - b.x);
  const leftMost = [sortedByX[0], sortedByX[1]];
  const rightMost = [sortedByX[2], sortedByX[3]];
  
  // Within left points, top-left has smaller Y, bottom-left has larger Y
  const tl = leftMost[0].y < leftMost[1].y ? leftMost[0] : leftMost[1];
  const bl = leftMost[0].y < leftMost[1].y ? leftMost[1] : leftMost[0];
  
  // Within right points, top-right has smaller Y, bottom-right has larger Y
  const tr = rightMost[0].y < rightMost[1].y ? rightMost[0] : rightMost[1];
  const br = rightMost[0].y < rightMost[1].y ? rightMost[1] : rightMost[0];
  
  return [tl, tr, br, bl];
}

// Helper to calculate rotated rectangle corners
function getRotatedRectPoints(rect: any): Point[] {
  const cx = rect.center.x;
  const cy = rect.center.y;
  const w = rect.size.width;
  const h = rect.size.height;
  const angle = rect.angle;
  
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  const hw = w / 2;
  const hh = h / 2;
  
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ];
  
  return corners.map(pt => ({
    x: cx + pt.x * cos - pt.y * sin,
    y: cy + pt.x * sin + pt.y * cos
  }));
}

// Find document edges using scaled Canny edge detection, dilation & contours
export function findDocumentCorners(canvas: HTMLCanvasElement): Point[] {
  const cv = window.cv;
  if (!cv) {
    throw new Error('OpenCV not loaded');
  }

  const w = canvas.width;
  const h = canvas.height;
  const defaultPoints: Point[] = [
    { x: w * 0.1, y: h * 0.1 },
    { x: w * 0.9, y: h * 0.1 },
    { x: w * 0.9, y: h * 0.9 },
    { x: w * 0.1, y: h * 0.9 }
  ];

  // 1. Downscale the image internally using a temp canvas to reduce noise and speed up processing
  const maxDim = 800;
  let scaleFactor = 1;
  let targetW = w;
  let targetH = h;

  if (w > maxDim || h > maxDim) {
    if (w > h) {
      scaleFactor = maxDim / w;
      targetW = maxDim;
      targetH = Math.round(h * scaleFactor);
    } else {
      scaleFactor = maxDim / h;
      targetH = maxDim;
      targetW = Math.round(w * scaleFactor);
    }
  }

  const detectCanvas = document.createElement('canvas');
  detectCanvas.width = targetW;
  detectCanvas.height = targetH;
  const detectCtx = detectCanvas.getContext('2d');
  if (detectCtx) {
    detectCtx.drawImage(canvas, 0, 0, targetW, targetH);
  } else {
    return defaultPoints;
  }

  let src = cv.imread(detectCanvas);
  let gray = new cv.Mat();
  let blurred = new cv.Mat();

  // Helper to extract a 4-point quad from a binary mask
  const findQuadFromMask = (mask: any): Point[] | null => {
    let tempContours = new cv.MatVector();
    let tempHierarchy = new cv.Mat();
    cv.findContours(mask, tempContours, tempHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = targetW * targetH * 0.08; // Document should span at least 8% of the viewport
    const candidates: { index: number; area: number }[] = [];

    for (let i = 0; i < tempContours.size(); ++i) {
      const contour = tempContours.get(i);
      const area = cv.contourArea(contour);
      if (area > minArea) {
        candidates.push({ index: i, area });
      }
      contour.delete();
    }

    candidates.sort((a, b) => b.area - a.area);

    let pts: Point[] | null = null;

    for (const cand of candidates) {
      const contour = tempContours.get(cand.index);
      let found = false;

      // Strategy A: Convex Hull + Dynamic Epsilon Sweep
      let hull = new cv.Mat();
      cv.convexHull(contour, hull, false, true);
      const periHull = cv.arcLength(hull, true);
      let approx = new cv.Mat();

      for (let eps = 0.01; eps <= 0.08; eps += 0.01) {
        cv.approxPolyDP(hull, approx, eps * periHull, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          pts = [];
          for (let idx = 0; idx < 4; ++idx) {
            pts.push({
              x: approx.data32S[idx * 2],
              y: approx.data32S[idx * 2 + 1]
            });
          }
          found = true;
          break;
        }
      }

      approx.delete();
      hull.delete();

      if (found) {
        contour.delete();
        break;
      }

      // Strategy B: Raw Contour + Dynamic Epsilon Sweep
      const periContour = cv.arcLength(contour, true);
      approx = new cv.Mat();
      for (let eps = 0.01; eps <= 0.08; eps += 0.01) {
        cv.approxPolyDP(contour, approx, eps * periContour, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          pts = [];
          for (let idx = 0; idx < 4; ++idx) {
            pts.push({
              x: approx.data32S[idx * 2],
              y: approx.data32S[idx * 2 + 1]
            });
          }
          found = true;
          break;
        }
      }
      approx.delete();

      if (found) {
        contour.delete();
        break;
      }

      // Strategy C: Bounding Box Fallback (only on the largest candidate)
      if (cand.index === candidates[0].index) {
        const rotatedRect = cv.minAreaRect(contour);
        pts = getRotatedRectPoints(rotatedRect);
      }

      contour.delete();
    }

    tempContours.delete();
    tempHierarchy.delete();
    return pts;
  };

  try {
    // 2. Convert to Grayscale & Blur
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

    let approxPoints: Point[] | null = null;

    // Tier 1: Otsu Thresholding (Highly effective for solid light sheets on dark/wood tables)
    let binary = new cv.Mat();
    cv.threshold(blurred, binary, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    approxPoints = findQuadFromMask(binary);
    binary.delete();

    // Tier 2: Adaptive Thresholding Fallback (Highly effective for low-contrast white sheets on light/white tables)
    if (!approxPoints) {
      let adaptive = new cv.Mat();
      cv.adaptiveThreshold(gray, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
      
      const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(adaptive, adaptive, dilateKernel);
      dilateKernel.delete();

      approxPoints = findQuadFromMask(adaptive);
      adaptive.delete();
    }

    // Tier 3: Canny Edge Detection Fallback (For structured boundaries with heavy shadows/textures)
    if (!approxPoints) {
      let edged = new cv.Mat();
      cv.Canny(blurred, edged, 30, 100, 3, false);

      const dilateKernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edged, edged, dilateKernel);
      dilateKernel.delete();

      approxPoints = findQuadFromMask(edged);
      edged.delete();
    }

    // 6. Scale points back to the original canvas size
    if (approxPoints) {
      const finalPoints = approxPoints.map(pt => ({
        x: Math.max(0, Math.min(w, pt.x / scaleFactor)),
        y: Math.max(0, Math.min(h, pt.y / scaleFactor))
      }));
      return orderPoints(finalPoints);
    }

  } catch (error) {
    console.error('Error in findDocumentCorners:', error);
  } finally {
    // Cleanup cv Mats
    src.delete();
    gray.delete();
    blurred.delete();
  }

  return defaultPoints;
}

// Warp perspective of source canvas to flat deskewed output canvas
export function warpPerspective(
  srcCanvas: HTMLCanvasElement,
  points: Point[],
  destCanvas: HTMLCanvasElement
): void {
  const cv = window.cv;
  if (!cv) {
    throw new Error('OpenCV not loaded');
  }

  const sortedPoints = orderPoints(points);
  
  // Calculate destination dimensions
  const tl = sortedPoints[0];
  const tr = sortedPoints[1];
  const br = sortedPoints[2];
  const bl = sortedPoints[3];

  // Calculate width (max of top and bottom distances)
  const widthA = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
  const widthB = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
  const maxWidth = Math.max(widthA, widthB);

  // Calculate height (max of left and right distances)
  const heightA = Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2));
  const heightB = Math.sqrt(Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2));
  const maxHeight = Math.max(heightA, heightB);

  destCanvas.width = maxWidth;
  destCanvas.height = maxHeight;

  let src = cv.imread(srcCanvas);
  let dst = new cv.Mat();
  
  // Create mapping coordinates
  const srcCoords = Float32Array.from([
    tl.x, tl.y,
    tr.x, tr.y,
    br.x, br.y,
    bl.x, bl.y
  ]);
  
  const dstCoords = Float32Array.from([
    0, 0,
    maxWidth - 1, 0,
    maxWidth - 1, maxHeight - 1,
    0, maxHeight - 1
  ]);

  let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcCoords);
  let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstCoords);
  
  let M = cv.getPerspectiveTransform(srcTri, dstTri);
  let dsize = new cv.Size(maxWidth, maxHeight);
  
  try {
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    cv.imshow(destCanvas, dst);
  } catch (error) {
    console.error('Error during warpPerspective:', error);
  } finally {
    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }
}

// Apply professional shadow removal / page flattening to a canvas
export function applyDocumentEnhancement(
  canvas: HTMLCanvasElement,
  filterType: 'bw' | 'magic' | 'grayscale'
): void {
  const cv = window.cv;
  if (!cv) return;

  let src = cv.imread(canvas);
  let dst = new cv.Mat();

  // Helper to apply levels correction directly on a single-channel Mat data buffer (fast in-place TypedArray iteration)
  const applyLevelsGrayscaleInPlace = (mat: any, low: number, high: number) => {
    const data = mat.data;
    const len = data.length;
    const scale = 255 / (high - low);
    for (let i = 0; i < len; i++) {
      const val = data[i];
      if (val < low) {
        data[i] = 0;
      } else if (val > high) {
        data[i] = 255;
      } else {
        data[i] = (val - low) * scale; // Automatically clamped and rounded by Uint8Array
      }
    }
  };

  try {
    if (filterType === 'bw') {
      // 1. Grayscale
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 2. Estimate background illumination map (dilation + median blur)
      let dilated = new cv.Mat();
      let bg = new cv.Mat();
      let ksize = new cv.Size(19, 19);
      let M = cv.getStructuringElement(cv.MORPH_RECT, ksize);
      cv.dilate(gray, dilated, M);
      cv.medianBlur(dilated, bg, 21);

      // 3. Divide to normalize illumination (removes paper shadows completely)
      let normalized = new cv.Mat();
      cv.divide(gray, bg, normalized, 255);

      // 4. Apply Levels Adjustment in-place (solid black text, pure white background)
      applyLevelsGrayscaleInPlace(normalized, 110, 190);
      
      normalized.copyTo(dst);

      // Convert back to RGBA for canvas rendering
      cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA);

      gray.delete();
      dilated.delete();
      bg.delete();
      M.delete();
      normalized.delete();
    } else if (filterType === 'magic') {
      // 1. Convert to YCrCb to isolate luminance channel (Y)
      let ycrcb = new cv.Mat();
      cv.cvtColor(src, ycrcb, cv.COLOR_RGBA2RGB);
      cv.cvtColor(ycrcb, ycrcb, cv.COLOR_RGB2YCrCb);

      // 2. Split channels
      let channels = new cv.MatVector();
      cv.split(ycrcb, channels);
      let yChan = channels.get(0);

      // 3. Estimate background illumination map of Y channel
      let dilated = new cv.Mat();
      let bg = new cv.Mat();
      let ksize = new cv.Size(19, 19);
      let M = cv.getStructuringElement(cv.MORPH_RECT, ksize);
      cv.dilate(yChan, dilated, M);
      cv.medianBlur(dilated, bg, 21);

      // 4. Divide Y channel by background (removes color document shadows)
      let normalizedY = new cv.Mat();
      cv.divide(yChan, bg, normalizedY, 255);

      // 5. Apply Levels correction on Y channel in-place to clean background to pure white & darken color text
      applyLevelsGrayscaleInPlace(normalizedY, 80, 210);

      // Merge back channels
      channels.set(0, normalizedY);
      cv.merge(channels, ycrcb);

      // Convert back to RGBA
      cv.cvtColor(ycrcb, dst, cv.COLOR_YCrCb2RGB);
      cv.cvtColor(dst, dst, cv.COLOR_RGB2RGBA);

      ycrcb.delete();
      channels.delete();
      yChan.delete();
      dilated.delete();
      bg.delete();
      M.delete();
      normalizedY.delete();
    } else if (filterType === 'grayscale') {
      // Grayscale shadow removal
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      let dilated = new cv.Mat();
      let bg = new cv.Mat();
      let ksize = new cv.Size(19, 19);
      let M = cv.getStructuringElement(cv.MORPH_RECT, ksize);
      cv.dilate(gray, dilated, M);
      cv.medianBlur(dilated, bg, 21);

      let normalized = new cv.Mat();
      cv.divide(gray, bg, normalized, 255);
      
      // Gentle contrast stretch on grayscale in-place
      applyLevelsGrayscaleInPlace(normalized, 90, 220);

      normalized.copyTo(dst);
      cv.cvtColor(dst, dst, cv.COLOR_GRAY2RGBA);

      gray.delete();
      dilated.delete();
      bg.delete();
      M.delete();
      normalized.delete();
    }

    cv.imshow(canvas, dst);
  } catch (error) {
    console.error('Error during applyDocumentEnhancement:', error);
    // Fallback: draw original
    cv.imshow(canvas, src);
  } finally {
    src.delete();
    dst.delete();
  }
}

