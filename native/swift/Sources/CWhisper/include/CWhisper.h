#pragma once
#include <stdint.h>
typedef void (*elpo_token_callback)(void *, const char *, int, int64_t, int64_t);
int elpo_whisper_validate(const char *model);
int elpo_whisper(const char *model, const char *language, const float *audio,
                 int count, int threads, elpo_token_callback callback, elpo_token_callback segment_callback, void *user);
