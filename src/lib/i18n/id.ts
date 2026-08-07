export interface DayNames { 1: string; 2: string; 3: string; 4: string; 5: string; 6: string; 7: string; fullName: { 1: string; 2: string; 3: string; 4: string; 5: string; 6: string; 7: string }; }

export interface ActivityLogTranslations {
  title: string;
  filterAll: string;
  filterSchedule: string;
  filterVoice: string;
  filterPlayback: string;
  refresh: string;
  openFolder: string;
  clear: string;
  confirmClear: string;
  empty: string;
  scheduleCreate: string;
  scheduleUpdate: string;
  scheduleDelete: string;
  voiceGenerate: string;
  voiceDelete: string;
  voicePlay: string;
  playbackRunning: string;
  playbackPaused: string;
  playbackStopped: string;
}

export interface UpdateTranslations {
  currentVersion: string;
  checkForUpdates: string;
  checking: string;
  upToDate: string;
  available: string;
  releaseNotes: string;
  downloadAndInstall: string;
  downloading: string;
  installing: string;
  restartRequired: string;
  restartNow: string;
  failed: string;
}

export interface Translations {
  app: { name: string, longName: string };
  nav: { schedules: string; audio: string; miniPlayer: string };
  schedule: { title: string; name: string; namePlaceholder: string; addSchedule: string; noSchedules: string; time: string; activeDays: string; enabled: string; statusEnabled: string; statusDisabled: string; totalDuration: string; notifications: string; addNotification: string; minutesBefore: string; deleteConfirm: string; hours: string; minutes: string; seconds: string; loopCount: string; loopForever: string };
  media: { title: string; addMedia: string; defaultMedia: string; defaultMediaDescription: string; loopCount: string; volume: string; fileMissing: string; noMedia: string; deleteConfirm: string; loopForever: string };
  settings: { title: string; theme: string; themeLight: string; themeDark: string; themeAuto: string; language: string; runOnStartup: string; apiKey: string; apiKeyPlaceholder: string; apiKeyHint: string; testConnection: string; testSuccess: string; testFailed: string; audioFolder: string; audioFolderHint: string; browse: string; activityLog: ActivityLogTranslations; update: UpdateTranslations };
  actions: { save: string; revert: string; close: string; edit: string; delete: string; add: string; play: string; cancel: string; confirm: string; moveUp: string; moveDown: string; generate: string; download: string; openFolder: string; stop: string };
  tts: { title: string; name: string; namePlaceholder: string; generateAudio: string; credits: string; creditsRemaining: string; connectionOnline: string; connectionOffline: string; text: string; textPlaceholder: string; charLimit: string; voice: string; voicePlaceholder: string; model: string; modelPlaceholder: string; language: string; speed: string; speedHint: string; stability: string; stabilityHint: string; similarity: string; similarityHint: string; generating: string; completed: string; failed: string; noHistory: string; deleteConfirm: string; downloadSuccess: string; downloadFailed: string; offline: string; sync: string; syncing: string };
  days: DayNames;
  unsaved: { title: string; message: string; save: string; discard: string; cancel: string };
  playback: { nowPlaying: string; paused: string; pause: string; resume: string; stop: string; reset: string; loop: string };
  status: { active: string; paused: string };
}

export const id: Translations = {
  app: { name: 'SIPUTAR', longName: 'Sistem Informasi Pemutaran Terjadwal' },
  nav: { schedules: 'Daftar Jadwal', audio: 'Buat Audio', miniPlayer: 'Mini Player' },
  schedule: {
    title: 'Jadwal',
    name: 'Nama Jadwal',
    namePlaceholder: 'Masukkan nama jadwal',
    addSchedule: 'Tambah Jadwal',
    noSchedules: 'Belum ada jadwal. Klik tombol + untuk menambahkan.',
    time: 'Waktu',
    activeDays: 'Hari Aktif',
    enabled: 'Aktif',
    statusEnabled: 'Klik untuk menjeda pemutaran otomatis',
    statusDisabled: 'Klik untuk menyalakan pemutaran otomatis',
    totalDuration: 'Total Durasi',
    notifications: 'Notifikasi',
    addNotification: 'Tambah Notifikasi',
    minutesBefore: 'menit sebelumnya',
    deleteConfirm: 'Hapus jadwal ini beserta semua medianya?',
    hours: 'Jam',
    minutes: 'Menit',
    seconds: 'Detik',
    loopCount: 'Ulangi Jadwal',
    loopForever: 'Ulangi terus',
  },
  media: {
    title: 'Media',
    addMedia: 'Tambah Media',
    defaultMedia: 'Ringtone Default',
    defaultMediaDescription: 'Tekan play untuk mencoba suara, tekan tambah untuk menambahkan media ini ke jadwal:',
    loopCount: 'Jumlah Pengulangan',
    volume: 'Volume',
    fileMissing: 'File tidak ditemukan',
    noMedia: 'Belum ada media',
    deleteConfirm: 'Hapus media ini dari jadwal?',
    loopForever: 'Loop terus',
  },
  settings: {
    title: 'Pengaturan',
    theme: 'Tema',
    themeLight: 'Terang',
    themeDark: 'Gelap',
    themeAuto: 'Sistem',
    language: 'Bahasa',
    runOnStartup: 'Jalankan saat komputer menyala',
    apiKey: 'API Key ElevenLabs',
    apiKeyPlaceholder: 'Masukkan API key',
    apiKeyHint: 'Dapatkan API key dari elevenlabs.io/app/settings/api-keys',
    testConnection: 'Tes Koneksi',
    testSuccess: 'Koneksi berhasil!',
    testFailed: 'Koneksi gagal',
    audioFolder: 'Folder Audio TTS',
    audioFolderHint: 'Lokasi penyimpanan file audio yang dihasilkan',
    browse: 'Pilih Folder',
    activityLog: {
      title: 'Log Aktivitas',
      filterAll: 'Semua',
      filterSchedule: 'Jadwal',
      filterVoice: 'Suara',
      filterPlayback: 'Pemutaran',
      refresh: 'Refresh',
      openFolder: 'Buka Folder',
      clear: 'Hapus',
      confirmClear: 'Hapus semua log aktivitas?',
      empty: 'Belum ada aktivitas tercatat',
      scheduleCreate: 'Jadwal dibuat',
      scheduleUpdate: 'Jadwal diperbarui',
      scheduleDelete: 'Jadwal dihapus',
      voiceGenerate: 'Audio dibuat',
      voiceDelete: 'Audio dihapus',
      voicePlay: 'Audio diputar',
      playbackRunning: 'Pemutaran dimulai',
      playbackPaused: 'Pemutaran dijeda',
      playbackStopped: 'Pemutaran dihentikan',
    },
    update: {
      currentVersion: 'Versi Saat Ini',
      checkForUpdates: 'Periksa Pembaruan',
      checking: 'Memeriksa...',
      upToDate: 'Anda sudah menggunakan versi terbaru!',
      available: 'Pembaruan tersedia',
      releaseNotes: 'Catatan rilis',
      downloadAndInstall: 'Unduh & Pasang',
      downloading: 'Mengunduh...',
      installing: 'Memasang...',
      restartRequired: 'Mulai ulang untuk menyelesaikan pembaruan',
      restartNow: 'Mulai Ulang Sekarang',
      failed: 'Gagal memeriksa pembaruan',
    },
  },
  actions: {
    save: 'Simpan Perubahan',
    revert: 'Batal',
    close: 'Tutup',
    edit: 'Edit',
    delete: 'Hapus',
    play: 'Putar Sekarang',
    add: 'Tambah',
    cancel: 'Batal',
    confirm: 'Konfirmasi',
    moveUp: 'Pindah ke atas',
    moveDown: 'Pindah ke bawah',
    generate: 'Buat Audio',
    download: 'Unduh',
    openFolder: 'Buka Folder',
    stop: 'Berhenti',
  },
  tts: {
    title: 'Text-to-Speech',
    name: 'Nama Audio',
    namePlaceholder: 'Masukkan nama untuk audio ini',
    generateAudio: 'Buat Audio Baru',
    credits: 'Kredit',
    creditsRemaining: 'karakter tersisa',
    connectionOnline: 'Online - dapat generate audio',
    connectionOffline: 'Offline - hanya dapat memutar file lokal',
    text: 'Teks',
    textPlaceholder: 'Masukkan teks yang ingin diubah menjadi audio...',
    charLimit: 'karakter',
    voice: 'Suara',
    voicePlaceholder: 'Pilih suara',
    model: 'Model',
    modelPlaceholder: 'Pilih model',
    language: 'Bahasa',
    speed: 'Kecepatan',
    speedHint: 'Kecepatan bicara (0.25 - 4.0)',
    stability: 'Stabilitas',
    stabilityHint: 'Nilai tinggi = lebih konsisten, nilai rendah = lebih ekspresif',
    similarity: 'Kesamaan Suara',
    similarityHint: 'Seberapa mirip dengan suara asli',
    generating: 'Sedang membuat...',
    completed: 'Selesai',
    failed: 'Gagal',
    noHistory: 'Belum ada riwayat audio',
    deleteConfirm: 'Hapus audio ini?',
    downloadSuccess: 'Audio berhasil diunduh',
    downloadFailed: 'Gagal mengunduh audio',
    offline: 'Mode offline - hanya dapat memutar file lokal',
    sync: 'Sinkronkan',
    syncing: 'Menyinkronkan...',
  },
  days: {
    1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab', 7: 'Min',
    fullName: { 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu', 7: 'Minggu' },
  },
  unsaved: {
    title: 'Perubahan belum disimpan',
    message: 'Apakah Anda ingin menyimpan perubahan sebelum keluar?',
    save: 'Simpan & Tutup',
    discard: 'Buang Perubahan',
    cancel: 'Batal',
  },
  playback: {
    nowPlaying: 'Sedang diputar',
    paused: 'Dijeda',
    pause: 'Jeda',
    resume: 'Lanjutkan',
    stop: 'Hentikan',
    reset: 'Mulai Ulang',
    loop: 'Putar Ulang',
  },
  status: {
    active: 'Aktif',
    paused: 'Dijeda',
  },
};
