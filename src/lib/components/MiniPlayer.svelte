<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { listen, emit } from "@tauri-apps/api/event";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { invoke } from "@tauri-apps/api/core";
  import {
    playbackStore,
    setPlaybackState,
  } from "$lib/stores/playback.svelte.js";
  import { getFileName, getMediaDuration } from "$lib/utils/thumbnail.js";
  import { formatDuration } from "$lib/utils/duration.js";
  import { t } from "$lib/i18n/index.svelte.js";
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import {
    IconPlayerPause,
    IconPlayerPlay,
    IconPlayerStop,
    IconMusic,
    IconVideo,
    IconRefresh,
  } from "@tabler/icons-svelte";

  console.log("[MiniPlayer] Component initializing...");

  let videoEl = $state<HTMLVideoElement | null>(null);
  let audioEl = $state<HTMLAudioElement | null>(null);
  let activeType = $state<"video" | "audio" | null>(null);

  type PlaylistItem = {
    name: string;
    type: string;
    path: string;
    loopCount: number;
  };
  let playlist = $state<PlaylistItem[]>([]);
  let currentIndex = $state(0);
  let durations = $state<Record<string, number>>({});
  let playlistEl = $state<HTMLElement | null>(null);

  let unlisteners: UnlistenFn[] = [];
  let activeSessionId: string | null = null;
  let activeSequence = 0;
  let activeAssetUrl: string | null = null;
  let completedKey: string | null = null;

  // Progress bar state
  let currentTime = $state(0);
  let duration = $state(0);

  // Loop info from scheduler
  let loopCurrent = $state(0);
  let loopTotal = $state(0);

  // Schedule name shown as the title (from scheduler, fallback to time)
  let scheduleTitle = $state("");

  const pb = $derived(playbackStore.state);
  const fileName = $derived(pb.mediaPath ? getFileName(pb.mediaPath) : "");
  const tr = $derived(t());
  const titleText = $derived(scheduleTitle || fileName || "—");

  function activeEl(): HTMLVideoElement | HTMLAudioElement | null {
    if (activeType === "video") return videoEl;
    if (activeType === "audio") return audioEl;
    return null;
  }

  async function loadDurations(items: PlaylistItem[]) {
    for (const item of items) {
      if (durations[item.path] !== undefined) continue;
      const d = await getMediaDuration(
        item.path,
        item.path,
        item.type as "video" | "audio",
      );
      durations = { ...durations, [item.path]: d };
    }
  }

  async function scrollToActive() {
    await tick();
    playlistEl
      ?.querySelector<HTMLElement>(".playlist-item.active")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function isCurrent(sessionId: string, sequence: number): boolean {
    return activeSessionId === sessionId && activeSequence === sequence;
  }

  function formatTime(s: number): string {
    if (!isFinite(s) || s < 0) return "0:00";
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function loopDisplay(n: number): string {
    if (n === 0) return "∞";
    return String(n);
  }

  function isLooped(): boolean {
    return loopTotal > 1 || loopTotal === 0;
  }

  function formatProgressText(): string {
    if (loopTotal > 1) {
      return `${tr.playback.loop} ${loopCurrent}/${loopTotal}`;
    }
    if (loopTotal === 0) {
      return `${tr.playback.loop} ∞`;
    }
    return "";
  }

  function waitUntilPlayable(
    el: HTMLMediaElement,
    sessionId: string,
    sequence: number,
  ): Promise<void> {
    if (el.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("Timed out loading media")), 10000);
      const onCanPlay = () => finish();
      const onError = () => finish(new Error(el.error?.message || "Failed to load media"));

      function finish(error?: Error) {
        clearTimeout(timeout);
        el.removeEventListener("canplay", onCanPlay);
        el.removeEventListener("error", onError);
        if (!isCurrent(sessionId, sequence)) resolve();
        else if (error) reject(error);
        else resolve();
      }

      el.addEventListener("canplay", onCanPlay, { once: true });
      el.addEventListener("error", onError, { once: true });
    });
  }

  onMount(async () => {
    console.log("[MiniPlayer] Component mounted");

    // Add F12 keyboard shortcut for DevTools
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        console.log("[MiniPlayer] F12 pressed - toggling DevTools");
        invoke("toggle_mini_player_devtools").catch((err) => {
          console.error("[MiniPlayer] Failed to toggle DevTools:", err);
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // Store cleanup function for onDestroy
    unlisteners.push(() =>
      window.removeEventListener("keydown", handleKeyDown),
    );

    unlisteners.push(
      await listen<{
        sessionId: string;
        sequence: number;
        path: string;
        type: "video" | "audio";
        volume: number;
        playlist?: PlaylistItem[];
        currentIndex?: number;
        currentLoop?: number;
        totalLoops?: number;
        scheduleName?: string;
      }>("playback:start", async ({ payload }) => {
        console.log("[MiniPlayer] playback:start event received:", payload);
        activeSessionId = payload.sessionId;
        activeSequence = payload.sequence;
        completedKey = null;
        activeType = payload.type;
        loopCurrent = payload.currentLoop ?? 0;
        loopTotal = payload.totalLoops ?? 0;
        scheduleTitle = payload.scheduleName ?? "";
        if (payload.playlist) {
          playlist = payload.playlist;
          loadDurations(payload.playlist); // load async, don't await
        }
        if (payload.currentIndex !== undefined)
          currentIndex = payload.currentIndex;
        setPlaybackState({
          status: "playing",
          mediaPath: payload.path,
          mediaType: payload.type,
        });

        // Wait for DOM to update so videoEl is bound before playing
        await tick();
        if (!isCurrent(payload.sessionId, payload.sequence)) return;

        const el = payload.type === "video" ? videoEl : audioEl;
        if (el) {
          videoEl?.pause();
          audioEl?.pause();
          const assetUrl = payload.path.startsWith("/media/")
            ? payload.path
            : convertFileSrc(payload.path);
          console.log("[MiniPlayer] Loading media:", payload.path);
          console.log("[MiniPlayer] Converted URL:", assetUrl);
          el.src = assetUrl;
          activeAssetUrl = el.src;
          el.volume = payload.volume;
          el.load();

          try {
            await waitUntilPlayable(el, payload.sessionId, payload.sequence);
            if (!isCurrent(payload.sessionId, payload.sequence)) return;
            await el.play();
          } catch (err) {
            console.error("[MiniPlayer] Failed to play media:", err);
            finishPlayback(
              payload.sessionId,
              payload.sequence,
              err instanceof Error ? err.message : String(err),
            );
          }
        } else {
          console.error(
            "[MiniPlayer] Media element not found for type:",
            payload.type,
          );
          finishPlayback(
            payload.sessionId,
            payload.sequence,
            `Media element not found for type: ${payload.type}`,
          );
        }
        scrollToActive();
      }),
      await listen("playback:pause", () => {
        console.log("[MiniPlayer] playback:pause event received");
        setPlaybackState({ status: "paused" });
        activeEl()?.pause();
      }),
      await listen("playback:resume", () => {
        console.log("[MiniPlayer] playback:resume event received");
        setPlaybackState({ status: "playing" });
        activeEl()
          ?.play()
          .catch((err) => {
            console.error("[MiniPlayer] Failed to resume:", err);
          });
      }),
      await listen("playback:stop", () => {
        console.log("[MiniPlayer] playback:stop event received");
        setPlaybackState({ status: "idle", mediaPath: null, mediaType: null });
        activeType = null;
        activeSessionId = null;
        activeSequence++;
        activeAssetUrl = null;
        completedKey = null;
        playlist = [];
        currentIndex = 0;
        durations = {};
        currentTime = 0;
        duration = 0;
        loopCurrent = 0;
        loopTotal = 0;
        scheduleTitle = "";
        // Clear media elements without triggering load() error
        if (videoEl) {
          videoEl.pause();
          videoEl.removeAttribute("src");
        }
        if (audioEl) {
          audioEl.pause();
          audioEl.removeAttribute("src");
        }
      }),
      await listen<{ requestId: string }>("mini-player:ready-request", ({ payload }) => {
        emit("mini-player:ready", { requestId: payload.requestId });
      }),
    );
    console.log("[MiniPlayer] Ready for playback requests");
  });

  onDestroy(() => {
    unlisteners.forEach((u) => u());
  });

  function finishPlayback(sessionId: string, sequence: number, error?: string) {
    if (!isCurrent(sessionId, sequence)) return;
    const key = `${sessionId}:${sequence}`;
    if (completedKey === key) return;
    completedKey = key;
    console.log(error ? "[MiniPlayer] Media failed" : "[MiniPlayer] Media ended");
    emit("playback:ended", { sessionId, sequence, error });
  }

  function handleEnded(e: Event) {
    if (e.target !== activeEl()) return;
    finishPlayback(activeSessionId ?? "", activeSequence);
  }

  function handlePause() {
    emit("playback:pause", {});
  }
  function handleResume() {
    emit("playback:resume", {});
  }
  function handleStop() {
    emit("playback:stop", {});
  }
  function handleReset() {
    emit("playback:reset", {});
  }

  function handleMediaError(e: Event) {
    const target = e.target as HTMLMediaElement;
    console.error("[MiniPlayer] Media error:", {
      error: target.error,
      src: target.src,
      networkState: target.networkState,
      readyState: target.readyState,
    });
    if (target !== activeEl() || (activeAssetUrl && target.src !== activeAssetUrl)) return;
    // Skip to next item if media fails to load
    finishPlayback(
      activeSessionId ?? "",
      activeSequence,
      target.error?.message || `Media error ${target.error?.code ?? "unknown"}`,
    );
  }

  function handleMediaLoaded(e: Event) {
    const target = e.target as HTMLMediaElement;
    console.log("[MiniPlayer] Media loaded successfully:", target.src);
  }

  function handleTimeUpdate() {
    const el = activeEl();
    if (el && el.duration && isFinite(el.duration)) {
      currentTime = el.currentTime;
      duration = el.duration;
    }
  }

  function handleSeek(e: MouseEvent | KeyboardEvent) {
    const el = activeEl();
    if (!el || !duration || !isFinite(duration)) return;
    // Keyboard: move by 5% per press
    if (e instanceof KeyboardEvent) {
      const step = duration * 0.05;
      if (e.key === ' ') {
        e.preventDefault();
        el.currentTime = Math.min(duration, el.currentTime + step);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        el.currentTime = Math.max(0, el.currentTime - step);
      }
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    el.currentTime = pct * duration;
  }

  function handleMediaLoadedMetadata() {
    const el = activeEl();
    if (el && el.duration && isFinite(el.duration)) {
      duration = el.duration;
    }
  }

  function loopLabel(n: number): string {
    if (n === 0) return "∞";
    if (n === 1) return "";
    return `×${n}`;
  }
</script>

<div class="player" data-tauri-drag-region>
  <!-- Keep both elements mounted; WebView2 can lose bindings while swapping nodes. -->
  <div
    class="media-area"
    class:audio-placeholder={pb.mediaType !== "video"}
    data-tauri-drag-region
  >
    <video
      bind:this={videoEl}
      class:hidden={pb.mediaType !== "video"}
      preload="auto"
      onended={handleEnded}
      onerror={handleMediaError}
      onloadeddata={handleMediaLoaded}
      ontimeupdate={handleTimeUpdate}
      onloadedmetadata={handleMediaLoadedMetadata}
      style="width:100%;height:100%;object-fit:contain;pointer-events:none;"
    ></video>
    <audio
      bind:this={audioEl}
      preload="auto"
      onended={handleEnded}
      onerror={handleMediaError}
      onloadeddata={handleMediaLoaded}
      ontimeupdate={handleTimeUpdate}
      onloadedmetadata={handleMediaLoadedMetadata}
    ></audio>
    <div class="video-drag-overlay" data-tauri-drag-region></div>
    {#if pb.mediaType !== "video"}
      <div class="audio-icon"><IconMusic size={32} color="#4ade80" /></div>
    {/if}
  </div>

  <!-- Progress bar -->
  <div class="progress-row">
    <span class="progress-time">{formatTime(currentTime)}</span>
    <div class="progress-bar" onclick={handleSeek} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSeek(e); }} role="slider" aria-label="Playback progress" aria-valuenow={Math.round(currentTime)} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabindex={pb.status === 'idle' ? undefined : 0}>
      <div class="progress-fill" style="width: {duration > 0 ? ((currentTime / duration) * 100).toFixed(2) : 0}%"></div>
    </div>
    <span class="progress-time">{duration > 0 ? formatTime(duration) : '--:--'}</span>
  </div>

  <!-- Controls bar -->
  <div class="controls" data-tauri-drag-region>
    <div class="info" data-tauri-drag-region title={pb.mediaPath ?? ""}>
      <span class="status-dot" class:playing={pb.status === "playing"}></span>
      <div class="title-block">
        <span class="schedule-title">{titleText}</span>
        {#if scheduleTitle && fileName}
          <span class="media-name">{fileName}</span>
        {/if}
      </div>
    </div>
    <div class="buttons">
      {#if pb.status === "playing"}
        <span class="tt ctrl-btn-wrap">
          <button class="ctrl-btn" onclick={handlePause}>
            <IconPlayerPause size={20} />
          </button>
          <span class="tt__bubble">{tr.playback.pause}</span>
        </span>
      {:else}
        <span class="tt ctrl-btn-wrap">
          <button
            class="ctrl-btn"
            onclick={handleResume}
            disabled={pb.status === "idle"}><IconPlayerPlay size={20} /></button
          >
          <span class="tt__bubble">{tr.playback.resume}</span>
        </span>
      {/if}
      <span class="tt ctrl-btn-wrap">
        <button
          class="ctrl-btn danger"
          onclick={handleStop}
          disabled={pb.status === "idle"}><IconPlayerStop size={20} /></button
        >
        <span class="tt__bubble">{tr.playback.stop}</span>
      </span>
      {#if pb.status !== "idle"}
        <span class="tt ctrl-btn-wrap">
          <button
            class="ctrl-btn reset"
            onclick={handleReset}><IconRefresh size={20} /></button
          >
          <span class="tt__bubble">{tr.playback.reset}</span>
        </span>
      {/if}
    </div>
  </div>

  <!-- Loop badge -->
  {#if pb.status !== "idle" && isLooped()}
    <div class="loop-badge">{formatProgressText()}</div>
  {/if}

  <!-- Playlist -->
  {#if playlist.length > 0}
    <div class="playlist" bind:this={playlistEl}>
      {#each playlist as item, i}
        <div class="playlist-item" class:active={i === currentIndex}>
          <span class="item-icon">
            {#if item.type === "video"}<IconVideo size={12} />{:else}<IconMusic
                size={12}
              />{/if}
          </span>
          <span class="item-name" title={item.name}>{item.name}</span>
          <span class="item-meta">
            {#if durations[item.path] > 0}
              <span class="item-dur"
                >{formatDuration(durations[item.path])}</span
              >
            {/if}
            {#if loopLabel(item.loopCount)}
              <span class="item-loop">{loopLabel(item.loopCount)}</span>
            {/if}
          </span>
          {#if i === currentIndex}
            <span class="now-dot"></span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(body) {
    background: #1a1a2e;
    color: #e0e0e0;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    height: 100vh;
  }

  .player {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #1a1a2e;
  }

  .media-area {
    height: 214px;
    flex-shrink: 0;
    overflow: hidden;
    background: #000;
    position: relative;
  }
  .video-drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
  }
  video.hidden {
    display: none;
  }
  .audio-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d1e;
  }
  .audio-icon {
    opacity: 1;
  }

  /* Progress bar */
  .progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px 4px;
    flex-shrink: 0;
    background: #12122a;
  }
  .progress-time {
    font-size: 12px;
    color: #666;
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: center;
    user-select: none;
    flex-shrink: 0;
  }
  .progress-bar {
    flex: 1;
    height: 4px;
    background: #2a2a4a;
    border-radius: 100px;
    overflow: hidden;
    cursor: default;
    transition: cursor 0.15s ease;
    user-select: none;
  }
  .progress-bar:hover {
    cursor: pointer;
  }
  .progress-bar:active {
    cursor: grabbing;
  }
  .progress-fill {
    height: 100%;
    background: #4ade80;
    border-radius: 100px;
    transition: width 0.1s linear;
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    gap: 10px;
    flex-shrink: 0;
    background: #12122a;
    border-top: 1px solid #2a2a4a;
  }
  .info {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    flex: 1;
  }
  .title-block {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }
  .schedule-title {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #e0e0e0;
  }
  .media-name {
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #888;
  }
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #555;
    flex-shrink: 0;
    transition: 0.2s;
  }
  .status-dot.playing {
    background: #4ade80;
  }

  .buttons {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .ctrl-btn-wrap {
    display: inline-flex;
  }
  .ctrl-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #e0e0e0;
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.08s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .ctrl-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }
  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.25);
  }
  .ctrl-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .ctrl-btn.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
  .ctrl-btn.reset:hover:not(:disabled) {
    background: rgba(234, 179, 8, 0.2);
    color: #fde68a;
  }

  /* Tooltip */
  .tt {
    position: relative;
  }

  .tt__bubble {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 6px);
    transform: translateX(-50%);
    padding: 5px 8px;
    border-radius: 5px;
    background: #111;
    color: #fff;
    font-size: 11px;
    white-space: nowrap;
    z-index: 999;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease, transform 0.12s ease;
  }

  .tt:hover .tt__bubble,
  .tt:focus-visible .tt__bubble {
    opacity: 1;
    transform: translateX(-50%) translateY(-2px);
  }

  /* Loop badge */
  .loop-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 12px;
    background: #12122a;
    border-top: 1px solid #2a2a4a;
    font-size: 11px;
    color: #4ade80;
    letter-spacing: 0.04em;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
    user-select: none;
  }

  /* Playlist */
  .playlist {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
    scrollbar-width: thin;
    scrollbar-color: #2a2a4a transparent;
  }
  .playlist-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    font-size: 14px;
    cursor: default;
    color: #888;
    transition: background 0.15s;
  }
  .playlist-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .playlist-item.active {
    color: #e0e0e0;
    background: rgba(74, 222, 128, 0.08);
    border-left: 2px solid #4ade80;
    padding-left: 10px; /* compensate for border */
  }
  .item-icon {
    flex-shrink: 0;
    opacity: 0.7;
    display: flex;
  }
  .item-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .item-dur {
    font-size: 12px;
    color: #666;
  }
  .item-loop {
    font-size: 12px;
    color: #4ade80;
    opacity: 0.8;
  }
  .now-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #4ade80;
    flex-shrink: 0;
    animation: pulse 1.4s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
</style>
