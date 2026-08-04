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
  import type { UnlistenFn } from "@tauri-apps/api/event";
  import {
    IconPlayerPause,
    IconPlayerPlay,
    IconPlayerStop,
    IconMusic,
    IconVideo,
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

  const pb = $derived(playbackStore.state);
  const fileName = $derived(pb.mediaPath ? getFileName(pb.mediaPath) : "");

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
      }>("playback:start", async ({ payload }) => {
        console.log("[MiniPlayer] playback:start event received:", payload);
        activeSessionId = payload.sessionId;
        activeSequence = payload.sequence;
        completedKey = null;
        activeType = payload.type;
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
  async function handlePause() {
    console.log("[MiniPlayer] Pause button clicked");
    await emit("playback:pause", {});
  }
  async function handleResume() {
    console.log("[MiniPlayer] Resume button clicked");
    await emit("playback:resume", {});
  }
  async function handleStop() {
    console.log("[MiniPlayer] Stop button clicked");
    await emit("playback:stop", {});
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
      style="width:100%;height:100%;object-fit:contain;pointer-events:none;"
    ></video>
    <audio
      bind:this={audioEl}
      preload="auto"
      onended={handleEnded}
      onerror={handleMediaError}
      onloadeddata={handleMediaLoaded}
    ></audio>
    <div class="video-drag-overlay" data-tauri-drag-region></div>
    {#if pb.mediaType !== "video"}
      <div class="audio-icon"><IconMusic size={32} color="yellowgreen" /></div>
    {/if}
  </div>

  <!-- Controls bar -->
  <div class="controls" data-tauri-drag-region>
    <div class="info" data-tauri-drag-region title={pb.mediaPath ?? ""}>
      <span class="status-dot" class:playing={pb.status === "playing"}></span>
      <span class="filename">{fileName || "—"}</span>
    </div>
    <div class="buttons">
      {#if pb.status === "playing"}
        <button class="ctrl-btn" onclick={handlePause} title="Pause"
          ><IconPlayerPause size={20} /></button
        >
      {:else}
        <button
          class="ctrl-btn"
          onclick={handleResume}
          title="Resume"
          disabled={pb.status === "idle"}><IconPlayerPlay size={20} /></button
        >
      {/if}
      <button
        class="ctrl-btn danger"
        onclick={handleStop}
        title="Stop"
        disabled={pb.status === "idle"}><IconPlayerStop size={20} /></button
      >
    </div>
  </div>

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

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    gap: 10px;
    flex-shrink: 0;
    background: #12122a;
    border-bottom: 1px solid #2a2a4a;
  }
  .info {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    flex: 1;
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
  .filename {
    font-size: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .buttons {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .ctrl-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #e0e0e0;
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    transition: 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ctrl-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
  }
  .ctrl-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .ctrl-btn.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
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
