import React, { useRef, useEffect, useState, useCallback } from 'react';
import './Player.css';

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

function Player({ videoId, title, subtitles, apiUrl }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentText, setCurrentText] = useState('');
  const [cues, setCues] = useState([]);
  const [delay, setDelay] = useState(0);
  const [selectedSub, setSelectedSub] = useState(null);
  const [availableSubs, setAvailableSubs] = useState([]);

  const streamUrl = `${apiUrl}/api/videos/${videoId}/stream`;

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
    const onError = () => setError('Error al cargar el video.');
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);
    return () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
  }, [videoId]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || cues.length === 0) {
      setCurrentText('');
      return;
    }
    const t = videoRef.current.currentTime - delay;
    const cue = cues.find(c => t >= c.start && t < c.end);
    setCurrentText(cue ? cue.text : '');
  }, [cues, delay]);

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
        {error && <div className="player-error"><p>{error}</p></div>}
        {loading && <div className="player-loading">Cargando video...</div>}
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          autoPlay
          crossOrigin="use-credentials"
          onTimeUpdate={handleTimeUpdate}
          className="video-element"
          style={{ display: loading ? 'none' : 'block' }}
        />
        {currentText && (
          <div className="subtitle-overlay">
            <span className="subtitle-text">{currentText}</span>
          </div>
        )}
      </div>

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
