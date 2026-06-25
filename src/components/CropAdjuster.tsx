import React, { useRef, useState, useEffect } from 'react';
import { findDocumentCorners, warpPerspective } from '../utils/opencv';
import type { Point } from '../utils/opencv';

import { Crop, ArrowLeft, RefreshCw } from 'lucide-react';

interface CropAdjusterProps {
  imageDataUrl: string;
  onCropComplete: (croppedImageDataUrl: string) => void;
  onBack: () => void;
}

export const CropAdjuster: React.FC<CropAdjusterProps> = ({
  imageDataUrl,
  onCropComplete,
  onBack
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [points, setPoints] = useState<Point[]>([]);
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // Initialize crop handles when image loads
  const handleImageLoad = () => {
    const img = imageRef.current;
    if (!img) return;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    setImageSize({ width: naturalWidth, height: naturalHeight });

    // Set fallback margins immediately
    setPoints([
      { x: naturalWidth * 0.1, y: naturalHeight * 0.1 },
      { x: naturalWidth * 0.9, y: naturalHeight * 0.1 },
      { x: naturalWidth * 0.9, y: naturalHeight * 0.9 },
      { x: naturalWidth * 0.1, y: naturalHeight * 0.9 }
    ]);

    setImgLoaded(true);
  };

  // Run auto-detection when image is loaded and window.cv becomes available
  useEffect(() => {
    if (!imgLoaded || !imageRef.current || imageSize.width === 0) return;

    const runAutoDetection = () => {
      const img = imageRef.current;
      if (!img) return;

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = imageSize.width;
      tempCanvas.height = imageSize.height;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        try {
          if (window.cv && window.cv.Mat) {
            const detectedPoints = findDocumentCorners(tempCanvas);
            setPoints(detectedPoints);
          }
        } catch (err) {
          console.error('Failed to run OpenCV auto-detect:', err);
        }
      }
    };

    if (window.cv && window.cv.Mat) {
      runAutoDetection();
    } else {
      const interval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(interval);
          runAutoDetection();
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [imgLoaded, imageSize]);


  // Recalculate scaling scale on resizing or image loading
  useEffect(() => {
    const updateScale = () => {
      const img = imageRef.current;
      const container = containerRef.current;
      if (!img || !container || !imgLoaded) return;

      const rect = img.getBoundingClientRect();
      setScale({
        x: rect.width / imageSize.width,
        y: rect.height / imageSize.height
      });
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [imgLoaded, imageSize]);

  // Redraw connecting lines polygon on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imgLoaded || points.length !== 4) return;

    const rect = img.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw semi-transparent background overlay outside selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Cut out the selection polygon
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(points[0].x * scale.x, points[0].y * scale.y);
      ctx.lineTo(points[1].x * scale.x, points[1].y * scale.y);
      ctx.lineTo(points[2].x * scale.x, points[2].y * scale.y);
      ctx.lineTo(points[3].x * scale.x, points[3].y * scale.y);
      ctx.closePath();
      ctx.fill();

      // Draw active border lines
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#3a86ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(points[0].x * scale.x, points[0].y * scale.y);
      ctx.lineTo(points[1].x * scale.x, points[1].y * scale.y);
      ctx.lineTo(points[2].x * scale.x, points[2].y * scale.y);
      ctx.lineTo(points[3].x * scale.x, points[3].y * scale.y);
      ctx.closePath();
      ctx.stroke();

      // Fill inside slightly to show target region
      ctx.fillStyle = 'rgba(58, 134, 255, 0.1)';
      ctx.fill();
    }
  }, [points, scale, imgLoaded]);

  // Handle Dragging
  const handleStart = (index: number) => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setActiveHandle(index);
  };

  const handleMove = (e: MouseEvent | TouchEvent) => {
    if (activeHandle === null || !imageRef.current) return;

    const img = imageRef.current;
    const rect = img.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if (window.TouchEvent && e instanceof TouchEvent) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e instanceof MouseEvent) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Relative to the image rect
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    // Convert back to original image scale
    const originalX = Math.max(0, Math.min(imageSize.width, relX / scale.x));
    const originalY = Math.max(0, Math.min(imageSize.height, relY / scale.y));

    setPoints((prev) => {
      const updated = [...prev];
      updated[activeHandle] = { x: originalX, y: originalY };
      return updated;
    });
  };

  const handleEnd = () => {
    setActiveHandle(null);
  };

  // Attach global event listeners during dragging
  useEffect(() => {
    if (activeHandle !== null) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [activeHandle, scale, imageSize]);

  // Execute Warp perspective via OpenCV
  const handleCropApply = () => {
    const img = imageRef.current;
    if (!img || points.length !== 4) return;

    // Setup source canvas
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageSize.width;
    srcCanvas.height = imageSize.height;
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return;
    srcCtx.drawImage(img, 0, 0);

    // Setup destination canvas
    const destCanvas = document.createElement('canvas');
    
    try {
      warpPerspective(srcCanvas, points, destCanvas);
      const warpedDataUrl = destCanvas.toDataURL('image/jpeg', 0.95);
      onCropComplete(warpedDataUrl);
    } catch (err) {
      console.error('Error during warp:', err);
    }
  };

  const resetCrop = () => {
    // Reset to full image borders
    setPoints([
      { x: imageSize.width * 0.05, y: imageSize.height * 0.05 },
      { x: imageSize.width * 0.95, y: imageSize.height * 0.05 },
      { x: imageSize.width * 0.95, y: imageSize.height * 0.95 },
      { x: imageSize.width * 0.05, y: imageSize.height * 0.95 }
    ]);
  };

  return (
    <div className="glass-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '2px' }}>
        Adjust Document Corners
      </h3>

      <div ref={containerRef} className="crop-container" style={{ position: 'relative', width: 'fit-content', margin: '0 auto', borderRadius: 'var(--border-radius-sm)', overflow: 'hidden', touchAction: 'none' }}>
        {/* Underlay Image */}
        <img
          ref={imageRef}
          src={imageDataUrl}
          onLoad={handleImageLoad}
          alt="Original frame"
          className="crop-image"
          style={{ display: 'block', maxWidth: '100%', maxHeight: '52vh', objectFit: 'contain', userSelect: 'none' }}
        />

        {/* Overlay Canvas for Lines */}
        {imgLoaded && (
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }}
          />
        )}

        {/* Draggable Corner Handles */}
        {imgLoaded &&
          points.map((pt, index) => (
            <div
              key={index}
              className="crop-handle"
              style={{
                left: `${pt.x * scale.x}px`,
                top: `${pt.y * scale.y}px`
              }}
              onMouseDown={handleStart(index)}
              onTouchStart={handleStart(index)}
            />
          ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <button onClick={onBack} className="btn btn-secondary">
          <ArrowLeft size={16} />
          Retake
        </button>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={resetCrop} className="btn btn-secondary">
            <RefreshCw size={16} />
            Reset
          </button>
          
          <button onClick={handleCropApply} className="btn btn-primary">
            <Crop size={16} />
            Warp & Crop
          </button>
        </div>
      </div>
    </div>
  );
};
