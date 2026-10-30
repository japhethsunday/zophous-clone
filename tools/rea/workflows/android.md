# REA workflow · android

Every command below is a real `rea` CLI subcommand from the vendored clone
(`./rea`, [morluto/rea](https://github.com/morluto/rea)), with usage examples
taken verbatim from REA's own documentation. Run them through the bridge so the
Node >=24.22.1 requirement is handled automatically:

```bash
node tools/rea/run.mjs <command> <args...> --json
```

Each call prints canonical Evidence JSON to stdout — save it (`> x.json`) and
chain it into comparison/view tools, or hand it to an agent for reconstruction.
Machine-readable catalogs: `tools/rea/catalog.slim.json` (233 MCP tool names +
descriptions) and `docs/research/rea/tool-catalog.json` (with input schemas).

## Commands

- `rea inspect-android-package /tmp/acq/com.whatsapp/base.apk`
- `rea search-android-classes /path/Example.apk MainActivity`
- `rea inspect-android-class /path/Example.apk example.MainActivity`
- `rea inspect-android-method /path/Example.apk example.MainActivity onCreate`
- `rea trace-android-references /path/Example.apk example.MainActivity`
- `rea decode-android-resources /targets/Example.apk`
- `rea inspect-apk-signature /path/app.apk`
- `rea project-android-application-graph '{"inventory_evidence":[<inventory_artifact Evidence>]}'`
- `rea identify-flutter-build /targets/Example.apk`
- `rea inspect-dart-aot /targets/Example.apk`
- `rea capture-adb-screen emulator-5554 --output-directory /tmp/shots`
- `rea list-adb-packages emulator-5554 --scope third_party`
- `rea start-adb-activity emulator-5554 android.intent.action.VIEW --data-uri https://example.com`
- `rea read-adb-logcat emulator-5554 --count 200`
- `rea pull-adb-package emulator-5554 com.whatsapp --output-directory /tmp/acq`
