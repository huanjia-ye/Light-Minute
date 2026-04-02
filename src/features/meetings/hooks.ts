import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AudioImportProgress,
  createMeeting,
  getMeetingById,
  getMeetings,
  importAudioAsMeeting,
  updateMeetingSummary,
} from './api';
import type { MeetingSummary } from '../../types/meeting';
import type { AppSettings } from '../../types/settings';

interface ImportAudioMutationInput {
  file: File;
  onStageChange?: (progress: AudioImportProgress) => void;
}

export function useMeetingsQuery() {
  return useQuery({
    queryKey: ['meetings'],
    queryFn: getMeetings,
  });
}

export function useMeetingQuery(meetingId: string | undefined) {
  return useQuery({
    queryKey: ['meetings', meetingId],
    queryFn: () => getMeetingById(meetingId ?? ''),
    enabled: Boolean(meetingId),
  });
}

export function useCreateMeetingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMeeting,
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.setQueryData(['meetings', meeting.id], meeting);
    },
  });
}

export function useUpdateSummaryMutation(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (summary: MeetingSummary) => updateMeetingSummary(meetingId, summary),
    onSuccess: (meeting) => {
      if (!meeting) {
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.setQueryData(['meetings', meetingId], meeting);
    },
  });
}

export function useImportAudioMutation(settings: AppSettings) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, onStageChange }: ImportAudioMutationInput) =>
      importAudioAsMeeting(file, settings, { onStageChange }),
    onSuccess: (meeting) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.setQueryData(['meetings', meeting.id], meeting);
    },
  });
}
