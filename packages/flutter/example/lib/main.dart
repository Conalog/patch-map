import 'package:flutter/material.dart';

// Resolves the public entry point even before it has a rendering API.
// ignore: unused_import
import 'package:conalog_patch_map/conalog_patch_map.dart';

void main() {
  runApp(const PatchMapExampleApp());
}

class PatchMapExampleApp extends StatelessWidget {
  const PatchMapExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PatchMap development',
      theme: ThemeData(useMaterial3: true),
      home: const _DevelopmentHost(),
    );
  }
}

class _DevelopmentHost extends StatelessWidget {
  const _DevelopmentHost();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('PatchMap development')),
      body: Center(
        child: Text(
          'Package environment is ready.\nMap renderer is not implemented yet.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge,
        ),
      ),
    );
  }
}
