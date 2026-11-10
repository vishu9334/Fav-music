package com.favmusic.auth;
import android.content.Intent;
import com.facebook.react.bridge.*;
import com.facebook.react.modules.core.DeviceEventManagerModule;
/** Receives text only. It never opens, fetches or extracts Instagram media. */
public final class AadatShareModule extends ReactContextBaseJavaModule {
 private String pending; private boolean examinedInitial=false;
 private final BaseActivityEventListener listener=new BaseActivityEventListener(){
  @Override public void onNewIntent(Intent intent){
   synchronized(AadatShareModule.this){examinedInitial=true;capture(intent);}
   if(getReactApplicationContext().hasActiveCatalystInstance())getReactApplicationContext().getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("aadatShareAvailable",null);
  }
 };
 public AadatShareModule(ReactApplicationContext context){super(context);context.addActivityEventListener(listener);}
 @Override public String getName(){return "AadatShare";}
 private void capture(Intent intent){
  if(intent==null||!Intent.ACTION_SEND.equals(intent.getAction())||!"text/plain".equals(intent.getType()))return;
  try { CharSequence text=intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
  if(text!=null&&text.length()>0&&text.length()<=4096)pending=text.toString(); } catch(RuntimeException invalid){ /* Malformed external extras are ignored. */ }
 }
 @ReactMethod public synchronized void consume(Promise promise){
  if(!examinedInitial){examinedInitial=true;if(getCurrentActivity()!=null)capture(getCurrentActivity().getIntent());}
  String text=pending;pending=null;promise.resolve(text);
 }
 @Override public void invalidate(){getReactApplicationContext().removeActivityEventListener(listener);pending=null;super.invalidate();}
}
