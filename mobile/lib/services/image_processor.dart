import 'dart:io';
import 'dart:typed_data';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';

class ImageProcessor {
  // Apply document enhancement (sharpening + background division + levels)
  static Future<String> applyEnhancement(String inputPath, String filterType) async {
    final File file = File(inputPath);
    if (!await file.exists()) throw Exception("Input file does not exist");

    final Uint8List bytes = await file.readAsBytes();
    final img.Image? originalImage = img.decodeImage(bytes);
    if (originalImage == null) throw Exception("Could not decode image");

    img.Image processed;

    if (filterType == 'bw') {
      // 1. Grayscale
      final img.Image gray = img.grayscale(originalImage);

      // 2. Estimate background illumination map using Low-Pass Downscale
      final img.Image tiny = img.copyResize(gray, width: 64, height: 64);
      final img.Image bgTiny = img.gaussianBlur(tiny, radius: 3);
      final img.Image bg = img.copyResize(bgTiny, width: gray.width, height: gray.height, interpolation: img.Interpolation.linear);

      // 3. Divide to normalize illumination (removes shadows)
      final img.Image normalized = img.Image.from(gray);
      for (int y = 0; y < gray.height; y++) {
        for (int x = 0; x < gray.width; x++) {
          final int origPixel = gray.getPixel(x, y).r.toInt();
          final int bgPixel = bg.getPixel(x, y).r.toInt();
          
          int newVal = bgPixel == 0 ? 255 : ((origPixel / bgPixel) * 255).round().clamp(0, 255);
          normalized.setPixelRgb(x, y, newVal, newVal, newVal);
        }
      }

      // 4. Sharpen
      final img.Image sharpened = img.convolve(normalized, filter: [
        0, -1,  0,
       -1,  5, -1,
        0, -1,  0
      ]);

      // 5. Apply Levels correction in-place (low 130, high 180)
      final double scale = 255 / (180 - 130);
      for (int y = 0; y < sharpened.height; y++) {
        for (int x = 0; x < sharpened.width; x++) {
          final int val = sharpened.getPixel(x, y).r.toInt();
          int newVal = val < 130 ? 0 : (val > 180 ? 255 : ((val - 130) * scale).round().clamp(0, 255));
          sharpened.setPixelRgb(x, y, newVal, newVal, newVal);
        }
      }

      processed = sharpened;
    } else if (filterType == 'magic') {
      // 1. Estimate background illumination map in color space
      final img.Image tiny = img.copyResize(originalImage, width: 64, height: 64);
      final img.Image bgTiny = img.gaussianBlur(tiny, radius: 3);
      final img.Image bg = img.copyResize(bgTiny, width: originalImage.width, height: originalImage.height, interpolation: img.Interpolation.linear);

      // 2. Divide channels to normalize illumination
      final img.Image normalized = img.Image.from(originalImage);
      for (int y = 0; y < originalImage.height; y++) {
        for (int x = 0; x < originalImage.width; x++) {
          final pOrig = originalImage.getPixel(x, y);
          final pBg = bg.getPixel(x, y);

          int r = pBg.r == 0 ? 255 : ((pOrig.r / pBg.r) * 255).round().clamp(0, 255);
          int g = pBg.g == 0 ? 255 : ((pOrig.g / pBg.g) * 255).round().clamp(0, 255);
          int b = pBg.b == 0 ? 255 : ((pOrig.b / pBg.b) * 255).round().clamp(0, 255);

          normalized.setPixelRgb(x, y, r, g, b);
        }
      }

      // 3. Sharpen color edges
      final img.Image sharpened = img.convolve(normalized, filter: [
        0, -1,  0,
       -1,  5, -1,
        0, -1,  0
      ]);

      // 4. Boost levels to push off-white backdrops to pure white (low 110, high 195)
      final double scale = 255 / (195 - 110);
      for (int y = 0; y < sharpened.height; y++) {
        for (int x = 0; x < sharpened.width; x++) {
          final p = sharpened.getPixel(x, y);
          
          int r = p.r < 110 ? 0 : (p.r > 195 ? 255 : ((p.r - 110) * scale).round().clamp(0, 255));
          int g = p.g < 110 ? 0 : (p.g > 195 ? 255 : ((p.g - 110) * scale).round().clamp(0, 255));
          int b = p.b < 110 ? 0 : (p.b > 195 ? 255 : ((p.b - 110) * scale).round().clamp(0, 255));

          sharpened.setPixelRgb(x, y, r, g, b);
        }
      }

      processed = sharpened;
    } else if (filterType == 'grayscale') {
      // 1. Grayscale
      final img.Image gray = img.grayscale(originalImage);

      // 2. Normalize shadows
      final img.Image tiny = img.copyResize(gray, width: 64, height: 64);
      final img.Image bgTiny = img.gaussianBlur(tiny, radius: 3);
      final img.Image bg = img.copyResize(bgTiny, width: gray.width, height: gray.height, interpolation: img.Interpolation.linear);

      final img.Image normalized = img.Image.from(gray);
      for (int y = 0; y < gray.height; y++) {
        for (int x = 0; x < gray.width; x++) {
          final int origPixel = gray.getPixel(x, y).r.toInt();
          final int bgPixel = bg.getPixel(x, y).r.toInt();
          
          int newVal = bgPixel == 0 ? 255 : ((origPixel / bgPixel) * 255).round().clamp(0, 255);
          normalized.setPixelRgb(x, y, newVal, newVal, newVal);
        }
      }

      // 3. Sharpen
      final img.Image sharpened = img.convolve(normalized, filter: [
        0, -1,  0,
       -1,  5, -1,
        0, -1,  0
      ]);

      // 4. Gentle contrast stretch (low 105, high 205)
      final double scale = 255 / (205 - 105);
      for (int y = 0; y < sharpened.height; y++) {
        for (int x = 0; x < sharpened.width; x++) {
          final int val = sharpened.getPixel(x, y).r.toInt();
          int newVal = val < 105 ? 0 : (val > 205 ? 255 : ((val - 105) * scale).round().clamp(0, 255));
          sharpened.setPixelRgb(x, y, newVal, newVal, newVal);
        }
      }

      processed = sharpened;
    } else {
      // Original
      processed = originalImage;
    }

    // Save processed image back to disk
    final Directory tempDir = await getTemporaryDirectory();
    final String outputPath = '${tempDir.path}/${DateTime.now().microsecondsSinceEpoch}_processed.jpg';
    final List<int> encodedBytes = img.encodeJpg(processed, quality: 90);
    await File(outputPath).writeAsBytes(encodedBytes);

    return outputPath;
  }

  // Rotate an image 90 degrees clockwise and save it
  static Future<String> rotateImage90(String imagePath) async {
    final File file = File(imagePath);
    final Uint8List bytes = await file.readAsBytes();
    final img.Image? originalImage = img.decodeImage(bytes);
    if (originalImage == null) throw Exception("Could not decode image");

    final img.Image rotated = img.copyRotate(originalImage, angle: 90);
    
    final Directory tempDir = await getTemporaryDirectory();
    final String outputPath = '${tempDir.path}/${DateTime.now().microsecondsSinceEpoch}_rotated.jpg';
    final List<int> encodedBytes = img.encodeJpg(rotated, quality: 90);
    await File(outputPath).writeAsBytes(encodedBytes);

    return outputPath;
  }
}
