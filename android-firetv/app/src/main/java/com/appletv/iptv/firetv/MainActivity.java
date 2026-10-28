package com.appletv.iptv.firetv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.okhttp.OkHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

@OptIn(markerClass = UnstableApi.class)
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private OkHttpClient httpClient;

    // Native Video Player & Apple TV Minimalist OSD Views
    private FrameLayout nativePlayerRoot;
    private PlayerView playerView;
    private ExoPlayer exoPlayer;
    private LinearLayout loadingBox;
    private TextView loadingText;

    // Native OSD Overlay (Hidden on BACK press for 100% CLEAR screen)
    private FrameLayout osdRoot;
    private TextView osdBadgeLive;
    private TextView backHintView;
    private TextView osdTitleView;
    private TextView osdSubtitleView;
    private TextView osdTimeView;
    private LinearLayout seekBarWrap;
    private SeekBar osdSeekBar;

    // Native Channel List Drawer (Live TV when pressing OK / center button)
    private LinearLayout channelDrawerBox;
    private ScrollView channelScrollView;
    private LinearLayout channelListContainer;
    private View activeChannelButtonView = null;

    private Button btnChannelsDrawer;
    private Button btnPrevCh;
    private Button btnRw15;
    private Button btnPlayPause;
    private Button btnFf15;
    private Button btnFf60;
    private Button btnNextCh;
    private Button btnMiniPlayer;
    private Button btnAspect;
    private Button btnHideOsd;
    private Button btnExitPlayer;

    private volatile boolean isNativePlayerOpen = false;
    private volatile boolean isCurrentStreamLive = false;
    private volatile boolean isMiniPlayerMode = false;
    private int currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private static final long OSD_AUTO_HIDE_MS = 5000L;

    private final Runnable autoHideOsdRunnable = () -> {
        if (isNativePlayerOpen && !isMiniPlayerMode && exoPlayer != null && exoPlayer.isPlaying()) {
            hideNativeOsd();
        }
    };

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            if (isNativePlayerOpen && !isMiniPlayerMode && exoPlayer != null && !isCurrentStreamLive) {
                long pos = Math.max(0L, exoPlayer.getCurrentPosition());
                long dur = Math.max(0L, exoPlayer.getDuration());
                if (dur > 0) {
                    osdTimeView.setText(formatMs(pos) + " / " + formatMs(dur));
                    int progress = (int) ((pos * 1000L) / dur);
                    osdSeekBar.setProgress(Math.max(0, Math.min(1000, progress)));
                } else {
                    osdTimeView.setText(formatMs(pos) + " / --:--");
                }
            }
            uiHandler.postDelayed(this, 500);
        }
    };

    private final Map<String, String> apiCache = new LinkedHashMap<String, String>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > 80;
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        httpClient = new OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(25, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#07080D"));

        // 1. WebView for KS TV-Stream Catalog UI
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#07080D"));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");

        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // 2. 100% Native Video Player + Apple TV Minimalist OSD Layer
        buildNativePlayerLayer();
        root.addView(nativePlayerRoot, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        initExoPlayer();

        setContentView(root);
        webView.loadUrl("file:///android_asset/www/index.html");
        webView.requestFocus();
        uiHandler.postDelayed(progressRunnable, 500);
    }

    private void buildNativePlayerLayer() {
        nativePlayerRoot = new FrameLayout(this);
        nativePlayerRoot.setBackgroundColor(Color.BLACK);
        nativePlayerRoot.setVisibility(View.GONE);

        // Hardware ExoPlayer SurfaceView (Do NOT setBackgroundColor on PlayerView so SurfaceView isn't covered!)
        playerView = new PlayerView(this);
        playerView.setUseController(false);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        nativePlayerRoot.addView(playerView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Center Loading Spinner
        loadingBox = new LinearLayout(this);
        loadingBox.setOrientation(LinearLayout.VERTICAL);
        loadingBox.setGravity(Gravity.CENTER);
        loadingBox.setPadding(dp(24), dp(18), dp(24), dp(18));
        loadingBox.setBackground(makeRoundedRect(Color.parseColor("#D910131C"), dp(16), 1, Color.parseColor("#26FFFFFF")));

        ProgressBar spinner = new ProgressBar(this);
        loadingBox.addView(spinner, new LinearLayout.LayoutParams(dp(36), dp(36)));

        loadingText = new TextView(this);
        loadingText.setText("Conectando ao sinal...");
        loadingText.setTextColor(Color.WHITE);
        loadingText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        LinearLayout.LayoutParams ltParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        ltParams.topMargin = dp(10);
        loadingBox.addView(loadingText, ltParams);

        FrameLayout.LayoutParams loadParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );
        nativePlayerRoot.addView(loadingBox, loadParams);

        // Apple TV Minimalist OSD Container
        osdRoot = new FrameLayout(this);
        osdRoot.setPadding(dp(32), dp(22), dp(32), dp(24));

        // Top Bar inside OSD
        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);

        osdBadgeLive = new TextView(this);
        osdBadgeLive.setText("● AO VIVO");
        osdBadgeLive.setTextColor(Color.WHITE);
        osdBadgeLive.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        osdBadgeLive.setTypeface(Typeface.DEFAULT_BOLD);
        osdBadgeLive.setPadding(dp(12), dp(5), dp(12), dp(5));
        osdBadgeLive.setBackground(makeRoundedRect(Color.parseColor("#FF3B30"), dp(99), 0, 0));
        topBar.addView(osdBadgeLive);

        View spacer = new View(this);
        topBar.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));

        backHintView = new TextView(this);
        backHintView.setText("VOLTAR: Limpar Tela  •  OK: Canais");
        backHintView.setTextColor(Color.parseColor("#D0D4E0"));
        backHintView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        backHintView.setPadding(dp(14), dp(6), dp(14), dp(6));
        backHintView.setBackground(makeRoundedRect(Color.parseColor("#D912151E"), dp(99), 1, Color.parseColor("#28FFFFFF")));
        topBar.addView(backHintView);

        osdRoot.addView(topBar, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        ));

        // Live Channel List Drawer (Left Floating Panel on OK press)
        channelDrawerBox = new LinearLayout(this);
        channelDrawerBox.setOrientation(LinearLayout.VERTICAL);
        channelDrawerBox.setPadding(dp(14), dp(14), dp(14), dp(14));
        channelDrawerBox.setBackground(makeRoundedRect(Color.parseColor("#F010131D"), dp(18), dp(1), Color.parseColor("#33FFFFFF")));
        channelDrawerBox.setVisibility(View.GONE);

        TextView drawerTitle = new TextView(this);
        drawerTitle.setText("CANAIS DA CATEGORIA");
        drawerTitle.setTextColor(Color.parseColor("#60A5FA"));
        drawerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        drawerTitle.setTypeface(Typeface.DEFAULT_BOLD);
        channelDrawerBox.addView(drawerTitle);

        TextView drawerSub = new TextView(this);
        drawerSub.setText("Selecione para trocar imediatamente");
        drawerSub.setTextColor(Color.parseColor("#9CA3AF"));
        drawerSub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        LinearLayout.LayoutParams dsParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        dsParams.bottomMargin = dp(8);
        channelDrawerBox.addView(drawerSub, dsParams);

        channelScrollView = new ScrollView(this);
        channelScrollView.setVerticalScrollBarEnabled(false);
        channelListContainer = new LinearLayout(this);
        channelListContainer.setOrientation(LinearLayout.VERTICAL);
        channelScrollView.addView(channelListContainer, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        channelDrawerBox.addView(channelScrollView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        FrameLayout.LayoutParams drawerParams = new FrameLayout.LayoutParams(
                dp(300),
                dp(310),
                Gravity.START | Gravity.TOP
        );
        drawerParams.topMargin = dp(48);
        osdRoot.addView(channelDrawerBox, drawerParams);

        // Bottom Sheet inside OSD
        LinearLayout bottomSheet = new LinearLayout(this);
        bottomSheet.setOrientation(LinearLayout.VERTICAL);
        bottomSheet.setPadding(dp(22), dp(16), dp(22), dp(16));
        bottomSheet.setBackground(makeRoundedRect(Color.parseColor("#EB12151F"), dp(22), dp(1), Color.parseColor("#33FFFFFF")));

        // Header Row (Title + Subtitle/EPG on Left, Time on Right)
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout titlesCol = new LinearLayout(this);
        titlesCol.setOrientation(LinearLayout.VERTICAL);

        osdTitleView = new TextView(this);
        osdTitleView.setText("KS TV-Stream");
        osdTitleView.setTextColor(Color.WHITE);
        osdTitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        osdTitleView.setTypeface(Typeface.DEFAULT_BOLD);
        osdTitleView.setSingleLine(true);
        osdTitleView.setEllipsize(TextUtils.TruncateAt.END);
        titlesCol.addView(osdTitleView);

        osdSubtitleView = new TextView(this);
        osdSubtitleView.setText("Reprodução Limpa");
        osdSubtitleView.setTextColor(Color.parseColor("#9DA3B4"));
        osdSubtitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        osdSubtitleView.setSingleLine(true);
        osdSubtitleView.setEllipsize(TextUtils.TruncateAt.END);
        titlesCol.addView(osdSubtitleView);

        headerRow.addView(titlesCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        osdTimeView = new TextView(this);
        osdTimeView.setText("00:00 / 00:00");
        osdTimeView.setTextColor(Color.WHITE);
        osdTimeView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        osdTimeView.setTypeface(Typeface.DEFAULT_BOLD);
        headerRow.addView(osdTimeView);

        bottomSheet.addView(headerRow);

        // Interactive Movie Timeline / SeekBar ("barra de tempo")
        seekBarWrap = new LinearLayout(this);
        seekBarWrap.setOrientation(LinearLayout.VERTICAL);
        seekBarWrap.setPadding(dp(8), dp(8), dp(8), dp(8));
        LinearLayout.LayoutParams sbWrapParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sbWrapParams.topMargin = dp(8);
        sbWrapParams.bottomMargin = dp(4);
        seekBarWrap.setBackground(makeRoundedRect(Color.parseColor("#18FFFFFF"), dp(10), dp(1), Color.TRANSPARENT));

        osdSeekBar = new SeekBar(this);
        osdSeekBar.setMax(1000);
        osdSeekBar.setProgress(0);
        osdSeekBar.setFocusable(true);
        osdSeekBar.setFocusableInTouchMode(true);
        osdSeekBar.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                seekBarWrap.setBackground(makeRoundedRect(Color.parseColor("#2EFFFFFF"), dp(10), dp(2), Color.WHITE));
            } else {
                seekBarWrap.setBackground(makeRoundedRect(Color.parseColor("#18FFFFFF"), dp(10), dp(1), Color.TRANSPARENT));
            }
        });
        osdSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && exoPlayer != null) {
                    long dur = exoPlayer.getDuration();
                    if (dur > 0) {
                        long newPos = (dur * progress) / 1000L;
                        exoPlayer.seekTo(newPos);
                        osdTimeView.setText(formatMs(newPos) + " / " + formatMs(dur));
                    }
                    resetOsdTimer();
                }
            }

            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {}

            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        osdSeekBar.setOnKeyListener((v, keyCode, event) -> {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                    seekRelativeMs(-15000L);
                    return true;
                } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                    seekRelativeMs(15000L);
                    return true;
                }
            }
            return false;
        });

        seekBarWrap.addView(osdSeekBar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        bottomSheet.addView(seekBarWrap, sbWrapParams);

        // Control Buttons Row (Monochrome symbols only — no orange emoji!)
        LinearLayout controlsRow = new LinearLayout(this);
        controlsRow.setOrientation(LinearLayout.HORIZONTAL);
        controlsRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams ctrlRowParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        ctrlRowParams.topMargin = dp(8);

        btnChannelsDrawer = createOsdButton("☰ Canais", false, v -> {
            resetOsdTimer();
            if (channelDrawerBox.getVisibility() == View.VISIBLE && activeChannelButtonView != null) {
                activeChannelButtonView.requestFocus();
            } else {
                channelDrawerBox.setVisibility(View.VISIBLE);
                if (activeChannelButtonView != null) {
                    activeChannelButtonView.requestFocus();
                }
            }
        });

        btnPrevCh = createOsdButton("|◀ Canal Ant.", false, v -> {
            resetOsdTimer();
            runJs("if(window.onNativeStepChannel) window.onNativeStepChannel(-1);");
        });

        btnRw15 = createOsdButton("↺ -15s", false, v -> {
            seekRelativeMs(-15000L);
        });

        btnPlayPause = createOsdButton("❚❚ Pausar", true, v -> {
            toggleNativePlayPause();
        });

        btnFf15 = createOsdButton("↻ +15s", false, v -> {
            seekRelativeMs(15000L);
        });

        btnFf60 = createOsdButton("+1 min", false, v -> {
            seekRelativeMs(60000L);
        });

        btnNextCh = createOsdButton("▶| Próx. Canal", false, v -> {
            resetOsdTimer();
            runJs("if(window.onNativeStepChannel) window.onNativeStepChannel(1);");
        });

        btnMiniPlayer = createOsdButton("⧉ Mini Player", false, v -> {
            enterNativeMiniPlayer();
        });

        btnAspect = createOsdButton("⛶ Tela: Padrão", false, v -> {
            cycleNativeAspect();
        });

        btnHideOsd = createOsdButton("✕ Ocultar", false, v -> {
            hideNativeOsd();
        });

        btnExitPlayer = createOsdButton("Sair", false, v -> {
            closeNativePlayer();
        });

        controlsRow.addView(btnChannelsDrawer);
        controlsRow.addView(btnPrevCh);
        controlsRow.addView(btnRw15);
        controlsRow.addView(btnPlayPause);
        controlsRow.addView(btnFf15);
        controlsRow.addView(btnFf60);
        controlsRow.addView(btnNextCh);
        controlsRow.addView(btnMiniPlayer);
        controlsRow.addView(btnAspect);
        controlsRow.addView(btnHideOsd);

        View flexSpace = new View(this);
        controlsRow.addView(flexSpace, new LinearLayout.LayoutParams(0, 1, 1f));
        controlsRow.addView(btnExitPlayer);

        bottomSheet.addView(controlsRow, ctrlRowParams);

        FrameLayout.LayoutParams sheetParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        osdRoot.addView(bottomSheet, sheetParams);

        nativePlayerRoot.addView(osdRoot, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
    }

    private Button createOsdButton(String label, boolean isPrimary, View.OnClickListener onClick) {
        Button btn = new Button(this);
        btn.setText(label);
        btn.setAllCaps(false);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setPadding(dp(13), dp(7), dp(13), dp(7));
        btn.setMinimumHeight(dp(36));
        btn.setMinimumWidth(0);
        btn.setMinHeight(dp(36));
        btn.setMinWidth(0);
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(true);

        styleOsdButton(btn, isPrimary, false);

        btn.setOnFocusChangeListener((v, hasFocus) -> {
            styleOsdButton(btn, isPrimary, hasFocus);
            if (hasFocus) resetOsdTimer();
        });
        btn.setOnClickListener(onClick);

        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        lp.rightMargin = dp(6);
        btn.setLayoutParams(lp);
        return btn;
    }

    private void styleOsdButton(Button btn, boolean isPrimary, boolean focused) {
        if (focused) {
            btn.setTextColor(Color.BLACK);
            btn.setBackground(makeRoundedRect(Color.WHITE, dp(99), dp(2), Color.WHITE));
        } else if (isPrimary) {
            btn.setTextColor(Color.WHITE);
            btn.setBackground(makeRoundedRect(Color.parseColor("#38FFFFFF"), dp(99), dp(1), Color.parseColor("#66FFFFFF")));
        } else {
            btn.setTextColor(Color.parseColor("#E5E7EB"));
            btn.setBackground(makeRoundedRect(Color.parseColor("#1FFFFFFF"), dp(99), dp(1), Color.parseColor("#2EFFFFFF")));
        }
    }

    private void populateLiveChannelDrawer(final String jsonArrayStr, final int currentIdx) {
        runOnUiThread(() -> {
            channelListContainer.removeAllViews();
            activeChannelButtonView = null;
            if (jsonArrayStr == null || jsonArrayStr.isEmpty()) return;

            try {
                JSONArray arr = new JSONArray(jsonArrayStr);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    final int itemIdx = obj.optInt("idx", i);
                    String name = obj.optString("name", "Canal " + (itemIdx + 1));
                    String epg = obj.optString("epg", "");
                    final boolean isCurrent = (itemIdx == currentIdx);

                    Button chBtn = new Button(this);
                    String label = (isCurrent ? "● " : "") + (itemIdx + 1) + ". " + name;
                    if (epg != null && !epg.isEmpty()) {
                        label += "\n   " + epg;
                    }
                    chBtn.setText(label);
                    chBtn.setAllCaps(false);
                    chBtn.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
                    chBtn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                    chBtn.setSingleLine(epg == null || epg.isEmpty());
                    chBtn.setMaxLines(2);
                    chBtn.setEllipsize(TextUtils.TruncateAt.END);
                    chBtn.setPadding(dp(12), dp(8), dp(12), dp(8));
                    chBtn.setMinimumHeight(dp(38));
                    chBtn.setMinHeight(dp(38));
                    chBtn.setFocusable(true);
                    chBtn.setFocusableInTouchMode(true);

                    styleDrawerChannelButton(chBtn, isCurrent, false);

                    chBtn.setOnFocusChangeListener((v, hasFocus) -> {
                        styleDrawerChannelButton(chBtn, isCurrent, hasFocus);
                        if (hasFocus) resetOsdTimer();
                    });

                    chBtn.setOnClickListener(v -> {
                        resetOsdTimer();
                        runJs("if(window.onNativeSelectChannelIndex) window.onNativeSelectChannelIndex(" + itemIdx + ");");
                    });

                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.WRAP_CONTENT
                    );
                    lp.bottomMargin = dp(4);
                    chBtn.setLayoutParams(lp);

                    channelListContainer.addView(chBtn);
                    if (isCurrent) {
                        activeChannelButtonView = chBtn;
                    }
                }
            } catch (Exception ignored) {
            }
        });
    }

    private void styleDrawerChannelButton(Button btn, boolean isCurrent, boolean focused) {
        if (focused) {
            btn.setTextColor(Color.BLACK);
            btn.setBackground(makeRoundedRect(Color.WHITE, dp(10), dp(2), Color.WHITE));
            btn.setTypeface(Typeface.DEFAULT_BOLD);
        } else if (isCurrent) {
            btn.setTextColor(Color.WHITE);
            btn.setBackground(makeRoundedRect(Color.parseColor("#330A84FF"), dp(10), dp(1), Color.parseColor("#880A84FF")));
            btn.setTypeface(Typeface.DEFAULT_BOLD);
        } else {
            btn.setTextColor(Color.parseColor("#D1D5DB"));
            btn.setBackground(makeRoundedRect(Color.parseColor("#14FFFFFF"), dp(10), 0, Color.TRANSPARENT));
            btn.setTypeface(Typeface.DEFAULT);
        }
    }

    private GradientDrawable makeRoundedRect(int bgColor, int radiusPx, int strokeWidthPx, int strokeColor) {
        GradientDrawable gd = new GradientDrawable();
        gd.setShape(GradientDrawable.RECTANGLE);
        gd.setCornerRadius(radiusPx);
        gd.setColor(bgColor);
        if (strokeWidthPx > 0) {
            gd.setStroke(strokeWidthPx, strokeColor);
        }
        return gd;
    }

    private int dp(int value) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
        );
    }

    private String formatMs(long ms) {
        long totalSec = Math.max(0L, ms / 1000L);
        long hrs = totalSec / 3600L;
        long mins = (totalSec % 3600L) / 60L;
        long secs = totalSec % 60L;
        if (hrs > 0) {
            return String.format(Locale.US, "%02d:%02d:%02d", hrs, mins, secs);
        }
        return String.format(Locale.US, "%02d:%02d", mins, secs);
    }

    private void initExoPlayer() {
        OkHttpDataSource.Factory dataSourceFactory = new OkHttpDataSource.Factory(httpClient)
                .setUserAgent("Lavf/60.3.100");

        exoPlayer = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(dataSourceFactory))
                .build();

        playerView.setPlayer(exoPlayer);

        exoPlayer.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_BUFFERING) {
                    if (!isMiniPlayerMode) {
                        loadingBox.setVisibility(View.VISIBLE);
                        loadingText.setText("Carregando vídeo...");
                    }
                } else if (playbackState == Player.STATE_READY) {
                    loadingBox.setVisibility(View.GONE);
                } else if (playbackState == Player.STATE_ENDED && !isCurrentStreamLive) {
                    showNativeOsd(false);
                }
            }

            @Override
            public void onRenderedFirstFrame() {
                loadingBox.setVisibility(View.GONE);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                btnPlayPause.setText(isPlaying ? "❚❚ Pausar" : "▶ Reproduzir");
                if (isPlaying) {
                    loadingBox.setVisibility(View.GONE);
                    resetOsdTimer();
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                if (!isMiniPlayerMode) {
                    loadingBox.setVisibility(View.VISIBLE);
                    loadingText.setText("Sinal indisponível no momento. Aperte VOLTAR.");
                    showNativeOsd(false);
                }
            }
        });
    }

    private void openNativePlayerUi(final String streamUrl, final String title, final String subtitle, final boolean isLive) {
        runOnUiThread(() -> {
            isNativePlayerOpen = true;
            isCurrentStreamLive = isLive;

            if (isMiniPlayerMode) {
                restoreFullscreenLayout();
            }

            osdTitleView.setText(title != null ? title : "KS TV-Stream");
            osdSubtitleView.setText(subtitle != null ? subtitle : "");

            if (isLive) {
                osdBadgeLive.setText("● AO VIVO");
                osdBadgeLive.setBackground(makeRoundedRect(Color.parseColor("#FF3B30"), dp(99), 0, 0));
                backHintView.setText("OK: Lista de Canais  •  VOLTAR: Limpar / Mini Player");
                osdTimeView.setVisibility(View.GONE);
                seekBarWrap.setVisibility(View.GONE);
                channelDrawerBox.setVisibility(View.VISIBLE);
                btnChannelsDrawer.setVisibility(View.VISIBLE);
                btnPrevCh.setVisibility(View.VISIBLE);
                btnNextCh.setVisibility(View.VISIBLE);
                btnMiniPlayer.setVisibility(View.VISIBLE);
                btnRw15.setVisibility(View.GONE);
                btnFf15.setVisibility(View.GONE);
                btnFf60.setVisibility(View.GONE);
            } else {
                osdBadgeLive.setText("KS TV-Stream • Cinema");
                osdBadgeLive.setBackground(makeRoundedRect(Color.parseColor("#2A3042"), dp(99), dp(1), Color.parseColor("#38FFFFFF")));
                backHintView.setText("Aperte VOLTAR para limpar a tela");
                osdTimeView.setVisibility(View.VISIBLE);
                osdTimeView.setText("00:00 / 00:00");
                seekBarWrap.setVisibility(View.VISIBLE);
                osdSeekBar.setProgress(0);
                channelDrawerBox.setVisibility(View.GONE);
                btnChannelsDrawer.setVisibility(View.GONE);
                btnPrevCh.setVisibility(View.GONE);
                btnNextCh.setVisibility(View.GONE);
                btnMiniPlayer.setVisibility(View.GONE);
                btnRw15.setVisibility(View.VISIBLE);
                btnFf15.setVisibility(View.VISIBLE);
                btnFf60.setVisibility(View.VISIBLE);
            }

            // Hide WebView during fullscreen playback so 100% of GPU goes to video
            webView.setVisibility(View.GONE);
            nativePlayerRoot.setVisibility(View.VISIBLE);
            loadingBox.setVisibility(View.VISIBLE);
            loadingText.setText("Conectando ao sinal...");

            showNativeOsd(false);

            exoPlayer.stop();
            exoPlayer.clearMediaItems();
            MediaItem mediaItem = MediaItem.fromUri(streamUrl);
            exoPlayer.setMediaItem(mediaItem);
            exoPlayer.prepare();
            exoPlayer.play();
        });
    }

    private void restoreFullscreenLayout() {
        isMiniPlayerMode = false;
        FrameLayout.LayoutParams fullLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        nativePlayerRoot.setLayoutParams(fullLp);
        nativePlayerRoot.setPadding(0, 0, 0, 0);
        nativePlayerRoot.setBackgroundColor(Color.BLACK);
        runJs("if(window.onNativeMiniPlayerState) window.onNativeMiniPlayerState(false);");
    }

    private void enterNativeMiniPlayer() {
        runOnUiThread(() -> {
            if (!isNativePlayerOpen) return;
            isMiniPlayerMode = true;
            hideNativeOsd();
            loadingBox.setVisibility(View.GONE);

            FrameLayout.LayoutParams pipLp = new FrameLayout.LayoutParams(
                    dp(288),
                    dp(162),
                    Gravity.BOTTOM | Gravity.END
            );
            pipLp.rightMargin = dp(26);
            pipLp.bottomMargin = dp(22);
            nativePlayerRoot.setLayoutParams(pipLp);
            nativePlayerRoot.setPadding(dp(2), dp(2), dp(2), dp(2));
            nativePlayerRoot.setBackground(makeRoundedRect(Color.BLACK, dp(12), dp(2), Color.parseColor("#80FFFFFF")));

            webView.setVisibility(View.VISIBLE);
            webView.requestFocus();
            runJs("if(window.onNativeMiniPlayerState) window.onNativeMiniPlayerState(true);");
        });
    }

    private void expandMiniPlayerToFullscreen() {
        runOnUiThread(() -> {
            if (!isNativePlayerOpen) return;
            restoreFullscreenLayout();
            webView.setVisibility(View.GONE);
            showNativeOsd(false);
        });
    }

    private void showNativeOsd(boolean focusChannelDrawer) {
        osdRoot.setVisibility(View.VISIBLE);
        if (isCurrentStreamLive) {
            channelDrawerBox.setVisibility(View.VISIBLE);
            if (focusChannelDrawer && activeChannelButtonView != null) {
                channelScrollView.post(() -> {
                    if (activeChannelButtonView != null) {
                        int scrollY = Math.max(0, activeChannelButtonView.getTop() - dp(90));
                        channelScrollView.scrollTo(0, scrollY);
                        activeChannelButtonView.requestFocus();
                    }
                });
            } else {
                btnPlayPause.requestFocus();
            }
        } else {
            channelDrawerBox.setVisibility(View.GONE);
            btnPlayPause.requestFocus();
        }
        resetOsdTimer();
    }

    private void hideNativeOsd() {
        uiHandler.removeCallbacks(autoHideOsdRunnable);
        osdRoot.setVisibility(View.GONE);
    }

    private void resetOsdTimer() {
        uiHandler.removeCallbacks(autoHideOsdRunnable);
        uiHandler.postDelayed(autoHideOsdRunnable, OSD_AUTO_HIDE_MS);
    }

    private void closeNativePlayer() {
        runOnUiThread(() -> {
            uiHandler.removeCallbacks(autoHideOsdRunnable);
            isNativePlayerOpen = false;
            if (isMiniPlayerMode) {
                restoreFullscreenLayout();
            }
            if (exoPlayer != null) {
                exoPlayer.stop();
                exoPlayer.clearMediaItems();
            }
            nativePlayerRoot.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.requestFocus();
        });
    }

    private void toggleNativePlayPause() {
        if (exoPlayer == null) return;
        if (exoPlayer.isPlaying()) {
            exoPlayer.pause();
        } else {
            exoPlayer.play();
        }
        resetOsdTimer();
    }

    private void seekRelativeMs(long deltaMs) {
        if (exoPlayer == null || isCurrentStreamLive) return;
        long dur = exoPlayer.getDuration();
        long pos = exoPlayer.getCurrentPosition();
        long next = Math.max(0L, pos + deltaMs);
        if (dur > 0) {
            next = Math.min(dur, next);
        }
        exoPlayer.seekTo(next);
        if (dur > 0) {
            osdTimeView.setText(formatMs(next) + " / " + formatMs(dur));
            osdSeekBar.setProgress((int) ((next * 1000L) / dur));
        }
        resetOsdTimer();
    }

    private void cycleNativeAspect() {
        if (currentResizeMode == AspectRatioFrameLayout.RESIZE_MODE_FIT) {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
            btnAspect.setText("⛶ Tela: Zoom");
        } else if (currentResizeMode == AspectRatioFrameLayout.RESIZE_MODE_ZOOM) {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
            btnAspect.setText("⛶ Tela: Esticar");
        } else {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
            btnAspect.setText("⛶ Tela: Padrão");
        }
        playerView.setResizeMode(currentResizeMode);
        resetOsdTimer();
    }

    private void runJs(final String script) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(script, null);
            }
        });
    }

    private void hideSystemUi() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        int action = event.getAction();

        // 1. NATIVE FULLSCREEN VIDEO PLAYER KEY HANDLING
        // When in Mini Player mode (isMiniPlayerMode == true), D-Pad keys go to the Catalog WebView below!
        if (isNativePlayerOpen && !isMiniPlayerMode) {
            // BACK BUTTON RULE:
            // - If OSD (player options) is visible -> Hide OSD immediately (leave video 100% CLEAR)!
            // - If OSD is already hidden (screen is clear):
            //   * For Live TV -> Enter Mini Player (keep playing in corner while browsing channels)!
            //   * For VOD (Movie/Series) -> Exit player back to catalog!
            if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                if (action == KeyEvent.ACTION_DOWN) {
                    if (osdRoot.getVisibility() == View.VISIBLE) {
                        hideNativeOsd();
                    } else if (isCurrentStreamLive) {
                        enterNativeMiniPlayer();
                    } else {
                        closeNativePlayer();
                    }
                }
                return true;
            }

            // Hardware Media Keys on Fire TV Remote
            if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY || keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                if (action == KeyEvent.ACTION_DOWN) {
                    toggleNativePlayPause();
                }
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD) {
                if (action == KeyEvent.ACTION_DOWN) {
                    showNativeOsd(false);
                    seekRelativeMs(15000L);
                }
                return true;
            }
            if (keyCode == KeyEvent.KEYCODE_MEDIA_REWIND) {
                if (action == KeyEvent.ACTION_DOWN) {
                    showNativeOsd(false);
                    seekRelativeMs(-15000L);
                }
                return true;
            }

            // If screen is currently CLEAR (OSD hidden):
            // - Pressing OK / Center button on Live TV opens OSD and focuses the Live Channel List Drawer!
            // - Any other D-Pad key brings up the OSD focused on Play/Pause.
            if (osdRoot.getVisibility() != View.VISIBLE) {
                if (action == KeyEvent.ACTION_DOWN) {
                    if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) {
                        showNativeOsd(isCurrentStreamLive);
                        return true;
                    } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP
                            || keyCode == KeyEvent.KEYCODE_DPAD_DOWN
                            || keyCode == KeyEvent.KEYCODE_DPAD_LEFT
                            || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                        showNativeOsd(false);
                        return true;
                    }
                }
                return true;
            }

            // OSD is visible -> Reset auto-hide timer and let Android native focus navigate OSD buttons, Channel Drawer & SeekBar!
            if (action == KeyEvent.ACTION_DOWN) {
                resetOsdTimer();
            }
            return super.dispatchKeyEvent(event);
        }

        // 2. CATALOG WEBVIEW KEY HANDLING (Including while Live TV Mini Player is active in the corner)
        String mappedKey = null;
        if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
            mappedKey = "Back";
        } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
            mappedKey = "ArrowUp";
        } else if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
            mappedKey = "ArrowDown";
        } else if (keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
            mappedKey = "ArrowLeft";
        } else if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
            mappedKey = "ArrowRight";
        } else if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
            mappedKey = "Enter";
        }

        if (mappedKey != null) {
            if (action == KeyEvent.ACTION_DOWN) {
                final String jsKey = mappedKey;
                webView.evaluateJavascript(
                        "(function(){ return window.handleFireTvKey ? window.handleFireTvKey('" + jsKey + "') : 'IGNORED'; })()",
                        result -> {
                            if (result != null && result.contains("INPUT_FOCUS")) {
                                InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
                                if (imm != null) {
                                    imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
                                }
                            }
                        }
                );
            }
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    public class AndroidBridge {

        @JavascriptInterface
        public String httpGet(String url) {
            boolean isAuthCall = !url.contains("action=");
            if (!isAuthCall) {
                synchronized (apiCache) {
                    if (apiCache.containsKey(url)) {
                        return apiCache.get(url);
                    }
                }
            }

            Request req = new Request.Builder()
                    .url(url)
                    .header("User-Agent", "IPTVSmartersPro/4.0 (AppleTV; tvOS 18.0)")
                    .header("Accept", "application/json, text/plain, */*")
                    .build();

            try (Response res = httpClient.newCall(req).execute()) {
                if (!res.isSuccessful() || res.body() == null) {
                    return "__ERROR__:HTTP " + res.code();
                }
                String body = res.body().string();
                if (!isAuthCall && body.length() < 4 * 1024 * 1024) {
                    synchronized (apiCache) {
                        apiCache.put(url, body);
                    }
                }
                return body;
            } catch (Exception e) {
                return "__ERROR__:" + e.getMessage();
            }
        }

        @JavascriptInterface
        public void openNativePlayer(final String streamUrl, final String title, final String subtitle, final boolean isLive) {
            openNativePlayerUi(streamUrl, title, subtitle, isLive);
        }

        @JavascriptInterface
        public void setLiveChannelList(final String jsonArray, final int currentIdx) {
            populateLiveChannelDrawer(jsonArray, currentIdx);
        }

        @JavascriptInterface
        public void updateLiveSubtitle(final String subtitle) {
            runOnUiThread(() -> {
                if (osdSubtitleView != null && subtitle != null) {
                    osdSubtitleView.setText(subtitle);
                }
            });
        }

        @JavascriptInterface
        public void expandMiniPlayer() {
            expandMiniPlayerToFullscreen();
        }

        @JavascriptInterface
        public void closeMiniPlayer() {
            closeNativePlayer();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (exoPlayer != null && exoPlayer.isPlaying()) {
            exoPlayer.pause();
        }
    }

    @Override
    protected void onDestroy() {
        uiHandler.removeCallbacks(progressRunnable);
        uiHandler.removeCallbacks(autoHideOsdRunnable);
        if (exoPlayer != null) {
            exoPlayer.release();
            exoPlayer = null;
        }
        super.onDestroy();
    }
}
