import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ui } from '../../components/app/ui';
import { colors } from '../../design/theme';
import { Button } from '../../design/controls';
import type { AuthUser } from '../contracts/auth.contract';
import { AccountApiClient } from '../repositories/account-api.client';
import { AvatarApiClient } from '../repositories/avatar-api.client';
import { AuthModule } from '../auth.module';
import { ProfileFields } from './account-presentation';
import { CollectionScopeGuard } from '../../library/scope-guard';
import { useLibraryStore } from '../../store/useLibraryStore';
import {
  PRESET_AVATARS,
  validateAndOptimizeProfilePhoto,
} from '../services/profile-photo.service';

export function ProfileEditor({ user }: { user: AuthUser }): React.JSX.Element {
  const [name, setName] = useState(user.displayName);
  const [persistent, setPersistent] = useState(user.chatRetentionPreference === 'PERSISTENT_HISTORY');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState<string | null>(null);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [customPhotoInput, setCustomPhotoInput] = useState('');
  const [photoInputError, setPhotoInputError] = useState<string | null>(null);

  const avatarClient = React.useMemo(() => new AvatarApiClient(), []);

  useEffect(() => {
    setName(user.displayName);
    setPersistent(user.chatRetentionPreference === 'PERSISTENT_HISTORY');
    setMessage(null);
    setPhotoFeedback(null);
    setBusy(false);
  }, [user.id, user.displayName, user.chatRetentionPreference, user.avatarUrl]);

  const enabled = process.env.EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED === 'true';

  const handleApplyPhoto = async (photoUri: string | null) => {
    const controller = AuthModule.getController();
    const current = controller.getSnapshot().user;
    if (!current || current.id !== user.id) {
      setPhotoFeedback('Account verification required.');
      return;
    }

    if (photoUri === null) {
      // Local profile photo removal with immediate persistence
      setBusy(true);
      setPhotoFeedback('Removing photo…');
      try {
        await controller.updateUser({ avatarUrl: null });
        setPhotoFeedback('Photo removed.');
        setShowPhotoPicker(false);
        void avatarClient.removeAvatar(user.id).catch(() => {});
      } catch (error) {
        setPhotoFeedback(
          error instanceof Error ? error.message : 'Could not remove photo.'
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    const validation = validateAndOptimizeProfilePhoto(photoUri);
    if (!validation.valid || !validation.photo) {
      setPhotoInputError(validation.error ?? 'Invalid photo format.');
      return;
    }

    // Immediate local storage persistence & 0ms UI update
    setBusy(true);
    setPhotoFeedback('Saving photo…');
    try {
      await controller.updateUser({ avatarUrl: validation.photo.uri });
      setPhotoFeedback('Photo updated.');
      setShowPhotoPicker(false);
      setCustomPhotoInput('');
      setPhotoInputError(null);

      // Best-effort background cloud synchronization
      void avatarClient
        .uploadAvatar(user.id, validation.photo)
        .then((serverUrl) => {
          void controller.updateUser({ avatarUrl: serverUrl });
        })
        .catch(() => {});
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Could not save photo.';
      setPhotoInputError(errMsg);
      setPhotoFeedback(errMsg);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = () => {
    const normalizedName = name.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!normalizedName || normalizedName.length > 80 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
      setMessage('Name must be 1 to 80 characters.');
      return;
    }

    const guard = new CollectionScopeGuard(useLibraryStore.getState);
    setBusy(true);
    setMessage(null);

    const preference = persistent ? 'PERSISTENT_HISTORY' : 'EPHEMERAL_SESSION_ONLY';

    void guard
      .run(() =>
        new AccountApiClient().request<{ updateProfile: { id: string } }>(
          user.id,
          'mutation UpdateProfile($displayName:String!,$preference:ChatRetentionPreference!){updateProfile(displayName:$displayName,preference:$preference){id}}',
          { displayName: normalizedName, preference }
        )
      )
      .then(async (result) => {
        if (!guard.valid() || !result) return;
        if (result.updateProfile.id !== user.id) {
          throw new Error('Profile identity mismatch');
        }

        await AuthModule.getController().updateUser({
          displayName: normalizedName,
          chatRetentionPreference: preference,
        });

        if (guard.valid()) {
          setMessage('Profile saved.');
        }
      })
      .catch((error: unknown) => {
        if (guard.valid()) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Save failed. Please retry.'
          );
        }
      })
      .finally(() => {
        if (guard.valid()) setBusy(false);
      });
  };

  return (
    <View style={{ width: '100%', gap: 14 }}>
      <ProfileFields
        name={name}
        persistent={persistent}
        disabled={!enabled}
        busy={busy}
        setName={setName}
        toggle={() => setPersistent(!persistent)}
        save={handleSaveProfile}
        avatarUrl={user.avatarUrl}
        onChangePhoto={() => setShowPhotoPicker(true)}
        onRemovePhoto={() => void handleApplyPhoto(null)}
        photoFeedback={photoFeedback}
        accountDetails={{
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        }}
      />

      {!enabled && <Text style={ui.subtitle}>Offline mode</Text>}
      {!!message && (
        <Text style={[ui.body, { color: colors.text }]} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}

      {/* Photo Selection Modal */}
      <Modal
        visible={showPhotoPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close photo picker"
            onPress={() => setShowPhotoPicker(false)}
          />
          <View style={styles.modalContent}>
            <Text style={ui.sectionTitle}>Profile photo</Text>
            <Text style={ui.subtitle}>Select an avatar or enter an image URL</Text>

            {/* Presets */}
            <Text style={styles.presetHeading}>Avatars</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
              {PRESET_AVATARS.map((preset) => (
                <Pressable
                  key={preset.id}
                  style={styles.presetButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${preset.label} avatar`}
                  onPress={() => void handleApplyPhoto(preset.uri)}
                >
                  <Text style={styles.presetLabel}>{preset.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Custom URL or data input */}
            <Text style={styles.presetHeading}>Image URL or Path</Text>
            <TextInput
              accessibilityLabel="Image URL"
              value={customPhotoInput}
              onChangeText={(text) => {
                setCustomPhotoInput(text);
                setPhotoInputError(null);
              }}
              placeholder="https://... or file://..."
              placeholderTextColor={colors.muted}
              style={[ui.input, { width: '100%' }]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {!!photoInputError && (
              <Text style={styles.errorText} accessibilityRole="alert">
                {photoInputError}
              </Text>
            )}

            <View style={{ gap: 10, marginTop: 8, width: '100%' }}>
              <Button
                title="Apply photo"
                disabled={!customPhotoInput.trim() || busy}
                onPress={() => void handleApplyPhoto(customPhotoInput)}
              />
              <Button
                title="Cancel"
                secondary
                disabled={busy}
                onPress={() => {
                  setShowPhotoPicker(false);
                  setPhotoInputError(null);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.panel,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    gap: 12,
  },
  presetHeading: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 6,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
  },
  presetButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  presetLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
  },
});
