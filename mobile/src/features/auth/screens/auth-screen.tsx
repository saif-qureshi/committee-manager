import { theme } from '@/theme';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';
import { LanguageSwitch } from '@/components/language-switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { authErrorKey, useAuthenticate } from '../use-auth';

export default function AuthScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const auth = useAuthenticate();
  const registering = mode === 'register';
  function submit() {
    if (auth.isPending) return;
    setValidation(null);
    if (!identifier.trim() || !password || (registering && !fullName.trim()))
      return setValidation('auth.required');
    if (registering && (password.length < 8 || password.length > 32))
      return setValidation('auth.passwordLength');
    if (registering && password !== confirmation)
      return setValidation('auth.passwordMismatch');
    auth.mutate({
      mode,
      identifier: identifier.trim(),
      password,
      fullName: fullName.trim(),
      passwordConfirmation: confirmation,
    });
  }
  const error = validation ?? (auth.isError ? authErrorKey(auth.error) : null);
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingVertical: 24,
            paddingHorizontal: theme.spacing.screen,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-12 flex-row items-center justify-between gap-3">
            <Brand />
            <LanguageSwitch />
          </View>
          <View className="mb-8 gap-3">
            <Text
              variant="title"
              style={{ fontSize: 26 }}
              accessibilityRole="header"
            >
              {t(registering ? 'auth.registerHeading' : 'auth.heading')}
            </Text>
            <Text className="text-muted">
              {t(registering ? 'auth.registerDescription' : 'auth.description')}
            </Text>
          </View>
          <View className="gap-5">
            {registering ? (
              <Input
                label={t('auth.fullName')}
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
                textContentType="name"
                editable={!auth.isPending}
              />
            ) : null}
            <Input
              label={t('auth.identifier')}
              placeholder={t('auth.identifierPlaceholder')}
              value={identifier}
              onChangeText={setIdentifier}
              latin
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              editable={!auth.isPending}
            />
            <Input
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secret
              latin
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={registering ? 'new-password' : 'current-password'}
              textContentType={registering ? 'newPassword' : 'password'}
              returnKeyType={registering ? 'next' : 'go'}
              onSubmitEditing={registering ? undefined : submit}
              editable={!auth.isPending}
            />
            {registering ? (
              <Input
                label={t('auth.confirmPassword')}
                value={confirmation}
                onChangeText={setConfirmation}
                secret
                latin
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submit}
                editable={!auth.isPending}
              />
            ) : null}
            {error ? (
              <View
                accessibilityLiveRegion="polite"
                className="rounded-control bg-dangerSoft p-4"
              >
                <Text variant="caption" className="text-danger">
                  {t(error)}
                </Text>
              </View>
            ) : null}
            <Button
              label={t(registering ? 'auth.createAccount' : 'auth.signIn')}
              loading={auth.isPending}
              onPress={submit}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={auth.isPending}
            className="min-h-[52px] items-center justify-center py-4"
            onPress={() => {
              setMode(registering ? 'signIn' : 'register');
              setValidation(null);
              setPassword('');
              setConfirmation('');
              auth.reset();
            }}
          >
            <Text
              variant="caption"
              className="text-brand"
              style={{ textAlign: 'center' }}
            >
              {t(registering ? 'auth.haveAccount' : 'auth.newAccount')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
