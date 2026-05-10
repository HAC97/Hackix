import React, { useRef, useEffect, useState } from 'react';
import './Player.css';

function Player({ videoId, title, apiUrl }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const streamUrl = `${apiUrl}/api/videos/${videoId}/stream`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setLoading(true);

    const onLoaded = () => setLoading(false);
    const onError = () => setError('Error al cargar el video. Verifica que el formato sea compatible (MP4, WebM).');

    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('error', onError);
    };
  }, [videoId]);

  return (
    <div className="player-container">
      <h2 className="player-title">{title}</h2>
      <div className="player-wrapper">
        {error && (
          <div className="player-error">
            <p>{error}</p>
          </div>
        )}
        {loading && <div className="player-loading">Cargando video...</div>}
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          autoPlay
          crossOrigin="use-credentials"
          className="video-element"
          style={{ display: loading ? 'none' : 'block' }}
        />
      </div>
    </div>
  );
}

export default Player;
