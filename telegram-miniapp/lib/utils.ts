/** Полное число с разделителями тысяч, как принято в ru-RU (Caspers, рубли и т.п.) */
export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}
