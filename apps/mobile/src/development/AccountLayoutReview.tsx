import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../design/controls';
import { ui } from '../design/styles';
import { GlassSurface } from '../design/GlassSurface';
import { LoginIntro, ProfileIdentity, ProfileFields } from '../auth/components/account-presentation';
import { GoogleSignInButton } from '../auth/components/google-signin.button';
import { AuthLoadingScreen } from '../auth/components/auth-loading.screen';
const unavailable = () => {};
/** Layout state only; no AuthUser/AuthState, session repository, user store or network dependency. */
export function AccountLayoutReview({ page }: { page: 'login' | 'profile' | 'loading' }): React.JSX.Element {
  const [draft, setDraft] = useState('');
  if (page === 'login') return <View style={{ alignItems: 'center', gap: 18 }}><LoginIntro /><GoogleSignInButton disabled onPress={unavailable} /><Text style={ui.subtitle}>Google Sign-In is disabled in visual review. Use the real Login screen after secure account setup.</Text></View>;
  if (page === 'loading') return <View style={{ minHeight: 220 }}><AuthLoadingScreen review /></View>;
  return <><ProfileIdentity review /><Text style={ui.subtitle}>Keyboard test: draft text stays in memory and is cleared when leaving this view. It never becomes an account identity.</Text><ProfileFields name={draft} persistent={false} disabled reviewTyping busy={false} setName={setDraft} toggle={unavailable} save={unavailable} /><GlassSurface style={{ padding: 20, gap: 12 }}><Text style={ui.sectionTitle}>Account collections</Text><Text style={ui.body}>Playlists, favourites, bookmarks, Warehouse and cloud synchronization require a real account. No saved records are displayed.</Text></GlassSurface><Button title="Sign out (requires real account)" disabled onPress={unavailable} /></>;
}
