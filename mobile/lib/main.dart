import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'services/database_service.dart';
import 'screens/history_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Lock orientation to portrait
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);

  // Set system navigation overlay styling
  SystemChrome.setSystemUIOverlayStyle(const SystemOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF09090E),
    systemNavigationBarIconBrightness: Brightness.light,
  ));

  // Initialize Local Hive Database
  final dbService = DatabaseService();
  await dbService.init();

  runApp(DocuScanApp(dbService: dbService));
}

class DocuScanApp extends StatelessWidget {
  final DatabaseService dbService;

  const DocuScanApp({Key? key, required this.dbService}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DocuScan OCR',
      debugShowCheckedModeBanner: false,
      
      // Modern sleek dark mode glassmorphic-inspired design system
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF09090E),
        primaryColor: const Color(0xFF3A86FF),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF3A86FF),
          secondary: Color(0xFF8338EC),
          surface: Color(0xFF14141F),
          error: Color(0xFFFF006E),
          success: Color(0xFF06D6A0),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF09090E),
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            fontFamily: 'Outfit',
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: Colors.white,
          ),
        ),
        cardTheme: CardTheme(
          color: const Color(0xFF1E1E2E).withOpacity(0.6),
          elevation: 8,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.white.withOpacity(0.06)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF1E1E2E),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.white.withOpacity(0.05)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF3A86FF), width: 1.5),
          ),
        ),
      ),
      home: HistoryScreen(dbService: dbService),
    );
  }
}
