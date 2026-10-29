package com.pinlab.batterylifecycle;

import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }
}
