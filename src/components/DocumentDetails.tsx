import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import Tesseract from 'tesseract.js';
import { 
  ArrowLeft, Plus, Share2, FileText, FileDown, 
  Trash2, Edit3, CheckCircle2, AlertCircle, Copy, X,
  ChevronRight, RotateCw
} from 'lucide-react';
import type { ScannedDocument, DocumentPage } from '../utils/storage';

interface DocumentDetailsProps {
  document: ScannedDocument;
  onBack: () => void;
  onAddPage: () => void;
  onSave: (doc: ScannedDocument) => void;
}

const LANGUAGES = [
  { code: 'eng', name: 'English' },
  { code: 'hin', name: 'Hindi (हिन्दी)' },
  { code: 'ben', name: 'Bengali (বাংলা)' },
  { code: 'mar', name: 'Marathi (मराठी)' },
  { code: 'tel', name: 'Telugu (తెలుగు)' },
  { code: 'tam', name: 'Tamil (தமிழ்)' },
  { code: 'kan', name: 'Kannada (కನ್ನಡ)' },
  { code: 'guj', name: 'Gujarati (ગુજરાતી)' },
  { code: 'mal', name: 'Malayalam (മലയാളം)' },
  { code: 'pan', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'spa', name: 'Spanish (Español)' },
  { code: 'fra', name: 'French (Français)' },
  { code: 'deu', name: 'German (Deutsch)' },
  { code: 'chi_sim', name: 'Chinese Simplified (简体中文)' },
  { code: 'ara', name: 'Arabic (العربية)' }
];

const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      resolve({ width: 640, height: 480 });
    };
  });
};

const rotateImage = (dataUrl: string, degrees: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      const angle = (degrees * Math.PI) / 180;
      const is90or270 = Math.abs(degrees) % 180 !== 0;

      canvas.width = is90or270 ? img.height : img.width;
      canvas.height = is90or270 ? img.width : img.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(angle);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
  });
};

const compressImage = (dataUrl: string, quality: number): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
  });
};

export const DocumentDetails: React.FC<DocumentDetailsProps> = ({
  document: initialDoc,
  onBack,
  onAddPage,
  onSave
}) => {
  const [doc, setDoc] = useState<ScannedDocument>(initialDoc);
  const [title, setTitle] = useState(initialDoc.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // PDF Export Settings
  const [pdfPageSize, setPdfPageSize] = useState<'A4' | 'Letter' | 'Fit'>('A4');
  const [pdfQuality, setPdfQuality] = useState<'High' | 'Medium' | 'Low'>('Medium');

  // Selected page for detail view/edit modal
  const [editingPage, setEditingPage] = useState<DocumentPage | null>(null);
  const [editingPageNum, setEditingPageNum] = useState<number>(0);
  const [pageOcrText, setPageOcrText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('eng');
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');

  // Update component state if the prop document updates (e.g. after adding pages)
  useEffect(() => {
    setDoc(initialDoc);
    setTitle(initialDoc.title);
  }, [initialDoc]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const handleTitleSave = () => {
    if (!title.trim()) {
      setTitle(doc.title);
      setIsEditingTitle(false);
      return;
    }
    const updated = { ...doc, title: title.trim() };
    setDoc(updated);
    onSave(updated);
    setIsEditingTitle(false);
    showToast('Document renamed!');
  };

  const handlePageDelete = (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this page from this document?')) {
      const filteredPages = doc.pages.filter((p) => p.id !== pageId);
      const updated = { ...doc, pages: filteredPages };
      setDoc(updated);
      onSave(updated);
      showToast('Page deleted.');
    }
  };

  // Reorder: Shift Page Left
  const handleMovePageLeft = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === 0) return;
    const updatedPages = [...doc.pages];
    const temp = updatedPages[index];
    updatedPages[index] = updatedPages[index - 1];
    updatedPages[index - 1] = temp;

    const updated = { ...doc, pages: updatedPages };
    setDoc(updated);
    onSave(updated);
    showToast('Page moved left.');
  };

  // Reorder: Shift Page Right
  const handleMovePageRight = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === doc.pages.length - 1) return;
    const updatedPages = [...doc.pages];
    const temp = updatedPages[index];
    updatedPages[index] = updatedPages[index + 1];
    updatedPages[index + 1] = temp;

    const updated = { ...doc, pages: updatedPages };
    setDoc(updated);
    onSave(updated);
    showToast('Page moved right.');
  };

  // Rotate Page 90° Clockwise
  const handleRotatePage = async (pageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    showToast('Rotating page...');
    const pageToRotate = doc.pages.find((p) => p.id === pageId);
    if (!pageToRotate) return;

    try {
      const rotatedDataUrl = await rotateImage(pageToRotate.processedImage, 90);
      const updatedPages = doc.pages.map((p) => {
        if (p.id === pageId) {
          return { ...p, processedImage: rotatedDataUrl };
        }
        return p;
      });

      const updated = { ...doc, pages: updatedPages };
      setDoc(updated);
      onSave(updated);
      showToast('Page rotated.');
    } catch (err) {
      console.error(err);
      showToast('Rotation failed.');
    }
  };

  // Select page for editing in modal
  const handleOpenPageEditor = (page: DocumentPage, index: number) => {
    setEditingPage(page);
    setEditingPageNum(index + 1);
    setPageOcrText(page.text);
  };

  // Close page editor modal
  const handleClosePageEditor = () => {
    setEditingPage(null);
    setIsOcrLoading(false);
    setOcrProgress(0);
  };

  // Run Tesseract OCR on demand inside modal with language selection
  const handleRunOcrOnPage = () => {
    if (!editingPage) return;
    
    setIsOcrLoading(true);
    setOcrProgress(0);
    setOcrStatus('Starting OCR...');

    Tesseract.recognize(
      editingPage.processedImage,
      selectedLanguage,
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
            setOcrStatus(`Recognizing text (${Math.round(m.progress * 100)}%)...`);
          } else {
            setOcrStatus(m.status);
          }
        }
      }
    )
      .then(({ data: { text } }) => {
        setPageOcrText(text || 'No text detected.');
        setIsOcrLoading(false);
        showToast('Text recognized!');
      })
      .catch((err) => {
        console.error('OCR Error:', err);
        setPageOcrText('Failed to extract text. You can type manual notes here.');
        setIsOcrLoading(false);
      });
  };

  // Save the edited page text
  const handleSavePageText = () => {
    if (!editingPage) return;
    
    const updatedPages = doc.pages.map((p) => {
      if (p.id === editingPage.id) {
        return { ...p, text: pageOcrText };
      }
      return p;
    });

    const updated = { ...doc, pages: updatedPages };
    setDoc(updated);
    onSave(updated);
    handleClosePageEditor();
    showToast('Page text saved!');
  };

  // Generate jsPDF Blob based on configuration settings
  const compilePDF = async (): Promise<Blob> => {
    if (doc.pages.length === 0) {
      throw new Error('No pages to scan.');
    }
    
    // Choose compression quality factor
    let compressionQuality = 0.8;
    if (pdfQuality === 'High') compressionQuality = 0.95;
    if (pdfQuality === 'Low') compressionQuality = 0.6;

    let pdf: jsPDF;

    // Load first page dimensions to configure layout
    const firstPage = doc.pages[0];
    const firstDims = await getImageDimensions(firstPage.processedImage);

    if (pdfPageSize === 'Fit') {
      pdf = new jsPDF({
        unit: 'pt',
        format: [firstDims.width, firstDims.height]
      });
    } else {
      pdf = new jsPDF({
        unit: 'mm',
        format: pdfPageSize.toLowerCase()
      });
    }

    for (let i = 0; i < doc.pages.length; i++) {
      const page = doc.pages[i];
      const dims = await getImageDimensions(page.processedImage);
      
      // Compress the page image dynamically based on selected quality
      const compressedImgData = await compressImage(page.processedImage, compressionQuality);

      if (i > 0) {
        if (pdfPageSize === 'Fit') {
          pdf.addPage([dims.width, dims.height]);
        } else {
          pdf.addPage(pdfPageSize.toLowerCase());
        }
      }
      
      if (pdfPageSize === 'Fit') {
        // Render 100% borderless fit
        pdf.addImage(compressedImgData, 'JPEG', 0, 0, dims.width, dims.height);
      } else {
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10;
        const maxWidth = pageWidth - margin * 2;
        const maxHeight = pageHeight - margin * 2;
        
        const imageRatio = dims.width / dims.height;
        let imgWidth = maxWidth;
        let imgHeight = maxWidth / imageRatio;
        
        if (imgHeight > maxHeight) {
          imgHeight = maxHeight;
          imgWidth = maxHeight * imageRatio;
        }
        
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;
        
        pdf.addImage(compressedImgData, 'JPEG', x, y, imgWidth, imgHeight);
      }
    }
    
    return pdf.output('blob');
  };

  // Direct download PDF
  const handleDownloadPDF = async () => {
    try {
      showToast('Generating PDF...');
      const pdfBlob = await compilePDF();
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.title.toLowerCase().replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('PDF downloaded successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to generate PDF.');
    }
  };

  // Share PDF file using Web Share API
  const handleSharePDF = async () => {
    try {
      showToast('Compiling PDF to share...');
      const pdfBlob = await compilePDF();
      const filename = `${doc.title.toLowerCase().replace(/\s+/g, '_')}.pdf`;
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: doc.title,
          text: `Scanned document: ${doc.title}`
        });
        showToast('PDF Shared!');
      } else {
        handleDownloadPDF();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Sharing PDF error:', err);
        showToast('Could not share PDF.');
      }
    }
  };

  // Copy combined OCR text
  const handleCopyCombinedText = () => {
    const combinedText = doc.pages.map((p, idx) => `--- Page ${idx + 1} ---\n${p.text}`).join('\n\n');
    navigator.clipboard.writeText(combinedText);
    showToast('Combined text copied!');
  };

  // Download combined text
  const handleDownloadCombinedText = () => {
    const combinedText = doc.pages.map((p, idx) => `--- Page ${idx + 1} ---\n${p.text}`).join('\n\n');
    const file = new Blob([combinedText], { type: 'text/plain' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.title.toLowerCase().replace(/\s+/g, '_')}_all_ocr.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Text file downloaded!');
  };

  return (
    <div className="glass-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '12px' }}>
          <ArrowLeft size={16} />
          <span>Back to List</span>
        </button>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Updated: {new Date(doc.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Title block with inline editing */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isEditingTitle ? (
          <div style={{ display: 'flex', width: '100%', gap: '8px' }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              style={{ fontSize: '20px', fontWeight: 700 }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSave();
                if (e.key === 'Escape') {
                  setTitle(doc.title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
            />
            <button onClick={handleTitleSave} className="btn btn-primary" style={{ padding: '8px 16px' }}>
              Save
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '26px' }}>
              {doc.title}
            </h2>
            <button 
              onClick={() => setIsEditingTitle(true)} 
              className="btn btn-secondary btn-icon-only" 
              title="Rename Document"
              style={{ padding: '6px', border: 'none', background: 'transparent' }}
            >
              <Edit3 size={18} style={{ color: 'var(--primary)' }} />
            </button>
          </div>
        )}
      </div>

      {/* Main Command Bar */}
      <div className="btn-row" style={{ flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
        <button onClick={onAddPage} className="btn btn-primary" style={{ flex: '1 1 auto', boxShadow: '0 4px 15px var(--primary-glow)' }}>
          <Plus size={18} />
          <span>Scan Page</span>
        </button>
        
        {doc.pages.length > 0 && (
          <>
            <button onClick={handleDownloadPDF} className="btn btn-secondary" title="Download PDF File">
              <FileDown size={18} style={{ color: 'var(--success)' }} />
              <span>Download PDF</span>
            </button>

            <button onClick={handleSharePDF} className="btn btn-secondary" title="Share PDF File">
              <Share2 size={18} style={{ color: 'var(--primary)' }} />
              <span>Share PDF</span>
            </button>

            <button onClick={handleDownloadCombinedText} className="btn btn-secondary" title="Download combined OCR Text">
              <FileText size={18} />
              <span>Text</span>
            </button>
            
            <button onClick={handleCopyCombinedText} className="btn btn-secondary" title="Copy combined OCR Text">
              <Copy size={18} />
              <span>Copy Text</span>
            </button>
          </>
        )}
      </div>

      {/* PDF Export Configurations */}
      {doc.pages.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          padding: '16px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--border-color)',
          marginTop: '-8px'
        }}>
          {/* PDF Page Format */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>PDF Page Format</span>
            <select
              value={pdfPageSize}
              onChange={(e) => setPdfPageSize(e.target.value as any)}
              className="input-field"
              style={{ height: '38px', padding: '6px 12px' }}
            >
              <option value="A4">A4 (Standard - 210 x 297 mm)</option>
              <option value="Letter">Letter (US - 216 x 279 mm)</option>
              <option value="Fit">Fit to Image (Match original layout aspect ratio)</option>
            </select>
          </div>

          {/* PDF Image Quality */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>PDF Image Compression Quality</span>
            <select
              value={pdfQuality}
              onChange={(e) => setPdfQuality(e.target.value as any)}
              className="input-field"
              style={{ height: '38px', padding: '6px 12px' }}
            >
              <option value="Medium">Medium (Recommended - Balanced file size)</option>
              <option value="High">High (Best Quality - Larger file size)</option>
              <option value="Low">Low (Compact File - Smallest file size)</option>
            </select>
          </div>
        </div>
      )}

      {/* Pages Preview Grid */}
      <div>
        <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '16px', marginBottom: '12px' }}>
          Document Pages ({doc.pages.length})
        </h4>

        {doc.pages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
            background: 'var(--bg-glass)',
            border: '1px dashed var(--border-color)',
            borderRadius: 'var(--border-radius)',
            gap: '12px',
            color: 'var(--text-secondary)'
          }}>
            <AlertCircle size={36} style={{ color: 'var(--text-muted)' }} />
            <p style={{ fontSize: '14px' }}>This document is currently empty.</p>
            <button onClick={onAddPage} className="btn btn-primary btn-sm" style={{ marginTop: '8px' }}>
              <Plus size={16} /> Add First Page
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '16px'
          }}>
            {doc.pages.map((page, index) => (
              <div 
                key={page.id} 
                className="history-item"
                style={{
                  flexDirection: 'column',
                  padding: '12px',
                  alignItems: 'stretch',
                  position: 'relative',
                  background: 'var(--bg-glass)',
                  gap: '8px'
                }}
                onClick={() => handleOpenPageEditor(page, index)}
              >
                {/* Reordering & Rotation Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {/* Shift Left */}
                    <button
                      onClick={(e) => handleMovePageLeft(index, e)}
                      disabled={index === 0}
                      className="btn btn-secondary"
                      style={{ 
                        padding: '4px 6px', 
                        border: 'none', 
                        background: 'rgba(255,255,255,0.05)', 
                        opacity: index === 0 ? 0.2 : 0.8,
                        cursor: index === 0 ? 'default' : 'pointer'
                      }}
                      title="Move Page Left"
                    >
                      <ArrowLeft size={12} />
                    </button>

                    {/* Shift Right */}
                    <button
                      onClick={(e) => handleMovePageRight(index, e)}
                      disabled={index === doc.pages.length - 1}
                      className="btn btn-secondary"
                      style={{ 
                        padding: '4px 6px', 
                        border: 'none', 
                        background: 'rgba(255,255,255,0.05)', 
                        opacity: index === doc.pages.length - 1 ? 0.2 : 0.8,
                        cursor: index === doc.pages.length - 1 ? 'default' : 'pointer'
                      }}
                      title="Move Page Right"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>

                  {/* Rotate Page button */}
                  <button
                    onClick={(e) => handleRotatePage(page.id, e)}
                    className="btn btn-secondary"
                    style={{ padding: '4px 6px', border: 'none', background: 'rgba(58, 134, 255, 0.1)', cursor: 'pointer' }}
                    title="Rotate Page 90° Clockwise"
                  >
                    <RotateCw size={12} style={{ color: 'var(--primary)' }} />
                  </button>
                </div>

                {/* Page Thumbnail */}
                <div style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '3 / 4',
                  overflow: 'hidden',
                  borderRadius: 'var(--border-radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: '#050508'
                }}>
                  <img
                    src={page.processedImage}
                    alt={`Page ${index + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '6px',
                    left: '6px',
                    background: 'rgba(9, 9, 14, 0.85)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 600
                  }}>
                    Pg {index + 1}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{
                    color: page.text ? 'var(--success)' : 'var(--text-muted)',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {page.text ? 'OCR Ready' : 'No OCR'}
                  </span>
                  <button
                    onClick={(e) => handlePageDelete(page.id, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--error)',
                      cursor: 'pointer',
                      padding: '4px'
                    }}
                    title="Delete page"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Page Modal (Image & OCR Text Panel) */}
      {editingPage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div className="glass-panel animate-fade" style={{
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '12px'
            }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px' }}>
                Page {editingPageNum} Details
              </h3>
              <button 
                onClick={handleClosePageEditor}
                className="btn btn-secondary btn-icon-only"
                style={{ padding: '6px', border: 'none', background: 'transparent' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Split Panel */}
            <div className="ocr-layout" style={{ flex: 1, overflowY: 'auto' }}>
              {/* Left Panel: Image */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Page Preview
                </span>
                <div style={{
                  background: '#09090d',
                  borderRadius: 'var(--border-radius-sm)',
                  padding: '6px',
                  border: '1px solid var(--border-color)',
                  height: '320px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={editingPage.processedImage}
                    alt="Page view"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>
              </div>

              {/* Right Panel: OCR */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Recognized Text (Editable)
                  </span>
                  
                  {!isOcrLoading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="input-field"
                        style={{ width: 'auto', padding: '4px 8px', fontSize: '12px', height: '28px' }}
                      >
                        {LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.name}
                          </option>
                        ))}
                      </select>
                      <button 
                        onClick={handleRunOcrOnPage}
                        className="btn btn-primary"
                        style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '8px' }}
                      >
                        Extract Text (OCR)
                      </button>
                    </div>
                  )}
                </div>

                {isOcrLoading ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '320px',
                    border: '1px dashed var(--border-color)',
                    borderRadius: 'var(--border-radius-sm)',
                    gap: '12px',
                    padding: '24px'
                  }}>
                    <div className="spinner"></div>
                    <div style={{ fontWeight: 600 }}>Tesseract OCR Running</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{ocrStatus}</div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }}></div>
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={pageOcrText}
                    onChange={(e) => setPageOcrText(e.target.value)}
                    placeholder="No text extracted. Click 'Extract Text' to run OCR or write manual notes here."
                    className="ocr-result-text"
                    style={{ height: '320px' }}
                  />
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '12px'
            }}>
              <button onClick={handleClosePageEditor} className="btn btn-secondary">
                Cancel
              </button>
              <button 
                onClick={handleSavePageText} 
                className="btn btn-primary"
                disabled={isOcrLoading}
              >
                Save Page
              </button>
            </div>

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
