import { FileText, Image, MessageCircle, Video, type LucideIcon } from 'lucide-react';
import type { PermissionForm } from './link-permissions';

/** What guests can add, in the order every screen lists it, with its icon (owner 2026-10-02). */
export const ADD_TYPES = [
  { name: 'photos', icon: Image },
  { name: 'videos', icon: Video },
  { name: 'documents', icon: FileText },
  { name: 'texts', icon: MessageCircle },
] as const satisfies readonly { name: keyof PermissionForm; icon: LucideIcon }[];

export type AddType = (typeof ADD_TYPES)[number]['name'];
