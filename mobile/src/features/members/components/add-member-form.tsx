import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { InfoTip } from '@/components/ui/info-tip';
import { Input } from '@/components/ui/input';
import { AppScreen as Screen } from '@/components/app-screen';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/session-store';
import { ApiError } from '@/lib/api';
import { queryClient } from '@/lib/query-client';
import { createMember, type Member } from '../api';

export function AddMemberForm({
  onAdded,
  onCancel,
}: {
  onAdded: (member: Member) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const token = useSession((state) => state.token)!;
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const save = useMutation({
    mutationKey: ['addMember'],
    mutationFn: () =>
      createMember(token, { fullName: fullName.trim(), phone: phone.trim() }),
    onSuccess: async () => {
      if (useSession.getState().token === token)
        await queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });
  function submit() {
    if (save.isPending || !fullName.trim() || !phone.trim()) return;
    save.mutate(undefined, {
      onSuccess: ({ data }) => {
        if (useSession.getState().token === token) onAdded(data);
      },
    });
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
      >
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="title" accessibilityRole="header">
            {t('members.add')}
          </Text>
          <InfoTip text={t('members.noLogin')} />
        </View>
        <Input
          label={t('members.name')}
          value={fullName}
          onChangeText={setFullName}
          maxLength={120}
          editable={!save.isPending}
          autoComplete="name"
        />
        <Input
          label={t('members.phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder="03001234567"
          keyboardType="phone-pad"
          autoComplete="tel"
          latin
          maxLength={16}
          editable={!save.isPending}
        />
        {save.isError ? (
          <Text className="text-danger" accessibilityLiveRegion="polite">
            {t(
              save.error instanceof ApiError && save.error.status === 409
                ? 'members.duplicate'
                : save.error instanceof ApiError && save.error.status === 422
                  ? 'members.invalid'
                  : 'members.saveError',
            )}
          </Text>
        ) : null}
        <Button
          label={t('common.save')}
          loading={save.isPending}
          disabled={!fullName.trim() || !phone.trim()}
          onPress={submit}
        />
        <Button
          label={t('common.cancel')}
          variant="secondary"
          disabled={save.isPending}
          onPress={onCancel}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AddMemberModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={() => {
        if (!queryClient.isMutating({ mutationKey: ['addMember'] })) onClose();
      }}
    >
      <Screen onNavigate={onClose}>
        <View className="flex-1 p-screen" accessibilityViewIsModal>
          <AddMemberForm onAdded={onClose} onCancel={onClose} />
        </View>
      </Screen>
    </Modal>
  );
}
