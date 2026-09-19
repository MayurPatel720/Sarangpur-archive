import type { Metadata } from 'next';
import { SettingsForm } from '@/components/admin/SettingsForm';

export const metadata: Metadata = {
  title: 'Settings — Admin — Archive Tracker',
};

export default function AdminSettingsPage() {
  return <SettingsForm />;
}
