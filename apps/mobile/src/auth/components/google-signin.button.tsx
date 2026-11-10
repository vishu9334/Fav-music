import { colors } from '../../design/theme';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props { readonly onPress: () => void; readonly disabled?: boolean }

/** Modern Google branded button for authentication */
export class GoogleSignInButton extends React.Component<Props> {
  public override render(): React.JSX.Element {
    return (
      <View style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign up with Google"
          disabled={this.props.disabled}
          onPress={this.props.onPress}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            this.props.disabled && styles.buttonDisabled,
          ]}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.googleLetter}>G</Text>
          </View>
          <Text style={styles.buttonText}>Sign up with Google</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 320,
    marginTop: 12,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: '100%',
    minHeight: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F3F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleLetter: {
    color: '#4285F4',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 20,
  },
  buttonText: {
    color: '#040415',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  notice: { color: colors.text, textAlign: 'center', lineHeight: 22 },
});
