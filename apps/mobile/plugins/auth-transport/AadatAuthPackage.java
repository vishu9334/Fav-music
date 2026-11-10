package com.favmusic.auth;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.Collections;
import java.util.List;

public final class AadatAuthPackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) { return java.util.Arrays.asList(new AadatAuthModule(context), new AadatShareModule(context), new AadatMediaModule(context)); }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }
}
