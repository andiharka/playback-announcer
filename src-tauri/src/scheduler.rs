use chrono::{Datelike, Duration as ChronoDuration, Local, NaiveTime, Timelike};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};

use crate::activity_log;
use crate::types::{Schedule, SchedulerStatus};

pub struct SchedulerState {
    pub status: SchedulerStatus,
    pub schedules: Vec<Schedule>,
    pub notified: std::collections::HashSet<String>,
}

impl SchedulerState {
    pub fn new() -> Self {
        Self {
            status: SchedulerStatus::Active,
            schedules: Vec::new(),
            notified: std::collections::HashSet::new(),
        }
    }
}

pub fn start_scheduler(app: AppHandle, state: Arc<Mutex<SchedulerState>>) {
    tauri::async_runtime::spawn(async move {
        let mut last_minute = u32::MAX;
        let mut last_check = Local::now();

        loop {
            sleep(Duration::from_secs(1)).await;

            let now = Local::now();
            // Tokio timers may wake late. Check a bounded elapsed interval instead of
            // requiring the loop to run during one exact wall-clock second.
            let check_from = std::cmp::max(last_check, now - ChronoDuration::seconds(10));
            last_check = now;
            let current_minute = now.minute();

            // Reset notification tracker at the start of each new minute
            if current_minute != last_minute {
                last_minute = current_minute;
                if let Ok(mut s) = state.lock() {
                    // Only clear keys from a previous day
                    let today_prefix = now.format("%Y-%m-%d").to_string();
                    s.notified.retain(|k| k.starts_with(&today_prefix));
                }
            }

            let (status, schedules) = {
                match state.lock() {
                    Ok(s) => (s.status.clone(), s.schedules.clone()),
                    Err(_) => continue,
                }
            };

            if status == SchedulerStatus::Paused {
                continue;
            }

            let now_time = now.format("%H:%M:%S").to_string();
            // weekday: Mon=1..Sun=7
            let weekday = now.weekday().number_from_monday() as u8;

            for schedule in &schedules {
                if !schedule.enabled {
                    continue;
                }
                if !schedule.active_days.contains(&weekday) {
                    continue;
                }

                // Check notifications
                for notif in &schedule.notifications {
                    let notif_key = format!(
                        "{}-{}-notif{}",
                        now.format("%Y-%m-%d"),
                        schedule.id,
                        notif.offset_minutes
                    );
                    let already_notified = state
                        .lock()
                        .map(|s| s.notified.contains(&notif_key))
                        .unwrap_or(true);
                    if already_notified {
                        continue;
                    }

                    // Calculate notification time
                    if let Some(notif_time) =
                        calc_offset_time(&schedule.time, -notif.offset_minutes)
                    {
                        if now_time.starts_with(&notif_time) {
                            let _ = app.emit(
                                "scheduler:notify",
                                serde_json::json!({
                                    "scheduleId": schedule.id,
                                    "minutesBefore": notif.offset_minutes,
                                }),
                            );
                            if let Ok(mut s) = state.lock() {
                                s.notified.insert(notif_key);
                            }
                        }
                    }
                }

                // Check playback trigger (match HH:MM:SS)
                let play_key = format!("{}-{}-play", now.format("%Y-%m-%d"), schedule.id);
                let already_triggered = state
                    .lock()
                    .map(|s| s.notified.contains(&play_key))
                    .unwrap_or(true);
                if already_triggered {
                    continue;
                }

                let should_play = NaiveTime::parse_from_str(&schedule.time, "%H:%M:%S")
                    .ok()
                    .and_then(|time| {
                        now.date_naive()
                            .and_time(time)
                            .and_local_timezone(Local)
                            .single()
                    })
                    .map(|target| target > check_from && target <= now)
                    .unwrap_or(false);

                if should_play {
                    activity_log::log_playback_running(Some(&schedule.id));
                    let _ = app.emit(
                        "scheduler:play",
                        serde_json::json!({
                            "scheduleId": schedule.id,
                        }),
                    );
                    if let Ok(mut s) = state.lock() {
                        s.notified.insert(play_key);
                    }
                }
            }
        }
    });
}

/// Subtract `offset_minutes` from a "HH:MM:SS" time string, return "HH:MM"
fn calc_offset_time(time_str: &str, offset_minutes: i64) -> Option<String> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() < 2 {
        return None;
    }
    let h: i64 = parts[0].parse().ok()?;
    let m: i64 = parts[1].parse().ok()?;
    let total = h * 60 + m + offset_minutes;
    let total = ((total % 1440) + 1440) % 1440; // wrap around
    Some(format!("{:02}:{:02}", total / 60, total % 60))
}
