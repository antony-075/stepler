import type { GuestLinkPermissions } from '@stepler/contracts';
import { describe, expect, it } from 'vitest';
import { acceptFor, primaryContribution } from './contribute-actions';

const none: GuestLinkPermissions = {
  canUploadPhotos: false,
  canUploadVideos: false,
  canUploadDocuments: false,
  canSubmitText: false,
  canViewGallery: false,
  canDeleteOwn: false,
};

describe('primaryContribution', () => {
  it('files when any upload kind is allowed', () => {
    expect(primaryContribution({ ...none, canUploadVideos: true, canSubmitText: true })).toBe(
      'files',
    );
  });
  it('a text-only link makes the wish the main action', () => {
    expect(primaryContribution({ ...none, canSubmitText: true })).toBe('text');
  });
  it('a view-only link has none', () => {
    expect(primaryContribution({ ...none, canViewGallery: true })).toBeNull();
  });
});

describe('acceptFor', () => {
  it('offers only the kinds the link takes', () => {
    const videos = acceptFor({ ...none, canUploadVideos: true });
    expect(videos).toBe('video/mp4,video/quicktime,video/webm');
    expect(videos).not.toContain('image/*');
    expect(acceptFor({ ...none, canUploadPhotos: true, canUploadDocuments: true })).toBe(
      'image/*,.heic,.heif,.pdf,.docx,.xlsx,.pptx,.txt',
    );
    expect(acceptFor({ ...none, canSubmitText: true })).toBe('');
  });
});
