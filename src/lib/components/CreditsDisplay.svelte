<script lang="ts">
  import { t } from "$lib/i18n/index.svelte.js";
  import {
    ttsStore,
    formatCredits,
    getCreditsPercent,
  } from "$lib/stores/tts.svelte.js";

  const tr = $derived(t());
  const subscription = $derived(ttsStore.subscription);
  const creditsText = $derived(formatCredits(subscription));
  const creditsPercent = $derived(getCreditsPercent(subscription));
  const isLow = $derived(subscription !== null && creditsPercent <= 20);
</script>

<div class="credits-display" class:low={isLow}>
  <span class="credits-label">{tr.tts.credits}:</span>
  <div
    class="credits-bar-container"
    role="progressbar"
    aria-label={tr.tts.credits}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow={Math.round(creditsPercent)}
  >
    <div class="credits-bar" style="width: {creditsPercent}%"></div>
  </div>
  <span class="credits-percent">{Math.round(creditsPercent)}%</span>
  <span class="credits-text">{creditsText}</span>
</div>

<style>
  .credits-display {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 12px;
  }

  .credits-label {
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .credits-bar-container {
    width: 120px;
    height: 14px;
    background: var(--color-surface-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    overflow: hidden;
  }

  .credits-bar {
    height: 100%;
    background: var(--color-primary);
    min-width: 2px;
    border-radius: 999px;
    transition: width 0.3s ease;
  }

  .credits-percent {
    min-width: 32px;
    color: var(--color-primary);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .credits-text {
    color: var(--color-text);
    font-weight: 500;
    min-width: 100px;
    font-variant-numeric: tabular-nums;
  }

  .credits-display.low {
    font-weight: 600;
  }

  .low .credits-label,
  .low .credits-percent,
  .low .credits-text {
    color: var(--color-danger);
  }

  .low .credits-bar-container {
    background: color-mix(in srgb, var(--color-danger) 12%, var(--color-surface-3));
    border-color: color-mix(in srgb, var(--color-danger) 35%, var(--color-border));
  }

  .low .credits-bar {
    background: var(--color-danger);
  }
</style>
