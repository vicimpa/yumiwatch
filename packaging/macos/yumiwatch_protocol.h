/* SPDX-License-Identifier: LGPL-2.1-or-later */
#ifndef YUMIWATCH_PROTOCOL_H
#define YUMIWATCH_PROTOCOL_H

#include <stdint.h>

typedef struct {
    void *(*open)(const char *url);
    int (*read)(void *stream, uint8_t *buffer, int size, int (*cancelled)(void *), void *context);
    int64_t (*seek)(void *stream, int64_t offset, int whence,
                    int (*cancelled)(void *), void *context);
    void (*close)(void *stream);
} YWMediaIO;

#endif
