package com.jcm.miamitrolleylive;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
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
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // Used only to remember the rider's selected From/To stops on-device.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                URL url = request.getUrl() == null ? null : toUrl(request.getUrl().toString());
                if (url == null) return error("Invalid request");
                if (url.getHost().equals("app.local") && url.getPath().equals("/api/tracker")) return trackerResponse(url);
                if (url.getHost().equals("app.local") && url.getPath().equals("/api/bus")) return busResponse(url);
                if (url.getHost().equals("app.local")) return assetResponse(url.getPath());
                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.loadUrl(APP_ORIGIN + "index.html");
    }

    private URL toUrl(String value) {
        try { return new URL(value); } catch (Exception ignored) { return null; }
    }

    private WebResourceResponse assetResponse(String path) {
        String name = path.equals("/") ? "index.html" : path.substring(1);
        if (!name.matches("(index\\.html|styles\\.css|engine\\.js|app\\.js|bus-stops\\.js|vendor/leaflet\\.css|vendor/leaflet\\.js)")) return error("Not found");
        String mime = name.endsWith(".html") ? "text/html" : name.endsWith(".css") ? "text/css" : "text/javascript";
        try { return new WebResourceResponse(mime, "UTF-8", getAssets().open("web/" + name)); }
        catch (Exception ignored) { return error("Missing app asset"); }
    }

    private WebResourceResponse trackerResponse(URL localUrl) {
        HttpURLConnection connection = null;
        try {
            String query = localUrl.getQuery() == null ? "" : localUrl.getQuery();
            if (!(query.contains("Key=ROUTES_BYTKN") || query.contains("Key=UNITS_LOCATION_ROUTE") || query.contains("Key=STOPINFO_WITHOVERLAPS"))) return error("Unsupported request");
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
            if (!routeMatch.find()) return error("Unsupported bus route");
            String route = routeMatch.group(1);
            String stop = route.equals("3") ? "6706" : "6774";
            URL upstream = new URL(BUS_TIME + "?direction=MetroBus%3ASOUTHBOUND&id=MetroBus%3A" + stop + "&route=MetroBus%3A" + route + "&showAllBusses=off");
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
            return jsonResponse("{\"route\":\"" + route + "\",\"stop\":\"" + stop + "\",\"direction\":\"south\",\"minutes\":" + minutes + ",\"source\":\"Miami-Dade BusTime\"}", 200, "OK");
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
        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private WebResourceResponse error(String message) {
        return jsonResponse("{\"error\":\"" + message + "\"}", 502, "Bad Gateway");
    }

    private WebResourceResponse jsonResponse(String json, int status, String reason) {
        WebResourceResponse response = new WebResourceResponse("application/json", "UTF-8", new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        response.setStatusCodeAndReasonPhrase(status, reason);
        response.setResponseHeaders(java.util.Map.of("Access-Control-Allow-Origin", "*", "Cache-Control", "no-store"));
        return response;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
