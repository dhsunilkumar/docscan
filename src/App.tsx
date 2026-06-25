import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Header } from './components/Header';
import { CameraScanner } from './components/CameraScanner';
import { CropAdjuster } from './components/CropAdjuster';
import { ImageFilters } from './components/ImageFilters';
import { OCREngine } from './components/OCREngine';
import { HistoryList } from './components/HistoryList';
import { DocumentDetails } from './components/DocumentDetails';
import { loadOpenCV } from './utils/opencv';
import { storage } from './utils/storage';
import type { ScannedDocument, DocumentPage } from './utils/storage';

type WorkflowStep = 'HISTORY' | 'CAPTURE' | 'CROP' | 'FILTER' | 'OCR' | 'DOC_DETAILS';

function App() {
  const [step, setStep] = useState<WorkflowStep>('CAPTURE');
  const [isOpenCVLoaded, setIsOpenCVLoaded] = useState(false);
  const [loadingCV, setLoadingCV] = useState(true);
  const [debugErrors, setDebugErrors] = useState<any[]>([]);

  // Poll for errors inside window.__errors
  useEffect(() => {
    const interval = setInterval(() => {
      const winErrors = (window as any).__errors;
      if (winErrors && winErrors.length !== debugErrors.length) {
        setDebugErrors([...winErrors]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [debugErrors]);

  // Active Multi-page Document
  const [activeDoc, setActiveDoc] = useState<ScannedDocument | null>(null);

  // Workflow current image states (for the page currently being scanned)
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [croppedImage, setCroppedImage] = useState<string>('');
  const [filteredImage, setFilteredImage] = useState<string>('');

  const [refreshHistory, setRefreshHistory] = useState(false);

  // Lazy load OpenCV.js
  useEffect(() => {
    loadOpenCV()
      .then(() => {
        setIsOpenCVLoaded(true);
        setLoadingCV(false);
      })
      .catch((err) => {
        console.error('Failed to load OpenCV:', err);
        setLoadingCV(false);
      });
  }, []);

  // Initialize a new document automatically if we start on CAPTURE step without an active document
  useEffect(() => {
    if (step === 'CAPTURE' && !activeDoc) {
      handleStartNewDoc();
    }
  }, [step, activeDoc]);

  const handleStartNewDoc = () => {
    const timestamp = Date.now();
    const newDoc: ScannedDocument = {
      id: Math.random().toString(36).substring(2, 9),
      title: `Doc Scan - ${new Date(timestamp).toLocaleDateString()}`,
      pages: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    setActiveDoc(newDoc);
    setCapturedImage('');
    setCroppedImage('');
    setFilteredImage('');
    setStep('CAPTURE');
  };

  const handleToggleHistory = (show: boolean) => {
    if (show) {
      setStep('HISTORY');
      setActiveDoc(null);
    } else {
      handleStartNewDoc();
    }
  };

  const handleCapture = (imageDataUrl: string) => {
    setCapturedImage(imageDataUrl);
    setStep('CROP');
  };

  const handleCropComplete = (croppedDataUrl: string) => {
    setCroppedImage(croppedDataUrl);
    setStep('FILTER');
  };

  // User clicked Proceed to OCR on the Filter view
  const handleProceedToOcr = (filteredDataUrl: string) => {
    setFilteredImage(filteredDataUrl);
    setStep('OCR');
  };

  // User clicked Save Without OCR on the Filter view
  const handleSaveWithoutOcr = async (filteredDataUrl: string) => {
    await handleSavePage(filteredDataUrl, '');
  };

  // OCR completed and user saved
  const handleOcrSave = async (ocrText: string) => {
    await handleSavePage(filteredImage, ocrText);
  };

  // Base helper to save a page image and text to activeDoc
  const handleSavePage = async (processedImg: string, ocrText: string) => {
    let currentDoc = activeDoc;
    if (!currentDoc) {
      const timestamp = Date.now();
      currentDoc = {
        id: Math.random().toString(36).substring(2, 9),
        title: `Doc Scan - ${new Date(timestamp).toLocaleDateString()}`,
        pages: [],
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }

    const newPage: DocumentPage = {
      id: Math.random().toString(36).substring(2, 9),
      originalImage: capturedImage,
      processedImage: processedImg,
      text: ocrText
    };

    const updatedDoc: ScannedDocument = {
      ...currentDoc,
      pages: [...currentDoc.pages, newPage],
      updatedAt: Date.now()
    };

    await storage.saveScan(updatedDoc);
    setActiveDoc(updatedDoc);
    setRefreshHistory((prev) => !prev);
    
    // Reset intermediate page capture states
    setCapturedImage('');
    setCroppedImage('');
    setFilteredImage('');
    
    setStep('DOC_DETAILS');
  };

  // Document details triggered updates (rename, delete page)
  const handleUpdateDocumentDetails = async (updatedDoc: ScannedDocument) => {
    await storage.saveScan(updatedDoc);
    setActiveDoc(updatedDoc);
    setRefreshHistory((prev) => !prev);
  };

  const handleSelectHistoryScan = (doc: ScannedDocument) => {
    setActiveDoc(doc);
    setStep('DOC_DETAILS');
  };

  const handleAddPageToDoc = () => {
    setCapturedImage('');
    setCroppedImage('');
    setFilteredImage('');
    setStep('CAPTURE');
  };

  const handleCaptureBack = () => {
    if (activeDoc && activeDoc.pages.length > 0) {
      setStep('DOC_DETAILS');
    } else {
      setStep('HISTORY');
    }
  };

  return (
    <>
      <Header
        showHistory={step === 'HISTORY'}
        onToggleHistory={handleToggleHistory}
        isOpenCVLoaded={isOpenCVLoaded}
      />

      <main className="app-container">
        {/* Loading OpenCV Overlay Banner */}
        {loadingCV && (
          <div className="opencv-loading-banner animate-fade">
            <div className="spinner-sm"></div>
            <span>Downloading image processing modules (OpenCV)... Scanner will be ready in a moment.</span>
          </div>
        )}

        {/* State Machine Views */}
        {step === 'HISTORY' && (
          <HistoryList
            onSelectScan={handleSelectHistoryScan}
            refreshTrigger={refreshHistory}
          />
        )}

        {step === 'CAPTURE' && (
          <div className="glass-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <button onClick={handleCaptureBack} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '12px' }}>
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              {activeDoc && (
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Adding to: {activeDoc.title}
                </span>
              )}
            </div>
            

            <CameraScanner onCapture={handleCapture} />
          </div>
        )}

        {step === 'CROP' && (
          <CropAdjuster
            imageDataUrl={capturedImage}
            onCropComplete={handleCropComplete}
            onBack={() => setStep('CAPTURE')}
          />
        )}

        {step === 'FILTER' && (
          <ImageFilters
            croppedImageDataUrl={croppedImage}
            onFilterComplete={handleProceedToOcr}
            onSaveWithoutOcr={handleSaveWithoutOcr}
            onBack={() => setStep('CROP')}
          />
        )}

        {step === 'OCR' && (
          <OCREngine
            filteredImageDataUrl={filteredImage}
            onSave={handleOcrSave}
            onBack={() => setStep('FILTER')}
          />
        )}

        {step === 'DOC_DETAILS' && activeDoc && (
          <DocumentDetails
            document={activeDoc}
            onBack={() => {
              setActiveDoc(null);
              setStep('HISTORY');
            }}
            onAddPage={handleAddPageToDoc}
            onSave={handleUpdateDocumentDetails}
          />
        )}

        {/* Debug Logs Panel */}
        {debugErrors.length > 0 && (
          <div className="glass-panel animate-fade" style={{ marginTop: '20px', border: '1px solid var(--error)', background: 'rgba(239, 68, 68, 0.08)' }}>
            <h4 style={{ color: 'var(--error)', marginBottom: '8px', fontSize: '15px', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              Debug Console Logs / Connection Errors:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', textAlign: 'left' }}>
              {debugErrors.map((err, i) => (
                <div key={i} style={{ fontSize: '12px', fontFamily: 'monospace', background: 'rgba(0, 0, 0, 0.4)', padding: '8px', borderRadius: '6px', borderLeft: '3px solid var(--error)', color: '#fda4af' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong>{err.message}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>{err.time}</span>
                  </div>
                  {err.filename && <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Location: {err.filename}:{err.lineno}</div>}
                  {err.error && <pre style={{ fontSize: '10px', marginTop: '6px', overflowX: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{err.error}</pre>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'left' }}>
              Tip: If you see a file loading error for "opencv.js", make sure you have copied `opencv.js` to the root folder of your IIS web application.
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default App;
