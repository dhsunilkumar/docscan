import localforage from 'localforage';

export interface DocumentPage {
  id: string;
  originalImage: string;  // Base64 data URL
  processedImage: string; // Base64 data URL (JPEG cropped/filtered)
  text: string;           // Extracted OCR text (can be empty)
}

export interface ScannedDocument {
  id: string;
  title: string;
  pages: DocumentPage[];
  createdAt: number;
  updatedAt: number;
}

// Automatically migrate single-page legacy scans to the new multi-page document structure
export const migrateDocument = (doc: any): ScannedDocument => {
  if (doc && !doc.pages) {
    return {
      id: doc.id,
      title: doc.title,
      pages: [
        {
          id: doc.id + '_p1',
          originalImage: doc.originalImage || '',
          processedImage: doc.processedImage || '',
          text: doc.text || ''
        }
      ],
      createdAt: doc.createdAt,
      updatedAt: doc.createdAt || doc.createdAt
    };
  }
  return doc as ScannedDocument;
};

// Configure localforage to use IndexedDB
localforage.config({
  name: 'DocuScanOCR',
  storeName: 'scans',
  description: 'Stores scanned documents, images, and OCR text.'
});

export const storage = {
  async getAllScans(): Promise<ScannedDocument[]> {
    const scans: ScannedDocument[] = [];
    await localforage.iterate<any, void>((value) => {
      scans.push(migrateDocument(value));
    });
    // Sort by newest first (updatedAt or createdAt)
    return scans.sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async getScan(id: string): Promise<ScannedDocument | null> {
    const value = await localforage.getItem<any>(id);
    return value ? migrateDocument(value) : null;
  },

  async saveScan(scan: ScannedDocument): Promise<ScannedDocument> {
    scan.updatedAt = Date.now();
    return localforage.setItem(scan.id, scan);
  },

  async deleteScan(id: string): Promise<void> {
    return localforage.removeItem(id);
  },

  async clearAll(): Promise<void> {
    return localforage.clear();
  }
};
