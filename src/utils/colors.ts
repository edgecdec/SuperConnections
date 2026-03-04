export const COLORS = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
  '#A0E8AF', '#FFC8A2', '#D4A5A5', '#9EB3C2', '#C7CEEA',
  '#F1CBFF', '#E2F0CB', '#FFDAC1', '#FF9AA2', '#B5EAD7',
];

export function getRandomColor(exclude: string[] = []) {
  const available = COLORS.filter((c) => !exclude.includes(c));
  if (available.length === 0) return COLORS[Math.floor(Math.random() * COLORS.length)];
  return available[Math.floor(Math.random() * available.length)];
}
