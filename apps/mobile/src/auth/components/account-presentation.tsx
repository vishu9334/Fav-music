import React from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { GlassSurface } from '../../design/GlassSurface';
import { colors } from '../../design/theme';
import { Button } from '../../design/controls';
import { ui } from '../../design/styles';
import { BrandLogo } from '../../design/BrandLogo';
import { APP_WORDMARK } from '../../design/branding';
import { UserIdCard } from './user-id.card';

/** Presentational account fragments. Clean music aesthetic with app icon and dark ambiance. */
export function LoginIntro(): React.JSX.Element {
  return (
    <View style={accountStyles.introContainer}>
      <View style={accountStyles.mark}>
        <BrandLogo size={96} />
      </View>
      <Text style={accountStyles.eyebrow}>{APP_WORDMARK}</Text>
      <Text accessibilityRole="header" style={accountStyles.title}>
        Your music
      </Text>
      <Text style={accountStyles.subtitle}>
        Feel the rhythm · Stream together in real time
      </Text>
    </View>
  );
}

export function ProfileIdentity({
  displayName,
  email,
  avatarUrl,
  review = false,
}: {
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
  review?: boolean;
}): React.JSX.Element {
  return (
    <View style={accountStyles.identity}>
      <View style={accountStyles.avatar}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={accountStyles.avatarImage}
            accessibilityLabel="Profile photo"
          />
        ) : (
          <Text style={accountStyles.initials}>
            {review ? '—' : displayName?.slice(0, 1).toUpperCase() || 'A'}
          </Text>
        )}
      </View>
      <Text style={accountStyles.eyebrow}>
        {review ? 'PROFILE LAYOUT · NO ACCOUNT LOADED' : 'YOUR ACCOUNT'}
      </Text>
      <Text accessibilityRole="header" style={accountStyles.title}>
        {displayName ?? 'Your account'}
      </Text>
      <Text style={accountStyles.subtitle}>
        {email ?? 'Sign-in required'}
      </Text>
      {review && (
        <GlassSurface style={accountStyles.card}>
          <Text style={ui.sectionTitle}>Layout review</Text>
          <Text style={ui.body}>
            Visual review only. No user, session or saved account data exists in this view.
          </Text>
        </GlassSurface>
      )}
    </View>
  );
}

export interface ProfileFieldsProps {
  name: string;
  persistent: boolean;
  reviewTyping?: boolean;
  disabled: boolean;
  busy: boolean;
  setName: (value: string) => void;
  toggle: () => void;
  save: () => void;
  avatarUrl?: string | null;
  onChangePhoto?: () => void;
  onRemovePhoto?: () => void;
  photoFeedback?: string | null;
  accountDetails?: {
    id: string;
    email: string;
    createdAt?: string;
  };
}

export function ProfileFields({
  name,
  persistent,
  disabled,
  busy,
  setName,
  toggle,
  save,
  reviewTyping = false,
  avatarUrl,
  onChangePhoto,
  onRemovePhoto,
  photoFeedback,
  accountDetails,
}: ProfileFieldsProps): React.JSX.Element {
  return (
    <View style={accountStyles.fields}>
      <Text style={ui.sectionTitle}>Profile & privacy</Text>

      {/* Profile Photo Management */}
      <View style={accountStyles.sectionBox}>
        <Text style={ui.subtitle}>Profile photo</Text>
        <View style={accountStyles.photoRow}>
          <View style={accountStyles.smallAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={accountStyles.smallAvatarImage} />
            ) : (
              <Text style={accountStyles.smallInitials}>
                {name?.slice(0, 1).toUpperCase() || 'A'}
              </Text>
            )}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            {onChangePhoto && (
              <Button
                title={avatarUrl ? 'Change photo' : 'Select photo'}
                secondary
                disabled={disabled || busy}
                onPress={onChangePhoto}
              />
            )}
            {avatarUrl && onRemovePhoto && (
              <Button
                title="Remove photo"
                secondary
                disabled={disabled || busy}
                onPress={onRemovePhoto}
              />
            )}
          </View>
        </View>
        {!!photoFeedback && (
          <Text style={accountStyles.photoFeedback} accessibilityLiveRegion="polite">
            {photoFeedback}
          </Text>
        )}
      </View>

      {/* Display Name Editing */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={ui.subtitle}>Display name</Text>
          <Text style={accountStyles.charCount}>{name.length}/80</Text>
        </View>
        <TextInput
          accessibilityLabel="Display name"
          value={name}
          maxLength={80}
          onChangeText={setName}
          editable={!busy && (!disabled || reviewTyping)}
          placeholder={disabled ? 'Editing unavailable' : 'Enter your name'}
          placeholderTextColor={colors.muted}
          style={ui.input}
        />
      </View>

      {/* Privacy Settings & Chat Retention */}
      <View style={accountStyles.sectionBox}>
        <Text style={ui.subtitle}>Chat privacy & history</Text>
        <Text style={ui.body}>
          {persistent
            ? 'Persistent history: Room messages with explicit consent are saved to account history.'
            : 'Session-only: Room messages stay in memory and are discarded after each session.'}
        </Text>
        <Text style={accountStyles.privacyHint}>Room consent required for persistent messages</Text>
        <Button
          title={persistent ? 'Use session-only chat history' : 'Choose persistent chat history'}
          secondary
          disabled={disabled || busy}
          onPress={toggle}
        />
      </View>

      {/* Account Info Details */}
      {accountDetails && (
        <View style={accountStyles.accountInfoCard}>
          <UserIdCard userId={accountDetails.id} />
          <Text style={accountStyles.accountInfoLabel}>Email</Text>
          <Text style={accountStyles.accountInfoValue}>{accountDetails.email}</Text>
          {accountDetails.createdAt && (
            <>
              <Text style={accountStyles.accountInfoLabel}>Member since</Text>
              <Text style={accountStyles.accountInfoValue}>
                {new Date(accountDetails.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
            </>
          )}
        </View>
      )}

      {/* Save Action */}
      <Button
        title={busy ? 'Saving…' : 'Save profile'}
        disabled={disabled || busy || !name.trim()}
        onPress={save}
      />
    </View>
  );
}

export const accountStyles = StyleSheet.create({
  introContainer: { width: '100%', alignItems: 'center', gap: 12, marginBottom: 8 },
  collageGrid: {
    width: 260,
    height: 140,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  collageCard: {
    width: 100,
    height: 60,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  collageImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  cardRotateLeft: { transform: [{ rotate: '-6deg' }] },
  cardRotateRight: { transform: [{ rotate: '4deg' }] },
  cardRotateDown: { transform: [{ rotate: '3deg' }] },
  cardRotateCenter: { transform: [{ rotate: '-4deg' }] },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(233,255,96,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,255,96,0.3)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  liveText: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  identity: { width: '100%', alignItems: 'center', gap: 18 },
  fields: { width: '100%', gap: 14 },
  mark: { alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 1.6,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.5,
    maxWidth: 340,
  },
  subtitle: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 21, maxWidth: 280 },
  privacy: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 6 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.darkAccent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 88, height: 88, borderRadius: 44, resizeMode: 'cover' },
  initials: { color: colors.text, fontSize: 38, fontWeight: '600' },
  smallAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.darkAccent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  smallAvatarImage: { width: 56, height: 56, borderRadius: 28, resizeMode: 'cover' },
  smallInitials: { color: colors.text, fontSize: 24, fontWeight: '600' },
  card: { padding: 24, width: '100%', gap: 10, marginVertical: 12 },
  sectionBox: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoFeedback: { color: colors.text, fontSize: 12, lineHeight: 16 },
  charCount: { color: colors.muted, fontSize: 11 },
  privacyHint: { color: colors.muted, fontSize: 12, fontStyle: 'italic' },
  accountInfoCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  accountInfoLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  accountInfoValue: { color: colors.text, fontSize: 13, fontWeight: '500' },
});
