import 'dart:io';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';
import '../models/page.dart';

class PdfService {
  // Generate a compiled PDF file from document pages
  static Future<File> generatePdf(
    List<DocumentPage> pages,
    String docTitle, {
    String pageSizeSetting = 'A4', // 'A4', 'Letter', 'Fit'
    String qualitySetting = 'Medium', // 'Low', 'Medium', 'High'
  }) async {
    final pdf = pw.Document();

    for (var docPage in pages) {
      final File imgFile = File(docPage.processedImagePath);
      if (!await imgFile.exists()) continue;

      Uint8List imageBytes = await imgFile.readAsBytes();
      double pageWidth;
      double pageHeight;

      // 1. Process Quality & Compression
      if (qualitySetting == 'Low' || qualitySetting == 'Medium') {
        final img.Image? decoded = img.decodeImage(imageBytes);
        if (decoded != null) {
          int maxDim = qualitySetting == 'Low' ? 800 : 1200;
          int quality = qualitySetting == 'Low' ? 60 : 80;
          
          img.Image resized = decoded;
          if (decoded.width > maxDim || decoded.height > maxDim) {
            resized = img.copyResize(
              decoded,
              width: decoded.width > decoded.height ? maxDim : null,
              height: decoded.height >= decoded.width ? maxDim : null,
            );
          }
          imageBytes = Uint8List.fromList(img.encodeJpg(resized, quality: quality));
        }
      }

      // 2. Read Image Dimensions (for scaling or 'Fit' page size)
      final img.Image? decodedForSize = img.decodeImage(imageBytes);
      final double imgWidth = (decodedForSize?.width ?? 600).toDouble();
      final double imgHeight = (decodedForSize?.height ?? 800).toDouble();

      // 3. Resolve PDF Page Format
      PdfPageFormat pageFormat;
      if (pageSizeSetting == 'Letter') {
        pageFormat = PdfPageFormat.letter;
        pageWidth = PdfPageFormat.letter.width;
        pageHeight = PdfPageFormat.letter.height;
      } else if (pageSizeSetting == 'Fit') {
        // Fit to image width/height (points)
        pageFormat = PdfPageFormat(imgWidth, imgHeight, marginAll: 0);
        pageWidth = imgWidth;
        pageHeight = imgHeight;
      } else {
        // Standard A4
        pageFormat = PdfPageFormat.a4;
        pageWidth = PdfPageFormat.a4.width;
        pageHeight = PdfPageFormat.a4.height;
      }

      final pw.MemoryImage pdfImage = pw.MemoryImage(imageBytes);

      pdf.addPage(
        pw.Page(
          pageFormat: pageFormat,
          build: (pw.Context context) {
            if (pageSizeSetting == 'Fit') {
              return pw.FullPage(
                ignoreMargins: true,
                child: pw.Image(pdfImage, fit: pw.BoxFit.fill),
              );
            } else {
              // Maintain aspect ratio inside A4/Letter margin limits
              final double margin = 36.0; // 0.5 inches margin
              final double printableWidth = pageWidth - (margin * 2);
              final double printableHeight = pageHeight - (margin * 2);

              final double imageRatio = imgWidth / imgHeight;
              final double printableRatio = printableWidth / printableHeight;

              double renderWidth = printableWidth;
              double renderHeight = printableHeight;

              if (imageRatio > printableRatio) {
                renderWidth = printableWidth;
                renderHeight = printableWidth / imageRatio;
              } else {
                renderHeight = printableHeight;
                renderWidth = printableHeight * imageRatio;
              }

              return pw.Center(
                child: pw.Container(
                  width: renderWidth,
                  height: renderHeight,
                  child: pw.Image(pdfImage, fit: pw.BoxFit.contain),
                ),
              );
            }
          },
        ),
      );
    }

    // Write PDF to cache/temp directory for viewing/sharing
    final Directory tempDir = await getTemporaryDirectory();
    final String cleanTitle = docTitle.toLowerCase().replaceAll(RegExp(r'\s+'), '_');
    final String pdfPath = '${tempDir.path}/${cleanTitle}_${DateTime.now().millisecondsSinceEpoch}.pdf';
    final File pdfFile = File(pdfPath);
    await pdfFile.writeAsBytes(await pdf.save());

    return pdfFile;
  }
}
