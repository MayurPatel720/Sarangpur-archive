import type { Metadata } from 'next';
import { ListsManager } from '@/components/admin/ListsManager';

export const metadata: Metadata = {
  title: 'Lists — Admin — Archive Tracker',
};

export default function AdminListsPage() {
  return <ListsManager />;
}
