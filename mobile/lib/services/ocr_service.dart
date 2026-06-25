import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

class OcrService {
  // Map standard language codes to ML Kit script recognizers
  static TextRecognitionScript _getScriptForLanguage(String langCode) {
    switch (langCode) {
      case 'hin':
      case 'mar':
        return TextRecognitionScript.devanagari;
      case 'ara':
        return TextRecognitionScript.arabic;
      case 'chi_sim':
      case 'chi_tra':
        return TextRecognitionScript.chinese;
      case 'jpn':
        return TextRecognitionScript.japanese;
      case 'kor':
        return TextRecognitionScript.korean;
      default:
        // English, Spanish, French, German, Bengali, Telugu, Tamil, Kannada, Malayalam, Punjabi
        // Latin script supports standard European languages, while other Indian scripts might fall back
        return TextRecognitionScript.latin;
    }
  }

  // Perform on-device text recognition on an image path
  static Future<String> recognizeText(String imagePath, {String languageCode = 'eng'}) async {
    final InputImage inputImage = InputImage.fromFilePath(imagePath);
    final TextRecognitionScript script = _getScriptForLanguage(languageCode);
    final TextRecognizer textRecognizer = TextRecognizer(script: script);

    try {
      final RecognizedText recognizedText = await textRecognizer.processImage(inputImage);
      return recognizedText.text;
    } catch (e) {
      print('OCR recognition failed: $e');
      return 'OCR failed: ${e.toString()}';
    } finally {
      textRecognizer.close();
    }
  }
}
