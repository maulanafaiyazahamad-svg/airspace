package com.shahzad.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import android.webkit.JavascriptInterface;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

/** Full-screen WebView that serves the app from its own assets over a secure origin. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/www/index.html";
    // Live code: every file is fetched fresh from the first source that answers, so updates need no
    // reinstall. Several sources, because some mobile networks block one or another of these hosts.
    private static final String[] SOURCES = {
            "https://maulanafaiyazahamad-svg.github.io/airspace/",
            "https://cdn.jsdelivr.net/gh/maulanafaiyazahamad-svg/airspace@main/",
            "https://raw.githubusercontent.com/maulanafaiyazahamad-svg/airspace/main/",
    };
    private static final String[] SOURCE_NAMES = { "github", "jsdelivr", "raw" };
    private volatile int good = 0;
    private volatile long offlineUntil = 0;
    private volatile String source = "app";
    private static final int REQ_CAMERA = 7;

    private WebView web;
    private PermissionRequest pending;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(0xFF000000);
        setContentView(web);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                return HOST.equals(u.getHost()) ? serve(u) : null;
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return !HOST.equals(req.getUrl().getHost());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (hasCamera()) request.grant(request.getResources());
                    else { pending = request; askCamera(); }
                });
            }
        });

        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public String source() { return source; }
        }, "ShahzadNative");
        if (!hasCamera()) askCamera();
        web.loadUrl(START);
    }

    private WebResourceResponse asset(String path) {
        try {
            InputStream in = getAssets().open(path);
            WebResourceResponse r = new WebResourceResponse(mime(path), null, in);
            Map<String, String> h = new HashMap<>();
            h.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(h);
            return r;
        } catch (Exception e) {
            return null;
        }
    }

    private WebResourceResponse serve(Uri uri) {
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.contains("..")) return null;
        if (path.startsWith("/")) path = path.substring(1);
        if (path.startsWith("www/")) {
            String rel = path.substring(4);
            // Big files that never change (model, libraries, icons) always come from inside the APK.
            boolean fixed = rel.startsWith("vendor/") || rel.equals("hand_landmarker.task") || rel.startsWith("icons/");
            if (!fixed) {
                byte[] body = fetchLive(rel);
                File cached = new File(getCacheDir(), "live/" + rel);
                if (body != null) save(cached, body);
                else if (cached.exists()) body = read(cached);
                if (body != null) return bytes(rel, body);
            }
        }
        try {
            InputStream in = getAssets().open(path);
            WebResourceResponse r = new WebResourceResponse(mime(path), mime(path).startsWith("text") || mime(path).endsWith("javascript") ? "utf-8" : null, in);
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(h);
            return r;
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
        }
    }

    private byte[] fetchLive(String rel) {
        if (System.currentTimeMillis() < offlineUntil) return null;
        for (int k = 0; k < SOURCES.length; k++) {
            int i = (good + k) % SOURCES.length;
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(SOURCES[i] + rel + "?t=" + System.currentTimeMillis()).openConnection();
                c.setConnectTimeout(3500); c.setReadTimeout(6000); c.setUseCaches(false);
                c.setRequestProperty("Cache-Control", "no-cache");
                if (c.getResponseCode() != 200) continue;
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                good = i; source = SOURCE_NAMES[i];
                return out.toByteArray();
            } catch (Exception e) {
                // try the next source
            } finally {
                if (c != null) c.disconnect();
            }
        }
        offlineUntil = System.currentTimeMillis() + 20000;
        source = "offline";
        return null;
    }

    private WebResourceResponse bytes(String path, byte[] body) {
        WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", new ByteArrayInputStream(body));
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        r.setResponseHeaders(h);
        return r;
    }

    private static void save(File f, byte[] b) {
        try { f.getParentFile().mkdirs(); FileOutputStream o = new FileOutputStream(f); o.write(b); o.close(); } catch (Exception ignored) { }
    }

    private static byte[] read(File f) {
        try {
            FileInputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n); in.close();
            return out.toByteArray();
        } catch (Exception e) { return null; }
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private boolean hasCamera() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    private void askCamera() {
        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code != REQ_CAMERA || pending == null) return;
        if (hasCamera()) pending.grant(pending.getResources()); else pending.deny();
        pending = null;
    }

    @SuppressWarnings("deprecation")
    private void hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideBars();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
