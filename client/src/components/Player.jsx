import React, { useRef, useEffect, useState, useCallback } from 'react';
import './Player.css';

const PROGRESS_KEY = (videoId) => `hackix_time_${videoId}`;
const RESUME_THRESHOLD = 5; // seconds — only offer resume if > 5s in

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

function parseVTT(vttText) {
  const cues = [];
  const clean = vttText.replace(/^\s*WEBVTT\s*\n*/i, '');
  const blocks = clean.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timeMatch = lines[0].match(/([\d:.]+)\s*-->\s*([\d:.]+)/);
    if (!timeMatch) continue;
    const start = parseTime(timeMatch[1]);
    const end = parseTime(timeMatch[2]);
    const text = lines.slice(1).join('\n').trim();
    if (text) cues.push({ start, end, text });
  }
  return cues;
}

const LANG_LABELS = {
  es: 'Español', en: 'English', fr: 'Français', pt: 'Português',
  de: 'Deutsch', ja: '日本語', ko: '한국어', zh: '中文',
};

function Player({ videoId, title, subtitles, posterUrl, apiUrl, episodeIndex, episodeCount, onPrev, onNext }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentText, setCurrentText] = useState('');
  const [cues, setCues] = useState([]);
  const [delay, setDelay] = useState(0);
  const [selectedSub, setSelectedSub] = useState(null);
  const [availableSubs, setAvailableSubs] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const [savedTime, setSavedTime] = useState(null);
  const [showResume, setShowResume] = useState(false);
  const lastSaveRef = useRef(0);

  const streamUrl = `${apiUrl}/api/videos/${videoId}/stream`;

  // ── Load saved progress ────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY(videoId));
      if (raw) {
        const data = JSON.parse(raw);
        if (data.time > RESUME_THRESHOLD) {
          setSavedTime(data.time);
          setShowResume(true);
        }
      }
    } catch (_) {}
  }, [videoId]);

  // ── Save progress periodically ────────────────
  const saveProgress = useCallback((time) => {
    if (!time || time < 1) return;
    const now = Date.now();
    if (now - lastSaveRef.current < 3000) return;
    lastSaveRef.current = now;
    try {
      localStorage.setItem(PROGRESS_KEY(videoId), JSON.stringify({
        time,
        title,
        timestamp: now,
      }));
    } catch (_) {}
  }, [videoId, title]);

  // ── Clear progress ────────────────────────────
  const clearProgress = useCallback(() => {
    try { localStorage.removeItem(PROGRESS_KEY(videoId)); } catch (_) {}
    setSavedTime(null);
    setShowResume(false);
  }, [videoId]);

  const handleResume = useCallback(() => {
    if (videoRef.current && savedTime) {
      videoRef.current.currentTime = savedTime;
    }
    setShowResume(false);
  }, [savedTime]);

  const handleRestart = useCallback(() => {
    clearProgress();
  }, [clearProgress]);

  // ── Save on pause and before unmount ──────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPause = () => {
      if (video.currentTime > 1) {
        saveProgress(video.currentTime);
        lastSaveRef.current = Date.now();
      }
    };

    video.addEventListener('pause', onPause);
    return () => {
      if (video.currentTime > 1) {
        saveProgress(video.currentTime);
      }
      video.removeEventListener('pause', onPause);
    };
  }, [videoId, saveProgress]);

  useEffect(() => {
    if (subtitles && subtitles.length > 0) {
      setAvailableSubs(subtitles);
      setSelectedSub(subtitles[0]);
    } else {
      setAvailableSubs([]);
      setSelectedSub(null);
      setCues([]);
    }
  }, [subtitles]);

  useEffect(() => {
    if (!selectedSub) { setCues([]); return; }

    fetch(`${apiUrl}/api/subtitles/${selectedSub.id}`, { credentials: 'include' })
      .then(r => r.text())
      .then(text => setCues(parseVTT(text)))
      .catch(() => setCues([]));
  }, [selectedSub, apiUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setLoading(true);

    const onLoaded = () => setLoading(false);
    const onCanPlay = () => setLoading(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onError = () => setError('Error al cargar el video. Verifica tu conexión o intenta de nuevo.');

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);

    video.load();

    return () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
    };
  }, [videoId, retryCount]);

  const handleRetry = () => {
    setRetryCount(c => c + 1);
  };

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    // Periodic save
    if (video.currentTime > 1) {
      saveProgress(video.currentTime);
    }

    if (cues.length === 0) {
      setCurrentText('');
      return;
    }
    const t = video.currentTime - delay;
    const cue = cues.find(c => t >= c.start && t < c.end);
    setCurrentText(cue ? cue.text : '');
  }, [cues, delay, saveProgress]);

  const handleDelayChange = (e) => {
    setDelay(parseFloat(e.target.value));
  };

  const handleSubtitleChange = (e) => {
    const sub = availableSubs.find(s => s.id === e.target.value);
    setSelectedSub(sub || null);
  };

  const langLabel = (sub) => LANG_LABELS[sub.lang] || sub.lang || sub.name;

  return (
    <div className="player-container" ref={containerRef}>
      <h2 className="player-title">{title}</h2>
      <div className="player-wrapper">
        {error ? (
          <div className="player-error">
            <p>{error}</p>
            <button onClick={handleRetry} className="btn-retry">Reintentar</button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="player-loading">
                {posterUrl && (
                  <img src={posterUrl} alt="" className="loading-poster" crossOrigin="use-credentials" />
                )}
                <div className="loading-spinner">
                  <div className="spinner" />
                  <span>Cargando video...</span>
                </div>
              </div>
            )}
            <video
              key={`${videoId}-${retryCount}`}
              ref={videoRef}
              controls
              autoPlay
              playsInline
              preload="auto"
              crossOrigin="use-credentials"
              onTimeUpdate={handleTimeUpdate}
              className="video-element"
              style={{ display: loading ? 'none' : 'block' }}
            >
              <source src={streamUrl} type="video/mp4" />
            </video>

            {showResume && (
              <div className="resume-overlay">
                <div className="resume-dialog">
                  <p className="resume-title">¿Continuar reproducción?</p>
                  <p className="resume-hint">Dejaste de ver en {formatTime(savedTime)}</p>
                  <div className="resume-actions">
                    <button onClick={handleResume} className="btn-resume-primary">
                      Continuar
                    </button>
                    <button onClick={handleRestart} className="btn-resume-secondary">
                      Desde el principio
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {currentText && (
          <div className="subtitle-overlay">
            <span className="subtitle-text">{currentText}</span>
          </div>
        )}
      </div>

      {(onPrev || onNext) && (
        <div className="episode-nav">
          <button
            onClick={onPrev}
            disabled={!onPrev}
            className="btn-episode-nav"
            title={onPrev ? 'Capítulo anterior' : ''}
          >
            &larr; Anterior
          </button>
          <span className="episode-counter">
            {episodeIndex >= 0 ? `${episodeIndex + 1} de ${episodeCount}` : ''}
          </span>
          <button
            onClick={onNext}
            disabled={!onNext}
            className="btn-episode-nav"
            title={onNext ? 'Siguiente capítulo' : ''}
          >
            Siguiente &rarr;
          </button>
        </div>
      )}

      {availableSubs.length > 0 && (
        <div className="subtitle-controls">
          <div className="subtitle-control">
            <label>Subtítulos:</label>
            <select value={selectedSub?.id || ''} onChange={handleSubtitleChange}>
              <option value="">Desactivados</option>
              {availableSubs.map(s => (
                <option key={s.id} value={s.id}>{langLabel(s)}</option>
              ))}
            </select>
          </div>

          {selectedSub && (
            <div className="subtitle-control">
              <label>Sincronización: {delay > 0 ? '+' : ''}{delay.toFixed(2)}s</label>
              <input
                type="range"
                min="-60"
                max="60"
                step="0.05"
                value={delay}
                onChange={handleDelayChange}
                className="delay-slider"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Player;
