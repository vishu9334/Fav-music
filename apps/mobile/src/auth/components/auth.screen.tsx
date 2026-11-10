import { colors } from '../../design/theme';
import { LoginIntro, ProfileIdentity } from './account-presentation';
import { ProfileEditor } from './profile-editor';
import React from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthModule } from '../auth.module';
import { AuthState } from '../controllers/auth.controller';
import { AuthLoadingScreen } from './auth-loading.screen';
import { GoogleSignInButton } from './google-signin.button';
import { AccountCollectionsPanel } from './account-collections.panel';
import { APP_WORDMARK } from '../../design/branding';

/** Screens only render controller state; credentials never enter React state. */
export class AuthScreen extends React.Component<Record<string, never>, AuthState> {
  private readonly controller = AuthModule.getController();
  private unsubscribe?: () => void;

  public constructor(props: Record<string, never>) {
    super(props);
    this.state = this.controller.getSnapshot();
  }
  public override componentDidMount(): void {
    this.unsubscribe = this.controller.subscribe(() => this.setState(this.controller.getSnapshot()));
    void this.controller.restore();
  }
  public override componentWillUnmount(): void {
    this.unsubscribe?.();
  }

  public override render(): React.JSX.Element {
    const { status, user, message } = this.state;
    return (
      <SafeAreaView style={styles.screen} edges={user ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}>
        {!user && (
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&q=80' }}
            style={styles.bgImage}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        )}
        {!user && <View style={styles.scrim} pointerEvents="none" />}
        {!user && (
          <View style={styles.top}>
            <Text style={styles.wordmark}>{APP_WORDMARK}</Text>
          </View>
        )}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {status === 'loading' || status === 'idle' ? (
            <AuthLoadingScreen />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={[styles.content, user && { justifyContent: 'flex-start' }]}
            >
              {status === 'authenticated' && user ? (
                <>
                  <ProfileIdentity displayName={user.displayName} email={user.email} avatarUrl={user.avatarUrl} />
                  <ProfileEditor user={user} />
                  <AccountCollectionsPanel userId={user.id} />
                  <Pressable
                    style={styles.secondaryButton}
                    accessibilityRole="button"
                    onPress={() => {
                      void this.controller.logout();
                    }}
                  >
                    <Text style={styles.secondaryText}>Sign out</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <LoginIntro />
                  {status === 'offline' ? <Text style={styles.notice}>You are offline.</Text> : null}
                  {message ? (
                    <Text style={styles.notice} accessibilityRole="alert">
                      {message}
                    </Text>
                  ) : null}
                  {AuthModule.isEnabled() ? (
                    <View style={styles.authActionBox}>
                      <GoogleSignInButton onPress={() => { void this.controller.login(); }} />
                    </View>
                  ) : (
                    <Text style={styles.notice} accessibilityRole="alert">
                      Account services are not available yet. Your existing local data is preserved. Please retry when secure setup is complete.
                    </Text>
                  )}
                  {status === 'error' || status === 'offline' ? (
                    <>
                      <Pressable
                        style={styles.secondaryButton}
                        accessibilityRole="button"
                        onPress={() => {
                          void this.controller.restore();
                        }}
                      >
                        <Text style={styles.secondaryText}>Retry connection</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.textButton}
                        onPress={() => {
                          void this.controller.logout();
                        }}
                      >
                        <Text style={styles.muted}>Sign out of this device</Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.18,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 4, 21, 0.62)',
  },
  top: {
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  wordmark: { color: colors.text, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 32,
    gap: 20,
    zIndex: 2,
  },
  authActionBox: { width: '100%', maxWidth: 320, gap: 12, alignItems: 'center', marginTop: 12 },
  secondaryButton: {
    width: '100%',
    backgroundColor: colors.glass,
    padding: 16,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  textButton: { padding: 12 },
  muted: { color: colors.muted, fontSize: 13 },
  notice: {
    color: colors.text,
    backgroundColor: colors.warningSurface,
    padding: 16,
    borderRadius: 16,
    textAlign: 'center',
    lineHeight: 21,
    width: '100%',
  },
});
