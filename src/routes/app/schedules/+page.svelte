<script lang="ts">
  import { onMount } from "svelte";
  import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    loadConfig,
    configStore,
    saveConfig,
    revertConfig,
    addSchedule,
  } from "$lib/stores/config.svelte.js";
  import {
    playbackStore,
    setPlaybackState,
    setSchedulerStatus,
  } from "$lib/stores/playback.svelte.js";
  import { showConfirm } from "$lib/stores/ui.svelte.js";
  import { t } from "$lib/i18n/index.svelte.js";
  import { getFileName } from "$lib/utils/thumbnail.js";
  import ScheduleList from "$lib/components/ScheduleList.svelte";
  import ConfigPanel from "$lib/components/ConfigPanel.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import {
    IconPlayerPause,
    IconPlayerPlay,
    IconPlus,
  } from "@tabler/icons-svelte";

  const tr = $derived(t());
  const isDirty = $derived(configStore.isDirty);
  const schedulerStatus = $derived(playbackStore.schedulerStatus);
  let removePlaybackListeners = () => {};
  let schedulesPageDestroyed = false;

  onMount(() => {
    schedulesPageDestroyed = false;
    let destroyed = false;
    const unlisteners: UnlistenFn[] = [];
    const playbackUnlisteners: UnlistenFn[] = [];

    async function register(promise: Promise<UnlistenFn>, keepDuringPlayback = false) {
      const unlisten = await promise;
      if (destroyed && !(keepDuringPlayback && isPlayingSchedule)) unlisten();
      else (keepDuringPlayback ? playbackUnlisteners : unlisteners).push(unlisten);
    }

    removePlaybackListeners = () => {
      playbackUnlisteners.splice(0).forEach((unlisten) => unlisten());
    };

    (async () => {
      await loadConfig();
      if (destroyed) return;

      const appWindow = getCurrentWindow();
      await register(
        appWindow.listen("tauri://close-requested", async () => {
          if (configStore.isDirty) {
            showConfirm(
              tr.unsaved.title,
              tr.unsaved.message,
              async () => {
                await saveConfig();
                await appWindow.hide();
              },
              async () => {
                revertConfig();
                await appWindow.hide();
              },
            );
          } else {
            await appWindow.hide();
          }
        }),
      );

      await register(listen<{ status: string }>("tray:status-changed", ({ payload }) => {
        setSchedulerStatus(payload.status as "active" | "paused");
      }));

      await register(listen<{ scheduleId: string }>("scheduler:play", ({ payload }) => {
        startScheduledPlayback(payload.scheduleId);
      }));

      await register(listen<{ scheduleId: string; minutesBefore: number }>(
        "scheduler:notify",
        ({ payload }) => {
          const schedule = configStore.schedules.find(
            (s) => s.id === payload.scheduleId,
          );
          if (!schedule) return;
          import("@tauri-apps/plugin-notification").then(
            ({ sendNotification }) => {
              sendNotification({
                title: tr.playback.nowPlaying,
                body: `Jadwal ${schedule.time} akan diputar dalam ${payload.minutesBefore} menit`,
              });
            },
          );
        },
      ));

      await register(listen<PlaybackResult>("playback:ended", ({ payload }) =>
        advancePlaybackQueue(payload),
      ), true);
      await register(listen<{ sessionId: string }>("playback:session-started", ({ payload }) => {
        if (!currentSessionId || payload.sessionId === currentSessionId) return;
        currentSessionId = null;
        currentSequence++;
        isPlayingSchedule = false;
        advancing = false;
        playQueue = [];
        queueIndex = 0;
        scheduleLoopRemaining = 0;
        if (destroyed) removePlaybackListeners();
      }), true);
      await register(listen("playback:pause", () =>
        setPlaybackState({ status: "paused" }),
      ));
      await register(listen("playback:resume", () =>
        setPlaybackState({ status: "playing" }),
      ));
      // playback:stop is emitted by MiniPlayer's stop button (manual stop),
      // and internally by the reset flow after state is already cleared.
      await register(listen("playback:stop", () => {
        if (scheduleIdForReset !== null || isPlayingSchedule || playQueue.length) {
          currentSessionId = null;
          currentSequence++;
          setPlaybackState({ status: "idle", scheduleId: null, mediaPath: null });
          isPlayingSchedule = false;
          advancing = false;
          playQueue = [];
          queueIndex = 0;
          scheduleLoopRemaining = 0;
          scheduleLoopCountInit = 0;
          activeScheduleName = "";
          invoke("close_mini_player").catch(() => {});
          scheduleIdForReset = null;
          if (destroyed) removePlaybackListeners();
        }
      }), true);
      // Loop tracking for schedule-level repeat display
      // (scheduleLoopRemaining lives at module scope; used by advancePlaybackQueue)

      await register(listen("playback:reset", () => {
        console.log("[Schedules] playback:reset received");
        if (!scheduleIdForReset || !isPlayingSchedule) return;
        const restartId = scheduleIdForReset;
        // Full synchronous cleanup of internal state first
        currentSessionId = null;
        currentSequence++;
        advancing = false;
        isPlayingSchedule = false;
        playQueue = [];
        queueIndex = 0;
        scheduleLoopRemaining = 0;
        scheduleLoopCountInit = 0;
        scheduleIdForReset = null;
        // Tell MiniPlayer to stop its media — it will handle cleanup internally
        // (pausing, clearing src, etc.). Our stop listener above no-ops because
        // the state was already cleared by this reset handler.
        emit("playback:stop", {}).catch(() => {});
        // Wait for MiniPlayer to finish cleanup + close, drain audio buffer, then reopen
        setTimeout(async () => {
          startScheduledPlayback(restartId);
        }, 500);
      }), true);
    })().catch((error) => {
      console.error("[Schedules] Failed to register event listeners:", error);
    });

    return () => {
      destroyed = true;
      schedulesPageDestroyed = true;
      unlisteners.forEach((unlisten) => unlisten());
      if (!isPlayingSchedule) {
        currentSessionId = null;
        removePlaybackListeners();
      }
    };
  });

  type PlaybackResult = {
    sessionId: string;
    sequence: number;
    error?: string;
  };

  type MiniPlayerReady = {
    requestId: string;
  };

  let playQueue: {
    path: string;
    volume: number;
    loopCount: number;
    type: "video" | "audio";
  }[] = [];
  let queueIndex = 0;
  let loopRemaining = 0;
  let scheduleLoopRemaining = 0;
  let scheduleLoopCountInit = 0; // original schedule loop count (0 = infinite)
  let isPlayingSchedule = false; // true while a schedule playlist is active
  let advancing = false; // guard against re-entrant advancePlaybackQueue
  let currentSessionId: string | null = null;
  let currentSequence = 0;
  let scheduleIdForReset: string | null = null;
  let activeScheduleName = ""; // display name sent to MiniPlayer (name or time fallback)
  let newScheduleId = $state<string | null>(null);

  async function waitForMiniPlayer(sessionId: string): Promise<boolean> {
    const requestId = crypto.randomUUID();
    let unlisten: UnlistenFn | null = null;
    let requestTimer: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    return new Promise<boolean>(async (resolve, reject) => {
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (requestTimer) clearInterval(requestTimer);
        if (timeout) clearTimeout(timeout);
        unlisten?.();
        resolve(ready);
      };

      try {
        unlisten = await listen<MiniPlayerReady>("mini-player:ready", ({ payload }) => {
          if (payload.requestId === requestId) finish(true);
        });

        if (currentSessionId !== sessionId) {
          finish(false);
          return;
        }

        const requestReady = () => {
          emit("mini-player:ready-request", { requestId }).catch(() => {});
        };
        requestReady();
        requestTimer = setInterval(requestReady, 100);
        timeout = setTimeout(() => finish(false), 3000);
      } catch (error) {
        if (requestTimer) clearInterval(requestTimer);
        if (timeout) clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async function startScheduledPlayback(scheduleId: string) {
    const schedule = configStore.schedules.find((s) => s.id === scheduleId);
    if (!schedule || schedule.media.length === 0) return;

    const sessionId = crypto.randomUUID();
    currentSessionId = sessionId;
    currentSequence = 0;
    await emit("playback:session-started", { sessionId });
    if (currentSessionId !== sessionId) return;

    const { getMediaType } = await import("$lib/utils/thumbnail.js");
    if (currentSessionId !== sessionId) return;
    playQueue = schedule.media.map((m) => ({
      path: m.path,
      volume: m.volume,
      loopCount: m.loopCount,
      type: getMediaType(m.path),
    }));
    queueIndex = 0;
    loopRemaining = Math.max(1, playQueue[0]?.loopCount ?? 1);
    // Schedule-level loop: 0 = infinite (-1 sentinel), otherwise the total number of passes
    const lc = schedule.loopCount ?? 1;
    scheduleLoopRemaining = lc === 0 ? -1 : Math.max(1, lc);
    scheduleLoopCountInit = lc === 0 ? 0 : Math.max(1, lc);
    isPlayingSchedule = true;
    advancing = false;
    scheduleIdForReset = scheduleId;
    activeScheduleName = schedule.name?.trim() || schedule.time || "";

    setPlaybackState({
      status: "playing",
      scheduleId,
      mediaIndex: 0,
      currentLoop: 0,
    });
    await invoke("open_mini_player").catch(() => {});

    const ready = await waitForMiniPlayer(sessionId);
    if (!ready || currentSessionId !== sessionId) {
      console.error("[Schedules] Mini-player did not become ready in time");
      if (currentSessionId === sessionId) {
        currentSessionId = null;
        isPlayingSchedule = false;
        playQueue = [];
        setPlaybackState({ status: "idle", scheduleId: null, mediaPath: null });
        invoke("close_mini_player").catch(() => {});
      }
      return;
    }

    playQueueItem(0);
  }

  async function playQueueItem(index: number) {
    const item = playQueue[index];
    const sessionId = currentSessionId;
    if (!item || !sessionId) return;
    const sequence = ++currentSequence;
    
    // Don't call open_mini_player here — it's already opened once in
    // startScheduledPlayback(). Re-calling show()/hide() between tracks
    // triggers Windows window animations and causes stutter.
    
    setPlaybackState({
      mediaPath: item.path,
      mediaType: item.type,
      mediaIndex: index,
      currentIndex: index,
    });
    const playlist = playQueue.map((q) => ({
      name: getFileName(q.path),
      type: q.type,
      path: q.path,
      loopCount: q.loopCount,
    }));
    // Calculate current/total schedule-level loops for the MiniPlayer display
    const totalLoopsDisplay = scheduleLoopCountInit;  // 0 = infinite
    const currentLoopNum = totalLoopsDisplay > 0
      ? (totalLoopsDisplay - scheduleLoopRemaining + 1)
      : 1;
    await emit("playback:start", {
      sessionId,
      sequence,
      path: item.path,
      type: item.type,
      volume: item.volume,
      playlist,
      currentIndex: index,
      currentLoop: currentLoopNum,
      totalLoops: totalLoopsDisplay,
      scheduleName: activeScheduleName,
    });
  }

  async function advancePlaybackQueue(result: PlaybackResult) {
    // Guard: ignore stale or duplicate 'ended' events
    if (!isPlayingSchedule || playQueue.length === 0) return;
    if (result.sessionId !== currentSessionId || result.sequence !== currentSequence) return;
    if (advancing) return;
    advancing = true;

    if (result.error) {
      console.error("[Schedules] Media playback failed:", result.error);
    }

    try {
      loopRemaining--;
      if (loopRemaining > 0) {
        await playQueueItem(queueIndex);
        return;
      }
      queueIndex++;
      if (queueIndex < playQueue.length) {
        loopRemaining = Math.max(1, playQueue[queueIndex].loopCount);
        await playQueueItem(queueIndex);
      } else {
        // Entire playlist finished — check schedule-level loop
        if (scheduleLoopRemaining === -1) {
          // Infinite loop: restart from beginning
          queueIndex = 0;
          loopRemaining = Math.max(1, playQueue[0].loopCount);
          await playQueueItem(0);
        } else if (scheduleLoopRemaining > 1) {
          // More repeats remaining: decrement and restart
          scheduleLoopRemaining--;
          queueIndex = 0;
          loopRemaining = Math.max(1, playQueue[0].loopCount);
          await playQueueItem(0);
        } else {
          // All done — clean up and hide mini-player
          const finishedSessionId = currentSessionId;
          isPlayingSchedule = false;
          playQueue = [];
          queueIndex = 0;
          scheduleLoopRemaining = 0;
          setPlaybackState({ status: "idle", scheduleId: null, mediaPath: null });
          // Keep the WebView alive briefly so the OS audio buffer can drain.
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (currentSessionId === finishedSessionId && !isPlayingSchedule) {
            currentSessionId = null;
            invoke("close_mini_player").catch(() => {});
            if (schedulesPageDestroyed) removePlaybackListeners();
          }
        }
      }
    } finally {
      if (result.sessionId === currentSessionId) advancing = false;
    }
  }

  async function handleToggleScheduler() {
    if (schedulerStatus === "active") {
      await invoke("pause_all").catch(() => {});
      setSchedulerStatus("paused");
    } else {
      await invoke("resume_all").catch(() => {});
      setSchedulerStatus("active");
    }
  }

  async function handleAddSchedule() {
    const { tick } = await import("svelte");
    const schedule = addSchedule();
    newScheduleId = schedule.id;
    await tick();
    // Scroll the new card into view
    const el = document.getElementById(`schedule-${schedule.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Clear highlight after animation completes
    setTimeout(() => {
      newScheduleId = null;
    }, 1600);
  }
</script>

<svelte:head><title>{tr.nav.schedules} - {tr.app.name}</title></svelte:head>

<div class="page-header">
  <div class="header-left">
    <button
      class="btn badge tt"
      onclick={handleToggleScheduler}
      class:badge-active={schedulerStatus === "active"}
      class:badge-paused={schedulerStatus === "paused"}
    >
      {#if schedulerStatus === "active"}
        <IconPlayerPlay size={16} />
        {tr.status.active}
        <span class="tooltip">- {tr.schedule.statusEnabled}</span>
      {:else}
        <IconPlayerPause size={16} />
        {tr.status.paused}
        <span class="tooltip">- {tr.schedule.statusDisabled}</span>
      {/if}
    </button>
  </div>
  <div class="header-actions">
    {#if isDirty}
      <div class="btn-group">
        <button class="btn btn-ghost" onclick={revertConfig}
          >{tr.actions.revert}</button
        >
        <button class="btn btn-success" onclick={saveConfig}
          >{tr.actions.save}</button
        >
      </div>
    {/if}
    <button
      class="btn btn-primary"
      onclick={handleAddSchedule}
      title={tr.schedule.addSchedule}
    >
      <IconPlus size={16} />
      {tr.schedule.addSchedule}
    </button>
  </div>
</div>

<div class="page-content">
  <ScheduleList onplay={startScheduledPlayback} {newScheduleId} />
</div>

<ConfigPanel />
<ConfirmDialog />

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    gap: 12px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .page-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
