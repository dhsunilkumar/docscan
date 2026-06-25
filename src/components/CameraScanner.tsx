import React, { useRef, useState, useEffect } from 'react';
import { Image as ImageIcon, RotateCw, AlertCircle } from 'lucide-react';

const resizeImageIfNeeded = (dataUrl: string, maxDim: number = 1600): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) {
        resolve(dataUrl);
        return;
      }
      let w = img.width;
      let h = img.height;
      if (w > h) {
        if (w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        }
      } else {
        if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
  });
};

// Module-level globals to manage camera stream across StrictMode remounts
let globalStream: MediaStream | null = null;
let globalStreamFacingMode: 'user' | 'environment' | null = null;
let globalPendingPromise: Promise<MediaStream> | null = null;
let globalStopTimeout: any = null;
let activeClientCount = 0;

const stopGlobalStream = () => {
  if (globalStream) {
    globalStream.getTracks().forEach((track) => track.stop());
    globalStream = null;
  }
  globalStreamFacingMode = null;
  globalPendingPromise = null;
};

const acquireGlobalStream = async (facingMode: 'user' | 'environment'): Promise<MediaStream> => {
  // Cancel any pending stop timeout
  if (globalStopTimeout !== null) {
    clearTimeout(globalStopTimeout);
    globalStopTimeout = null;
  }

  // If the global stream exists, is active, and has the correct facingMode, reuse it!
  if (globalStream && globalStreamFacingMode === facingMode) {
    const hasActiveTracks = globalStream.getVideoTracks().some(track => track.readyState === 'live');
    if (hasActiveTracks) {
      return globalStream;
    }
  }

  // If there is a pending getUserMedia request for the SAME facingMode, reuse that promise!
  if (globalPendingPromise && globalStreamFacingMode === facingMode) {
    return globalPendingPromise;
  }

  // If there's an existing stream with a different facingMode, stop it first
  if (globalStream) {
    stopGlobalStream();
  }

  const constraints: MediaStreamConstraints = {
    video: {
      facingMode: facingMode,
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  };

  const promise = (async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      globalStream = mediaStream;
      globalStreamFacingMode = facingMode;
      globalPendingPromise = null;
      return mediaStream;
    } catch (err) {
      console.warn('Failed to get user media with constraints, trying fallback', err);
      // Fallback: try without resolution constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingMode },
          audio: false
        });
        globalStream = fallbackStream;
        globalStreamFacingMode = facingMode;
        globalPendingPromise = null;
        return fallbackStream;
      } catch (fallbackErr) {
        globalPendingPromise = null;
        throw fallbackErr;
      }
    }
  })();

  globalPendingPromise = promise;
  globalStreamFacingMode = facingMode;
  return promise;
};

const releaseGlobalStream = (immediate = false) => {
  if (globalStopTimeout !== null) {
    clearTimeout(globalStopTimeout);
    globalStopTimeout = null;
  }

  if (immediate) {
    stopGlobalStream();
  } else {
    // Only stop if no other client is currently active
    if (activeClientCount <= 0) {
      globalStopTimeout = window.setTimeout(() => {
        if (activeClientCount <= 0) {
          stopGlobalStream();
        }
        globalStopTimeout = null;
      }, 300);
    }
  }
};

interface CameraScannerProps {
  onCapture: (imageDataUrl: string) => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isCameraActive, setIsCameraActive] = useState(false);

  // StrictMode Safety Refs
  const isMountedRef = useRef(true);

  // Check if multiple camera devices exist
  useEffect(() => {
    isMountedRef.current = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setHasMultipleCameras(false);
      return;
    }
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      if (!isMountedRef.current) return;
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    }).catch((err) => {
      console.warn('enumerateDevices failed:', err);
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Initialize camera stream
  useEffect(() => {
    isMountedRef.current = true;
    activeClientCount++;
    
    const startCamera = async () => {
      setError(null);
      setIsCameraActive(false);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Camera access is not supported on this connection or device. Please run over HTTPS to enable camera capture, or import from your gallery.');
        return;
      }

      try {
        const mediaStream = await acquireGlobalStream(facingMode);
        
        if (!isMountedRef.current) {
          return;
        }

        setIsCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch((playErr) => {
            console.warn('Auto-play failed in startCamera, relying on onLoadedMetadata:', playErr);
          });
        }
      } catch (err: any) {
        console.error('Camera access error in startCamera:', err);
        if (isMountedRef.current) {
          setError(`Camera access error: ${err.name || err.message || err}`);
          setIsCameraActive(false);
        }
      }
    };

    startCamera();
    
    return () => {
      isMountedRef.current = false;
      activeClientCount--;
      releaseGlobalStream(false);
    };
  }, [facingMode]);

  // Flip camera toggle
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Capture frame from video stream
  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || !isCameraActive) return;

    const canvas = document.createElement('canvas');
    // Capture at video's native resolution for highest quality OCR
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // If using front camera, mirror the frame
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      
      releaseGlobalStream(true);
      setIsCameraActive(false);

      const resizedDataUrl = await resizeImageIfNeeded(dataUrl);
      onCapture(resizedDataUrl);
    }
  };

  // Handle image import from gallery file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result && typeof event.target.result === 'string') {
        releaseGlobalStream(true);
        setIsCameraActive(false);
        const resizedDataUrl = await resizeImageIfNeeded(event.target.result);
        onCapture(resizedDataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="scanner-container">
        {isCameraActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => {
                videoRef.current?.play().catch((e) => console.error('Video play error on metadata load:', e));
              }}
              className="camera-preview"
            />
            <div className="scanner-overlay">
              <div className="scanner-guides"></div>
              
              <div className="scanner-controls">
                {/* Flip camera */}
                {hasMultipleCameras && (
                  <button onClick={toggleCamera} className="btn btn-secondary btn-icon-only" title="Switch Camera">
                    <RotateCw size={20} />
                  </button>
                )}
                
                {/* Shutter button */}
                <button onClick={captureFrame} className="shutter-btn" title="Capture Document"></button>
                
                {/* Gallery selector icon */}
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary btn-icon-only" title="Import from Gallery">
                  <ImageIcon size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            background: 'var(--bg-secondary)',
            gap: '16px'
          }}>
            <AlertCircle size={48} style={{ color: 'var(--text-muted)' }} />
            {error ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{error}</p>
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Starting camera stream...</p>
            )}
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary" style={{ marginTop: '12px' }}>
              <ImageIcon size={18} />
              Choose Photo from Device
            </button>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />

      {isCameraActive && (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
          Align the document boundaries inside the center frame and press capture
        </div>
      )}
    </div>
  );
};
