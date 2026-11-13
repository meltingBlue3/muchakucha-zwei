import { useTranslation } from '../../i18n';
import { useRef, useState } from 'react';
import { TextInput, Pressable, View } from 'react-native';
import type { AssistantProtocol, AssistantProviderResponseDto } from '@muchakucha/api-client';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { Button, FormActions, Inline, PasswordField, Stack, Text, TextField } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { assistantErrorKey, transcriptionErrorKey, type AssistantErrorKey } from './assistant-runtime';

export interface AssistantProviderInput {
  name: string;
  protocol: AssistantProtocol;
  baseUrl: string;
  model: string;
  visibility: 'private' | 'household';
  apiKey?: string;
}

export function AssistantChoice<T extends string>({ label, options, value, onChange, disabled = false }: {
  label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <Stack gap={2}><Text variant="label">{label}</Text><View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
      accessibilityState={{ checked: option.value === value, disabled }} aria-checked={option.value === value} disabled={disabled}
      onPress={() => onChange(option.value)}
      style={({ pressed }) => ({ flexGrow: 1, minHeight: theme.controlSizes.touchTarget, justifyContent: 'center', padding: theme.spacing[3], borderRadius: theme.borderRadii.md, borderWidth: theme.borderWidths.default, borderColor: option.value === value ? theme.colors.primary : theme.colors.separator, backgroundColor: pressed ? theme.colors.surfaceMuted : option.value === value ? theme.colors.surfaceSelected : theme.colors.surface })}>
      <Text variant="label" color={option.value === value ? 'link' : 'inkMuted'}>{option.value === value ? '✓ ' : ''}{option.label}</Text>
    </Pressable>)}
  </View></Stack>;
}

type CheckResult = { key: string } & (
  { status: 'checking' } | { status: 'ok' | 'warning' | 'failed'; message: AssistantErrorKey | 'form.asrOk' | 'form.toolsOk' | 'form.toolsMissing' }
);

// Voice transcription currently means Alibaba Cloud Bailian's Qwen-ASR through its OpenAI-compatible address.
const QWEN_ASR_MODEL = 'qwen3-asr-flash';
const defaultUrls: Record<AssistantProtocol, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  'qwen-asr': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
};

export function AssistantProviderForm({ initial, busy, onSubmit, onCancel, onCheck }: {
  initial?: AssistantProviderResponseDto; busy: boolean; onSubmit: (input: AssistantProviderInput) => Promise<void>; onCancel: () => void;
  onCheck?: (input: AssistantProviderInput) => Promise<{ toolCalling: boolean; transcription?: boolean }>;
}) {
  const { t } = useTranslation(['assistant', 'common']);
  const [name, setName] = useState(initial?.name ?? '');
  const [protocol, setProtocol] = useState<AssistantProtocol>(initial?.protocol ?? 'openai-compatible');
  const transcription = protocol === 'qwen-asr';
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? defaultUrls['openai-compatible']);
  const [model, setModel] = useState(initial?.model ?? '');
  const [visibility, setVisibility] = useState<AssistantProviderInput['visibility']>(initial?.visibility ?? 'private');
  // Credentials deliberately never enter the persisted draft/workspace store.
  const [apiKey, setApiKey] = useState('');
  const [attempts, setAttempts] = useState(0);
  // A connection check validates the connection fields only, never the name.
  const [checkAttempts, setCheckAttempts] = useState(0);
  const connectionAttempts = attempts + checkAttempts;
  const nameRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);
  const modelRef = useRef<TextInput>(null);
  const keyRef = useRef<TextInput>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const validUrl = (() => {
    try {
      const url = new URL(baseUrl);
      return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  })();
  const input = (): AssistantProviderInput => ({ name: name.trim(), protocol, baseUrl: baseUrl.trim().replace(/\/$/, ''), model: model.trim(), visibility, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
  // A result belongs to the values it checked; editing any of them hides it.
  const checkKey = JSON.stringify([protocol, baseUrl.trim(), model.trim(), apiKey.trim()]);
  const shownCheck = check?.key === checkKey ? check : null;
  /** Focuses the first field that blocks a connection check. */
  const connectionReady = () => {
    if (!validUrl) { urlRef.current?.focus(); return false; }
    if (!model.trim()) { modelRef.current?.focus(); return false; }
    if (!initial && !apiKey.trim()) { keyRef.current?.focus(); return false; }
    return true;
  };
  const submit = async () => {
    setAttempts(value => value + 1);
    if (!name.trim()) { nameRef.current?.focus(); return; }
    if (!connectionReady()) return;
    await onSubmit(input());
  };
  const runCheck = async () => {
    if (!onCheck || check?.status === 'checking') return;
    setCheckAttempts(value => value + 1);
    if (!connectionReady()) return;
    const key = checkKey;
    setCheck({ key, status: 'checking' });
    try {
      const result = await onCheck(input());
      setCheck(result.transcription
        ? { key, status: 'ok', message: 'form.asrOk' }
        : result.toolCalling
        ? { key, status: 'ok', message: 'form.toolsOk' }
        : { key, status: 'warning', message: 'form.toolsMissing' });
    } catch (error) {
      setCheck({ key, status: 'failed', message: (transcription ? transcriptionErrorKey : assistantErrorKey)(error, 'errors.connectionCheck') });
    }
  };
  /** Follows the new protocol's address and model only while the fields still hold a default. */
  const chooseProtocol = (value: AssistantProtocol) => {
    setProtocol(value);
    if (Object.values(defaultUrls).includes(baseUrl)) setBaseUrl(defaultUrls[value]);
    if (!model.trim() || model === QWEN_ASR_MODEL) setModel(value === 'qwen-asr' ? QWEN_ASR_MODEL : '');
  };
  return <Stack gap={4}>
    {/* The use is fixed once created: conversations are bound to a chat configuration. */}
    {initial ? <Text variant="bodySm" color="inkMuted">{t('form.currentPurpose', { purpose: t(transcription ? 'models.transcription' : 'models.chat') })}</Text>
      : <AssistantChoice label={t('form.purpose')} options={[{ value: 'chat', label: t('models.chat') }, { value: 'transcription', label: t('models.transcription') }]} value={transcription ? 'transcription' : 'chat'} disabled={busy}
        onChange={value => { if ((value === 'transcription') !== transcription) chooseProtocol(value === 'transcription' ? 'qwen-asr' : 'openai-compatible'); }} />}
    {transcription ? <Text variant="bodySm" color="inkMuted">{t('form.asrDescription')}</Text> : null}
    <TextField ref={nameRef} label={t('form.name')} value={name} onChangeText={setName} maxLength={80} disabled={busy} submitAttempt={attempts} {...(attempts && !name.trim() ? { error: t('form.nameRequired') } : {})} placeholder={transcription ? t('form.asrName') : t('form.chatName')} />
    {transcription ? null : <AssistantChoice label={t('form.protocol')} options={[{ value: 'openai-compatible', label: t('form.openAiCompatible') }, { value: 'anthropic', label: 'Anthropic' }]} value={protocol} disabled={busy} onChange={chooseProtocol} />}
    <TextField ref={urlRef} label={t('form.url')} value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} disabled={busy} submitAttempt={connectionAttempts}
      hint={transcription ? t('form.asrUrlHint', { url: defaultUrls['qwen-asr'] }) : t('form.urlHint', { url: defaultUrls[protocol] })} {...(connectionAttempts && !validUrl ? { error: t('form.urlInvalid') } : {})} />
    <Text variant="caption">{t('form.httpInfo')}</Text>
    <TextField ref={modelRef} label={t('form.modelName')} value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} maxLength={120} disabled={busy} submitAttempt={connectionAttempts} hint={transcription ? t('form.asrModelHint', { model: QWEN_ASR_MODEL }) : t('form.chatModelHint')} {...(connectionAttempts && !model.trim() ? { error: t('form.modelRequired') } : {})} />
    <PasswordField ref={keyRef} label={t('form.apiKey')} value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={4096} disabled={busy} submitAttempt={connectionAttempts}
      hint={initial ? t('form.savedKey') : t('form.keyInfo')} {...(connectionAttempts && !initial && !apiKey.trim() ? { error: t('form.keyRequired') } : {})} />
    {onCheck ? <Stack gap={2}>
      <Button label={t('form.check')} tone="secondary" size="compact" loading={shownCheck?.status === 'checking'} disabled={busy} onPress={() => { void runCheck(); }} style={{ alignSelf: 'flex-start' }} />
      {shownCheck && shownCheck.status !== 'checking' ? <Inline accessibilityLiveRegion="polite" gap={2} style={{ alignItems: 'flex-start' }}>
        {shownCheck.status === 'ok'
          ? <CircleCheck color={theme.colors.success} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          : <CircleAlert color={theme.colors.destructive} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />}
        <Text variant="bodySm" color={shownCheck.status === 'ok' ? 'ink' : 'destructive'} style={{ flex: 1 }}>{t(shownCheck.message)}</Text>
      </Inline> : <Text variant="caption">{transcription ? t('form.asrCheckInfo') : t('form.chatCheckInfo')}</Text>}
    </Stack> : null}
    <AssistantChoice label={t('form.visibility')} options={[{ value: 'private', label: t('form.private') }, { value: 'household', label: t('form.household') }]} value={visibility} onChange={setVisibility} disabled={busy} />
    <Text variant="bodySm" color="inkMuted">{transcription
      ? visibility === 'household' ? t('form.asrSharedInfo') : t('form.asrPrivateInfo')
      : visibility === 'household' ? t('form.chatSharedInfo') : t('form.chatPrivateInfo')}</Text>
    <Text variant="bodySm" color="inkMuted">{transcription ? t('form.asrPrivacy') : t('form.chatPrivacy')}</Text>
    <FormActions submitting={busy} submitLabel={initial ? t('common:save') : t('form.create')} onCancel={onCancel} onSubmit={() => { void submit(); }} />
  </Stack>;
}
