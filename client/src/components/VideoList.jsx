import React from 'react';
import './VideoList.css';

function formatSize(bytes) {
  if (!bytes) return '--';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function getFileIcon(mimeType) {
  if (mimeType?.includes('mp4')) return '🎬';
  if (mimeType?.includes('webm')) return '🌐';
  if (mimeType?.includes('ogg')) return '🎵';
  if (mimeType?.includes('quicktime')) return '🍎';
  return '📹';
}

function MovieCard({ entry, apiUrl, onSelect }) {
  return (
    <div className="video-card" onClick={() => onSelect(entry)}>
      <div className="card-thumbnail">
        {entry.image ? (
          <img
            src={`${apiUrl}/api/images/${entry.image.id}`}
            alt={entry.folderName}
            crossOrigin="use-credentials"
          />
        ) : (
          <div className="card-placeholder">{getFileIcon(entry.video.mimeType)}</div>
        )}
        <div className="play-overlay">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="#fff">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </div>
      </div>
      <div className="card-info">
        <h3 className="card-title" title={entry.folderName}>{entry.folderName}</h3>
        <div className="card-meta">
          <span>{formatSize(entry.video.size)}</span>
          <span>{entry.video.year || '----'}</span>
        </div>
      </div>
    </div>
  );
}

function SeriesCard({ series, apiUrl, onSelect }) {
  return (
    <div className="video-card series-card" onClick={() => onSelect(series)}>
      <div className="card-thumbnail">
        {series.image ? (
          <img
            src={`${apiUrl}/api/images/${series.image.id}`}
            alt={series.name}
            crossOrigin="use-credentials"
          />
        ) : (
          <div className="card-placeholder">📺</div>
        )}
        <div className="series-badge">{series.episodes.length} capítulos</div>
        <div className="play-overlay">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="#fff">
            <polygon points="9,3 23,12 9,21" />
          </svg>
        </div>
      </div>
      <div className="card-info">
        <h3 className="card-title" title={series.name}>{series.name}</h3>
        <div className="card-meta">
          <span>{series.episodes.length} capítulos</span>
          <span>{new Set(series.episodes.map(e => e.season)).size} temporadas</span>
        </div>
      </div>
    </div>
  );
}

function VideoList({ movies, seriesList, apiUrl, onSelectMovie, onSelectSeries }) {
  const totalItems = movies.length + seriesList.length;

  if (totalItems === 0) {
    return (
      <div className="empty-state">
        <p>No se encontraron carpetas con videos en Hackix.</p>
        <p className="hint">
          Estructura esperada en tu Drive:<br />
          Hackix/ &rarr; Peliculas/ &rarr; [Nombre]/ &rarr; video + portada<br />
          Hackix/ &rarr; Series/ &rarr; [Serie]/ &rarr; [Temporada]/ &rarr; [Capitulo]/ &rarr; video + portada
        </p>
      </div>
    );
  }

  return (
    <div className="video-sections">
      {movies.length > 0 && (
        <div className="video-section">
          <h2 className="section-title">Películas</h2>
          <div className="video-grid">
            {movies.map(entry => (
              <MovieCard key={entry.video.id} entry={entry} apiUrl={apiUrl} onSelect={onSelectMovie} />
            ))}
          </div>
        </div>
      )}

      {seriesList.length > 0 && (
        <div className="video-section">
          <h2 className="section-title">Series</h2>
          <div className="video-grid">
            {seriesList.map(series => (
              <SeriesCard key={series.name} series={series} apiUrl={apiUrl} onSelect={onSelectSeries} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default VideoList;
