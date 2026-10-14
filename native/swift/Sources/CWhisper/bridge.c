#include "CWhisper.h"
#include "whisper.h"
#include <string.h>
int elpo_whisper_validate(const char *model) {
    struct whisper_context_params params = whisper_context_default_params();
    params.use_gpu = true;
    struct whisper_context *ctx = whisper_init_from_file_with_params(model, params);
    if (!ctx) return 1;
    whisper_free(ctx);
    return 0;
}

// No subprocess: killing the managed helper releases this context and Metal.
int elpo_whisper(const char *model, const char *language, const float *audio,
                 int count, int threads, elpo_token_callback callback, void *user) {
    struct whisper_context_params cp = whisper_context_default_params();
    cp.use_gpu = true;
    cp.flash_attn = true;
    struct whisper_context *ctx = whisper_init_from_file_with_params(model, cp);
    if (!ctx) return 1;
    struct whisper_full_params p = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    p.n_threads = threads;
    p.language = language;
    p.detect_language = false;
    p.translate = false;
    p.token_timestamps = true;
    p.print_progress = p.print_realtime = p.print_timestamps = p.print_special = false;
    int status = whisper_full(ctx, p, audio, count);
    if (status == 0) {
        for (int i = 0; i < whisper_full_n_segments(ctx); ++i) {
            for (int j = 0; j < whisper_full_n_tokens(ctx, i); ++j) {
                if (whisper_full_get_token_id(ctx, i, j) >= whisper_token_eot(ctx)) continue;
                struct whisper_token_data t = whisper_full_get_token_data(ctx, i, j);
                const char *text = whisper_full_get_token_text(ctx, i, j);
                callback(user, text, (int)strlen(text), t.t0 * 10, t.t1 * 10);
            }
        }
    }
    whisper_free(ctx);
    return status;
}
