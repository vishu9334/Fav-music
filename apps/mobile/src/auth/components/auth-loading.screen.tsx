import React from 'react';
import { colors } from '../../design/theme';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export class AuthLoadingScreen extends React.PureComponent<{ review?: boolean }> {
  public override render(): React.JSX.Element {
    return <View style={styles.container} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.title}>One moment</Text>
      <Text style={styles.subtitle}>{this.props.review ? 'Loading layout review · no connection attempted' : 'Connecting…'}</Text>
    </View>;
  }
}
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});
