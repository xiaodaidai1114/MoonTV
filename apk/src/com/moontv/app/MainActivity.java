package com.moontv.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

/**
 * MoonTV 的轻量级 WebView 外壳：打开自己部署的 MoonTV 站点。
 * 首次启动选择服务器地址，之后可通过「返回键 → 更换服务器」修改。
 */
public class MainActivity extends Activity {

    private static final String PREFS = "moontv";
    private static final String KEY_SERVER = "server_url";
    private static final String UA_SUFFIX = " MoonTVApp/1.0";

    /**
     * 监听播放器的全屏状态：ArtPlayer 的「网页全屏」只是加了个 class，
     * 不会触发 WebChromeClient.onShowCustomView，所以这里主动观察。
     */
    private static final String ORIENTATION_WATCHER_JS =
            "(function(){"
          + "if(window.__moonOriWatch){return;}window.__moonOriWatch=true;"
          + "var last='off';"
          + "function fullscreenOn(){"
          + "  if(document.fullscreenElement){return true;}"
          + "  if(document.body&&document.body.classList.contains('art-fullscreen-web')){return true;}"
          + "  var el=document.querySelector('.art-video-player');"
          + "  if(el&&((el.classList.contains('art-fullscreen-web'))||(el.classList.contains('art-fullscreen')))){return true;}"
          + "  return false;"
          + "}"
          + "function videoWide(){var v=document.querySelector('video');"
          + "  if(!v||!v.videoWidth||!v.videoHeight){return false;}"
          + "  return v.videoWidth>=v.videoHeight;}"
          + "function check(){var on=fullscreenOn();var wide=on&&videoWide();var key=on?('on'+wide):'off';"
          + "  if(key!==last){last=key;"
          + "  try{window.MoonTVShell.setLandscape(on&&wide);}catch(e){}}}"
          + "document.addEventListener('fullscreenchange',check);"
          + "try{new MutationObserver(check).observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['class']});}catch(e){}"
          + "setInterval(check,600);"
          + "})();";

    private static final String[][] KNOWN_SERVERS = {
        { "东京", "http://43.163.211.88:3000" },
        { "jd云", "http://117.72.220.120:3001" },
    };

    private FrameLayout root;
    private WebView webView;
    private ProgressBar progressBar;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private WebChromeClient chromeClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(2));
        progressParams.topMargin = 0;
        root.addView(progressBar, progressParams);

        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setUserAgentString(settings.getUserAgentString() + UA_SUFFIX);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                view.evaluateJavascript(ORIENTATION_WATCHER_JS, null);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                progressBar.setVisibility(View.GONE);
                if (failingUrl != null && failingUrl.equals(currentUrl())) {
                    showOfflinePage(description);
                }
            }
        });

        chromeClient = new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progressBar.setProgress(newProgress);
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setFullscreen(true);
                applyOrientation(true);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                webView.setVisibility(View.VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                setFullscreen(false);
                applyOrientation(false);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
            }
        };
        webView.setWebChromeClient(chromeClient);

        // 让网页能通知外壳旋转屏幕（ArtPlayer 的网页全屏是 CSS 实现的，不会触发 onShowCustomView）
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setLandscape(final boolean landscape) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        applyOrientation(landscape);
                    }
                });
            }
        }, "MoonTVShell");

        String saved = prefs().getString(KEY_SERVER, null);
        if (saved == null || saved.trim().isEmpty()) {
            showServerDialog(true);
        } else {
            load(saved);
        }
    }

    /* ------------------------------ 站点地址 ------------------------------ */

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String currentUrl() {
        String saved = prefs().getString(KEY_SERVER, null);
        return saved == null ? "" : saved;
    }

    private String normalize(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "";
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private void load(String server) {
        final String normalized = normalize(server);
        if (normalized.isEmpty()) {
            showServerDialog(true);
            return;
        }
        prefs().edit().putString(KEY_SERVER, normalized).apply();
        webView.loadUrl(normalized);
    }

    private void showServerDialog(final boolean firstRun) {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(16);
        container.setPadding(pad, pad, pad, pad);

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("http://你的服务器:3000");
        input.setText(currentUrl());
        input.setSingleLine(true);
        container.addView(input);

        String[] labels = new String[KNOWN_SERVERS.length];
        for (int i = 0; i < KNOWN_SERVERS.length; i++) {
            labels[i] = KNOWN_SERVERS[i][0] + "  " + KNOWN_SERVERS[i][1];
        }

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle(firstRun ? "选择服务器" : "更换服务器");
        builder.setView(container);
        builder.setPositiveButton("连接", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String value = normalize(input.getText().toString());
                if (value.isEmpty()) {
                    Toast.makeText(MainActivity.this, "请输入服务器地址", Toast.LENGTH_SHORT).show();
                    showServerDialog(firstRun);
                    return;
                }
                load(value);
            }
        });
        builder.setNeutralButton("常用地址", new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("常用地址")
                        .setItems(labels, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int index) {
                                load(KNOWN_SERVERS[index][1]);
                            }
                        })
                        .show();
            }
        });
        if (!firstRun) {
            builder.setNegativeButton("取消", null);
        }
        builder.setCancelable(!firstRun);
        builder.show();
    }

    /* ------------------------------ 导航处理 ------------------------------ */

    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("http://") || url.startsWith("https://")) {
            String server = currentUrl();
            try {
                String host = Uri.parse(url).getHost();
                String serverHost = Uri.parse(server).getHost();
                if (host != null && host.equals(serverHost)) {
                    return false; // 站内跳转，留在应用内
                }
            } catch (Exception ignored) {
                // 解析失败按站内处理
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
                // 没有可用浏览器时忽略
            }
            return true;
        }
        // intent://、tel:、mailto: 等交给系统
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
        return true;
    }

    private void showOfflinePage(String description) {
        String html = "<html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<style>body{background:#0b0b0b;color:#e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"
                + "display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}"
                + "div{padding:24px}h2{font-size:18px;margin:0 0 8px}p{color:#9ca3af;font-size:14px;margin:0 0 20px}"
                + "button{background:#16a34a;color:#fff;border:0;border-radius:10px;padding:12px 28px;font-size:15px}</style></head>"
                + "<body><div><h2>连不上服务器</h2><p>"
                + (description == null ? "" : description)
                + "</p><button onclick=\"location.reload()\">重试</button></div></body></html>";
        webView.loadDataWithBaseURL(currentUrl(), html, "text/html", "utf-8", null);
    }

    private void setFullscreen(boolean fullscreen) {
        View decor = getWindow().getDecorView();
        if (fullscreen) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    /** 全屏时切横屏，退出时交还给系统（跟随重力/锁定） */
    private void applyOrientation(boolean landscape) {
        try {
            setRequestedOrientation(landscape
                    ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } catch (Exception ignored) {
            // 个别机型不支持，忽略
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    /* ------------------------------ 返回键 ------------------------------ */

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (customView != null) {
                chromeClient.onHideCustomView();
                return true;
            }
            webView.evaluateJavascript(
                    "(function(){try{if(window.__moonExitFullscreen&&window.__moonExitFullscreen()){return 'fs';}}catch(e){}return '';})()",
                    new android.webkit.ValueCallback<String>() {
                        @Override
                        public void onReceiveValue(String value) {
                            if (value != null && value.contains("fs")) return;
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    if (webView.canGoBack()) webView.goBack();
                                    else finish();
                                }
                            });
                        }
                    });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void showExitMenu() {
        new AlertDialog.Builder(this)
                .setTitle("MoonTV")
                .setItems(new String[] { "刷新页面", "更换服务器", "退出" }, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        if (which == 0) {
                            webView.reload();
                        } else if (which == 1) {
                            showServerDialog(false);
                        } else {
                            finish();
                        }
                    }
                })
                .setNegativeButton("取消", null)
                .show();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            root.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }
}
