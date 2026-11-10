import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from '../../lib/icons';
import { setTrackLiked } from '../../lib/like-toggle';
import { setLikedUrn, useLiked } from '../../lib/likes';
import type { Track } from '../../stores/player';

export const LikeButton = React.memo(function LikeButton({
  track,
  variant = 'inline',
  position = 'top-2 left-2',
}: {
  track: Track;
  variant?: 'overlay' | 'inline';
  position?: string;
}) {
  const { t } = useTranslation();
  const liked = useLiked(track.urn);
  const label = liked ? t('track.unlike') : t('track.like');
  const title = label;

  // Seed from API data when available
  useEffect(() => {
    if (track.user_favorite) setLikedUrn(track.urn, true);
  }, [track.urn, track.user_favorite]);
  const qc = useQueryClient();

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    void setTrackLiked(qc, track, !liked);
  };
  const heart = (
    <Heart size={14} fill={liked ? 'currentColor' : 'none'} strokeWidth={2} />
  );

  if (variant === 'overlay') {
    return (
      <span data-scheme="dark" className={`absolute ${position} flex`}>
        <button
          data-ui="like-button"
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={liked}
          title={title}
          className={`cursor-pointer w-8 h-8 rounded-full flex items-center justify-center group-hover:opacity-100 group-hover:backdrop-blur-md focus-visible:opacity-100 focus-visible:backdrop-blur-md transition-all duration-200 ${
            liked ? 'opacity-100 backdrop-blur-md' : 'opacity-0'
          } ${
            liked
              ? 'bg-accent/80 text-accent-contrast'
              : 'bg-black/50 text-ink-80 hover:text-white hover:bg-black/70'
          }`}
        >
          {heart}
        </button>
      </span>
    );
  }

  return (
    <button
      data-ui="like-button"
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={liked}
      title={title}
      className={`cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-200 shrink-0 ${
        liked ? 'opacity-100' : 'opacity-0'
      } ${liked ? 'text-accent' : 'text-ink-20 hover:text-ink-50'}`}
    >
      {heart}
    </button>
  );
});
