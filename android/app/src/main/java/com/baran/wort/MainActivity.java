package com.baran.wort;

import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Android 15+ enforces edge-to-edge for apps targeting API 35+.
        // Capacitor's SystemBars plugin then injects the real safe-area insets
        // into CSS as --safe-area-inset-* (see capacitor.config.json).
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
