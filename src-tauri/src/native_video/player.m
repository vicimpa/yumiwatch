#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>
#import <OpenGL/gl3.h>
#import <QuartzCore/CAOpenGLLayer.h>
#import <QuartzCore/CATransaction.h>
#include <dlfcn.h>

// Subset of the public libmpv client/render ABI (client API 2.x).
typedef struct mpv_handle mpv_handle;
typedef struct mpv_render_context mpv_render_context;
typedef struct { int type; void *data; } RenderParam;
typedef struct { void *(*get_proc_address)(void *, const char *); void *context; } GLInit;
typedef struct { int fbo, w, h, internal_format; } GLFramebuffer;
typedef struct { int id, error; uint64_t userdata; void *data; } Event;
typedef struct { int reason, error; } EndFile;
typedef struct { void *data; size_t size; } ByteArray;
typedef struct Node Node;
typedef struct { int count; Node *values; char **keys; } NodeList;
struct Node {
    union { int64_t integer; NodeList *list; ByteArray *bytes; } data;
    int format;
};
enum { OptionNotFound = -5 };
enum { FormatString = 1, FormatFlag = 3, FormatInteger = 4, FormatDouble = 5, FormatMap = 8, FormatBytes = 9 };
enum { EventSetPropertyReply = 4, EventEndFile = 7, EventFileLoaded = 8,
       EventSeek = 20, EventPlaybackRestart = 21 };
enum { LoadReply = 1, SeekReply, PauseReply };
enum { RenderEnd, RenderAPI, RenderGLInit, RenderGLFramebuffer, RenderFlipY,
       RenderBlock = 12, RenderSkip = 13 };
static struct {
    mpv_handle *(*create)(void);
    int (*initialize)(mpv_handle *);
    int (*set_option_string)(mpv_handle *, const char *, const char *);
    int (*set_property_async)(mpv_handle *, uint64_t, const char *, int, void *);
    int (*get_property)(mpv_handle *, const char *, int, void *);
    int (*command_async)(mpv_handle *, uint64_t, const char **);
    int (*command_ret)(mpv_handle *, const char **, Node *);
    void (*free_node_contents)(Node *);
    Event *(*wait_event)(mpv_handle *, double);
    void (*terminate_destroy)(mpv_handle *);
    void (*free)(void *);
    int (*render_context_create)(mpv_render_context **, mpv_handle *, RenderParam *);
    void (*render_context_free)(mpv_render_context *);
    void (*render_context_set_update_callback)(mpv_render_context *, void (*)(void *), void *);
    uint64_t (*render_context_update)(mpv_render_context *);
    int (*render_context_render)(mpv_render_context *, RenderParam *);
} mpv;

static BOOL load_mpv(const char *override) {
    if (mpv.create) return YES;
    NSString *bundled = [NSBundle.mainBundle.privateFrameworksPath
        stringByAppendingPathComponent:@"libmpv.2.dylib"];
    void *library = bundled ? dlopen(bundled.fileSystemRepresentation, RTLD_LOCAL | RTLD_NOW) : NULL;
    if (!library && override) library = dlopen(override, RTLD_LOCAL | RTLD_NOW);
    if (!library) return NO;
    unsigned long (*api_version)(void) = dlsym(library, "mpv_client_api_version");
    if (!api_version || (api_version() >> 16) != 2) goto failure;
#define LOAD(name) if (!(mpv.name = dlsym(library, "mpv_" #name))) goto failure
    LOAD(create);
    LOAD(initialize);
    LOAD(set_option_string);
    LOAD(set_property_async);
    LOAD(get_property);
    LOAD(command_async);
    LOAD(command_ret);
    LOAD(free_node_contents);
    LOAD(wait_event);
    LOAD(terminate_destroy);
    LOAD(free);
    LOAD(render_context_create);
    LOAD(render_context_free);
    LOAD(render_context_set_update_callback);
    LOAD(render_context_update);
    LOAD(render_context_render);
#undef LOAD
    return YES;
failure:
    memset(&mpv, 0, sizeof(mpv));
    dlclose(library);
    return NO;
}

@interface YWVideoLayer : CAOpenGLLayer {
@public
    CGLPixelFormatObj pixelFormat;
    CGLContextObj gl;
    mpv_render_context *renderer;
    BOOL shuttingDown;
    BOOL visible;
}
@end

@implementation YWVideoLayer
- (CGLPixelFormatObj)copyCGLPixelFormatForDisplayMask:(uint32_t)mask {
    CGLRetainPixelFormat(pixelFormat);
    return pixelFormat;
}
- (CGLContextObj)copyCGLContextForPixelFormat:(CGLPixelFormatObj)format {
    CGLRetainContext(gl);
    return gl;
}
- (void)drawInCGLContext:(CGLContextObj)context
            pixelFormat:(CGLPixelFormatObj)format
           forLayerTime:(CFTimeInterval)time
            displayTime:(const CVTimeStamp *)timestamp {
    @synchronized (self) {
        GLint framebuffer, viewport[4];
        glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &framebuffer);
        glGetIntegerv(GL_VIEWPORT, viewport);
        if (renderer && viewport[2] > 0 && viewport[3] > 0) {
            GLFramebuffer target = { framebuffer, viewport[2], viewport[3], 0 };
            int flip = 1, block = 0;
            RenderParam params[] = {
                {RenderGLFramebuffer, &target}, {RenderFlipY, &flip},
                {RenderBlock, &block}, {RenderEnd, NULL}
            };
            mpv.render_context_render(renderer, params);
        } else {
            glClearColor(0, 0, 0, 1);
            glClear(GL_COLOR_BUFFER_BIT);
        }
        [super drawInCGLContext:context pixelFormat:format forLayerTime:time displayTime:timestamp];
    }
}
- (void)dealloc {
    if (gl) CGLReleaseContext(gl);
    if (pixelFormat) CGLReleasePixelFormat(pixelFormat);
}
@end

static void update_render(void *pointer) {
    YWVideoLayer *layer = (__bridge YWVideoLayer *)pointer;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (layer->shuttingDown) return;
        @synchronized (layer) {
            if (!(mpv.render_context_update(layer->renderer) & 1)) return;
            if (!layer->visible) {
                int skip = 1, block = 0;
                RenderParam params[] = {
                    {RenderSkip, &skip}, {RenderBlock, &block}, {RenderEnd, NULL}
                };
                CGLContextObj previous = CGLGetCurrentContext();
                CGLSetCurrentContext(layer->gl);
                mpv.render_context_render(layer->renderer, params);
                CGLSetCurrentContext(previous);
                return;
            }
        }
        [layer setNeedsDisplay];
    });
}

static void *gl_proc(void *context, const char *name) {
    return dlsym(context, name);
}

@class YWThumbnailDecoder;

@interface YWVideoSource : NSObject {
@public
    NSString *url, *kind;
    BOOL bounded;
}
@end

@implementation YWVideoSource
@end

static YWVideoSource *video_source(const char *url, const char *kind, BOOL bounded) {
    YWVideoSource *source = [YWVideoSource new];
    source->url = [NSString stringWithUTF8String:url];
    source->kind = [NSString stringWithUTF8String:kind];
    source->bounded = bounded;
    return source;
}

static void destroy_player(mpv_handle *player) {
    if (player) dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        mpv.terminate_destroy(player);
    });
}

@interface YWVideo : NSObject {
@public
    mpv_handle *player;
    YWVideoLayer *surface;
    NSView *view;
    __weak NSView *webview;
    double geometry[4];
    BOOL hasGeometry, inlineVisible, inPictureInPicture;
    unsigned pauseReplies;
    BOOL requestedPause;
    BOOL ready, ended, failed, seekRequested;
    NSString *caption;
    YWVideoSource *source, *previewSource;
    BOOL thumbnailPending;
    YWThumbnailDecoder *thumbnails;
}
- (void)updateGeometry:(NSNotification *)notification;
- (void)resizeVideo:(NSRect)frame scale:(CGFloat)scale;
- (void)showInline;
@end
@implementation YWVideo
- (void)updateGeometry:(NSNotification *)notification {
    NSView *web = webview;
    if (inPictureInPicture || !hasGeometry || !web.superview) return;

    NSRect bounds = web.bounds;
    NSRect region = NSMakeRect(
        NSMinX(bounds) + geometry[0] * NSWidth(bounds),
        NSMinY(bounds) + (web.isFlipped ? geometry[1] : 1 - geometry[1] - geometry[3]) * NSHeight(bounds),
        geometry[2] * NSWidth(bounds), geometry[3] * NSHeight(bounds));
    NSRect frame = [web convertRect:region toView:web.superview];
    [self resizeVideo:frame scale:web.window.backingScaleFactor];
}

- (void)resizeVideo:(NSRect)frame scale:(CGFloat)scale {
    if (NSEqualRects(view.frame, frame) && surface.contentsScale == scale) return;

    // AppKit already drives the drag animation. Apply its geometry in this transaction.
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    view.frame = frame;
    surface.contentsScale = scale;
    [surface setNeedsDisplay];
    [CATransaction commit];
}

- (void)showInline {
    NSView *web = webview;
    inPictureInPicture = NO;
    view.autoresizingMask = NSViewNotSizable;
    [view removeFromSuperview];
    if (web.superview) {
        [web.superview addSubview:view positioned:NSWindowBelow relativeTo:web];
        [self updateGeometry:nil];
    }
    surface->visible = inlineVisible && web.superview != nil;
    view.hidden = !surface->visible;
    if (surface->visible) [surface setNeedsDisplay];
}

- (void)dealloc {
    [NSNotificationCenter.defaultCenter removeObserver:self];
    [view removeFromSuperview];
    if (surface) {
        surface->shuttingDown = YES;
        @synchronized (surface) {
            if (surface->renderer) {
                mpv.render_context_set_update_callback(surface->renderer, NULL, NULL);
                CGLContextObj previous = CGLGetCurrentContext();
                CGLSetCurrentContext(surface->gl);
                mpv.render_context_free(surface->renderer);
                surface->renderer = NULL;
                CGLSetCurrentContext(previous);
            }
        }
    }
    destroy_player(player);
}
@end

typedef struct {
    double position, duration, buffered;
    int ready, seeking, buffering, ended, failure, paused, pictureInPicture;
} Snapshot;

void yw_video_flag(void *pointer, const char *name, int value);
void yw_video_number(void *pointer, const char *name, double value);
void yw_video_snapshot(void *pointer, Snapshot *snapshot);

@interface YWPictureInPictureView : NSView
@property(nonatomic, weak) NSButton *playButton;
@property(nonatomic, weak) NSButton *returnButton;
- (void)setControlsVisible:(BOOL)visible;
@end

@implementation YWPictureInPictureView {
    NSTrackingArea *hoverArea;
}
- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    if (hoverArea) [self removeTrackingArea:hoverArea];
    hoverArea = [[NSTrackingArea alloc] initWithRect:NSZeroRect
        options:NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect
        owner:self userInfo:nil];
    [self addTrackingArea:hoverArea];
}
- (void)mouseEntered:(NSEvent *)event {
    [self setControlsVisible:YES];
}
- (void)mouseExited:(NSEvent *)event {
    [self setControlsVisible:NO];
}
- (void)setControlsVisible:(BOOL)visible {
    self.playButton.hidden = self.returnButton.hidden = !visible;
}
- (NSView *)hitTest:(NSPoint)point {
    NSView *target = [super hitTest:point];
    if (!target || [target isKindOfClass:NSButton.class]) return target;
    return self;
}
- (BOOL)acceptsFirstMouse:(NSEvent *)event {
    return YES;
}
- (void)mouseDown:(NSEvent *)event {
    [self.window performWindowDragWithEvent:event];
}
@end

static NSButton *floating_button(NSString *symbol, NSString *label, id target, SEL action, NSRect frame) {
    NSImage *image = [NSImage imageWithSystemSymbolName:symbol accessibilityDescription:label];
    NSButton *button = [NSButton buttonWithImage:image target:target action:action];
    button.frame = frame;
    button.bordered = NO;
    button.wantsLayer = YES;
    button.layer.cornerRadius = NSHeight(frame) / 2;
    button.layer.backgroundColor = [NSColor colorWithWhite:0.06 alpha:0.8].CGColor;
    button.contentTintColor = NSColor.whiteColor;
    button.toolTip = label;
    [button setAccessibilityLabel:label];
    return button;
}

@interface YWPictureInPicture : NSObject <NSWindowDelegate>
@property(nonatomic, strong, readonly) NSPanel *panel;
@property(nonatomic, weak, readonly) YWVideo *video;
- (instancetype)initWithScreen:(NSScreen *)screen;
- (void)showVideo:(YWVideo *)video;
- (void)dismissReturningToPlayer:(BOOL)returnToPlayer;
@end

@implementation YWPictureInPicture {
    NSButton *playButton;
    NSTimer *timer;
}
- (instancetype)initWithScreen:(NSScreen *)screen {
    self = [super init];
    if (!self) return nil;
    NSRect area = screen ? screen.visibleFrame : NSMakeRect(0, 0, 640, 480);
    CGFloat width = MIN(400, NSWidth(area) - 32);
    CGFloat height = width * 9 / 16;
    NSRect rect = NSMakeRect(NSMaxX(area) - width - 16, NSMinY(area) + 16, width, height);
    _panel = [[NSPanel alloc] initWithContentRect:rect
        styleMask:NSWindowStyleMaskBorderless | NSWindowStyleMaskResizable |
                  NSWindowStyleMaskNonactivatingPanel
        backing:NSBackingStoreBuffered defer:NO];
    if (!_panel) return nil;
    _panel.title = @"YummyWatch";
    _panel.delegate = self;
    _panel.contentMinSize = NSMakeSize(240, 135);
    _panel.contentAspectRatio = NSMakeSize(16, 9);
    _panel.backgroundColor = NSColor.blackColor;
    _panel.hasShadow = YES;
    _panel.movable = YES;
    _panel.floatingPanel = YES;
    _panel.hidesOnDeactivate = NO;
    _panel.becomesKeyOnlyIfNeeded = YES;
    _panel.releasedWhenClosed = NO;
    _panel.excludedFromWindowsMenu = YES;
    _panel.tabbingMode = NSWindowTabbingModeDisallowed;
    _panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                NSWindowCollectionBehaviorFullScreenAuxiliary;
    if (@available(macOS 13.0, *)) {
        _panel.collectionBehavior |= NSWindowCollectionBehaviorCanJoinAllApplications;
    }
    YWPictureInPictureView *content = [[YWPictureInPictureView alloc]
        initWithFrame:NSMakeRect(0, 0, width, height)];
    _panel.contentView = content;
    NSButton *returnButton = floating_button(@"pip.exit", @"Вернуть видео в плеер", self,
        @selector(returnVideo:), NSMakeRect(8, height - 36, 28, 28));
    returnButton.autoresizingMask = NSViewMinYMargin | NSViewMaxXMargin;
    content.returnButton = returnButton;
    [content addSubview:returnButton];
    playButton = floating_button(@"play.fill", @"Воспроизвести", self,
        @selector(togglePlay:), NSMakeRect((width - 44) / 2, (height - 44) / 2, 44, 44));
    playButton.autoresizingMask = NSViewMinXMargin | NSViewMaxXMargin | NSViewMinYMargin | NSViewMaxYMargin;
    content.playButton = playButton;
    [content addSubview:playButton];
    [content setControlsVisible:NO];
    return self;
}

- (void)showVideo:(YWVideo *)video {
    if (_video != video) {
        [_video showInline];
        _video = video;
        video->inPictureInPicture = YES;
        [video->view removeFromSuperview];
        video->view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
        [self.panel.contentView addSubview:video->view positioned:NSWindowBelow relativeTo:nil];
        video->surface->visible = YES;
        video->view.hidden = NO;
        [video resizeVideo:self.panel.contentView.bounds scale:self.panel.backingScaleFactor];
        [video->surface setNeedsDisplay];
    }
    if (!timer) {
        __weak YWPictureInPicture *weakSelf = self;
        timer = [NSTimer timerWithTimeInterval:0.25 repeats:YES block:^(NSTimer *tick) {
            [weakSelf updatePlayButton];
        }];
        [NSRunLoop.mainRunLoop addTimer:timer forMode:NSRunLoopCommonModes];
    }
    [self updatePlayButton];
    [self.panel orderFrontRegardless];
    [(YWPictureInPictureView *)self.panel.contentView setControlsVisible:
        NSPointInRect(NSEvent.mouseLocation, self.panel.frame)];
}

- (void)dismissReturningToPlayer:(BOOL)returnToPlayer {
    YWVideo *video = _video;
    _video = nil;
    [timer invalidate];
    timer = nil;
    [(YWPictureInPictureView *)self.panel.contentView setControlsVisible:NO];
    [self.panel orderOut:nil];
    [video showInline];
    if (video && returnToPlayer) {
        NSView *web = video->webview;
        NSWindow *host = web.window;
        if (host.miniaturized) [host deminiaturize:nil];
        [NSApp activateIgnoringOtherApps:YES];
        [host makeKeyAndOrderFront:nil];
        [host makeFirstResponder:web];
    }
}

- (void)windowDidChangeBackingProperties:(NSNotification *)notification {
    YWVideo *video = _video;
    if (video) [video resizeVideo:self.panel.contentView.bounds scale:self.panel.backingScaleFactor];
}

- (void)returnVideo:(id)sender {
    YWVideo *video = _video;
    NSView *web = video ? video->webview : nil;
    [self dismissReturningToPlayer:YES];
    if (web) [NSNotificationCenter.defaultCenter postNotificationName:@"YummyWatchReturnToPlayer" object:web];
}

- (void)togglePlay:(id)sender {
    YWVideo *video = _video;
    if (!video) return;
    void *pointer = (__bridge void *)video;
    Snapshot state = {};
    yw_video_snapshot(pointer, &state);
    if (state.failure) return;
    BOOL paused = state.paused < 0 ? video->requestedPause : state.paused != 0;
    if (state.ended) yw_video_number(pointer, "time-pos", 0);
    yw_video_flag(pointer, "pause", !paused && !state.ended);
    [self updatePlayButton];
}

- (void)updatePlayButton {
    YWVideo *video = _video;
    if (!video) return;
    Snapshot state = {};
    yw_video_snapshot((__bridge void *)video, &state);
    BOOL paused = state.ended || (state.paused < 0 ? video->requestedPause : state.paused != 0);
    NSString *label = paused ? @"Воспроизвести" : @"Пауза";
    if (![playButton.toolTip isEqualToString:label]) {
        playButton.toolTip = label;
        playButton.image = [NSImage imageWithSystemSymbolName:paused ? @"play.fill" : @"pause.fill"
            accessibilityDescription:label];
        [playButton setAccessibilityLabel:label];
    }
    playButton.enabled = state.ready && !state.failure;
}
@end

static YWPictureInPicture *floatingVideo;

bool yw_video_picture_in_picture(void *pointer, bool enabled, void *previous) {
    YWVideo *video = (__bridge YWVideo *)pointer;
    if (!enabled) {
        if (floatingVideo.video == video) [floatingVideo dismissReturningToPlayer:NO];
        return true;
    }
    if (previous && floatingVideo.video != (__bridge YWVideo *)previous) return true;
    NSWindow *host = video->webview.window;
    if (!host || !video->ready || video->failed) return false;
    if (!floatingVideo)
        floatingVideo = [[YWPictureInPicture alloc] initWithScreen:host.screen ?: NSScreen.mainScreen];
    if (!floatingVideo) return false;
    [floatingVideo showVideo:video];
    return true;
}

static mpv_handle *create_player(const char *kind, BOOL bounded, BOOL preview) {
    mpv_handle *player = mpv.create();
    if (!player) return NULL;
    const char *options[][2] = {
        {"config", "no"}, {"autoload-files", "no"},
        {"input-default-bindings", "no"}, {"input-vo-keyboard", "no"},
        {"osd-level", "0"}, {"vo", preview ? "null" : "libmpv"}, {"ao", "coreaudio"},
        {"hwdec", preview ? "videotoolbox-copy" : "videotoolbox"},
        {"hwdec-codecs", "h264,hevc"}, {"vd", "h264,hevc,-"},
        {"hwdec-software-fallback", "no"}, {"ad", "aac_at,mp3_at,ac3_at,eac3_at,-"},
        {"pause", "yes"}, {"mute", "yes"}, {"keep-open", "yes"},
        {"stop-playback-on-init-failure", "yes"},
        {"cache-pause", preview ? "no" : "yes"}, {"cache-pause-wait", "1"},
        {"demuxer-readahead-secs", preview ? "1" : "15"},
        {"tls-verify", "yes"}, {"network-timeout", preview ? "4" : "20"},
        {"user-agent", "Mozilla/5.0"},
        {"demuxer", "lavf"}, {"demuxer-lavf-format", kind},
        {"demuxer-lavf-allow-mimetype", "no"},
        {"demuxer-lavf-o", "protocol_whitelist=%25%http,https,tls,tcp,crypto,allowed_extensions=ALL,extension_picky=0"},
    };
    for (size_t index = 0; index < sizeof(options) / sizeof(*options); index++) {
        if (mpv.set_option_string(player, options[index][0], options[index][1]) < 0) goto failure;
    }
    // These options are absent from the bundled library, where scripts aren't compiled in.
    const char *scriptOptions[] = { "load-scripts", "ytdl", "load-stats-overlay", "load-osd-console", "osc" };
    for (size_t index = 0; index < sizeof(scriptOptions) / sizeof(*scriptOptions); index++) {
        int result = mpv.set_option_string(player, scriptOptions[index], "no");
        if (result < 0 && result != OptionNotFound) goto failure;
    }
    if (bounded && mpv.set_option_string(player, "stream-lavf-o",
        "request_size=8388608,initial_request_size=8388608,short_seek_size=4194304") < 0) goto failure;
    if (preview && (mpv.set_option_string(player, "aid", "no") < 0 ||
        mpv.set_option_string(player, "sid", "no") < 0 ||
        mpv.set_option_string(player, "hls-bitrate", "min") < 0 ||
        mpv.set_option_string(player, "demuxer-max-bytes", "8MiB") < 0 ||
        mpv.set_option_string(player, "demuxer-max-back-bytes", "2MiB") < 0)) goto failure;
    if (mpv.initialize(player) >= 0) return player;
failure:
    destroy_player(player);
    return NULL;
}

static int load_video(mpv_handle *player, const char *url, double start) {
    char position[64];
    snprintf(position, sizeof(position), "start=%.3f", start);
    const char *load[] = { "loadfile", url, "replace", "0", position, NULL };
    return mpv.command_async(player, LoadReply, load);
}

static int seek_video(mpv_handle *player, double seconds) {
    char position[64];
    snprintf(position, sizeof(position), "%.3f", seconds);
    const char *seek[] = { "seek", position, "absolute+exact", NULL };
    return mpv.command_async(player, SeekReply, seek);
}

void *yw_video_open(void *webview, const char *library, const char *url,
                    const char *caption_url, const char *kind, double start,
                    bool bounded, const char **error) {
    NSView *web = (__bridge NSView *)webview;
    if (!web.superview || !load_mpv(library)) {
        *error = "Не найдена нативная библиотека libmpv.";
        return NULL;
    }
    YWVideo *session = [YWVideo new];
    YWVideoLayer *layer = nil;
    session->player = create_player(kind, bounded, NO);
    if (!session->player) goto failure;

    session->surface = [YWVideoLayer new];
    layer = session->surface;
    CGLPixelFormatAttribute attrs[] = {
        kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
        kCGLPFAAccelerated, kCGLPFAAllowOfflineRenderers, kCGLPFAColorSize, 24, 0
    };
    GLint count = 0;
    if (CGLChoosePixelFormat(attrs, &layer->pixelFormat, &count) != kCGLNoError || !layer->pixelFormat ||
        CGLCreateContext(layer->pixelFormat, NULL, &layer->gl) != kCGLNoError) goto failure;

    GLInit init = { gl_proc, RTLD_DEFAULT };
    RenderParam params[] = { {RenderAPI, "opengl"}, {RenderGLInit, &init}, {RenderEnd, NULL} };
    CGLContextObj previous = CGLGetCurrentContext();
    CGLSetCurrentContext(layer->gl);
    int status = mpv.render_context_create(&layer->renderer, session->player, params);
    CGLSetCurrentContext(previous);
    if (status < 0) goto failure;
    layer.asynchronous = NO;
    layer.opaque = YES;
    layer.needsDisplayOnBoundsChange = YES;
    layer.contentsScale = web.window.backingScaleFactor;
    session->view = [[NSView alloc] initWithFrame:NSZeroRect];
    session->view.hidden = YES;
    session->view.wantsLayer = YES;
    session->view.layer = layer;
    [web.superview addSubview:session->view positioned:NSWindowBelow relativeTo:web];
    session->webview = web;
    web.postsFrameChangedNotifications = YES;
    [NSNotificationCenter.defaultCenter addObserver:session selector:@selector(updateGeometry:)
        name:NSViewFrameDidChangeNotification object:web];
    [NSNotificationCenter.defaultCenter addObserver:session selector:@selector(updateGeometry:)
        name:NSWindowDidChangeBackingPropertiesNotification object:web.window];
    mpv.render_context_set_update_callback(layer->renderer, update_render, (__bridge void *)layer);

    if (caption_url) session->caption = [NSString stringWithUTF8String:caption_url];
    session->source = video_source(url, kind, bounded);
    if (load_video(session->player, url, start) < 0) goto failure;
    return (__bridge_retained void *)session;
failure:
    *error = "Не удалось запустить libmpv с VideoToolbox.";
    return NULL;
}

void yw_video_close(void *pointer) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    if (floatingVideo.video == session) [floatingVideo dismissReturningToPlayer:NO];
    // A frame capture may briefly retain the decoder after the view closes.
    session->view.hidden = YES;
    session->surface->visible = NO;
    int pause = 1;
    mpv.set_property_async(session->player, 0, "pause", FormatFlag, &pause);
    CFRelease(pointer);
}

void yw_video_set_thumbnail_source(void *pointer, const char *url, const char *kind, bool bounded) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    session->previewSource = video_source(url, kind, bounded);
}

static Node map_value(Node map, const char *key) {
    if (map.format == FormatMap) {
        NodeList *list = map.data.list;
        for (int index = 0; index < list->count; index++) {
            if (strcmp(list->keys[index], key) == 0) return list->values[index];
        }
    }
    return (Node){0};
}

static NSData *thumbnail(Node frame, double limit) {
    Node w = map_value(frame, "w"), h = map_value(frame, "h");
    Node s = map_value(frame, "stride"), bytes = map_value(frame, "data");
    if (w.format != FormatInteger || h.format != FormatInteger ||
        s.format != FormatInteger || bytes.format != FormatBytes) return nil;
    int64_t width = w.data.integer, height = h.data.integer, stride = s.data.integer;
    ByteArray *pixels = bytes.data.bytes;
    if (width < 1 || height < 1 || width > 8192 || height > 8192 ||
        stride < width * 4 || stride > 65536 || (uint64_t)(stride * height) > pixels->size)
        return nil;

    double scale = fmin(1, limit / fmax(width, height));
    size_t outWidth = fmax(1, round(width * scale)), outHeight = fmax(1, round(height * scale));
    CGColorSpaceRef colors = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGDataProviderRef provider = CGDataProviderCreateWithData(NULL, pixels->data, pixels->size, NULL);
    CGBitmapInfo format = kCGBitmapByteOrder32Big | kCGImageAlphaNoneSkipLast;
    CGImageRef source = provider && colors ? CGImageCreate(width, height, 8, 32, stride, colors,
        format, provider, NULL, false, kCGRenderingIntentDefault) : NULL;
    CGContextRef canvas = source ? CGBitmapContextCreate(NULL, outWidth, outHeight, 8,
        outWidth * 4, colors, format) : NULL;
    NSMutableData *output = [NSMutableData data];
    if (canvas) {
        CGContextSetInterpolationQuality(canvas, kCGInterpolationMedium);
        CGContextDrawImage(canvas, CGRectMake(0, 0, outWidth, outHeight), source);
        CGImageRef small = CGBitmapContextCreateImage(canvas);
        CGImageDestinationRef jpeg = CGImageDestinationCreateWithData((__bridge CFMutableDataRef)output,
            CFSTR("public.jpeg"), 1, NULL);
        if (jpeg && small) {
            NSDictionary *options = @{(__bridge NSString *)kCGImageDestinationLossyCompressionQuality: @0.76};
            CGImageDestinationAddImage(jpeg, small, (__bridge CFDictionaryRef)options);
            if (!CGImageDestinationFinalize(jpeg)) output = nil;
        }
        if (jpeg) CFRelease(jpeg);
        if (small) CGImageRelease(small);
        CGContextRelease(canvas);
    }
    if (source) CGImageRelease(source);
    if (provider) CGDataProviderRelease(provider);
    if (colors) CGColorSpaceRelease(colors);
    return output.length ? output : nil;
}

static NSData *capture_frame(mpv_handle *player, double limit) {
    Node result = {0};
    const char *capture[] = { "screenshot-raw", "video", "rgba", NULL };
    if (mpv.command_ret(player, capture, &result) < 0) return nil;
    NSData *image = thumbnail(result, limit);
    mpv.free_node_contents(&result);
    return image;
}

void yw_video_frame(void *pointer, void *context,
                    void (*complete)(void *, const uint8_t *, size_t)) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSData *image = capture_frame(session->player, 640);
        // The last owner of the AppKit views releases them on the main thread.
        dispatch_async(dispatch_get_main_queue(), ^{
            complete(context, image.bytes, image.length);
            (void)session;
        });
    });
}

@interface YWThumbnailDecoder : NSObject {
    mpv_handle *player;
}
- (NSData *)frameAt:(double)seconds source:(YWVideoSource *)source deadline:(NSTimeInterval)deadline;
@end

@implementation YWThumbnailDecoder
- (NSData *)frameAt:(double)seconds source:(YWVideoSource *)source deadline:(NSTimeInterval)deadline {
    BOOL opening = !player;
    if (opening) {
        player = create_player(source->kind.UTF8String, source->bounded, YES);
        if (!player || load_video(player, source->url.UTF8String, seconds) < 0) return nil;
    } else {
        while (mpv.wait_event(player, 0)->id) {}
        if (seek_video(player, seconds) < 0) return nil;
    }
    // Wait for a new decoded frame. A seek command can finish before its frame is ready.
    BOOL seeking = opening;
    for (NSTimeInterval remaining; (remaining = deadline - NSProcessInfo.processInfo.systemUptime) > 0;) {
        Event *event = mpv.wait_event(player, remaining);
        if (event->id == EventSeek) seeking = YES;
        if (event->id == EventPlaybackRestart && seeking) return capture_frame(player, 320);
        if (event->id == EventEndFile || ((event->userdata == LoadReply ||
             event->userdata == SeekReply) && event->error < 0)) break;
    }
    return nil;
}
- (void)dealloc {
    destroy_player(player);
}
@end

void yw_video_thumbnail(void *pointer, double seconds, void *context,
                       void (*complete)(void *, const uint8_t *, size_t)) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    if (session->thumbnailPending) {
        complete(context, NULL, 0);
        return;
    }
    if (!session->thumbnails) session->thumbnails = [YWThumbnailDecoder new];
    session->thumbnailPending = YES;
    YWThumbnailDecoder *decoder = session->thumbnails;
    YWVideoSource *source = session->source, *preferred = session->previewSource;
    __weak YWVideo *owner = session;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 5;
        YWThumbnailDecoder *worker = decoder;
        NSData *image = [worker frameAt:seconds source:preferred ?: source deadline:deadline];
        BOOL fallback = preferred && !image;
        if (fallback && NSProcessInfo.processInfo.systemUptime < deadline) {
            worker = [YWThumbnailDecoder new];
            image = [worker frameAt:seconds source:source deadline:deadline];
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            YWVideo *active = owner;
            if (active) {
                active->thumbnailPending = NO;
                active->thumbnails = image ? worker : nil;
                if (fallback) active->previewSource = nil;
            }
            complete(context, image.bytes, image.length);
        });
    });
}

void yw_video_layout(void *pointer, const double *rect, int visibility) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    if (rect) {
        memcpy(session->geometry, rect, sizeof(session->geometry));
        session->hasGeometry = YES;
        [session updateGeometry:nil];
    }
    if (visibility >= 0) {
        session->inlineVisible = visibility != 0;
        if (!session->inPictureInPicture) {
            session->surface->visible = session->inlineVisible;
            session->view.hidden = !session->inlineVisible;
            if (visibility) [session->surface setNeedsDisplay];
        }
    }
}

void yw_video_flag(void *pointer, const char *name, int value) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    uint64_t reply = strcmp(name, "pause") == 0 ? PauseReply : 0;
    if (mpv.set_property_async(session->player, reply, name, FormatFlag, &value) >= 0 &&
        reply == PauseReply) {
        session->pauseReplies++;
        session->requestedPause = value != 0;
    }
}

void yw_video_number(void *pointer, const char *name, double value) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    if (strcmp(name, "time-pos") == 0) {
        if (seek_video(session->player, value) >= 0) {
            session->ended = NO;
            session->seekRequested = YES;
        }
    } else {
        mpv.set_property_async(session->player, 0, name, FormatDouble, &value);
    }
}

static int flag(mpv_handle *player, const char *name) {
    int value = 0;
    return mpv.get_property(player, name, FormatFlag, &value) < 0 ? 0 : value;
}

static double number(mpv_handle *player, const char *name) {
    double value = 0;
    return mpv.get_property(player, name, FormatDouble, &value) < 0 || !isfinite(value) ? 0 : value;
}

void yw_video_snapshot(void *pointer, Snapshot *snapshot) {
    YWVideo *session = (__bridge YWVideo *)pointer;
    mpv_handle *player = session->player;
    Event *event;
    while ((event = mpv.wait_event(player, 0))->id) {
        if (event->id == EventFileLoaded && session->caption) {
            const char *sub[] = { "sub-add", session->caption.UTF8String, "select", NULL };
            mpv.command_async(player, 0, sub);
        } else if (event->id == EventPlaybackRestart) {
            session->seekRequested = NO;
            char *decoder = NULL;
            if (mpv.get_property(player, "hwdec-current", FormatString, &decoder) >= 0) {
                session->ready = decoder && strcmp(decoder, "videotoolbox") == 0;
                mpv.free(decoder);
            }
            if (!session->ready) session->failed = YES;
        } else if (event->id == EventEndFile && event->data) {
            EndFile *end = event->data;
            session->seekRequested = NO;
            session->ended = end->reason == 0;
            if (end->error < 0 || !session->ready) session->failed = YES;
        } else if (event->id == EventSetPropertyReply && event->userdata == PauseReply) {
            if (session->pauseReplies) session->pauseReplies--;
        } else if (event->userdata == LoadReply && event->error < 0) {
            session->failed = YES;
        } else if (event->userdata == SeekReply && event->error < 0) {
            session->seekRequested = NO;
        }
    }
    snapshot->ready = session->ready;
    snapshot->seeking = session->seekRequested || flag(player, "seeking");
    snapshot->buffering = flag(player, "paused-for-cache");
    snapshot->ended = !snapshot->seeking &&
        (session->ended || (session->ready && flag(player, "eof-reached")));
    snapshot->failure = session->failed;
    // An async pause command can still be queued when the snapshot is taken.
    snapshot->paused = session->pauseReplies ? -1 : flag(player, "pause");
    snapshot->position = number(player, "time-pos");
    snapshot->duration = number(player, "duration");
    snapshot->buffered = number(player, "demuxer-cache-time");
    snapshot->pictureInPicture = session->inPictureInPicture;
}
