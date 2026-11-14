import CalendarDays from 'lucide-react-native/icons/calendar-days';
import Languages from 'lucide-react-native/icons/languages';
import { View } from 'react-native';
import { AccountScreen } from '../../src/features/households/household-screen';
import { setLunarCalendar, useLunarCalendar } from '../../src/features/lunar/lunar-calendar';
import { setJapaneseCalendar, useJapaneseCalendar } from '../../src/features/wareki/japanese-calendar';
import { LANGUAGES, LANGUAGE_NAMES, setLanguageChoice, systemLanguage, useLanguageChoice, useTranslation, type LanguageChoice } from '../../src/i18n';
import { OptionRow } from '../../src/ui/compose-rows';
import { FilterOptions } from '../../src/ui/filter-options';
import { PageIntro } from '../../src/ui/page-intro';
import { Stack, Text } from '../../src/ui/primitives';
import { SettingsRows, SettingsSection, SwitchRow } from '../../src/ui/settings-section';
import { theme } from '../../src/ui/theme';
import { useDesktop } from '../../src/ui/use-desktop';

const sectionIcon = (Icon: typeof Languages) => <Icon size={theme.controlSizes.icon} color={theme.colors.inkMuted} strokeWidth={theme.controlSizes.iconStroke} />;

/**
 * 设置: what this device shows, namely the interface language and what the
 * calendar adds to its dates. None of it reaches the account, which is why it
 * stays apart from 个人资料. Every change applies at once.
 */
export default function SettingsRoute() {
  const desktop = useDesktop();
  const { t } = useTranslation('settings');
  const lunar = useLunarCalendar();
  const japanese = useJapaneseCalendar();
  const language = useLanguageChoice();
  // A language is offered under its own name, whatever the interface is in.
  const languages: Array<{ value: LanguageChoice; label: string; name: string; detail?: string }> = [
    { value: 'system', label: t('language.system'), name: t('language.system'), detail: t('language.systemNow', { language: LANGUAGE_NAMES[systemLanguage()] }) },
    ...LANGUAGES.map(value => ({ value, label: LANGUAGE_NAMES[value], name: LANGUAGE_NAMES[value] })),
  ];
  return (
    <AccountScreen accessibilityLabel={t('title')}>
      <Stack gap={6}>
        <PageIntro title={t('title')} />
        <SettingsSection title={t('language.title')} icon={sectionIcon(Languages)} detail={t('deviceOnly')}>
          {desktop ? (
            <FilterOptions hideLabel label={t('language.title')} options={languages} value={language} onChange={value => setLanguageChoice(value as LanguageChoice)} />
          ) : (
            // A phone lists the choices as rows: three pills crowd a narrow screen in Japanese.
            <View accessibilityRole="radiogroup" accessibilityLabel={t('language.title')} style={{ marginHorizontal: -theme.spacing[2] }}>
              {languages.map(option => (
                <OptionRow key={option.value} label={option.label} {...(option.detail ? { detail: option.detail } : {})} checked={language === option.value} onPress={() => setLanguageChoice(option.value)} />
              ))}
            </View>
          )}
        </SettingsSection>
        <SettingsSection title={t('calendar.title')} icon={sectionIcon(CalendarDays)} detail={t('deviceOnly')}>
          <SettingsRows>
            <SwitchRow label={t('calendar.showLunar')} value={lunar} disabled={false} onChange={setLunarCalendar}>
              <Text variant="caption">{t('calendar.showLunarDetail')}</Text>
            </SwitchRow>
            <SwitchRow label={t('calendar.showJapanese')} value={japanese} disabled={false} onChange={setJapaneseCalendar}>
              <Text variant="caption">{t('calendar.showJapaneseDetail')}</Text>
            </SwitchRow>
          </SettingsRows>
        </SettingsSection>
      </Stack>
    </AccountScreen>
  );
}
