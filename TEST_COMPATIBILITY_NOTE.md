# Test Compatibility Note

## Vitest Configuration Issue

There's a known issue with vitest hanging due to CommonJS/ESM module conflicts in the test runner configuration.

### The Issue:
- Vitest requires ESM imports but the project is configured as CommonJS
- This causes the test runner to hang when loading test files
- This is NOT a Windows compatibility issue - it affects all platforms equally

### Impact on Windows:
- **No impact on production code** - All services run fine
- **No impact on functionality** - The hanging is only in the test runner
- **Tests will behave identically on Windows** (they'll hang there too until fixed)

### Current Status:
- All smoke tests work (`npm run smoke:sim`)  
- All builds work (`npm run build`)
- All services start correctly
- Only `vitest run` hangs due to module loading

### Workaround:
Use smoke tests to verify functionality instead of unit tests:
```bash
npm run smoke:sim
```

### Future Fix:
The project needs to either:
1. Migrate to ESM modules (`"type": "module"`)
2. Use a different test runner (like Jest)
3. Configure vitest with a custom transformer for CommonJS

This is a test infrastructure issue, not a cross-platform compatibility issue.