import 'page.dart';

class ScannedDocument {
  final String id;
  final String title;
  final List<DocumentPage> pages;
  final DateTime createdAt;
  final DateTime updatedAt;

  ScannedDocument({
    required this.id,
    required this.title,
    required this.pages,
    required this.createdAt,
    required this.updatedAt,
  });

  ScannedDocument copyWith({
    String? id,
    String? title,
    List<DocumentPage>? pages,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return ScannedDocument(
      id: id ?? this.id,
      title: title ?? this.title,
      pages: pages ?? this.pages,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'pages': pages.map((p) => p.toJson()).toList(),
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt.toIso8601String(),
    };
  }

  factory ScannedDocument.fromJson(Map<String, dynamic> json) {
    var list = json['pages'] as List;
    List<DocumentPage> pageList = list.map((p) => DocumentPage.fromJson(p as Map<String, dynamic>)).toList();

    return ScannedDocument(
      id: json['id'] as String,
      title: json['title'] as String,
      pages: pageList,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}
