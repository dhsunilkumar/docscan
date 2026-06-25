import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/document.dart';

class DatabaseService {
  static const String _boxName = 'documents_box';
  late Box<String> _box;

  Future<void> init() async {
    await Hive.initFlutter();
    _box = await Hive.openBox<String>(_boxName);
  }

  List<ScannedDocument> getAllDocuments() {
    List<ScannedDocument> docs = [];
    for (var key in _box.keys) {
      final jsonStr = _box.get(key);
      if (jsonStr != null) {
        try {
          final Map<String, dynamic> jsonMap = json.decode(jsonStr) as Map<String, dynamic>;
          docs.add(ScannedDocument.fromJson(jsonMap));
        } catch (e) {
          print('Error parsing document JSON: $e');
        }
      }
    }
    // Sort by latest updated first
    docs.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return docs;
  }

  Future<void> saveDocument(ScannedDocument doc) async {
    final jsonStr = json.encode(doc.toJson());
    await _box.put(doc.id, jsonStr);
  }

  Future<void> deleteDocument(String id) async {
    await _box.delete(id);
  }
}
