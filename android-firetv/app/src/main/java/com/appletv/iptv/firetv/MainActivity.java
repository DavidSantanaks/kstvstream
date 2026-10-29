package com.appletv.iptv.firetv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
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
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.AppCompatButton;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
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
    private ProgressBar loadingSpinner;
    private TextView loadingTitle;
    private TextView loadingText;
    private LinearLayout osdBottomSheet;
    private LinearLayout osdTopBar;
    private boolean nativeLoadingActive = false;
    private boolean isActivityVisible = true;
    private int loadingPhraseIndex = 0;

    // Native OSD Overlay (Hidden on BACK press for 100% CLEAR screen)
    private FrameLayout osdRoot;
    private TextView osdBadgeLive;
    private TextView backHintView;
    private TextView osdTitleView;
    private TextView osdSubtitleView;
    private TextView osdTimeView;
    private TextView osdRemainingTimeView;
    private LinearLayout seekBarWrap;
    private SeekBar osdSeekBar;
    private LinearLayout transportControls;

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
    private Button btnTopClose;
    private long lastNativeOsdToggleTime = 0;

    private volatile boolean isNativePlayerOpen = false;
    private volatile boolean isCurrentStreamLive = false;
    private volatile boolean isMiniPlayerMode = false;
    private int currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;

    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private static final long OSD_AUTO_HIDE_MS = 5000L;
    private static final long LOADING_PHRASE_INTERVAL_MS = 3000L;
    private static final String[] LOADING_PHRASES = {
            "Mexendo na antena…",
            "Limpando a tela…",
            "Colocando Bombril na antena…"
    };

    private final Runnable loadingPhraseRunnable = new Runnable() {
        @Override
        public void run() {
            if (!nativeLoadingActive || !isNativePlayerOpen || isMiniPlayerMode || !isActivityVisible) {
                hideNativeLoading();
                return;
            }
            loadingPhraseIndex = (loadingPhraseIndex + 1) % LOADING_PHRASES.length;
            loadingText.setText(LOADING_PHRASES[loadingPhraseIndex]);
            uiHandler.postDelayed(this, LOADING_PHRASE_INTERVAL_MS);
        }
    };

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
                    updateNativeTimeline(pos, dur);
                    int progress = (int) ((pos * 1000L) / dur);
                    osdSeekBar.setProgress(Math.max(0, Math.min(1000, progress)));
                } else {
                    updateNativeTimeline(pos, 0);
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
        webView.setVerticalScrollBarEnabled(true);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Remote pages must not inherit the native bridge.
                return request.isForMainFrame()
                        && !request.getUrl().toString().startsWith("file:///android_asset/www/");
            }
        });
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

        // A compact connection status sits below transport, above the OSD layer.
        loadingBox = new LinearLayout(this);
        loadingBox.setOrientation(LinearLayout.HORIZONTAL);
        loadingBox.setGravity(Gravity.CENTER_VERTICAL);
        loadingBox.setPadding(dp(14), dp(9), dp(14), dp(9));
        loadingBox.setBackground(makeGlassBackground(false, dp(18)));
        loadingBox.setVisibility(View.GONE);
        loadingBox.setFocusable(false);
        loadingBox.setClickable(false);
        loadingBox.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

        loadingSpinner = new ProgressBar(this);
        loadingSpinner.setIndeterminateTintList(ColorStateList.valueOf(Color.WHITE));
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(dp(20), dp(20));
        spinnerParams.rightMargin = dp(11);
        loadingBox.addView(loadingSpinner, spinnerParams);

        LinearLayout loadingCopy = new LinearLayout(this);
        loadingCopy.setOrientation(LinearLayout.VERTICAL);
        loadingTitle = new TextView(this);
        loadingTitle.setText(R.string.connecting);
        loadingTitle.setTextColor(Color.parseColor("#A6FFFFFF"));
        loadingTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        loadingTitle.setVisibility(getResources().getConfiguration().screenHeightDp < 420 ? View.GONE : View.VISIBLE);
        loadingCopy.addView(loadingTitle);

        loadingText = new TextView(this);
        loadingText.setText(LOADING_PHRASES[0]);
        loadingText.setTextColor(Color.WHITE);
        loadingText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        loadingText.setMaxWidth(dp(260));
        loadingText.setMaxLines(2);
        loadingText.setEllipsize(TextUtils.TruncateAt.END);
        loadingCopy.addView(loadingText);
        loadingBox.addView(loadingCopy);

        // Apple TV Minimalist OSD Container
        osdRoot = new FrameLayout(this);
        osdRoot.setPadding(dp(28), dp(18), dp(28), dp(22));
        osdRoot.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {Color.parseColor("#85000000"), Color.TRANSPARENT, Color.parseColor("#DA000000")}));

        // Top Bar inside OSD
        LinearLayout topBar = new LinearLayout(this);
        osdTopBar = topBar;
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);

        btnTopClose = createTransportButton("close", false, "Encerrar reprodução", v -> closeNativePlayer());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(dp(42), dp(42));
        closeParams.rightMargin = dp(14);
        topBar.addView(btnTopClose, closeParams);

        osdBadgeLive = new TextView(this);
        osdBadgeLive.setText(R.string.live_badge);
        osdBadgeLive.setTextColor(Color.WHITE);
        osdBadgeLive.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        osdBadgeLive.setTypeface(Typeface.DEFAULT_BOLD);
        osdBadgeLive.setPadding(dp(12), dp(5), dp(12), dp(5));
        osdBadgeLive.setBackground(makeRoundedRect(Color.parseColor("#FF3B30"), dp(99), 0, 0));
        topBar.addView(osdBadgeLive);

        View spacer = new View(this);
        topBar.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1f));

        backHintView = new TextView(this);
        backHintView.setText(R.string.remote_hint);
        backHintView.setTextColor(Color.parseColor("#B3FFFFFF"));
        backHintView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        backHintView.setSingleLine(true);
        backHintView.setMaxWidth(dp(Math.max(100, getResources().getConfiguration().screenWidthDp - 290)));
        backHintView.setEllipsize(TextUtils.TruncateAt.END);
        backHintView.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        backHintView.setPadding(dp(12), dp(6), 0, dp(6));
        LinearLayout.LayoutParams bhParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bhParams.rightMargin = dp(8);
        topBar.addView(backHintView, bhParams);

        osdRoot.addView(topBar, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP
        ));

        // Live Channel List Drawer (Left Floating Panel on OK press)
        channelDrawerBox = new LinearLayout(this);
        channelDrawerBox.setOrientation(LinearLayout.VERTICAL);
        channelDrawerBox.setPadding(dp(14), dp(14), dp(14), dp(14));
        channelDrawerBox.setBackground(makeGlassBackground(false, dp(24)));
        channelDrawerBox.setVisibility(View.GONE);

        TextView drawerTitle = new TextView(this);
        drawerTitle.setText(R.string.channels_title);
        drawerTitle.setTextColor(Color.WHITE);
        drawerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        drawerTitle.setTypeface(Typeface.DEFAULT_BOLD);
        channelDrawerBox.addView(drawerTitle);

        TextView drawerSub = new TextView(this);
        drawerSub.setText(R.string.channels_hint);
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

        int screenWidthDp = getResources().getConfiguration().screenWidthDp;
        int screenHeightDp = getResources().getConfiguration().screenHeightDp;
        FrameLayout.LayoutParams drawerParams = new FrameLayout.LayoutParams(
                dp(Math.min(264, Math.max(180, screenWidthDp / 3))),
                dp(Math.min(220, Math.max(110, screenHeightDp - 230))),
                Gravity.START | Gravity.TOP
        );
        drawerParams.topMargin = dp(56);
        osdRoot.addView(channelDrawerBox, drawerParams);

        // Titles and timeline sit directly over the video, above the options capsules.
        LinearLayout bottomSheet = new LinearLayout(this);
        osdBottomSheet = bottomSheet;
        bottomSheet.setOrientation(LinearLayout.VERTICAL);
        bottomSheet.setPadding(0, dp(12), 0, 0);

        // Subtitle/EPG and title, matching the visual hierarchy of the web player.
        LinearLayout headerRow = new LinearLayout(this);
        headerRow.setOrientation(LinearLayout.HORIZONTAL);
        headerRow.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout titlesCol = new LinearLayout(this);
        titlesCol.setOrientation(LinearLayout.VERTICAL);

        osdTitleView = new TextView(this);
        osdTitleView.setText(R.string.app_name);
        osdTitleView.setTextColor(Color.WHITE);
        osdTitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        osdTitleView.setTypeface(Typeface.DEFAULT_BOLD);
        osdTitleView.setSingleLine(true);
        osdTitleView.setEllipsize(TextUtils.TruncateAt.END);

        osdSubtitleView = new TextView(this);
        osdSubtitleView.setText(R.string.playback_subtitle);
        osdSubtitleView.setTextColor(Color.parseColor("#D9FFFFFF"));
        osdSubtitleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        osdSubtitleView.setSingleLine(true);
        osdSubtitleView.setEllipsize(TextUtils.TruncateAt.END);
        titlesCol.addView(osdSubtitleView);
        titlesCol.addView(osdTitleView);

        headerRow.addView(titlesCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        bottomSheet.addView(headerRow);

        // Interactive Movie Timeline / SeekBar ("barra de tempo")
        seekBarWrap = new LinearLayout(this);
        seekBarWrap.setOrientation(LinearLayout.HORIZONTAL);
        seekBarWrap.setGravity(Gravity.CENTER_VERTICAL);
        seekBarWrap.setPadding(0, dp(3), 0, dp(3));
        LinearLayout.LayoutParams sbWrapParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        sbWrapParams.topMargin = dp(6);
        sbWrapParams.bottomMargin = dp(6);

        osdTimeView = createTimelineLabel("00:00");
        seekBarWrap.addView(osdTimeView, new LinearLayout.LayoutParams(dp(64), ViewGroup.LayoutParams.WRAP_CONTENT));

        osdSeekBar = new SeekBar(this);
        osdSeekBar.setMax(1000);
        osdSeekBar.setProgress(0);
        osdSeekBar.setId(View.generateViewId());
        osdSeekBar.setContentDescription("Posição da reprodução. Use as setas para avançar ou voltar 15 segundos.");
        osdSeekBar.setProgressTintList(ColorStateList.valueOf(Color.WHITE));
        osdSeekBar.setProgressBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#66FFFFFF")));
        osdSeekBar.setThumbTintList(ColorStateList.valueOf(Color.WHITE));
        osdSeekBar.setFocusable(true);
        osdSeekBar.setFocusableInTouchMode(true);
        osdSeekBar.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                seekBarWrap.setBackground(makeRoundedRect(Color.parseColor("#1AFFFFFF"), dp(12), dp(1), Color.parseColor("#B3FFFFFF")));
                resetOsdTimer();
            } else {
                seekBarWrap.setBackgroundColor(Color.TRANSPARENT);
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
                        updateNativeTimeline(newPos, dur);
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
                0,
                dp(32),
                1f
        ));
        osdRemainingTimeView = createTimelineLabel("−00:00");
        osdRemainingTimeView.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        seekBarWrap.addView(osdRemainingTimeView, new LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.WRAP_CONTENT));
        bottomSheet.addView(seekBarWrap, sbWrapParams);

        // Control Buttons Scroll Row (Smooth touch pan & D-Pad focus scroll)
        HorizontalScrollView controlsScroll = new HorizontalScrollView(this);
        controlsScroll.setHorizontalScrollBarEnabled(false);
        controlsScroll.setFillViewport(true);
        controlsScroll.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);

        LinearLayout controlsRow = new LinearLayout(this);
        controlsRow.setOrientation(LinearLayout.HORIZONTAL);
        controlsRow.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout.LayoutParams ctrlRowParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );

        btnChannelsDrawer = createOsdButton("☰ Canais", false, v -> {
            resetOsdTimer();
            boolean opening = channelDrawerBox.getVisibility() != View.VISIBLE;
            setNativeDrawerVisible(opening);
            if (opening) {
                focusNativeChannelDrawer();
            } else {
                btnChannelsDrawer.requestFocus();
            }
        });

        btnPrevCh = createTransportButton("previous", false, "Canal anterior", v -> {
            resetOsdTimer();
            runJs("if(window.onNativeStepChannel) window.onNativeStepChannel(-1);");
        });

        btnRw15 = createTransportButton("rewind", false, "Voltar 15 segundos", v -> {
            seekRelativeMs(-15000L);
        });

        btnPlayPause = createTransportButton("pause", true, "Pausar", v -> {
            toggleNativePlayPause();
        });

        btnFf15 = createTransportButton("forward", false, "Avançar 15 segundos", v -> {
            seekRelativeMs(15000L);
        });

        btnFf60 = createOsdButton("+1 min", false, v -> {
            seekRelativeMs(60000L);
        });

        btnNextCh = createTransportButton("next", false, "Próximo canal", v -> {
            resetOsdTimer();
            runJs("if(window.onNativeStepChannel) window.onNativeStepChannel(1);");
        });

        btnMiniPlayer = createOsdButton("Mini Player", false, v -> {
            enterNativeMiniPlayer();
        });

        btnAspect = createOsdButton("Tela: Padrão", false, v -> {
            cycleNativeAspect();
        });

        btnHideOsd = createOsdButton("Tela limpa", false, v -> {
            hideNativeOsd();
        });

        btnExitPlayer = createOsdButton("Encerrar", false, v -> {
            closeNativePlayer();
        });

        controlsRow.addView(btnChannelsDrawer);
        controlsRow.addView(btnFf60);
        controlsRow.addView(btnMiniPlayer);
        controlsRow.addView(btnAspect);
        controlsRow.addView(btnHideOsd);
        controlsRow.addView(btnExitPlayer);

        controlsScroll.addView(controlsRow, ctrlRowParams);

        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        scrollParams.topMargin = dp(8);
        bottomSheet.addView(controlsScroll, scrollParams);

        FrameLayout.LayoutParams sheetParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        osdRoot.addView(bottomSheet, sheetParams);

        // Large transport controls remain reachable by touch and Android's spatial D-pad focus.
        transportControls = new LinearLayout(this);
        transportControls.setOrientation(LinearLayout.HORIZONTAL);
        transportControls.setGravity(Gravity.CENTER_VERTICAL);
        transportControls.addView(btnPrevCh);
        transportControls.addView(btnRw15);
        transportControls.addView(btnPlayPause);
        transportControls.addView(btnFf15);
        transportControls.addView(btnNextCh);
        FrameLayout.LayoutParams transportParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
        );
        transportParams.bottomMargin = dp(screenHeightDp < 360 ? 56 : screenHeightDp < 420 ? 44 : 16);
        osdRoot.addView(transportControls, transportParams);

        nativePlayerRoot.addView(osdRoot, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        // Last child: the status can never be dimmed or covered by the OSD.
        nativePlayerRoot.addView(loadingBox, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.START
        ));
        View.OnLayoutChangeListener loadingPositionListener = (view, l, t, r, b, oldL, oldT, oldR, oldB) -> positionNativeLoading();
        loadingBox.addOnLayoutChangeListener(loadingPositionListener);
        transportControls.addOnLayoutChangeListener(loadingPositionListener);
        osdBottomSheet.addOnLayoutChangeListener(loadingPositionListener);

        // Touch & Tap Support for Native Player Controls
        View.OnClickListener toggleOsdListener = v -> {
            if (!isNativePlayerOpen) return;
            long now = System.currentTimeMillis();
            if (now - lastNativeOsdToggleTime < 400) return;
            lastNativeOsdToggleTime = now;

            if (isMiniPlayerMode) {
                expandMiniPlayerToFullscreen();
                return;
            }
            if (osdRoot.getVisibility() == View.VISIBLE) {
                hideNativeOsd();
            } else {
                showNativeOsd(false);
            }
        };

        playerView.setOnClickListener(toggleOsdListener);
        nativePlayerRoot.setOnClickListener(toggleOsdListener);

        osdRoot.setOnClickListener(v -> {
            long now = System.currentTimeMillis();
            if (now - lastNativeOsdToggleTime < 400) return;
            lastNativeOsdToggleTime = now;
            hideNativeOsd();
        });
        topBar.setOnClickListener(v -> resetOsdTimer());
        bottomSheet.setOnClickListener(v -> resetOsdTimer());
        channelDrawerBox.setOnClickListener(v -> resetOsdTimer());
        transportControls.setOnClickListener(v -> resetOsdTimer());
        // These surfaces consume background taps but should never become empty D-pad stops.
        nativePlayerRoot.setFocusable(false);
        playerView.setFocusable(false);
        osdRoot.setFocusable(false);
        topBar.setFocusable(false);
        bottomSheet.setFocusable(false);
        channelDrawerBox.setFocusable(false);
        transportControls.setFocusable(false);
    }

    private void showNativeLoading(String title) {
        if (!isNativePlayerOpen || isMiniPlayerMode || !isActivityVisible) return;
        loadingTitle.setText(title);
        loadingSpinner.setVisibility(View.VISIBLE);
        loadingBox.setVisibility(View.VISIBLE);
        if (!nativeLoadingActive) {
            nativeLoadingActive = true;
            loadingPhraseIndex = 0;
            loadingText.setText(LOADING_PHRASES[loadingPhraseIndex]);
            uiHandler.removeCallbacks(loadingPhraseRunnable);
            uiHandler.postDelayed(loadingPhraseRunnable, LOADING_PHRASE_INTERVAL_MS);
        }
        loadingBox.post(this::positionNativeLoading);
    }

    private void hideNativeLoading() {
        nativeLoadingActive = false;
        uiHandler.removeCallbacks(loadingPhraseRunnable);
        if (loadingBox != null) loadingBox.setVisibility(View.GONE);
        if (transportControls != null) {
            transportControls.setTranslationY(0);
            transportControls.setScaleX(1);
            transportControls.setScaleY(1);
        }
    }

    private void showNativeLoadingError() {
        hideNativeLoading();
        if (!isNativePlayerOpen || isMiniPlayerMode || !isActivityVisible) return;
        loadingSpinner.setVisibility(View.GONE);
        loadingTitle.setText(R.string.signal_unavailable);
        loadingText.setText(R.string.signal_error);
        loadingBox.setVisibility(View.VISIBLE);
        loadingBox.post(this::positionNativeLoading);
    }

    private void positionNativeLoading() {
        if (loadingBox == null || loadingBox.getVisibility() != View.VISIBLE || isMiniPlayerMode
                || transportControls == null || transportControls.getHeight() == 0 || loadingBox.getHeight() == 0) return;

        // Use measured bounds so compact screens reserve a real gap before the titles.
        int gap = dp(8);
        int topLimit = osdRoot.getTop() + osdTopBar.getBottom() + dp(6);
        int bottomLimit = osdRoot.getTop() + osdBottomSheet.getTop() - gap;
        float availableTransportHeight = bottomLimit - topLimit - loadingBox.getHeight() - gap;
        float scale = Math.max(.86f, Math.min(1f, availableTransportHeight / transportControls.getHeight()));
        transportControls.setScaleX(scale);
        transportControls.setScaleY(scale);
        float visualTop = osdRoot.getTop() + transportControls.getTop() + transportControls.getHeight() * (1 - scale) / 2;
        float visualBottom = osdRoot.getTop() + transportControls.getBottom() - transportControls.getHeight() * (1 - scale) / 2;
        float shift = Math.min(0, bottomLimit - loadingBox.getHeight() - gap - visualBottom);
        shift = Math.max(shift, topLimit - visualTop);
        transportControls.setTranslationY(shift);

        int statusTop = Math.round(visualBottom + shift + gap);
        int centerX = osdRoot.getLeft() + transportControls.getLeft() + transportControls.getWidth() / 2;
        int statusLeft = Math.max(dp(16), Math.min(nativePlayerRoot.getWidth() - loadingBox.getWidth() - dp(16), centerX - loadingBox.getWidth() / 2));
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) loadingBox.getLayoutParams();
        if (params.topMargin != statusTop || params.leftMargin != statusLeft) {
            params.topMargin = statusTop;
            params.leftMargin = statusLeft;
            loadingBox.setLayoutParams(params);
        }
    }

    private TextView createTimelineLabel(String text) {
        TextView label = new TextView(this);
        label.setText(text);
        label.setTextColor(Color.parseColor("#B3FFFFFF"));
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        label.setTypeface(Typeface.MONOSPACE);
        label.setSingleLine(true);
        return label;
    }

    private void updateNativeTimeline(long positionMs, long durationMs) {
        osdTimeView.setText(formatMs(positionMs));
        osdRemainingTimeView.setText(durationMs > 0 ? "−" + formatMs(Math.max(0, durationMs - positionMs)) : "--:--");
    }

    private void setNativeDrawerVisible(boolean visible) {
        channelDrawerBox.setVisibility(visible ? View.VISIBLE : View.GONE);
        FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) transportControls.getLayoutParams();
        params.gravity = visible ? Gravity.END | Gravity.CENTER_VERTICAL : Gravity.CENTER;
        transportControls.setLayoutParams(params);
        View channel = activeChannelButtonView != null ? activeChannelButtonView : channelListContainer.getChildAt(0);
        btnPrevCh.setNextFocusLeftId(visible && channel != null ? channel.getId() : View.NO_ID);
    }

    private void focusNativeChannelDrawer() {
        final View channel = activeChannelButtonView != null ? activeChannelButtonView : channelListContainer.getChildAt(0);
        if (channel == null) {
            btnPlayPause.requestFocus();
            return;
        }
        channelScrollView.post(() -> {
            if (channel.isShown()) {
                channelScrollView.scrollTo(0, Math.max(0, channel.getTop() - dp(70)));
                channel.requestFocus();
            }
        });
    }

    private Button createTransportButton(String kind, boolean primary, String description, View.OnClickListener listener) {
        PlayerControlButton button = new PlayerControlButton(kind);
        button.setContentDescription(description);
        button.setId(View.generateViewId());
        button.setPadding(0, 0, 0, 0);
        button.setMinimumWidth(0);
        button.setMinimumHeight(0);
        button.setMinWidth(0);
        button.setMinHeight(0);
        button.setFocusable(true);
        button.setFocusableInTouchMode(true);
        button.setStateListAnimator(null);
        styleOsdButton(button, primary, false);
        button.setOnFocusChangeListener((view, focused) -> {
            styleOsdButton(button, primary, focused);
            if (focused) resetOsdTimer();
        });
        button.setOnClickListener(listener);
        boolean compact = getResources().getConfiguration().screenHeightDp < 420;
        int size = dp(primary ? (compact ? 72 : 86) : (compact ? 52 : 60));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(size, size);
        params.leftMargin = dp(9);
        params.rightMargin = dp(9);
        button.setLayoutParams(params);
        return button;
    }

    private Button createOsdButton(String label, boolean isPrimary, View.OnClickListener onClick) {
        Button btn = new Button(this);
        btn.setText(label);
        btn.setAllCaps(false);
        btn.setId(View.generateViewId());
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setPadding(dp(17), dp(9), dp(17), dp(9));
        btn.setMinimumHeight(dp(40));
        btn.setMinimumWidth(0);
        btn.setMinHeight(dp(40));
        btn.setMinWidth(0);
        btn.setFocusable(true);
        btn.setFocusableInTouchMode(true);
        btn.setStateListAnimator(null);

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
        lp.rightMargin = dp(8);
        btn.setLayoutParams(lp);
        return btn;
    }

    private void styleOsdButton(Button btn, boolean isPrimary, boolean focused) {
        if (focused) {
            btn.setTextColor(Color.BLACK);
            btn.setBackground(makeRoundedRect(Color.WHITE, dp(99), dp(2), Color.WHITE));
        } else {
            btn.setTextColor(Color.WHITE);
            btn.setBackground(makeGlassBackground(isPrimary, dp(99)));
        }
        btn.invalidate();
    }

    private GradientDrawable makeGlassBackground(boolean primary, int radius) {
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {Color.parseColor(primary ? "#E63D3D40" : "#E6303033"), Color.parseColor("#E61D1D20")});
        background.setCornerRadius(radius);
        background.setStroke(dp(1), Color.parseColor(primary ? "#4DFFFFFF" : "#2EFFFFFF"));
        return background;
    }

    // Draw transport symbols ourselves so they never become colored emoji on Android/Fire OS.
    private class PlayerControlButton extends AppCompatButton {
        private String kind;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path iconPath = new Path();
        private final RectF iconBounds = new RectF();

        PlayerControlButton(String controlKind) {
            super(MainActivity.this);
            kind = controlKind;
        }

        void setKind(String controlKind) {
            kind = controlKind;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float cx = getWidth() / 2f;
            float cy = getHeight() / 2f;
            float unit = Math.min(getWidth(), getHeight()) * 0.23f;
            paint.setColor(getCurrentTextColor());
            paint.setStrokeWidth(dp(2));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            paint.setStyle(Paint.Style.FILL);
            if ("pause".equals(kind)) {
                canvas.drawRoundRect(cx - unit * .72f, cy - unit, cx - unit * .2f, cy + unit, dp(2), dp(2), paint);
                canvas.drawRoundRect(cx + unit * .2f, cy - unit, cx + unit * .72f, cy + unit, dp(2), dp(2), paint);
            } else if ("play".equals(kind)) {
                Path triangle = iconPath;
                triangle.reset();
                triangle.moveTo(cx - unit * .55f, cy - unit);
                triangle.lineTo(cx + unit, cy);
                triangle.lineTo(cx - unit * .55f, cy + unit);
                triangle.close();
                canvas.drawPath(triangle, paint);
            } else if ("close".equals(kind)) {
                paint.setStyle(Paint.Style.STROKE);
                canvas.drawLine(cx - unit * .7f, cy - unit * .7f, cx + unit * .7f, cy + unit * .7f, paint);
                canvas.drawLine(cx + unit * .7f, cy - unit * .7f, cx - unit * .7f, cy + unit * .7f, paint);
            } else if ("previous".equals(kind) || "next".equals(kind)) {
                float direction = "next".equals(kind) ? 1f : -1f;
                Path triangle = iconPath;
                triangle.reset();
                triangle.moveTo(cx - direction * unit * .65f, cy - unit * .8f);
                triangle.lineTo(cx + direction * unit * .5f, cy);
                triangle.lineTo(cx - direction * unit * .65f, cy + unit * .8f);
                triangle.close();
                canvas.drawPath(triangle, paint);
                paint.setStyle(Paint.Style.STROKE);
                canvas.drawLine(cx + direction * unit * .85f, cy - unit * .8f, cx + direction * unit * .85f, cy + unit * .8f, paint);
            } else {
                float direction = "forward".equals(kind) ? 1f : -1f;
                canvas.save();
                canvas.scale(direction, 1f, cx, cy);
                paint.setStyle(Paint.Style.STROKE);
                iconBounds.set(cx - unit, cy - unit, cx + unit, cy + unit);
                canvas.drawArc(iconBounds, -70, 310, false, paint);
                Path arrow = iconPath;
                arrow.reset();
                arrow.moveTo(cx + unit * .05f, cy - unit * 1.3f);
                arrow.lineTo(cx + unit * .45f, cy - unit * .93f);
                arrow.lineTo(cx - unit * .05f, cy - unit * .7f);
                canvas.drawPath(arrow, paint);
                canvas.restore();
                paint.setStyle(Paint.Style.FILL);
                paint.setTextSize(unit * .95f);
                paint.setTypeface(Typeface.DEFAULT_BOLD);
                paint.setTextAlign(Paint.Align.CENTER);
                canvas.drawText("15", cx, cy - (paint.ascent() + paint.descent()) / 2f, paint);
            }
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
                    chBtn.setId(View.generateViewId());
                    chBtn.setNextFocusRightId(btnPrevCh.getId());
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

                    chBtn.setOnKeyListener((v, keyCode, event) -> {
                        if (keyCode == KeyEvent.KEYCODE_DPAD_RIGHT && event.getAction() == KeyEvent.ACTION_DOWN) {
                            setNativeDrawerVisible(false);
                            btnPrevCh.requestFocus();
                            resetOsdTimer();
                            return true;
                        }
                        return false;
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
                    showNativeLoading("Só um instante");
                } else if (playbackState == Player.STATE_READY) {
                    hideNativeLoading();
                } else if (playbackState == Player.STATE_ENDED && !isCurrentStreamLive) {
                    hideNativeLoading();
                    showNativeOsd(false);
                } else if (playbackState == Player.STATE_IDLE && exoPlayer != null && exoPlayer.getPlayerError() != null) {
                    showNativeLoadingError();
                } else if (playbackState == Player.STATE_IDLE || playbackState == Player.STATE_ENDED) {
                    hideNativeLoading();
                }
            }

            @Override
            public void onRenderedFirstFrame() {
                hideNativeLoading();
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                ((PlayerControlButton) btnPlayPause).setKind(isPlaying ? "pause" : "play");
                btnPlayPause.setContentDescription(isPlaying ? "Pausar" : "Reproduzir");
                if (isPlaying) {
                    hideNativeLoading();
                    resetOsdTimer();
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                showNativeLoadingError();
                if (isNativePlayerOpen && !isMiniPlayerMode && isActivityVisible) {
                    showNativeOsd(false);
                }
            }
        });
    }

    private void openNativePlayerUi(final String streamUrl, final String title, final String subtitle, final boolean isLive) {
        runOnUiThread(() -> {
            hideNativeLoading();
            isNativePlayerOpen = true;
            isCurrentStreamLive = isLive;

            if (isMiniPlayerMode) {
                restoreFullscreenLayout();
            }

            osdTitleView.setText(title != null ? title : "KS TV-Stream");
            osdSubtitleView.setText(subtitle != null ? subtitle : "");

            if (isLive) {
                osdBadgeLive.setText(R.string.live_badge);
                osdBadgeLive.setBackground(makeRoundedRect(Color.parseColor("#FF3B30"), dp(99), 0, 0));
                backHintView.setText(R.string.live_remote_hint);
                osdTimeView.setVisibility(View.GONE);
                seekBarWrap.setVisibility(View.GONE);
                setNativeDrawerVisible(false);
                btnChannelsDrawer.setVisibility(View.VISIBLE);
                btnPrevCh.setVisibility(View.VISIBLE);
                btnNextCh.setVisibility(View.VISIBLE);
                btnMiniPlayer.setVisibility(View.VISIBLE);
                btnRw15.setVisibility(View.GONE);
                btnFf15.setVisibility(View.GONE);
                btnFf60.setVisibility(View.GONE);
            } else {
                osdBadgeLive.setText(R.string.cinema_badge);
                osdBadgeLive.setBackground(makeRoundedRect(Color.parseColor("#2A3042"), dp(99), dp(1), Color.parseColor("#38FFFFFF")));
                backHintView.setText(R.string.vod_remote_hint);
                osdTimeView.setVisibility(View.VISIBLE);
                updateNativeTimeline(0, 0);
                seekBarWrap.setVisibility(View.VISIBLE);
                osdSeekBar.setProgress(0);
                setNativeDrawerVisible(false);
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
            showNativeOsd(false);

            exoPlayer.stop();
            exoPlayer.clearMediaItems();
            showNativeLoading("Conectando ao sinal");
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
            hideNativeLoading();

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
            if (exoPlayer != null && exoPlayer.getPlayerError() != null) {
                showNativeLoadingError();
            } else if (exoPlayer != null && exoPlayer.getPlaybackState() == Player.STATE_BUFFERING) {
                showNativeLoading("Só um instante");
            }
        });
    }

    private void showNativeOsd(boolean focusChannelDrawer) {
        osdRoot.setVisibility(View.VISIBLE);
        if (isCurrentStreamLive) {
            setNativeDrawerVisible(focusChannelDrawer);
            if (focusChannelDrawer) {
                focusNativeChannelDrawer();
            } else {
                btnPlayPause.requestFocus();
            }
        } else {
            setNativeDrawerVisible(false);
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
            hideNativeLoading();
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
            updateNativeTimeline(next, dur);
            osdSeekBar.setProgress((int) ((next * 1000L) / dur));
        }
        resetOsdTimer();
    }

    private void cycleNativeAspect() {
        if (currentResizeMode == AspectRatioFrameLayout.RESIZE_MODE_FIT) {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
            btnAspect.setText(R.string.aspect_zoom);
        } else if (currentResizeMode == AspectRatioFrameLayout.RESIZE_MODE_ZOOM) {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FILL;
            btnAspect.setText(R.string.aspect_fill);
        } else {
            currentResizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT;
            btnAspect.setText(R.string.aspect_default);
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
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decorView);
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
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
                    .header("User-Agent", "KS-TV-Player/1.0")
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
        isActivityVisible = true;
        hideSystemUi();
        if (exoPlayer != null && exoPlayer.getPlayerError() != null) {
            showNativeLoadingError();
        } else if (exoPlayer != null && exoPlayer.getPlaybackState() == Player.STATE_BUFFERING) {
            showNativeLoading("Só um instante");
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        isActivityVisible = false;
        hideNativeLoading();
        if (exoPlayer != null && exoPlayer.isPlaying()) {
            exoPlayer.pause();
        }
    }

    @Override
    protected void onDestroy() {
        hideNativeLoading();
        uiHandler.removeCallbacks(progressRunnable);
        uiHandler.removeCallbacks(autoHideOsdRunnable);
        if (exoPlayer != null) {
            exoPlayer.release();
            exoPlayer = null;
        }
        super.onDestroy();
    }
}
