import React, { useState, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { Copy, Download, Save, ArrowLeft, CheckCircle2 } from 'lucide-react';

interface OCREngineProps {
  filteredImageDataUrl: string;
  onSave: (ocrText: string) => void;
  onBack: () => void;
  defaultText?: string;
}

const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'hin', name: 'Hindi (हिन्दी)' },
  { code: 'ben', name: 'Bengali (বাংলা)' },
  { code: 'mar', name: 'Marathi (मराठी)' },
  { code: 'tel', name: 'Telugu (తెలుగు)' },
  { code: 'tam', name: 'Tamil (தமிழ்)' },
  { code: 'kan', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'guj', name: 'Gujarati (ગુજરાતી)' },
  { code: 'mal', name: 'Malayalam (മലയാളം)' },
  { code: 'pan', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'spa', name: 'Spanish (Español)' },
  { code: 'fra', name: 'French (Français)' },
  { code: 'deu', name: 'German (Deutsch)' },
  { code: 'chi_sim', name: 'Chinese Simplified (简体中文)' },
  { code: 'ara', name: 'Arabic (العربية)' }
];

export const OCREngine: React.FC<OCREngineProps> = ({
  filteredImageDataUrl,
  onSave,
  onBack,
  defaultText = ''
}) => {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Initializing OCR Engine...');
  const [ocrText, setOcrText] = useState(defaultText);
  const [selectedLanguage, setSelectedLanguage] = useState('eng');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Run Tesseract OCR when image or language changes
  useEffect(() => {
    setLoading(true);
    setProgress(0);
    setStatusText('Initializing OCR Engine...');

    Tesseract.recognize(
      filteredImageDataUrl,
      selectedLanguage,
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
            setStatusText(`Recognizing text (${Math.round(m.progress * 100)}%)...`);
          } else {
            setStatusText(m.status);
          }
        }
      }
    )
      .then(({ data: { text } }) => {
        setOcrText(text || 'No text detected in this page.');
        setLoading(false);
      })
      .catch((err) => {
        console.error('OCR Error:', err);
        setOcrText('Failed to extract text. You can type manual notes here.');
        setLoading(false);
      });
  }, [filteredImageDataUrl, selectedLanguage]);

  const handleCopyText = () => {
    navigator.clipboard.writeText(ocrText);
    showToast('Text copied to clipboard!');
  };

  const handleDownloadTXT = () => {
    const element = document.createElement('a');
    const file = new Blob([ocrText], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `page_ocr.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showToast('Text file downloaded!');
  };

  const handleSavePage = () => {
    onSave(ocrText);
    showToast('Page saved with OCR text!');
  };

  return (
    <div className="glass-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600 }}>
          Extract Page Text (OCR)
        </h3>

        {/* Language Selection Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Language:</span>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="input-field"
            style={{ width: 'auto', padding: '6px 12px', height: '36px' }}
            disabled={loading}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} style={{ background: 'var(--bg-secondary)', color: '#fff' }}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="ocr-loader-container">
          <div className="spinner"></div>
          <div style={{ fontWeight: 600, fontSize: '16px' }}>Running OCR Engine</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{statusText}</div>
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      ) : (
        <div className="ocr-layout animate-fade">
          {/* Left: Scanned Page Image */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Page Image
            </span>
            <div style={{
              background: '#09090d',
              borderRadius: 'var(--border-radius-sm)',
              padding: '6px',
              border: '1px solid var(--border-color)',
              height: '300px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src={filteredImageDataUrl}
                alt="Page content"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          {/* Right: OCR Text Editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Extracted Text (Editable)
            </span>
            <textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              className="ocr-result-text"
            />
          </div>
        </div>
      )}

      {/* Buttons */}
      {!loading && (
        <div className="btn-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <button onClick={onBack} className="btn btn-secondary" style={{ flex: '1 1 auto' }}>
            <ArrowLeft size={16} />
            Back
          </button>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flex: '2 1 auto', justifyContent: 'flex-end' }}>
            <button onClick={handleCopyText} className="btn btn-secondary" title="Copy Text">
              <Copy size={16} />
              <span className="mobile-hide">Copy</span>
            </button>

            <button onClick={handleDownloadTXT} className="btn btn-secondary" title="Download Text File">
              <Download size={16} />
              <span className="mobile-hide">Text</span>
            </button>

            <button onClick={handleSavePage} className="btn btn-primary" title="Save Page to Document">
              <Save size={16} />
              <span>Save with OCR</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="status-toast">
          <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
