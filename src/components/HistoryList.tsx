import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import type { ScannedDocument } from '../utils/storage';
import { Search, Trash2, Calendar, FileText, AlertCircle, Layers } from 'lucide-react';

interface HistoryListProps {
  onSelectScan: (doc: ScannedDocument) => void;
  refreshTrigger: boolean;
}

export const HistoryList: React.FC<HistoryListProps> = ({ onSelectScan, refreshTrigger }) => {
  const [scans, setScans] = useState<ScannedDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScans();
  }, [refreshTrigger]);

  const loadScans = async () => {
    setLoading(true);
    try {
      const allScans = await storage.getAllScans();
      setScans(allScans);
    } catch (err) {
      console.error('Failed to load scans from storage:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the scan details
    if (confirm('Are you sure you want to delete this document from your device?')) {
      try {
        await storage.deleteScan(id);
        setScans((prev) => prev.filter((scan) => scan.id !== id));
      } catch (err) {
        console.error('Failed to delete scan:', err);
      }
    }
  };

  const filteredScans = scans.filter((scan) => {
    const titleMatch = scan.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Check if any page contains the text query
    const textMatch = scan.pages && scan.pages.some(
      (page) => page.text && page.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return titleMatch || textMatch;
  });

  return (
    <div className="glass-panel animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 600 }}>
        Saved Documents History
      </h3>

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title or document text..."
          className="input-field"
          style={{ paddingLeft: '40px' }}
        />
        <Search
          size={18}
          style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      ) : filteredScans.length > 0 ? (
        <div className="history-list">
          {filteredScans.map((scan) => {
            const hasPages = scan.pages && scan.pages.length > 0;
            const thumbnail = hasPages ? scan.pages[0].processedImage : '';
            const pageCount = scan.pages ? scan.pages.length : 0;
            
            // Find first page with OCR text
            const firstOcrPage = scan.pages?.find((p) => p.text);
            const previewText = firstOcrPage ? firstOcrPage.text : '';

            return (
              <div
                key={scan.id}
                className="history-item"
                onClick={() => onSelectScan(scan)}
              >
                {thumbnail ? (
                  <img
                    src={thumbnail}
                    alt={scan.title}
                    className="history-thumb"
                  />
                ) : (
                  <div className="history-thumb" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)'
                  }}>
                    <FileText size={20} />
                  </div>
                )}
                
                <div className="history-info">
                  <div className="history-title">{scan.title}</div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <Calendar size={12} />
                      <span>{new Date(scan.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <Layers size={12} style={{ color: 'var(--primary)' }} />
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                    </div>
                    {previewText && (
                      <div className="mobile-hide" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <FileText size={12} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                          {previewText.substring(0, 30)}...
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="history-actions">
                  <button
                    onClick={(e) => handleDelete(scan.id, e)}
                    className="btn btn-secondary btn-icon-only"
                    style={{ color: 'var(--error)' }}
                    title="Delete document"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center',
          gap: '12px',
          color: 'var(--text-muted)'
        }}>
          <AlertCircle size={36} />
          <p style={{ fontSize: '14px' }}>
            {searchQuery ? 'No match found for your search.' : 'Your history is empty. Start scanning to save your documents!'}
          </p>
        </div>
      )}
    </div>
  );
};
