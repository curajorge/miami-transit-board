package com.jcm.miamitrolleylive;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.graphics.Color;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String APP_ORIGIN = "https://app.local/";
    private static final String TRACKER = "https://publictransportation.tsomobile.com/rest/PubTrans/GetModuleInfoPublic";
    private static final String BUS_TIME = "https://transitbustime.miamidade.gov/bustime/wireless/html/eta.jsp";
    private static final int MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.rgb(16, 42, 67));
        container.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(container);
        // Android 15 enforces edge-to-edge. Keep the entire WebView, including
        // dialogs, inside system bars/cutouts rather than guessing CSS heights.
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            container.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            });
            container.requestApplyInsets();
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // Used only to remember the rider's selected From/To stops on-device.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString("MiamiTransitBoard/0.2 (+https://github.com/curajorge/miami-transit-board)");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri requestUri = request.getUrl();
                URL url = requestUri == null ? null : toUrl(requestUri.toString());
                if (url == null) return error("Invalid request");
                if (isAppOrigin(requestUri) && url.getPath().equals("/api/tracker")) return trackerResponse(url);
                if (isAppOrigin(requestUri) && url.getPath().equals("/api/bus")) return busResponse(url);
                if (isAppOrigin(requestUri)) return assetResponse(url.getPath());
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppOrigin(uri)) return false;
                if (request.isForMainFrame() && uri != null && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
        });

        webView.loadUrl(APP_ORIGIN + "index.html");
    }

    private URL toUrl(String value) {
        try { return new URL(value); } catch (Exception ignored) { return null; }
    }

    private boolean isAppOrigin(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && "app.local".equals(uri.getHost()) && uri.getPort() == -1;
    }

    private WebResourceResponse assetResponse(String path) {
        String name = path.equals("/") ? "index.html" : path.substring(1);
        if (!name.matches("(index\\.html|styles\\.css|engine\\.js|app\\.js|go\\.js|go\\.css|bus-stops\\.js|trolley-stops\\.js|vendor/leaflet\\.css|vendor/leaflet\\.js|assets/brand/miami-transit-after-hours\\.png)")) return error("Not found");
        String mime = name.endsWith(".png") ? "image/png" : name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript";
        try { return new WebResourceResponse(mime, "UTF-8", getAssets().open("web/" + name)); }
        catch (Exception ignored) { return error("Missing app asset"); }
    }

    private WebResourceResponse trackerResponse(URL localUrl) {
        HttpURLConnection connection = null;
        try {
            String key = Uri.parse(localUrl.toString()).getQueryParameter("Key");
            String query;
            if ("ROUTES_BYTKN".equals(key)) query = "Key=ROUTES_BYTKN&id=-1&f1=81E39EC9-D773-447E-BE29-D7F30AB177BC&f2=&f3=&lan=en";
            else if ("UNITS_LOCATION_ROUTE".equals(key)) query = "Key=UNITS_LOCATION_ROUTE&id=71276&lan=en";
            else return error("Unsupported request");
            URL upstream = new URL(TRACKER + "?" + query + "&callback=x&_=" + System.currentTimeMillis());
            connection = (HttpURLConnection) upstream.openConnection();
            connection.setRequestProperty("User-Agent", "curl/8.14.1");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            if (connection.getResponseCode() != 200) return error("City tracker unavailable");
            String wrapped = readAll(connection.getInputStream());
            if (!wrapped.startsWith("x(") || !wrapped.endsWith(");")) return error("Unexpected tracker response");
            String jsonString = wrapped.substring(2, wrapped.length() - 2);
            // The callback contains a JSON string whose contents are themselves JSON.
            // Use Android's parser so encoded polyline backslashes remain valid.
            String json = new JSONArray("[" + jsonString + "]").getString(0);
            return jsonResponse(json, 200, "OK");
        } catch (Exception ignored) {
            return error("City tracker unavailable");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private WebResourceResponse busResponse(URL localUrl) {
        HttpURLConnection connection = null;
        try {
            String query = localUrl.getQuery() == null ? "" : localUrl.getQuery();
            Matcher routeMatch = Pattern.compile("(?:^|&)route=(3|9)(?:&|$)").matcher(query);
            Matcher directionMatch = Pattern.compile("(?:^|&)direction=(south|north)(?:&|$)").matcher(query);
            if (!routeMatch.find() || !directionMatch.find()) return error("Unsupported bus route");
            String route = routeMatch.group(1);
            String direction = directionMatch.group(1);
            String stop = route.equals("3") ? (direction.equals("south") ? "6706" : "103") : (direction.equals("south") ? "6774" : "6635");
            URL upstream = new URL(BUS_TIME + "?direction=MetroBus%3A" + direction.toUpperCase() + "BOUND&id=MetroBus%3A" + stop + "&route=MetroBus%3A" + route + "&showAllBusses=off");
            connection = (HttpURLConnection) upstream.openConnection();
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 MiamiTransit/0.1");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            if (connection.getResponseCode() != 200) return error("Bus arrivals unavailable");
            String html = readAll(connection.getInputStream());
            Matcher arrivals = Pattern.compile("<strong class=\"larger\">\\s*(\\d+)(?:&nbsp;|\\s)*MIN", Pattern.CASE_INSENSITIVE).matcher(html);
            StringBuilder minutes = new StringBuilder("[");
            while (arrivals.find()) {
                if (minutes.length() > 1) minutes.append(',');
                minutes.append(arrivals.group(1));
            }
            minutes.append(']');
            return jsonResponse("{\"route\":\"" + route + "\",\"stop\":\"" + stop + "\",\"direction\":\"" + direction + "\",\"minutes\":" + minutes + ",\"source\":\"Miami-Dade BusTime\"}", 200, "OK");
        } catch (Exception ignored) {
            return error("Bus arrivals unavailable");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readAll(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > MAX_RESPONSE_BYTES) throw new Exception("Upstream response too large");
            output.write(buffer, 0, count);
        }
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private WebResourceResponse error(String message) {
        return jsonResponse("{\"error\":\"" + message + "\"}", 502, "Bad Gateway");
    }

    private WebResourceResponse jsonResponse(String json, int status, String reason) {
        WebResourceResponse response = new WebResourceResponse("application/json", "UTF-8", new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        response.setStatusCodeAndReasonPhrase(status, reason);
        response.setResponseHeaders(java.util.Map.of("Cache-Control", "no-store", "X-Content-Type-Options", "nosniff"));
        return response;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
