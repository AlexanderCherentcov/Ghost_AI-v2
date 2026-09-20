/** Облако точек одной формы: [x, y, z, hue, sat, light] на точку (~2600 точек на форму). */
export type LogoPointCloud = Array<[number, number, number, number, number, number]>;

const COORD_SCALE = 1000; // координаты в файле данных хранятся в тысячных
const NUMBERS_PER_POINT = 4; // x, y, z, индекс цвета в палитре

function unpack(
  palette: Array<[number, number, number]>,
  packed: Record<string, number[]>,
): Record<string, LogoPointCloud> {
  const logos: Record<string, LogoPointCloud> = {};
  for (const [name, flat] of Object.entries(packed)) {
    const cloud: LogoPointCloud = [];
    for (let i = 0; i < flat.length; i += NUMBERS_PER_POINT) {
      const [h, s, l] = palette[flat[i + 3]];
      cloud.push([flat[i] / COORD_SCALE, flat[i + 1] / COORD_SCALE, flat[i + 2] / COORD_SCALE, h, s, l]);
    }
    logos[name] = cloud;
  }
  return logos;
}

let logosPromise: Promise<Record<string, LogoPointCloud>> | null = null;

/**
 * Формы логотипов грузятся один раз лениво и держатся в памяти процесса. Файл данных
 * (lib/particle-logos-data.js) хранит их в сжатом виде — палитра цветов + целочисленные
 * координаты, ~430 КБ вместо ~900 КБ; здесь они распаковываются в привычный формат.
 */
export function loadLogos(): Promise<Record<string, LogoPointCloud>> {
  if (!logosPromise) {
    logosPromise = import('./particle-logos-data').then((m) => unpack(m.LOGO_PALETTE, m.LOGOS_PACKED));
  }
  return logosPromise;
}
