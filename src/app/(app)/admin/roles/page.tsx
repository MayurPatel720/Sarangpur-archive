import type { Metadata } from 'next';
import { RolesManager } from '@/components/admin/RolesManager';

export const metadata: Metadata = {
  title: 'Roles — Admin — Archive Tracker',
};

export default function AdminRolesPage() {
  return <RolesManager />;
}
