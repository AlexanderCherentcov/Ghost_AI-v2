/** Точечное облако [x, y, z, hue, sat, light] на точку, ~2600 точек на форму. */
export type LogoPointCloud = Array<[number, number, number, number, number, number]>;

export const LOGOS: Record<string, LogoPointCloud>;
