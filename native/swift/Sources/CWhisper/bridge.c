#include "CWhisper.h"
#include "whisper.h"
#include <string.h>
#include <stdlib.h>
#include <sys/file.h>
#include <fcntl.h>
#include <unistd.h>
int elpo_whisper_validate(const char *model) {
    struct whisper_context_params params = whisper_context_default_params();
    params.use_gpu = true;
    struct whisper_context *ctx = whisper_init_from_file_with_params(model, params);
    if (!ctx) return 1;
    whisper_free(ctx);
    return 0;
}

static whisper_token *prompt_tokens(struct whisper_context *ctx, const char *text, int *count, int *used, int *limit) {
    *count=0; *used=0; *limit=whisper_n_text_ctx(ctx)/2;
    if (*limit>224) *limit=224;
    if (!text || !text[0]) return NULL;
    int needed=whisper_tokenize(ctx,text,NULL,0);
    if (needed<0) needed=-needed;
    if (!needed) return NULL;
    whisper_token *tokens=malloc((size_t)needed*sizeof(whisper_token));
    if (!tokens) return NULL;
    int actual=whisper_tokenize(ctx,text,tokens,needed);
    if (actual<0) { free(tokens); return NULL; }
    *count=actual; *used=actual<*limit ? actual : *limit;
    return tokens;
}
int elpo_whisper_prompt_info(const char *model, const char *prompt, int *count, int *used, int *limit) {
    struct whisper_context_params cp=whisper_context_default_params(); cp.use_gpu=false;
    struct whisper_context *ctx=whisper_init_from_file_with_params_no_state(model,cp);
    if (!ctx) return 1;
    whisper_token *tokens=prompt_tokens(ctx,prompt,count,used,limit);
    free(tokens); whisper_free(ctx); return 0;
}
struct progress_context { elpo_progress_callback callback; void *user; };
static void report_progress(struct whisper_context *ctx, struct whisper_state *state, int percent, void *user) {
    (void)ctx; (void)state;
    struct progress_context *progress = user;
    if (progress->callback && percent >= 0 && percent <= 100) progress->callback(progress->user, percent);
}
// No subprocess: killing the managed helper releases this context and Metal.
int elpo_whisper(const char *model, const char *language, const float *audio,
                 int count, int threads, const char *prompt, int *prompt_count, int *prompt_used, int *prompt_limit, elpo_token_callback callback, elpo_token_callback segment_callback, elpo_progress_callback progress_callback, void *user) {
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
    // Required by whisper.cpp's word-boundary segment wrapping, but no token
    // timing is required by our SRT decoder. Real segment bounds are primary.
    p.token_timestamps = true;
    p.max_len = 84;
    p.split_on_word = true;
    p.print_progress = p.print_realtime = p.print_timestamps = p.print_special = false;
    whisper_token *initial=prompt_tokens(ctx,prompt,prompt_count,prompt_used,prompt_limit);
    p.prompt_tokens=initial; p.prompt_n_tokens=*prompt_used;
    p.n_max_text_ctx=*prompt_limit;
    p.carry_initial_prompt=true;
    struct progress_context progress = { progress_callback, user };
    p.progress_callback = report_progress;
    p.progress_callback_user_data = &progress;
    int status = whisper_full(ctx, p, audio, count);
    free(initial);
    if (status == 0) {
        for (int i = 0; i < whisper_full_n_segments(ctx); ++i) {
            const char *segment = whisper_full_get_segment_text(ctx, i);
            segment_callback(user, segment, (int)strlen(segment), whisper_full_get_segment_t0(ctx, i) * 10, whisper_full_get_segment_t1(ctx, i) * 10);
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

int elpo_model_lock(const char *path) {
    int descriptor=open(path,O_CREAT|O_RDWR,0600);
    if (descriptor<0) return -1;
    if (flock(descriptor,LOCK_EX|LOCK_NB)!=0) { close(descriptor); return -2; }
    return descriptor;
}
void elpo_model_unlock(int descriptor) {
    if (descriptor>=0) { flock(descriptor,LOCK_UN); close(descriptor); }
}
