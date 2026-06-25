class DocumentPage {
  final String id;
  final String processedImagePath;
  final String originalImagePath;
  final String text;

  DocumentPage({
    required this.id,
    required this.processedImagePath,
    required this.originalImagePath,
    required this.text,
  });

  DocumentPage copyWith({
    String? id,
    String? processedImagePath,
    String? originalImagePath,
    String? text,
  }) {
    return DocumentPage(
      id: id ?? this.id,
      processedImagePath: processedImagePath ?? this.processedImagePath,
      originalImagePath: originalImagePath ?? this.originalImagePath,
      text: text ?? this.text,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'processedImagePath': processedImagePath,
      'originalImagePath': originalImagePath,
      'text': text,
    };
  }

  factory DocumentPage.fromJson(Map<String, dynamic> json) {
    return DocumentPage(
      id: json['id'] as String,
      processedImagePath: json['processedImagePath'] as String,
      originalImagePath: json['originalImagePath'] as String,
      text: json['text'] as String,
    );
  }
}
