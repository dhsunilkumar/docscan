import { useRef, useState, useEffect } from 'react';
import { ArrowLeft, Check, Save, RotateCw } from 'lucide-react';
import { applyDocumentEnhancement } from '../utils/opencv';

interface ImageFiltersProps {
  croppedImageDataUrl: string;
  onFilterComplete: (filteredImageDataUrl: string) => void;
  onSaveWithoutOcr: (filteredImageDataUrl: string) => void;
  onBack: () => void;
}

type FilterType = 'original' | 'grayscale' | 'bw' | 'magic';

export const ImageFilters: React.FC<ImageFiltersProps> = ({
  croppedImageDataUrl,
  onFilterComplete,
  onSaveWithoutOcr,
  onBack
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('original');
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  
  // Manual adjustments state
  const [brightness, setBrightness] = useState(0);   // -100 to 100
  const [contrast, setContrast] = useState(1.0);     // 0.5 to 2.0
  const [rotation, setRotation] = useState(0);       // 0, 90, 180, 270

  // Load image once
  useEffect(() => {
    const img = new Image();
    img.src = croppedImageDataUrl;
    img.onload = () => {
      setImgElement(img);
    };
  }, [croppedImageDataUrl]);

  // Apply chosen filter, rotation, and sliders onto the canvas
  const applyFilter = (img: HTMLImageElement, filter: FilterType, bright: number, cont: number, rot: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const angle = (rot * Math.PI) / 180;
    const is90or270 = rot % 180 !== 0;

    // Set canvas dimensions to fit the rotated image
    canvas.width = is90or270 ? img.height : img.width;
    canvas.height = is90or270 ? img.width : img.height;

    // Draw rotated image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(angle);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    
    // Reset transform so we can manipulate pixels normally
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1. First, apply professional document enhancement using OpenCV
    if (filter !== 'original') {
      try {
        applyDocumentEnhancement(canvas, filter);
      } catch (err) {
        console.error('Failed to run OpenCV document enhancement:', err);
      }
    }

    // 2. Second, apply custom brightness & contrast adjustments
    if (bright !== 0 || cont !== 1.0) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const C = (cont - 1.0) * 128;
      const factor = (259 * (C + 255)) / (255 * (259 - C));
      const clamp = (val: number) => Math.max(0, Math.min(255, val));

      for (let i = 0; i < data.length; i += 4) {
        data[i] = clamp(factor * (data[i] - 128) + 128 + bright);
        data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128 + bright);
        data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128 + bright);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  };

  // Re-run filter application when any inputs change
  useEffect(() => {
    if (imgElement) {
      applyFilter(imgElement, selectedFilter, brightness, contrast, rotation);
    }
  }, [imgElement, selectedFilter, brightness, contrast, rotation]);

  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleResetSliders = () => {
    setBrightness(0);
    setContrast(1.0);
  };

  const handleProceed = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const filteredDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onFilterComplete(filteredDataUrl);
  };

  const handleSaveOnly = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const filteredDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onSaveWithoutOcr(filteredDataUrl);
  };

  return (
    <div className="glass-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600 }}>
        Apply Image Filters
      </h3>

      {/* Canvas Viewport */}
      <div style={{
        background: '#09090d',
        borderRadius: 'var(--border-radius-sm)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        border: '1px solid var(--border-color)',
        maxHeight: '400px'
      }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%',
            maxHeight: '380px',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        />
      </div>

      {/* Toolbar for Rotation & Reset */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '15px', color: 'var(--text-secondary)' }}>
          Fine-Tune Adjustments
        </h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(brightness !== 0 || contrast !== 1.0) && (
            <button 
              onClick={handleResetSliders} 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '10px' }}
            >
              Reset
            </button>
          )}
          <button 
            onClick={handleRotate} 
            className="btn btn-secondary" 
            style={{ padding: '6px 12px', fontSize: '13px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCw size={14} style={{ color: 'var(--primary)' }} />
            <span>Rotate 90°</span>
          </button>
        </div>
      </div>

      {/* Brightness & Contrast Sliders */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        padding: '12px',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--border-radius-sm)',
        border: '1px solid var(--border-color)'
      }}>
        {/* Brightness */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Brightness</span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{brightness > 0 ? `+${brightness}` : brightness}</span>
          </div>
          <input
            type="range"
            min="-100"
            max="100"
            value={brightness}
            onChange={(e) => setBrightness(parseInt(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--primary)',
              cursor: 'pointer'
            }}
          />
        </div>

        {/* Contrast */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Contrast</span>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{contrast.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={contrast}
            onChange={(e) => setContrast(parseFloat(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--primary)',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>

      {/* Horizontal Filter Selector */}
      <div className="filters-list">
        {(['original', 'grayscale', 'bw', 'magic'] as FilterType[]).map((filter) => (
          <div
            key={filter}
            className={`filter-option ${selectedFilter === filter ? 'active' : ''}`}
            onClick={() => handleFilterChange(filter)}
          >
            <div
              className="filter-preview-box"
              style={{
                backgroundImage: `url(${croppedImageDataUrl})`,
                filter:
                  filter === 'grayscale'
                    ? 'grayscale(1)'
                    : filter === 'bw'
                    ? 'contrast(2) grayscale(1) brightness(1.2)'
                    : filter === 'magic'
                    ? 'saturate(1.5) contrast(1.2) brightness(1.1)'
                    : 'none'
              }}
            />
            <span className="filter-label">
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </span>
          </div>
        ))}
      </div>

      {/* Button Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <button onClick={onBack} className="btn btn-secondary">
          <ArrowLeft size={16} />
          Back
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSaveOnly} className="btn btn-secondary" style={{ border: '1px solid var(--border-color)' }}>
            <Save size={16} />
            <span>Save (No OCR)</span>
          </button>

          <button onClick={handleProceed} className="btn btn-primary">
            <Check size={16} />
            <span>OCR (Extract Text)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
