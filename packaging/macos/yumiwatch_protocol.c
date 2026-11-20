/* SPDX-License-Identifier: LGPL-2.1-or-later */
#include <errno.h>

#include "libavutil/error.h"
#include "url.h"
#include "yumiwatch_protocol.h"

static const YWMediaIO *media_io;

// Called by the app before creating any players. The table lives for the process.
__attribute__((visibility("default")))
void av_yumiwatch_set_io(const YWMediaIO *callbacks);

void av_yumiwatch_set_io(const YWMediaIO *callbacks)
{
    media_io = callbacks;
}

typedef struct {
    void *stream;
} YWMediaContext;

static int open_media(URLContext *h, const char *url, int flags)
{
    YWMediaContext *ctx = h->priv_data;
    if (!media_io || flags & AVIO_FLAG_WRITE)
        return AVERROR(EACCES);

    ctx->stream = media_io->open(url);
    return ctx->stream ? 0 : AVERROR(ENOENT);
}

static int read_media(URLContext *h, unsigned char *buffer, int size)
{
    YWMediaContext *ctx = h->priv_data;
    int n = media_io->read(ctx->stream, buffer, size,
                           h->interrupt_callback.callback, h->interrupt_callback.opaque);
    if (n < 0)
        return h->interrupt_callback.callback &&
               h->interrupt_callback.callback(h->interrupt_callback.opaque)
            ? AVERROR_EXIT : AVERROR(EIO);
    return n ? n : AVERROR_EOF;
}

static int64_t seek_media(URLContext *h, int64_t offset, int whence)
{
    YWMediaContext *ctx = h->priv_data;
    const int64_t position = media_io->seek(ctx->stream, offset, whence & ~AVSEEK_FORCE,
                                            h->interrupt_callback.callback, h->interrupt_callback.opaque);
    return position < 0 ? AVERROR(EIO) : position;
}

static int close_media(URLContext *h)
{
    YWMediaContext *ctx = h->priv_data;
    if (ctx->stream)
        media_io->close(ctx->stream);
    return 0;
}

const URLProtocol ff_yumiwatch_protocol = {
    .name = "yumiwatch",
    .url_open = open_media,
    .url_read = read_media,
    .url_seek = seek_media,
    .url_close = close_media,
    .priv_data_size = sizeof(YWMediaContext),
    .default_whitelist = "yumiwatch",
};
