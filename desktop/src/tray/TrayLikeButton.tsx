import {Heart} from 'lucide-react';
import i18n from '../i18n';
import {sendCmd} from './state';

export function TrayLikeButton({liked}: {liked: boolean}) {
  return (
    <button
      type="button"
      onClick={() => sendCmd('like')}
      className={`tp-icon-btn ${liked ? 'is-like' : ''}`}
      title={liked ? i18n.t('track.unlike') : i18n.t('track.like')}
    >
      <Heart size={16} fill={liked ? 'currentColor' : 'none'} strokeWidth={2}/>
    </button>
  );
}
