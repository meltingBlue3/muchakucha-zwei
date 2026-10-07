import { useRef, useState } from 'react';
import { TextInput, Pressable, View } from 'react-native';
import type { AssistantProviderResponseDto } from '@muchakucha/api-client';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { Button, FormActions, Inline, PasswordField, Stack, Text, TextField } from '../../ui/primitives';
import { theme } from '../../ui/theme';
import { assistantError } from './assistant-runtime';

export interface AssistantProviderInput {
  name: string;
  protocol: 'openai-compatible' | 'anthropic';
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

type CheckResult = { key: string; status: 'checking' | 'ok' | 'warning' | 'failed'; message: string };

export function AssistantProviderForm({ initial, busy, onSubmit, onCancel, onCheck }: {
  initial?: AssistantProviderResponseDto; busy: boolean; onSubmit: (input: AssistantProviderInput) => Promise<void>; onCancel: () => void;
  onCheck?: (input: AssistantProviderInput) => Promise<{ toolCalling: boolean }>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [protocol, setProtocol] = useState<AssistantProviderInput['protocol']>(initial?.protocol ?? 'openai-compatible');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? 'https://api.openai.com/v1');
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
  const validUrl = (() => { try { const url = new URL(baseUrl); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; } })();
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
    setCheck({ key, status: 'checking', message: '' });
    try {
      const result = await onCheck(input());
      setCheck(result.toolCalling
        ? { key, status: 'ok', message: '连接正常，模型可以调用工具并读取结果。' }
        : { key, status: 'warning', message: '已连接，但模型没有调用工具。助手要靠工具调用查询家庭数据，请换用支持工具调用的模型。' });
    } catch (error) {
      setCheck({ key, status: 'failed', message: assistantError(error, '连接测试未能完成，请检查网络后重试。') });
    }
  };
  return <Stack gap={4}>
    <TextField ref={nameRef} label="配置名称" value={name} onChangeText={setName} maxLength={80} disabled={busy} submitAttempt={attempts} {...(attempts && !name.trim() ? { error: '请输入配置名称。' } : {})} placeholder="例如：家庭助手" />
    <AssistantChoice label="模型协议" options={[{ value: 'openai-compatible', label: 'OpenAI 兼容' }, { value: 'anthropic', label: 'Anthropic' }]} value={protocol} disabled={busy} onChange={value => {
      setProtocol(value);
      if (baseUrl === 'https://api.openai.com/v1' || baseUrl === 'https://api.anthropic.com/v1') setBaseUrl(value === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1');
    }} />
    <TextField ref={urlRef} label="服务地址" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} disabled={busy} submitAttempt={connectionAttempts}
      hint={protocol === 'anthropic' ? '填写完整 API 基础地址，例如 https://api.anthropic.com/v1。' : '填写完整 API 基础地址，例如 https://api.openai.com/v1。'} {...(connectionAttempts && !validUrl ? { error: '请输入 HTTPS 地址，不包含密码、查询参数或片段。' } : {})} />
    <Text variant="caption">支持提供商和自建服务的公网 HTTPS 地址；暂不接入局域网或本机地址。</Text>
    <TextField ref={modelRef} label="模型名称" value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} maxLength={120} disabled={busy} submitAttempt={connectionAttempts} hint="填写提供商支持工具调用的模型标识。" {...(connectionAttempts && !model.trim() ? { error: '请输入模型名称。' } : {})} />
    <PasswordField ref={keyRef} label="API 密钥" value={apiKey} onChangeText={setApiKey} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={4096} disabled={busy} submitAttempt={connectionAttempts}
      hint={initial ? '已保存的密钥不会显示。留空保留原密钥，填写后替换。' : '密钥由服务器加密保存，不保存到本机草稿。'} {...(connectionAttempts && !initial && !apiKey.trim() ? { error: '请输入 API 密钥。' } : {})} />
    {onCheck ? <Stack gap={2}>
      <Button label="测试连接" tone="secondary" size="compact" loading={shownCheck?.status === 'checking'} disabled={busy} onPress={() => { void runCheck(); }} style={{ alignSelf: 'flex-start' }} />
      {shownCheck && shownCheck.status !== 'checking' ? <Inline accessibilityLiveRegion="polite" gap={2} style={{ alignItems: 'flex-start' }}>
        {shownCheck.status === 'ok'
          ? <CircleCheck color={theme.colors.success} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />
          : <CircleAlert color={theme.colors.destructive} size={theme.controlSizes.icon} strokeWidth={theme.controlSizes.iconStroke} />}
        <Text variant="bodySm" color={shownCheck.status === 'ok' ? 'ink' : 'destructive'} style={{ flex: 1 }}>{shownCheck.message}</Text>
      </Inline> : <Text variant="caption">用上面的地址、模型和密钥发送一次测试请求，不读取家庭数据。</Text>}
    </Stack> : null}
    <AssistantChoice label="谁可以使用" options={[{ value: 'private', label: '仅自己' }, { value: 'household', label: '家庭可用' }]} value={visibility} onChange={setVisibility} disabled={busy} />
    <Text variant="bodySm" color="inkMuted">{visibility === 'household' ? '本家庭成员可使用此配置调用模型，费用由此密钥承担。只有你能修改配置和密钥；家人在应用里看不到彼此的对话，但这些对话都会经过你填写的服务地址。你可以在模型配置里看到每位家人本月的使用次数和用量。' : '此配置仅供你在当前家庭中使用；其他成员看不到你的配置和对话。'}</Text>
    <Text variant="bodySm" color="inkMuted">使用助手时，对话和为回答问题查询到的家庭数据将发送到所选服务地址。</Text>
    <FormActions submitting={busy} submitLabel={initial ? '保存' : '创建'} onCancel={onCancel} onSubmit={() => { void submit(); }} />
  </Stack>;
}
