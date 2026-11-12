/**
 * The Chinese lunisolar calendar for lunar years 1900–2100: lunar dates, the
 * 24 solar terms, and the festivals a family calendar marks. Pure arithmetic,
 * no I/O, shared by the API and the client.
 *
 * One file on purpose. The API runs this package as TypeScript through Node's
 * type stripping, which resolves no relative import without its `.ts`
 * extension, and the API compiler does not allow that extension.
 */

export interface SolarDate {
  year: number;
  month: number;
  day: number;
}

export interface LunarDate {
  /** The lunar year, named by the Gregorian year its 正月初一 falls in. */
  year: number;
  month: number;
  day: number;
  /** True inside a leap month (闰月), which repeats the number of the month before it. */
  leap: boolean;
}

export const LUNAR_FIRST_YEAR = 1900;
export const LUNAR_LAST_YEAR = 2100;

/**
 * One entry per lunar year from 1900, computed by the rules of GB/T 33661
 * (农历的编算和颁行): months begin on the day of the new moon, 冬月 holds
 * 冬至, and in a year of 13 months the first month without a principal term
 * is the leap month. Days are counted in China Standard Time, and in Beijing
 * local mean time before 1929. New moons follow Meeus, Astronomical
 * Algorithms, chapter 49; solar terms follow `apparentSolarLongitude` below.
 *
 * ICU's chinese calendar agrees on every day except where a new moon or a
 * principal term falls within minutes of midnight, which its coarser astronomy
 * puts on the wrong day — 2027's 春节 among them. `index.test.ts` lists those
 * years and checks the published dates.
 *
 * bits 0–12  month lengths in calendar order, the leap month right after its
 *            namesake; a set bit is a 30-day month, a clear one 29 days
 * bits 13–16 the leap month, 0 when the year has none
 * bits 17–22 days from 1 January to 正月初一
 */
const YEARS: readonly number[] = [
  0x3d16d2, 0x620752, 0x4c0ea5, 0x38b64a, 0x5c064b, 0x440a9b, 0x30955a, 0x56056a, 0x400b59, 0x2a5752,
  0x500752, 0x3adb25, 0x600b25, 0x480a4b, 0x32b4ab, 0x5802ad, 0x42056b, 0x2c4b69, 0x520da9, 0x3efd92,
  0x640e92, 0x4c0d25, 0x36ba4d, 0x5c0a56, 0x4602b6, 0x2e95b5, 0x5606d4, 0x400ea9, 0x2c5e92, 0x500e92,
  0x3acd26, 0x5e052b, 0x480a57, 0x32b2b6, 0x580b5a, 0x4406d4, 0x2e6ec9, 0x520749, 0x3cf693, 0x620a93,
  0x4c052b, 0x34ca5b, 0x5a0aad, 0x46056a, 0x309b55, 0x560ba4, 0x400b49, 0x2a5a93, 0x500a95, 0x38f52d,
  0x5e0536, 0x480aad, 0x34b5aa, 0x5805b2, 0x420da5, 0x2e7d4a, 0x540d4a, 0x3d0a95, 0x600a97, 0x4c0556,
  0x36cab5, 0x5a0ad5, 0x4606d2, 0x308ea5, 0x560ea5, 0x40064a, 0x286c97, 0x4e0a9b, 0x3af55a, 0x5e056a,
  0x480b69, 0x34b752, 0x5a0b52, 0x420b25, 0x2c964b, 0x520a4b, 0x3d14ab, 0x6002ad, 0x4a056d, 0x36cb69,
  0x5c0da9, 0x460d92, 0x309d25, 0x560d25, 0x415a4d, 0x640a56, 0x4e02b6, 0x38c5b5, 0x5e06d5, 0x480ea9,
  0x34be92, 0x5a0e92, 0x440d26, 0x2c6a56, 0x500a57, 0x3d14d6, 0x62035a, 0x4a06d5, 0x36b6c9, 0x5c0749,
  0x460693, 0x2e952b, 0x54052b, 0x3e0a5b, 0x2a555a, 0x4e056a, 0x38fb55, 0x600ba4, 0x4a0b49, 0x32ba93,
  0x580a95, 0x42052d, 0x2c8aad, 0x500ab5, 0x3d35aa, 0x6205d2, 0x4c0da5, 0x36dd4a, 0x5c0d4a, 0x460c95,
  0x30952e, 0x540556, 0x3e0ab5, 0x2a55b2, 0x5006d2, 0x38cea5, 0x5e0725, 0x48064b, 0x32ac97, 0x560cab,
  0x42055a, 0x2c6ad6, 0x520b69, 0x3d7752, 0x620b52, 0x4c0b25, 0x36da4b, 0x5a0a4b, 0x4404ab, 0x2ea55b,
  0x5405ad, 0x3e0b6a, 0x2a5b52, 0x500d92, 0x3afd25, 0x5e0d25, 0x480a55, 0x32b4ad, 0x5804b6, 0x4005b5,
  0x2c6daa, 0x520ec9, 0x3f1e92, 0x620e92, 0x4c0d26, 0x36ca56, 0x5a0a57, 0x440556, 0x2e86d5, 0x540755,
  0x400749, 0x286e93, 0x4e0693, 0x38f52b, 0x5e052b, 0x460a5b, 0x32b55a, 0x58056a, 0x420b65, 0x2c974a,
  0x520b4a, 0x3d1a95, 0x620a95, 0x4a052d, 0x34caad, 0x5a0ab5, 0x4605aa, 0x2e8ba5, 0x540da5, 0x400d4a,
  0x2a7c95, 0x4e0c96, 0x38f94e, 0x5e0556, 0x480ab5, 0x32b5b2, 0x5806d2, 0x420ea5, 0x2e8e4a, 0x50068b,
  0x3b0c97, 0x6004ab, 0x4a055b, 0x34cad6, 0x5a0b6a, 0x460752, 0x309725, 0x540b45, 0x3e0a8b, 0x28549b,
  0x4e04ab,
];

const DAY_MS = 86_400_000;

/** Days since 1970-01-01, the epoch both directions of conversion count from. */
function dayNumber(date: SolarDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS);
}

function solarFromDayNumber(days: number): SolarDate {
  const date = new Date(days * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

interface MonthSlot {
  month: number;
  leap: boolean;
  length: number;
  /** Day number of the month's first day. */
  start: number;
}

const monthCache = new Map<number, readonly MonthSlot[]>();

function yearInfo(lunarYear: number): number | undefined {
  if (!Number.isInteger(lunarYear) || lunarYear < LUNAR_FIRST_YEAR || lunarYear > LUNAR_LAST_YEAR) return undefined;
  return YEARS[lunarYear - LUNAR_FIRST_YEAR];
}

function monthsOf(lunarYear: number): readonly MonthSlot[] {
  const cached = monthCache.get(lunarYear);
  if (cached !== undefined) return cached;
  const info = yearInfo(lunarYear);
  if (info === undefined) return [];
  const leapMonth = (info >> 13) & 0xf;
  let start = dayNumber({ year: lunarYear, month: 1, day: 1 }) + ((info >> 17) & 0x3f);
  const slots: MonthSlot[] = [];
  let bit = 0;
  for (let month = 1; month <= 12; month += 1) {
    for (const leap of month === leapMonth ? [false, true] : [false]) {
      const length = (info >> bit) & 1 ? 30 : 29;
      slots.push({ month, leap, length, start });
      start += length;
      bit += 1;
    }
  }
  monthCache.set(lunarYear, slots);
  return slots;
}

function slotOf(lunarYear: number, month: number, leap: boolean): MonthSlot | undefined {
  return monthsOf(lunarYear).find(slot => slot.month === month && slot.leap === leap);
}

/** The month a leap month repeats in `lunarYear`, or 0 when the year has none. */
export function leapMonthOf(lunarYear: number): number {
  const info = yearInfo(lunarYear);
  return info === undefined ? 0 : (info >> 13) & 0xf;
}

/** 29 or 30, or 0 when that month does not exist in `lunarYear`. */
export function lunarMonthLength(lunarYear: number, month: number, leap = false): number {
  return slotOf(lunarYear, month, leap)?.length ?? 0;
}

/** The lunar date of a Gregorian date, or null outside lunar years 1900–2100. */
export function toLunar(date: SolarDate): LunarDate | null {
  const days = dayNumber(date);
  for (const lunarYear of [date.year, date.year - 1]) {
    const months = monthsOf(lunarYear);
    const first = months[0];
    if (first === undefined || days < first.start) continue;
    for (const slot of months) {
      if (days < slot.start + slot.length) {
        return { year: lunarYear, month: slot.month, day: days - slot.start + 1, leap: slot.leap };
      }
    }
  }
  return null;
}

/** The Gregorian date of an exact lunar date, or null when that day does not exist. */
export function fromLunar(date: LunarDate): SolarDate | null {
  const slot = slotOf(date.year, date.month, date.leap);
  if (slot === undefined || !Number.isInteger(date.day) || date.day < 1 || date.day > slot.length) return null;
  return solarFromDayNumber(slot.start + date.day - 1);
}

/**
 * Where a yearly lunar date such as a lunar birthday falls in `lunarYear`.
 * It is kept in the ordinary month even for someone born in a leap month, and
 * a 三十 falls on 廿九 in a year whose month has only 29 days. Null outside
 * the supported years.
 */
export function lunarAnniversary(lunarYear: number, month: number, day: number): SolarDate | null {
  const slot = slotOf(lunarYear, month, false);
  if (slot === undefined || !Number.isInteger(day) || day < 1 || day > 30) return null;
  return solarFromDayNumber(slot.start + Math.min(day, slot.length) - 1);
}

// ---------------------------------------------------------------------------
// Names

const MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'] as const;
const DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const;
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const;

/** 正月 … 十月, 冬月, 腊月, with 闰 before a leap month. */
export function formatLunarMonth(month: number, leap = false): string {
  return `${leap ? '闰' : ''}${MONTH_NAMES[month - 1] ?? ''}`;
}

/** 初一 … 初十, 十一 … 十九, 二十, 廿一 … 廿九, 三十. */
export function formatLunarDay(day: number): string {
  if (day <= 10) return `初${DIGITS[day - 1] ?? ''}`;
  if (day < 20) return `十${DIGITS[day - 11] ?? ''}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${DIGITS[day - 21] ?? ''}`;
  return '三十';
}

/** 十月十五, 冬月初八, 闰四月初一. */
export function formatLunarMonthDay(month: number, day: number, leap = false): string {
  return `${formatLunarMonth(month, leap)}${formatLunarDay(day)}`;
}

/** The sexagenary name of a lunar year, such as 丙午. */
export function lunarYearStemBranch(lunarYear: number): string {
  const index = ((lunarYear - 4) % 60 + 60) % 60;
  return `${STEMS[index % 10] ?? ''}${BRANCHES[index % 12] ?? ''}`;
}

/** 丙午马年. */
export function formatLunarYear(lunarYear: number): string {
  const index = ((lunarYear - 4) % 12 + 12) % 12;
  return `${lunarYearStemBranch(lunarYear)}${ZODIAC[index] ?? ''}年`;
}

// ---------------------------------------------------------------------------
// Solar terms

/** In calendar order from 小寒, at solar longitudes 285°, 300°, … 270°. */
export const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
] as const;
export type SolarTerm = (typeof SOLAR_TERMS)[number];

type Series = ReadonlyArray<readonly [number, number, number]>;

// Truncated VSOP87D series for the Earth's heliocentric longitude and radius,
// as tabulated in Meeus, Astronomical Algorithms, appendix III. They keep the
// Sun's longitude within about a second of arc, which is well under a minute
// of time for a solar term.
const L0: Series = [
  [175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517], [3497, 2.7441, 5753.3849],
  [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715], [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097],
  [1324, 0.7425, 11506.7698], [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
  [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694], [753, 2.533, 5507.553],
  [505, 4.583, 18849.228], [492, 4.205, 775.523], [357, 2.92, 0.067], [317, 5.849, 11790.629],
  [284, 1.899, 796.298], [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
  [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299], [132, 3.411, 2942.463],
  [126, 1.083, 20.775], [115, 0.645, 0.98], [103, 0.636, 4694.003], [102, 0.976, 15720.839],
  [102, 4.267, 7.114], [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
  [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15], [79, 3.04, 12036.46],
  [75, 1.76, 5088.63], [74, 3.5, 3154.69], [74, 4.68, 801.82], [70, 0.83, 9437.76],
  [62, 3.98, 8827.39], [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
  [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02], [51, 0.28, 5856.48],
  [49, 0.49, 1194.45], [41, 5.37, 8429.24], [41, 2.4, 19651.05], [39, 6.17, 10447.39],
  [37, 6.04, 10213.29], [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
  [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87], [25, 3.16, 4690.48],
];
const L1: Series = [
  [628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517], [425, 1.59, 3.523],
  [119, 5.796, 26.298], [109, 2.966, 1577.344], [93, 2.59, 18849.23], [72, 1.14, 529.69],
  [68, 1.87, 398.15], [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
  [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11], [21, 5.34, 0.98],
  [19, 1.85, 5486.78], [19, 4.97, 213.3], [17, 2.99, 6275.96], [16, 0.03, 2544.31],
  [16, 1.43, 2146.17], [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
  [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57], [10, 1.3, 6286.6],
  [10, 4.24, 1349.87], [9, 2.7, 242.73], [9, 5.64, 951.72], [8, 5.3, 2352.87],
  [6, 2.65, 9437.76], [6, 4.67, 4690.48],
];
const L2: Series = [
  [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152], [27, 0.05, 3.52],
  [16, 5.19, 26.3], [16, 3.68, 155.42], [10, 0.76, 18849.23], [9, 2.06, 77713.77],
  [7, 0.83, 775.52], [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14],
  [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73], [3, 6.12, 529.69],
  [3, 0.31, 398.15], [3, 2.28, 553.57], [2, 4.38, 5223.69], [2, 3.75, 0.98],
];
const L3: Series = [
  [289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.2, 155.42],
  [1, 4.72, 3.52], [1, 5.3, 18849.23], [1, 5.97, 242.73],
];
const L4: Series = [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]];
const L5: Series = [[1, 3.14, 0]];
const R0: Series = [
  [100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517], [3084, 5.1985, 77713.7715],
  [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194], [925, 5.453, 11506.77], [542, 4.564, 3930.21],
];
const R1: Series = [[103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517]];

const RAD = Math.PI / 180;

function sumSeries(series: Series, tau: number): number {
  let total = 0;
  for (const [amplitude, phase, frequency] of series) total += amplitude * Math.cos(phase + frequency * tau);
  return total;
}

/** The Sun's apparent geocentric longitude in degrees at a Julian Ephemeris Day. */
function apparentSolarLongitude(jde: number): number {
  const tau = (jde - 2451545) / 365250;
  const terms = [L0, L1, L2, L3, L4, L5].map(series => sumSeries(series, tau));
  let heliocentric = 0;
  for (let power = terms.length - 1; power >= 0; power -= 1) heliocentric = heliocentric * tau + (terms[power] ?? 0);
  const radius = (sumSeries(R0, tau) + sumSeries(R1, tau) * tau) / 1e8;
  const t = tau * 10;
  const moonNode = (125.04452 - 1934.136261 * t) * RAD;
  const sunMean = (280.4665 + 36000.7698 * t) * RAD;
  const moonMean = (218.3165 + 481267.8813 * t) * RAD;
  const nutation = -17.2 * Math.sin(moonNode) - 1.32 * Math.sin(2 * sunMean) - 0.23 * Math.sin(2 * moonMean) + 0.21 * Math.sin(2 * moonNode);
  // Geocentric = heliocentric + 180°; then the FK5 correction, nutation and aberration, in arcseconds.
  const degrees = heliocentric / 1e8 / RAD + 180 + (-0.09033 + nutation - 20.4898 / radius) / 3600;
  return ((degrees % 360) + 360) % 360;
}

/** ΔT = TT − UT in seconds: the Espenak–Meeus polynomials for 1900–2150. */
function deltaT(year: number): number {
  if (year < 1920) { const t = year - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (year < 1941) { const t = year - 1920; return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3; }
  if (year < 1961) { const t = year - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (year < 1986) { const t = year - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (year < 2005) { const t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (year < 2050) { const t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  return -20 + 32 * ((year - 1820) / 100) ** 2 - 0.5628 * (2150 - year);
}

/** Julian Day at 00:00 UT of day number 0 (1970-01-01). */
const UNIX_EPOCH_JD = 2440587.5;
const CHINA_STANDARD_FROM_JD = 2425612.5; // 1929-01-01

/** China Standard Time, or Beijing local mean time (+7:45:40) before 1929, in days. */
function chinaOffsetDays(jdUt: number): number {
  return jdUt < CHINA_STANDARD_FROM_JD ? (7 + 45 / 60 + 40 / 3600) / 24 : 8 / 24;
}

const termCache = new Map<number, ReadonlyMap<number, SolarTerm>>();

/** The day numbers of a Gregorian year's 24 solar terms, in China Standard Time. */
function termsOfYear(year: number): ReadonlyMap<number, SolarTerm> {
  const cached = termCache.get(year);
  if (cached !== undefined) return cached;
  const terms = new Map<number, SolarTerm>();
  SOLAR_TERMS.forEach((name, index) => {
    const target = (285 + 15 * index) % 360;
    // 小寒 is near 6 January; each term is about 15.2 days after the last.
    let jde = dayNumber({ year, month: 1, day: 6 }) + UNIX_EPOCH_JD + index * 15.2184;
    for (let step = 0; step < 12; step += 1) {
      const gap = ((target - apparentSolarLongitude(jde) + 540) % 360) - 180;
      jde += gap * (365.2422 / 360);
      if (Math.abs(gap) < 1e-7) break;
    }
    const ut = jde - deltaT(year + (index + 0.5) / 24) / 86400;
    terms.set(Math.floor(ut + chinaOffsetDays(ut) - UNIX_EPOCH_JD), name);
  });
  termCache.set(year, terms);
  return terms;
}

/** The solar term that begins on this date in China, if any. */
export function solarTermOn(date: SolarDate): SolarTerm | null {
  if (date.year < LUNAR_FIRST_YEAR || date.year > LUNAR_LAST_YEAR + 1) return null;
  return termsOfYear(date.year).get(dayNumber(date)) ?? null;
}

// ---------------------------------------------------------------------------
// Festivals and day labels

const LUNAR_FESTIVALS: ReadonlyMap<string, string> = new Map([
  ['1-1', '春节'], ['1-15', '元宵节'], ['5-5', '端午节'], ['7-7', '七夕'], ['7-15', '中元节'],
  ['8-15', '中秋节'], ['9-9', '重阳节'], ['12-8', '腊八'], ['12-23', '小年'],
]);
const SOLAR_FESTIVALS: ReadonlyMap<string, string> = new Map([
  ['1-1', '元旦'], ['3-8', '妇女节'], ['5-1', '劳动节'], ['5-4', '青年节'], ['6-1', '儿童节'],
  ['9-10', '教师节'], ['10-1', '国庆节'],
]);

/** Every festival `observancesOn` can name, lunar ones first. The solar terms are `SOLAR_TERMS`. */
export const FESTIVALS: readonly string[] = [...LUNAR_FESTIVALS.values(), '除夕', ...SOLAR_FESTIVALS.values(), '母亲节', '父亲节'];

/** The day of the month that is the `nth` Sunday. */
function nthSunday(year: number, month: number, nth: number): number {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - firstWeekday) % 7) + (nth - 1) * 7;
}

function lunarFestival(lunar: LunarDate): string | null {
  if (lunar.leap) return null;
  const fixed = LUNAR_FESTIVALS.get(`${lunar.month}-${lunar.day}`);
  if (fixed !== undefined) return fixed;
  return lunar.month === 12 && lunar.day === lunarMonthLength(lunar.year, 12) ? '除夕' : null;
}

function solarFestival(date: SolarDate): string | null {
  const fixed = SOLAR_FESTIVALS.get(`${date.month}-${date.day}`);
  if (fixed !== undefined) return fixed;
  if (date.month === 5 && date.day === nthSunday(date.year, 5, 2)) return '母亲节';
  if (date.month === 6 && date.day === nthSunday(date.year, 6, 3)) return '父亲节';
  return null;
}

/** Every festival and solar term on a date, lunar festivals first. */
export function observancesOn(date: SolarDate): string[] {
  const lunar = toLunar(date);
  return [lunar === null ? null : lunarFestival(lunar), solarFestival(date), solarTermOn(date)]
    .filter((name): name is string => name !== null);
}

export interface LunarDayLabel {
  text: string;
  /** A festival or solar term stands out; the first of a month names the month. */
  kind: 'festival' | 'term' | 'month' | 'day';
}

/**
 * The short text a month grid shows under a date: a festival, else a solar
 * term, else the month's name on its first day, else the lunar day.
 */
export function lunarDayLabel(date: SolarDate): LunarDayLabel | null {
  const lunar = toLunar(date);
  if (lunar === null) return null;
  const festival = lunarFestival(lunar) ?? solarFestival(date);
  if (festival !== null) return { text: festival, kind: 'festival' };
  const term = solarTermOn(date);
  if (term !== null) return { text: term, kind: 'term' };
  if (lunar.day === 1) return { text: formatLunarMonth(lunar.month, lunar.leap), kind: 'month' };
  return { text: formatLunarDay(lunar.day), kind: 'day' };
}

/** 农历十月初三, followed by the day's festivals and solar term: 农历九月廿九，立冬. */
export function describeLunarDay(date: SolarDate): string | null {
  const lunar = toLunar(date);
  if (lunar === null) return null;
  return [`农历${formatLunarMonthDay(lunar.month, lunar.day, lunar.leap)}`, ...observancesOn(date)].join('，');
}
