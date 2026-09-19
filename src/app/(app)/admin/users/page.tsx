import type { Metadata } from 'next';
import { UsersManager } from '@/components/admin/UsersManager';

export const metadata: Metadata = {
  title: 'Users — Admin — Archive Tracker',
};

export default function AdminUsersPage() {
  return <UsersManager />;
}
