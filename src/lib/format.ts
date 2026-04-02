import { format, formatDistanceToNow } from 'date-fns';

export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

export function formatTimestamp(totalSeconds: number) {
  return `[${formatDuration(totalSeconds)}]`;
}

export function formatDateTime(isoDate: string) {
  return format(new Date(isoDate), 'MMM d, yyyy HH:mm');
}

export function formatRelativeTime(isoDate: string) {
  return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
}
