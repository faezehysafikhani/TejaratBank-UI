// The look of a node type: its colour and icon. Icons come from a fixed list of lucide icons (by
// their kebab-case name, as the backend and the structure templates store them), so only these
// are in the bundle; an unknown name falls back to a plain folder.
import React from 'react';
import {
  Briefcase,
  Building,
  Building2,
  Crown,
  Factory,
  Folder,
  FolderTree,
  Gavel,
  Globe,
  Landmark,
  Layers,
  type LucideIcon,
  MapPin,
  Network,
  Scale,
  ShieldCheck,
  Store,
  User,
  Users,
  UsersRound,
  Wallet,
  Warehouse,
} from 'lucide-react';

export const NODE_TYPE_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  'building-2': { icon: Building2, label: 'ساختمان' },
  building: { icon: Building, label: 'ساختمان کوچک' },
  'folder-tree': { icon: FolderTree, label: 'پوشه‌ی درختی' },
  folder: { icon: Folder, label: 'پوشه' },
  briefcase: { icon: Briefcase, label: 'کیف' },
  crown: { icon: Crown, label: 'تاج' },
  landmark: { icon: Landmark, label: 'نهاد' },
  users: { icon: Users, label: 'گروه' },
  'users-round': { icon: UsersRound, label: 'جمع' },
  user: { icon: User, label: 'فرد' },
  'map-pin': { icon: MapPin, label: 'منطقه' },
  store: { icon: Store, label: 'شعبه' },
  'shield-check': { icon: ShieldCheck, label: 'حفاظت' },
  scale: { icon: Scale, label: 'ترازو' },
  gavel: { icon: Gavel, label: 'حقوقی' },
  wallet: { icon: Wallet, label: 'مالی' },
  network: { icon: Network, label: 'شبکه' },
  globe: { icon: Globe, label: 'بین‌الملل' },
  layers: { icon: Layers, label: 'لایه‌ها' },
  factory: { icon: Factory, label: 'کارخانه' },
  warehouse: { icon: Warehouse, label: 'انبار' },
};

/** Colours that read well on white and on the dark theme (the templates use these). */
export const NODE_TYPE_COLORS = [
  '#475569', '#1e3a8a', '#7c3aed', '#b45309', '#4d7c0f', '#0f766e',
  '#0369a1', '#2563eb', '#64748b', '#be123c', '#c2410c', '#a21caf',
];

export const DEFAULT_NODE_TYPE_STYLE = { color: '#2563eb', icon: 'folder' } as const;

/** A colour that is safe to put in a style (#rrggbb), else the default. */
export const safeColor = (color: string | null | undefined): string =>
  color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_NODE_TYPE_STYLE.color;

export const NodeTypeIcon: React.FC<{ icon: string | null | undefined; className?: string; color?: string }> = ({ icon, className = 'w-4 h-4', color }) => {
  const Icon = (icon && NODE_TYPE_ICONS[icon]?.icon) || Folder;
  return <Icon className={className} style={color ? { color: safeColor(color) } : undefined} aria-hidden />;
};

/** A node type's name as a small coloured badge with its icon. */
export const NodeTypeBadge: React.FC<{ name: string; color: string; icon: string }> = ({ name, color, icon }) => {
  const c = safeColor(color);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border"
      style={{ color: c, borderColor: `${c}55`, backgroundColor: `${c}14` }}
    >
      <NodeTypeIcon icon={icon} className="w-3 h-3" />
      {name}
    </span>
  );
};

/** Colours a new type is offered, each easy to tell from the others. */
export const TYPE_COLORS = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#c2410c', '#475569', '#db2777'];

/** An icon that fits a type's name (معاونت: ساختمان، شعبه: فروشگاه...); a plain folder otherwise. */
const ICON_HINTS: [RegExp, string][] = [
  [/عامل|ریاست|رئیس/, 'crown'], [/مجمع/, 'landmark'], [/هی[ئأ]ت/, 'users'], [/کمیته|شورا/, 'users-round'],
  [/معاونت/, 'building-2'], [/مدیریت/, 'briefcase'], [/اداره/, 'folder-tree'], [/شعبه|باجه/, 'store'],
  [/استان|منطقه/, 'map-pin'], [/حقوقی/, 'gavel'], [/مالی|حسابداری|خزانه/, 'wallet'], [/حراست|حفاظت|امنیت/, 'shield-check'],
  [/بین‌?الملل/, 'globe'], [/واحد|هسته/, 'building'],
];

/** The look a new type starts with: an icon from its name, and the first colour the other types do not use yet. */
export function suggestTypeLook(name: string, usedColors: string[]): { color: string; icon: string } {
  const icon = ICON_HINTS.find(([re]) => re.test(name))?.[1] ?? 'layers';
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  const color = TYPE_COLORS.find((c) => !used.has(c)) ?? TYPE_COLORS[usedColors.length % TYPE_COLORS.length];
  return { color, icon };
}
