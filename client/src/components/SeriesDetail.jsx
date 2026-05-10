import React from 'react';
import './SeriesDetail.css';

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

function EpisodeCard({ entry, apiUrl, onSelect }) {
  return (
    <div className="episode-card" onClick={() => onSelect(entry)}>
      <div className="episode-thumbnail">
        {entry.image ? (
          <img
            src={`${apiUrl}/api/images/${entry.image.id}`}
            alt={entry.folderName}
            crossOrigin="use-credentials"
          />
        ) : (
          <div className="episode-placeholder">{getFileIcon(entry.video.mimeType)}</div>
        )}
        <div className="play-overlay">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#fff">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </div>
      </div>
      <div className="episode-info">
        <h4 className="episode-title" title={entry.folderName}>{entry.folderName}</h4>
        <span className="episode-meta">{formatSize(entry.video.size)}</span>
      </div>
    </div>
  );
}

function SeriesDetail({ series, apiUrl, onBack, onSelect }) {
  const seasons = {};
  series.episodes.forEach(ep => {
    if (!seasons[ep.season]) seasons[ep.season] = [];
    seasons[ep.season].push(ep);
  });

  const seasonEntries = Object.entries(seasons);

  return (
    <div className="series-detail">
      <button onClick={onBack} className="btn-back">&larr; Volver</button>

      <div className="series-header">
        {series.image ? (
          <img
            src={`${apiUrl}/api/images/${series.image.id}`}
            alt={series.name}
            className="series-poster"
            crossOrigin="use-credentials"
          />
        ) : (
          <div className="series-poster-placeholder">📺</div>
        )}
        <div className="series-header-info">
          <h2 className="series-detail-title">{series.name}</h2>
          <p className="series-detail-meta">
            {seasonEntries.length} temporadas · {series.episodes.length} capítulos
          </p>
        </div>
      </div>

      {seasonEntries.map(([seasonName, episodes]) => (
        <div key={seasonName} className="season-section">
          <h3 className="season-title">{seasonName}</h3>
          <div className="episode-grid">
            {episodes.map(ep => (
              <EpisodeCard key={ep.video.id} entry={ep} apiUrl={apiUrl} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SeriesDetail;
