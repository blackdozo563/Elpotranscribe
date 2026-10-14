#pragma once
#include <stdint.h>
typedef void (*elpo_token_callback)(void *, const char *, int, int64_t, int64_t);
int elpo_whisper_validate(const char *model);
int elpo_whisper(const char *model, const char *language, const float *audio,
                 int count, int threads, const char *prompt, int *prompt_count, int *prompt_used, int *prompt_limit, elpo_token_callback callback, elpo_token_callback segment_callback, void *user);

int elpo_whisper_prompt_info(const char *model, const char *prompt, int *count, int *used, int *limit);

int elpo_model_lock(const char *path);
void elpo_model_unlock(int descriptor);
