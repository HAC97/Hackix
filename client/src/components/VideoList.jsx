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

function VideoList({ entries, apiUrl, onSelect }) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <p>No se encontraron carpetas con videos en Hackix.</p>
        <p className="hint">
          Estructura esperada en tu Drive:<br />
          Hatrix/ &rarr; [Nombre de la carpeta]/ &rarr; video + imagen de portada
        </p>
      </div>
    );
  }

  return (
    <div className="video-grid">
      {entries.map((entry) => (
        <div key={entry.video.id} className="video-card" onClick={() => onSelect(entry)}>
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
              <span>{entry.video.name}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default VideoList;
