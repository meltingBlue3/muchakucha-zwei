import { useCallback, useContext, useRef, useState, type ComponentType } from 'react';
import { Pressable, View } from 'react-native';
import Ellipsis from 'lucide-react-native/icons/ellipsis';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { AnchoredMenu, MenuItem } from './anchored-menu';
import { theme } from './theme';
import { useDesktopDensity } from './use-desktop';
import { RowInteraction } from './row-interaction';
import { useTranslation } from '../i18n';

type ActionIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
interface ActionLook { label: string; icon: ActionIcon; destructive?: boolean }

/**
 * One menu item: `kind` picks the standard 编辑 or 删除, otherwise the item
 * brings its own label and icon, such as 「移除」 on a member.
 */
export type CardAction = ({ kind: 'edit' | 'delete' } | ({ kind?: undefined } & ActionLook)) & {
  /** Full name for assistive technology, such as "删除任务：买菜". */
  accessibilityLabel: string;
  /** Receives the menu trigger, so a window opened from the item can return focus to it. */
  onPress(trigger: View | null): void;
};

const STANDARD_LOOK: Record<'edit' | 'delete', Omit<ActionLook, 'label'>> = {
  edit: { icon: Pencil },
  delete: { icon: Trash2, destructive: true },
};

/**
 * The "…" menu on a card or list row. `subject` names the item ("任务：买菜")
 * and titles the trigger "更多操作：任务：买菜". Renders nothing without actions.
 */
export function CardActionsMenu(props: { subject: string; actions: CardAction[]; disabled?: boolean }) {
  return props.actions.length === 0 ? null : <ActionsMenu {...props} />;
}

function ActionsMenu({ subject, actions, disabled = false }: { subject: string; actions: CardAction[]; disabled?: boolean }) {
  const { t } = useTranslation(['shared', 'common']);
  const dense = useDesktopDensity();
  const hovered = useContext(RowInteraction);
  const [focused, setFocused] = useState(false);
  const control = dense ? theme.layout.desktopControl : theme.controlSizes.touchTarget;
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const close = useCallback(() => setOpen(false), []);
  const menuLabel = t('moreActions', { subject });
  return <>
    <Pressable ref={trigger} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityRole="button" accessibilityLabel={menuLabel} accessibilityState={{ disabled, expanded: open }} aria-expanded={open} aria-haspopup="menu" disabled={disabled} onPress={() => setOpen(true)} style={({ pressed }) => ({ minWidth: control, minHeight: control, opacity: dense && !hovered && !focused && !open ? 0 : 1, alignItems: 'center', justifyContent: 'center', borderRadius: theme.borderRadii.full, backgroundColor: pressed || open ? theme.colors.surfaceMuted : theme.colors.transparent })}>
      <Ellipsis size={theme.controlSizes.icon} color={theme.colors.inkFaint} strokeWidth={theme.controlSizes.iconStroke} />
    </Pressable>
    {open ? <AnchoredMenu label={menuLabel} trigger={trigger} align="end" onClose={close} dismissTestID="card-menu-dismiss">
      {actions.map((action, index) => {
        const { icon, destructive = false } = action.kind ? STANDARD_LOOK[action.kind] : action;
        return (
          <MenuItem
            key={action.accessibilityLabel}
            initial={index === 0}
            icon={icon}
            destructive={destructive}
            label={action.kind ? t(`common:${action.kind}`) : action.label}
            accessibilityLabel={action.accessibilityLabel}
            onPress={() => { close(); requestAnimationFrame(() => action.onPress(trigger.current)); }}
          />
        );
      })}
    </AnchoredMenu> : null}
  </>;
}
