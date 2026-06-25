import 'package:flutter/material.dart';
import 'package:edge_detection/edge_detection.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import 'package:intl/intl.dart';
import '../models/document.dart';
import '../models/page.dart';
import '../services/database_service.dart';
import '../services/image_processor.dart';
import '../services/ocr_service.dart';
import 'document_details_screen.dart';

class HistoryScreen extends StatefulWidget {
  final DatabaseService dbService;

  const HistoryScreen({Key? key, required this.dbService}) : super(key: key);

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<ScannedDocument> _allDocs = [];
  List<ScannedDocument> _filteredDocs = [];
  final TextEditingController _searchController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadDocuments();
    _searchController.addListener(_filterDocuments);
  }

  void _loadDocuments() {
    setState(() {
      _allDocs = widget.dbService.getAllDocuments();
      _filteredDocs = List.from(_allDocs);
    });
  }

  void _filterDocuments() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      _filteredDocs = _allDocs.where((doc) {
        return doc.title.toLowerCase().contains(query);
      }).toList();
    });
  }

  // Launch native WeScan / OpenCV document scanner
  Future<void> _scanNewDocument() async {
    setState(() => _isLoading = true);
    try {
      final tempDir = await getTemporaryDirectory();
      final originalPath = "${tempDir.path}/${DateTime.now().millisecondsSinceEpoch}_raw.jpg";

      // Triggers high-resolution camera still and auto-edge detection view controller
      bool isCaptured = await EdgeDetection.detectEdge(
        originalPath,
        canUseGallery: true,
        androidScanTitle: 'Scan Document',
        androidCropTitle: 'Crop Boundaries',
        androidCropSupportButtonTitle: 'Crop',
      );

      if (isCaptured) {
        // Apply our custom photocopy shadow-removal filter by default
        final processedPath = await ImageProcessor.applyEnhancement(originalPath, 'bw');

        // Run on-device ML Kit Text Recognition
        final ocrText = await OcrService.recognizeText(processedPath);

        final newPage = DocumentPage(
          id: const Uuid().v4(),
          processedImagePath: processedPath,
          originalImagePath: originalPath,
          text: ocrText,
        );

        final String docTitle = "Scan ${DateFormat('MMM dd, yyyy HH:mm').format(DateTime.now())}";
        final newDoc = ScannedDocument(
          id: const Uuid().v4(),
          title: docTitle,
          pages: [newPage],
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );

        // Save to database
        await widget.dbService.saveDocument(newDoc);
        _loadDocuments();

        // Navigate immediately to the document details screen to review
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => DocumentDetailsScreen(
                document: newDoc,
                dbService: widget.dbService,
                onUpdate: _loadDocuments,
              ),
            ),
          );
        }
      }
    } catch (e) {
      print("Camera scanner error: $e");
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error starting document scanner: $e')),
        );
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // Display dialog to rename a document
  Future<void> _showRenameDialog(ScannedDocument doc) async {
    final textController = TextEditingController(text: doc.title);
    return showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Rename Document', style: TextStyle(fontWeight: FontWeight.bold)),
          content: TextField(
            controller: textController,
            decoration: const InputDecoration(hintText: 'Enter new title'),
            autofocus: true,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Colors.white60)),
            ),
            ElevatedButton(
              onPressed: () async {
                if (textController.text.trim().isNotEmpty) {
                  final updatedDoc = doc.copyWith(
                    title: textController.text.trim(),
                    updatedAt: DateTime.now(),
                  );
                  await widget.dbService.saveDocument(updatedDoc);
                  _loadDocuments();
                  Navigator.pop(context);
                }
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }

  // Display dialog to delete a document
  Future<void> _showDeleteConfirmDialog(ScannedDocument doc) async {
    return showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Delete Document'),
          content: Text('Are you sure you want to delete "${doc.title}"? This will delete all pages permanently.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Colors.white60)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
              onPressed: () async {
                await widget.dbService.deleteDocument(doc.id);
                _loadDocuments();
                Navigator.pop(context);
              },
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('DocuScan OCR'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadDocuments,
            tooltip: 'Refresh Scans',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  // Search Bar
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: 'Search documents...',
                      prefixIcon: const Icon(Icons.search, color: Colors.white54),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, color: Colors.white54),
                              onPressed: () => _searchController.clear(),
                            )
                          : null,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Documents List / Grid
                  Expanded(
                    child: _filteredDocs.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.document_scanner, size: 64, color: Colors.white.withOpacity(0.2)),
                                const SizedBox(height: 16),
                                Text(
                                  _searchController.text.isNotEmpty
                                      ? 'No matching scans found.'
                                      : 'No scanned documents yet.',
                                  style: const TextStyle(fontSize: 16, color: Colors.white38),
                                ),
                              ],
                            ),
                          )
                        : ListView.builder(
                            itemCount: _filteredDocs.length,
                            itemBuilder: (context, index) {
                              final doc = _filteredDocs[index];
                              final dateStr = DateFormat('MMM dd, yyyy').format(doc.updatedAt);
                              
                              return Card(
                                margin: const EdgeInsets.only(bottom: 12),
                                child: ListTile(
                                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                  leading: Container(
                                    width: 48,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF3A86FF).withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(Icons.insert_drive_file, color: Color(0xFF3A86FF)),
                                  ),
                                  title: Text(
                                    doc.title,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                  ),
                                  subtitle: Text(
                                    '$dateStr • ${doc.pages.length} Page${doc.pages.length == 1 ? "" : "s"}',
                                    style: const TextStyle(color: Colors.white54, fontSize: 13),
                                  ),
                                  trailing: PopupMenuButton<String>(
                                    onSelected: (val) {
                                      if (val == 'rename') {
                                        _showRenameDialog(doc);
                                      } else if (val == 'delete') {
                                        _showDeleteConfirmDialog(doc);
                                      }
                                    },
                                    itemBuilder: (context) => [
                                      const PopupMenuItem(value: 'rename', child: Text('Rename')),
                                      const PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: Colors.redAccent))),
                                    ],
                                  ),
                                  onTap: () {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(
                                        builder: (context) => DocumentDetailsScreen(
                                          document: doc,
                                          dbService: widget.dbService,
                                          onUpdate: _loadDocuments,
                                        ),
                                      ),
                                    );
                                  },
                                ),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: const Color(0xFF3A86FF),
        onPressed: _scanNewDocument,
        icon: const Icon(Icons.camera_alt, color: Colors.white),
        label: const Text('New Scan', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }
}
