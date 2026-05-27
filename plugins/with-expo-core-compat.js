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

module.exports = function withExpoCoreCompat(config) {
  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
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

      return modConfig;
    },
  ]);
};
