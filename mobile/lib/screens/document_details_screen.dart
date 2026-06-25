import 'dart:io';
import 'package:flutter/material.dart';
import 'package:edge_detection/edge_detection.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import 'package:share_plus/share_plus.dart';
import '../models/document.dart';
import '../models/page.dart';
import '../services/database_service.dart';
import '../services/image_processor.dart';
import '../services/ocr_service.dart';
import '../services/pdf_service.dart';

class DocumentDetailsScreen extends StatefulWidget {
  final ScannedDocument document;
  final DatabaseService dbService;
  final VoidCallback onUpdate;

  const DocumentDetailsScreen({
    Key? key,
    required this.document,
    required this.dbService,
    required this.onUpdate,
  }) : super(key: key);

  @override
  State<DocumentDetailsScreen> createState() => _DocumentDetailsScreenState();
}

class _DocumentDetailsScreenState extends State<DocumentDetailsScreen> {
  late ScannedDocument _doc;
  bool _isProcessing = false;
  String _pdfPageSize = 'A4';
  String _pdfQuality = 'Medium';

  final List<Map<String, String>> _languages = [
    {'code': 'eng', 'name': 'English'},
    {'code': 'hin', 'name': 'Hindi (हिन्दी)'},
    {'code': 'ara', 'name': 'Arabic (العربية)'},
    {'code': 'chi_sim', 'name': 'Chinese (简体中文)'},
    {'code': 'jpn', 'name': 'Japanese (日本語)'},
    {'code': 'kor', 'name': 'Korean (한국어)'},
    {'code': 'spa', 'name': 'Spanish (Español)'},
    {'code': 'fra', 'name': 'French (Français)'},
    {'code': 'deu', 'name': 'German (Deutsch)'},
  ];

  @override
  void initState() {
    super.initState();
    _doc = widget.document;
  }

  // Appends a new scanned page using WeScan / OpenCV
  Future<void> _addNewPage() async {
    setState(() => _isProcessing = true);
    try {
      final tempDir = await getTemporaryDirectory();
      final originalPath = "${tempDir.path}/${DateTime.now().millisecondsSinceEpoch}_raw.jpg";

      bool isCaptured = await EdgeDetection.detectEdge(
        originalPath,
        canUseGallery: true,
        androidScanTitle: 'Scan Page',
        androidCropTitle: 'Crop boundaries',
        androidCropSupportButtonTitle: 'Crop',
      );

      if (isCaptured) {
        // Apply default photocopy filter
        final processedPath = await ImageProcessor.applyEnhancement(originalPath, 'bw');
        final ocrText = await OcrService.recognizeText(processedPath);

        final newPage = DocumentPage(
          id: const Uuid().v4(),
          processedImagePath: processedPath,
          originalImagePath: originalPath,
          text: ocrText,
        );

        final updatedPages = List<DocumentPage>.from(_doc.pages)..add(newPage);
        final updatedDoc = _doc.copyWith(
          pages: updatedPages,
          updatedAt: DateTime.now(),
        );

        await widget.dbService.saveDocument(updatedDoc);
        setState(() => _doc = updatedDoc);
        widget.onUpdate();
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Page added successfully!')),
        );
      }
    } catch (e) {
      print('Add page error: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error adding page: $e')),
      );
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  // Shift page left in page grid
  Future<void> _movePageLeft(int index) async {
    if (index <= 0) return;
    final pages = List<DocumentPage>.from(_doc.pages);
    final temp = pages[index];
    pages[index] = pages[index - 1];
    pages[index - 1] = temp;

    final updatedDoc = _doc.copyWith(
      pages: pages,
      updatedAt: DateTime.now(),
    );
    await widget.dbService.saveDocument(updatedDoc);
    setState(() => _doc = updatedDoc);
    widget.onUpdate();
  }

  // Shift page right in page grid
  Future<void> _movePageRight(int index) async {
    if (index >= _doc.pages.length - 1) return;
    final pages = List<DocumentPage>.from(_doc.pages);
    final temp = pages[index];
    pages[index] = pages[index + 1];
    pages[index + 1] = temp;

    final updatedDoc = _doc.copyWith(
      pages: pages,
      updatedAt: DateTime.now(),
    );
    await widget.dbService.saveDocument(updatedDoc);
    setState(() => _doc = updatedDoc);
    widget.onUpdate();
  }

  // Rotate page 90 degrees clockwise in-place
  Future<void> _rotatePage(String pageId) async {
    setState(() => _isProcessing = true);
    try {
      final pages = List<DocumentPage>.from(_doc.pages);
      final index = pages.indexWhere((p) => p.id == pageId);
      if (index != -1) {
        final newPath = await ImageProcessor.rotateImage90(pages[index].processedImagePath);
        pages[index] = pages[index].copyWith(processedImagePath: newPath);

        final updatedDoc = _doc.copyWith(
          pages: pages,
          updatedAt: DateTime.now(),
        );
        await widget.dbService.saveDocument(updatedDoc);
        setState(() => _doc = updatedDoc);
        widget.onUpdate();
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Page rotated 90°')),
        );
      }
    } catch (e) {
      print('Rotate page error: $e');
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  // Delete a page from the document
  Future<void> _deletePage(String pageId) async {
    final bool? confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Page'),
        content: const Text('Are you sure you want to delete this page from the document?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel', style: TextStyle(color: Colors.white60)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      final pages = List<DocumentPage>.from(_doc.pages)..removeWhere((p) => p.id == pageId);
      final updatedDoc = _doc.copyWith(
        pages: pages,
        updatedAt: DateTime.now(),
      );
      await widget.dbService.saveDocument(updatedDoc);
      setState(() => _doc = updatedDoc);
      widget.onUpdate();
    }
  }

  // Open the page editor to edit OCR text and run OCR on-demand
  Future<void> _openPageEditor(DocumentPage page, int pageNum) async {
    final textController = TextEditingController(text: page.text);
    String selectedLang = 'eng';
    bool ocrRunning = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF09090E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                top: 20,
                left: 20,
                right: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Modal Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.between,
                      children: [
                        Text(
                          'Page $pageNum Details',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Exporter row for individual page
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Page Actions',
                          style: TextStyle(fontWeight: FontWeight.w600, color: Colors.white70),
                        ),
                        Row(
                          children: [
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1E1E2E),
                                elevation: 0,
                                side: BorderSide(color: Colors.white.withOpacity(0.1)),
                              ),
                              onPressed: () {
                                _exportSinglePage(page, pageNum, 'jpeg');
                              },
                              icon: const Icon(Icons.image, size: 14),
                              label: const Text('JPG', style: TextStyle(fontSize: 12)),
                            ),
                            const SizedBox(width: 8),
                            ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1E1E2E),
                                elevation: 0,
                                side: BorderSide(color: Colors.white.withOpacity(0.1)),
                              ),
                              onPressed: () {
                                _exportSinglePage(page, pageNum, 'png');
                              },
                              icon: const Icon(Icons.image, size: 14),
                              label: const Text('PNG', style: TextStyle(fontSize: 12)),
                            ),
                          ],
                        ),
                      ],
                    ),
                    const Divider(height: 24, color: Colors.white12),

                    // Split preview layout
                    Container(
                      height: 220,
                      decoration: BoxDecoration(
                        color: Colors.black,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.solid(color: Colors.white10, width: 1),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(11),
                        child: Image.file(
                          File(page.processedImagePath),
                          fit: pw.BoxFit.contain,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // OCR Language & Button Row
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'OCR Text Extraction',
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        if (!ocrRunning)
                          Row(
                            children: [
                              DropdownButton<String>(
                                value: selectedLang,
                                dropdownColor: const Color(0xFF14141F),
                                style: const TextStyle(fontSize: 13, color: Colors.white),
                                underline: Container(),
                                items: _languages.map((lang) {
                                  return DropdownMenuItem(
                                    value: lang['code'],
                                    child: Text(lang['name']!),
                                  );
                                }).toList(),
                                onChanged: (val) {
                                  if (val != null) {
                                    setModalState(() => selectedLang = val);
                                  }
                                },
                              ),
                              const SizedBox(width: 10),
                              ElevatedButton(
                                style: ElevatedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                ),
                                onPressed: () async {
                                  setModalState(() => ocrRunning = true);
                                  try {
                                    final recognizedText = await OcrService.recognizeText(
                                      page.processedImagePath,
                                      languageCode: selectedLang,
                                    );
                                    textController.text = recognizedText;
                                  } finally {
                                    setModalState(() => ocrRunning = false);
                                  }
                                },
                                child: const Text('Run OCR', style: TextStyle(fontSize: 12)),
                              ),
                            ],
                          )
                        else
                          const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // OCR Textbox Edit Area
                    TextField(
                      controller: textController,
                      maxLines: 6,
                      decoration: const InputDecoration(
                        hintText: 'Recognized text is empty. Run OCR to populate it.',
                      ),
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                    ),
                    const SizedBox(height: 20),

                    // Save Page Details
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3A86FF),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () async {
                        final pages = List<DocumentPage>.from(_doc.pages);
                        final index = pages.indexWhere((p) => p.id == page.id);
                        if (index != -1) {
                          pages[index] = pages[index].copyWith(text: textController.text);
                          final updatedDoc = _doc.copyWith(
                            pages: pages,
                            updatedAt: DateTime.now(),
                          );
                          await widget.dbService.saveDocument(updatedDoc);
                          setState(() => _doc = updatedDoc);
                          widget.onUpdate();
                        }
                        Navigator.pop(context);
                      },
                      child: const Text('Save Page Changes', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // Share compiled PDF
  Future<void> _sharePDF() async {
    if (_doc.pages.isEmpty) return;
    setState(() => _isProcessing = true);
    try {
      final pdfFile = await PdfService.generatePdf(
        _doc.pages,
        _doc.title,
        pageSizeSetting: _pdfPageSize,
        qualitySetting: _pdfQuality,
      );

      final XFile xFile = XFile(pdfFile.path);
      await Share.shareXFiles([xFile], text: 'Scanned document: ${_doc.title}');
    } catch (e) {
      print('Share PDF failed: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to share PDF: $e')),
      );
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  // Export single page image as JPG or PNG
  Future<void> _exportSinglePage(DocumentPage page, int pageNum, String format) async {
    try {
      final tempDir = await getTemporaryDirectory();
      String finalPath = page.processedImagePath;

      if (format == 'png') {
        final bytes = await File(page.processedImagePath).readAsBytes();
        final img.Image? decoded = img.decodeImage(bytes);
        if (decoded != null) {
          final pngBytes = img.encodePng(decoded);
          final pngPath = "${tempDir.path}/${_doc.title.toLowerCase().replaceAll(' ', '_')}_page_$pageNum.png";
          await File(pngPath).writeAsBytes(pngBytes);
          finalPath = pngPath;
        }
      } else {
        final jpgPath = "${tempDir.path}/${_doc.title.toLowerCase().replaceAll(' ', '_')}_page_$pageNum.jpg";
        await File(page.processedImagePath).copy(jpgPath);
        finalPath = jpgPath;
      }

      final XFile xFile = XFile(finalPath);
      await Share.shareXFiles([xFile], text: 'Exported Page $pageNum from ${_doc.title}');
    } catch (e) {
      print('Export page failed: $e');
    }
  }

  // Batch Export all pages as images (JPG or PNG)
  Future<void> _exportAllImages(String format) async {
    if (_doc.pages.isEmpty) return;
    setState(() => _isProcessing = true);
    try {
      final tempDir = await getTemporaryDirectory();
      List<XFile> xFilesToShare = [];

      for (int i = 0; i < _doc.pages.length; i++) {
        final page = _doc.pages[i];
        String finalPath = page.processedImagePath;

        if (format == 'png') {
          final bytes = await File(page.processedImagePath).readAsBytes();
          final img.Image? decoded = img.decodeImage(bytes);
          if (decoded != null) {
            final pngBytes = img.encodePng(decoded);
            final pngPath = "${tempDir.path}/${_doc.title.toLowerCase().replaceAll(' ', '_')}_page_${i + 1}.png";
            await File(pngPath).writeAsBytes(pngBytes);
            finalPath = pngPath;
          }
        } else {
          final jpgPath = "${tempDir.path}/${_doc.title.toLowerCase().replaceAll(' ', '_')}_page_${i + 1}.jpg";
          await File(page.processedImagePath).copy(jpgPath);
          finalPath = jpgPath;
        }

        xFilesToShare.add(XFile(finalPath));
      }

      await Share.shareXFiles(
        xFilesToShare,
        text: 'Exported page images from ${_doc.title} (${format.toUpperCase()})',
      );
    } catch (e) {
      print('Batch export failed: $e');
    } finally {
      setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_doc.title),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: _isProcessing
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Main Export Command Panel
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.picture_as_pdf, color: Colors.redAccent),
                              const SizedBox(width: 10),
                              Text(
                                'Compile Document (${_doc.pages.length} Pages)',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF3A86FF),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            onPressed: _sharePDF,
                            icon: const Icon(Icons.share, color: Colors.white),
                            label: const Text('Share PDF File', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                          const SizedBox(height: 16),

                          // PDF configurations (Dropdowns)
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    const Text('Page Size', style: TextStyle(fontSize: 12, color: Colors.white70)),
                                    const SizedBox(height: 4),
                                    DropdownButtonFormField<String>(
                                      value: _pdfPageSize,
                                      dropdownColor: const Color(0xFF14141F),
                                      decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                                      items: const [
                                        DropdownMenuItem(value: 'A4', child: Text('A4')),
                                        DropdownMenuItem(value: 'Letter', child: Text('Letter')),
                                        DropdownMenuItem(value: 'Fit', child: Text('Fit to Image')),
                                      ],
                                      onChanged: (val) {
                                        if (val != null) setState(() => _pdfPageSize = val);
                                      },
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    const Text('Quality', style: TextStyle(fontSize: 12, color: Colors.white70)),
                                    const SizedBox(height: 4),
                                    DropdownButtonFormField<String>(
                                      value: _pdfQuality,
                                      dropdownColor: const Color(0xFF14141F),
                                      decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                                      items: const [
                                        DropdownMenuItem(value: 'Low', child: Text('Low')),
                                        DropdownMenuItem(value: 'Medium', child: Text('Medium')),
                                        DropdownMenuItem(value: 'High', child: Text('High')),
                                      ],
                                      onChanged: (val) {
                                        if (val != null) setState(() => _pdfQuality = val);
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const Divider(height: 28, color: Colors.white12),

                          // Batch Image Export Actions
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Export all pages as separate images:',
                                style: TextStyle(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w600),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: ElevatedButton.icon(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: const Color(0xFF1E1E2E),
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                      ),
                                      onPressed: () => _exportAllImages('jpeg'),
                                      icon: const Icon(Icons.download, size: 16),
                                      label: const Text('Export all JPGs', style: TextStyle(fontSize: 13)),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: ElevatedButton.icon(
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: const Color(0xFF1E1E2E),
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                      ),
                                      onPressed: () => _exportAllImages('png'),
                                      icon: const Icon(Icons.download, size: 16),
                                      label: const Text('Export all PNGs', style: TextStyle(fontSize: 13)),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Page Composer Grid list
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Document Pages (${_doc.pages.length})',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      TextButton.icon(
                        onPressed: _addNewPage,
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add Page'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Display list of document pages
                  _doc.pages.isEmpty
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.symmetric(vertical: 40),
                            child: Text('No pages in this document. Add pages to compile.', style: TextStyle(color: Colors.white38)),
                          ),
                        )
                      : GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 12,
                            childAspectRatio: 0.72,
                          ),
                          itemCount: _doc.pages.length,
                          itemBuilder: (context, index) {
                            final page = _doc.pages[index];
                            return Card(
                              margin: EdgeInsets.zero,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  // Shifting & Rotation toolbar
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Row(
                                          children: [
                                            IconButton(
                                              padding: EdgeInsets.zero,
                                              constraints: const BoxConstraints(),
                                              icon: const Icon(Icons.arrow_back, size: 16),
                                              onPressed: index > 0 ? () => _movePageLeft(index) : null,
                                            ),
                                            const SizedBox(width: 8),
                                            IconButton(
                                              padding: EdgeInsets.zero,
                                              constraints: const BoxConstraints(),
                                              icon: const Icon(Icons.arrow_forward, size: 16),
                                              onPressed: index < _doc.pages.length - 1 ? () => _movePageRight(index) : null,
                                            ),
                                          ],
                                        ),
                                        IconButton(
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(),
                                          icon: const Icon(Icons.rotate_right, size: 16, color: Color(0xFF3A86FF)),
                                          onPressed: () => _rotatePage(page.id),
                                        ),
                                      ],
                                    ),
                                  ),

                                  // Page Preview Thumbnail
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () => _openPageEditor(page, index + 1),
                                      child: Container(
                                        margin: const EdgeInsets.symmetric(horizontal: 8),
                                        decoration: BoxDecoration(
                                          color: Colors.black54,
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(color: Colors.white.withOpacity(0.05)),
                                        ),
                                        child: ClipRRect(
                                          borderRadius: BorderRadius.circular(7),
                                          child: Image.file(
                                            File(page.processedImagePath),
                                            fit: BoxFit.contain,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),

                                  // Label & Delete button
                                  Padding(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          'Pg ${index + 1}',
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                        ),
                                        IconButton(
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(),
                                          icon: const Icon(Icons.delete, size: 16, color: Colors.redAccent),
                                          onPressed: () => _deletePage(page.id),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ],
              ),
            ),
    );
  }
}
