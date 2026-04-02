import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { HomePage } from '../pages/home/HomePage';
import { ImportPage } from '../pages/import/ImportPage';
import { MeetingDetailPage } from '../pages/meeting-detail/MeetingDetailPage';
import { MeetingsPage } from '../pages/meetings/MeetingsPage';
import { SettingsPage } from '../pages/settings/SettingsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
