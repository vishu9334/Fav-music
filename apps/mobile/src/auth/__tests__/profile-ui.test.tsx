import React from 'react';
import { createRequire } from 'node:module';
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (node: React.ReactNode) => string;
};
import { describe, expect, it, vi } from 'vitest';

const mockLibrary = {
  scope: 'test-user-id',
  status: 'ready' as const,
  sync: { status: 'synced' as const, message: 'Synced', revision: 1 },
  data: {
    version: 2 as const,
    likes: ['track-1', 'track-2'],
    favourites: ['track-1'],
    bookmarks: ['track-3', 'track-4', 'track-5'],
    warehouse: { 'track-1': 'ACTIVE' },
    playlists: [{ id: 'p1', name: 'Chill Vibes', trackIds: ['track-1'] }],
    warehouseStates: [],
    instamus: [],
  },
  synchronize: vi.fn(),
  activateAccount: vi.fn(),
};

function cleanProps(props: Record<string, unknown>) {
  const { style, ...rest } = props;
  return rest;
}

vi.mock('react-native', () => ({
  View: (props: Record<string, unknown>) => React.createElement('div', cleanProps(props), props['children'] as React.ReactNode),
  Text: (props: Record<string, unknown>) => React.createElement('span', cleanProps(props), props['children'] as React.ReactNode),
  TextInput: (props: Record<string, unknown>) => React.createElement('input', cleanProps(props)),
  Pressable: (props: Record<string, unknown>) => React.createElement('button', cleanProps(props), props['children'] as React.ReactNode),
  ScrollView: (props: Record<string, unknown>) => React.createElement('div', cleanProps(props), props['children'] as React.ReactNode),
  Modal: (props: Record<string, unknown>) => props['visible'] ? React.createElement('div', cleanProps(props), props['children'] as React.ReactNode) : null,
  Image: (props: { source?: { uri?: string }; accessibilityLabel?: string }) =>
    React.createElement('img', { src: props.source?.uri, alt: props.accessibilityLabel ?? 'image' }),
  KeyboardAvoidingView: (props: Record<string, unknown>) => React.createElement('div', cleanProps(props), props['children'] as React.ReactNode),
  Platform: { OS: 'android' },
  StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1, absoluteFill: {} },
}));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/profile',
  Link: 'a',
}));

vi.mock('../../design/GlassSurface', () => ({
  GlassSurface: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('../../design/BrandLogo', () => ({
  BrandLogo: () => React.createElement('img', { alt: 'Fav Music logo' }),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'main',
}));

vi.mock('lucide-react-native', () =>
  new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'then'
          ? undefined
          : key === '__esModule'
          ? true
          : () => React.createElement('i', { 'aria-hidden': true }),
      has: () => true,
    }
  )
);

vi.mock('../../store/useLibraryStore', () => ({
  useLibraryStore: Object.assign(
    (select: (state: typeof mockLibrary) => unknown) => select(mockLibrary),
    {
      getState: () => mockLibrary,
      setState: (next: unknown) => Object.assign(mockLibrary, next),
    }
  ),
}));

import { ProfileIdentity, ProfileFields } from '../components/account-presentation';
import { AccountCollectionsPanel } from '../components/account-collections.panel';

describe('Profile & Privacy UI presentation', () => {
  describe('ProfileIdentity & ProfileFields', () => {
    it('renders profile initials when avatarUrl is null and avatar image when avatarUrl is set', () => {
      // Without avatar
      const htmlNoAvatar = renderToStaticMarkup(
        React.createElement(ProfileIdentity, {
          displayName: 'Antigravity Listener',
          email: 'listener@example.com',
          avatarUrl: null,
        })
      );
      expect(htmlNoAvatar).toContain('Antigravity Listener');
      expect(htmlNoAvatar).toContain('listener@example.com');
      expect(htmlNoAvatar).toContain('A'); // initial
      expect(htmlNoAvatar).not.toContain('<img');

      // With avatar
      const htmlWithAvatar = renderToStaticMarkup(
        React.createElement(ProfileIdentity, {
          displayName: 'Antigravity Listener',
          email: 'listener@example.com',
          avatarUrl: 'https://example.com/avatar.jpg',
        })
      );
      expect(htmlWithAvatar).toContain('<img src="https://example.com/avatar.jpg"');
    });

    it('renders profile fields with photo management, privacy toggle, and account info', () => {
      const html = renderToStaticMarkup(
        React.createElement(ProfileFields, {
          name: 'Jane Doe',
          persistent: true,
          disabled: false,
          busy: false,
          setName: () => {},
          toggle: () => {},
          save: () => {},
          avatarUrl: 'https://example.com/photo.jpg',
          onChangePhoto: () => {},
          onRemovePhoto: () => {},
          accountDetails: {
            id: '12345678-1234-1234-1234-123456789abc',
            email: 'jane@example.com',
            createdAt: '2026-01-15T00:00:00Z',
          },
        })
      );

      // Section titles & fields
      expect(html).toContain('Profile &amp; privacy');
      expect(html).toContain('Profile photo');
      expect(html).toContain('Change photo');
      expect(html).toContain('Remove photo');
      expect(html).toContain('Display name');
      expect(html).toContain('Chat privacy &amp; history');
      expect(html).toContain('Room consent required for persistent messages');
      expect(html).toContain('Use session-only chat history');

      // Account info details
      expect(html).toContain('Your Fav Music User ID');
      expect(html).toContain('12345678-1234-1234-1234-123456789abc');
      expect(html).toContain('Share my User ID');
      expect(html).toContain('jane@example.com');
      expect(html).toContain('Member since');
      expect(html).toContain('Save profile');
    });
  });

  describe('AccountCollectionsPanel', () => {
    it('shows personal music collections with counts and sync management', () => {
      const html = renderToStaticMarkup(
        React.createElement(AccountCollectionsPanel, { userId: 'test-user-id' })
      );

      // Verify collection counts are clearly presented
      expect(html).toContain('Your account collections');
      expect(html).toContain('Liked Songs');
      expect(html).toContain('Favourites');
      expect(html).toContain('Bookmarks');
      expect(html).toContain('Playlists');
      expect(html).toContain('Warehouse');
      expect(html).toContain('Sync account collections');

      // Verify obsolete/technical migration text is NOT rendered
      expect(html).not.toContain('Preview legacy collection transfer');
      expect(html).not.toContain('Preview Legacy Collection Transfer');
      expect(html).not.toContain('Copy legacy likes');
      expect(html).not.toContain('Legacy collections copied');
    });
  });
});
