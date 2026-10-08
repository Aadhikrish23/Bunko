export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

export const COLOR_HEX_MAP: Record<HighlightColor, { bg: string; border: string; badge: string }> = {
  yellow: { bg: '#FEF08A', border: '#EAB308', badge: 'bg-yellow-200 text-yellow-900 border-yellow-400' },
  green: { bg: '#BBF7D0', border: '#22C55E', badge: 'bg-green-200 text-green-900 border-green-400' },
  blue: { bg: '#BFDBFE', border: '#3B82F6', badge: 'bg-blue-200 text-blue-900 border-blue-400' },
  pink: { bg: '#FBCFE8', border: '#EC4899', badge: 'bg-pink-200 text-pink-900 border-pink-400' },
  orange: { bg: '#FED7AA', border: '#F97316', badge: 'bg-orange-200 text-orange-900 border-orange-400' },
};
