const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const JAVA_SOURCE = `package expo.core;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.List;

public class ExpoModulesPackage implements ReactPackage {
  private final expo.modules.ExpoModulesPackage delegate = new expo.modules.ExpoModulesPackage();

  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    return delegate.createNativeModules(reactContext);
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return (List<ViewManager>) (List<?>) delegate.createViewManagers(reactContext);
  }
}
`;

const ANDROIDX_EXCLUDE_BLOCK = `
// Added by with-expo-core-compat: this project is AndroidX-only.
subprojects {
  configurations.configureEach {
    exclude group: "com.android.support"
  }
}
`;

module.exports = function withExpoCoreCompat(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const manifestPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "AndroidManifest.xml",
      );
      const buildGradlePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "build.gradle",
      );
      const outputPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "expo",
        "core",
        "ExpoModulesPackage.java",
      );

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JAVA_SOURCE);

      let manifest = fs.readFileSync(manifestPath, "utf8");
      if (!manifest.includes("xmlns:tools=")) {
        manifest = manifest.replace(
          /<manifest\b([^>]*)>/,
          '<manifest$1 xmlns:tools="http://schemas.android.com/tools">',
        );
      }

      if (!manifest.includes('tools:replace="android:appComponentFactory"')) {
        manifest = manifest.replace(
          /<application\b([^>]*)>/,
          '<application$1 tools:replace="android:appComponentFactory">',
        );
      }

      if (!manifest.includes("android:appComponentFactory=")) {
        manifest = manifest.replace(
          /<application\b([^>]*)>/,
          '<application$1 android:appComponentFactory="androidx.core.app.CoreComponentFactory">',
        );
      }

      fs.writeFileSync(manifestPath, manifest);

      let buildGradle = fs.readFileSync(buildGradlePath, "utf8");
      if (!buildGradle.includes("with-expo-core-compat: this project is AndroidX-only")) {
        buildGradle = `${buildGradle.trimEnd()}\n${ANDROIDX_EXCLUDE_BLOCK}`;
        fs.writeFileSync(buildGradlePath, buildGradle);
      }

      return modConfig;
    },
  ]);
};
