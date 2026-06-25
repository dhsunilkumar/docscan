import { ScanLine, History, PlusCircle } from 'lucide-react';


interface HeaderProps {
  showHistory: boolean;
  onToggleHistory: (show: boolean) => void;
  isOpenCVLoaded: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  showHistory,
  onToggleHistory,
  isOpenCVLoaded
}) => {
  return (
    <header className="app-header">
      <div className="brand">
        <ScanLine className="brand-icon" size={26} />
        <span>DocuScan<span style={{ color: 'var(--primary)', fontWeight: 500 }}>OCR</span></span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* OpenCV Status Indicator */}
        {!isOpenCVLoaded && (
          <div className="opencv-loading-banner" style={{ margin: 0, padding: '6px 12px', borderRadius: '20px' }}>
            <div className="spinner-sm"></div>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--warning)' }}>Loading CV...</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <button
          className={`btn ${showHistory ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onToggleHistory(true)}
          style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '14px' }}
        >
          <History size={16} />
          <span className="mobile-hide">History</span>
        </button>

        <button
          className={`btn ${!showHistory ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onToggleHistory(false)}
          style={{ padding: '8px 16px', borderRadius: '12px', fontSize: '14px' }}
        >
          <PlusCircle size={16} />
          <span className="mobile-hide">New Scan</span>
        </button>
      </div>
    </header>
  );
};
