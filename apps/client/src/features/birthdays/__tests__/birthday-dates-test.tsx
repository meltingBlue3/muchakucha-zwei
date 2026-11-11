import { ageOn, birthdayEvents, birthdayNote, EMPTY_BIRTHDAY, nextBirthday, otherBirthday, validateBirthday, type BirthdayDraft } from '../birthday-dates';

const today = '2026-11-11';
const tz = 'Asia/Shanghai';
const mom: BirthdayDraft = { ...EMPTY_BIRTHDAY, name: '妈妈', calendar: 'lunar', month: 10, day: 15, birthYearText: '1968' };

/** Local midnight and the end of that day, as the event form sends an all-day event. */
const allDay = (date: string) => ({ startTime: new Date(`${date}T00:00:00`).toISOString(), endTime: new Date(`${date}T23:59:59`).toISOString() });

describe('next birthday', () => {
  test('finds the next Gregorian or lunar date from today', () => {
    expect(nextBirthday('solar', 11, 18, today)).toBe('2026-11-18');
    expect(nextBirthday('solar', 11, 11, today)).toBe('2026-11-11');
    expect(nextBirthday('solar', 3, 2, today)).toBe('2027-03-02');
    expect(nextBirthday('solar', 2, 29, today)).toBe('2027-02-28');
    expect(nextBirthday('lunar', 10, 15, today)).toBe('2026-11-23');
    expect(nextBirthday('lunar', 1, 13, today)).toBe('2027-02-18');
  });
});

describe('the other calendar', () => {
  test('works out the Gregorian birth date of a lunar birthday from its year', () => {
    expect(otherBirthday(mom)).toEqual({ calendar: 'solar', month: 12, day: 4, year: 1968, birthDate: '公历 1968年12月4日' });
    // A 腊月 birthday falls in the next Gregorian year.
    expect(otherBirthday({ ...mom, month: 12, day: 3 })).toMatchObject({ year: 1969, birthDate: '公历 1969年1月20日' });
  });

  test('works out the lunar birth date of a Gregorian birthday', () => {
    expect(otherBirthday({ ...mom, calendar: 'solar', month: 12, day: 4 })).toEqual({ calendar: 'lunar', month: 10, day: 15, year: 1968, birthDate: '农历 1968年十月十五' });
    // Early in the year the lunar year is still the one before.
    expect(otherBirthday({ ...mom, calendar: 'solar', month: 1, day: 20, birthYearText: '1969' })).toMatchObject({ month: 12, day: 3, year: 1968 });
  });

  test('needs a year of birth and a date that existed that year', () => {
    expect(otherBirthday({ ...mom, birthYearText: '' })).toBeNull();
    expect(otherBirthday({ ...mom, calendar: 'solar', month: 2, day: 29, birthYearText: '1969' })).toBeNull();
  });
});

describe('the series a saved birthday creates', () => {
  test('one all-day lunar series from the next lunar date', () => {
    expect(birthdayEvents(mom, today, tz)).toEqual([{
      title: '妈妈的农历生日',
      allDay: true,
      ...allDay('2026-11-23'),
      recurrence: { freq: 'yearly', startsOn: '2026-11-23', timezone: tz, lunar: { month: 10, day: 15 }, occasion: 'birthday', birthYear: 1968 },
    }]);
  });

  test('both birthdays, each with the year of birth of its own calendar', () => {
    const events = birthdayEvents({ ...mom, month: 12, day: 3, alsoOther: true }, today, tz);
    expect(events.map(event => [event.title, event.recurrence?.startsOn, event.recurrence?.birthYear, event.recurrence?.lunar])).toEqual([
      ['妈妈的农历生日', '2027-01-10', 1968, { month: 12, day: 3 }],
      ['妈妈的生日', '2027-01-20', 1969, undefined],
    ]);
  });

  test('a Gregorian 2 月 29 日 starts on the last 29 February so it lands on the 28th in common years', () => {
    const [event] = birthdayEvents({ ...EMPTY_BIRTHDAY, name: '我', calendar: 'solar', month: 2, day: 29 }, today, tz);
    expect(event).toMatchObject({ title: '我的生日', recurrence: { startsOn: '2024-02-29', occasion: 'birthday' } });
    expect(event!.recurrence).not.toHaveProperty('birthYear');
  });

  test('passes a chosen reminder to every series', () => {
    const reminder = { mode: 'before' as const, minutesBefore: 1440, alarm: null };
    expect(birthdayEvents({ ...mom, alsoOther: true }, today, tz, reminder).map(event => event.myReminder)).toEqual([reminder, reminder]);
  });
});

describe('ages and validation', () => {
  test('counts lunar years for a lunar birthday', () => {
    const lunar = { occasion: 'birthday' as const, birthYear: 1968, lunar: { month: 12, day: 3 } };
    // 2027-01-10 is still lunar 2026.
    expect(ageOn(lunar, '2027-01-10')).toBe(58);
    expect(ageOn({ ...lunar, lunar: null }, '2027-01-10')).toBe(59);
    expect(ageOn({ ...lunar, birthYear: null }, '2027-01-10')).toBeNull();
  });

  test('notes the lunar date and age on an occurrence', () => {
    const recurrence = { occasion: 'birthday' as const, birthYear: 1968, lunar: { month: 10, day: 15 }, startsOn: '2026-11-23' } as never;
    expect(birthdayNote({ recurrence, occurrenceDate: '2026-11-23' })).toBe('农历十月十五 · 58 岁');
    expect(birthdayNote({ recurrence: null, occurrenceDate: null })).toBeNull();
  });

  test('asks for a name and a date, and a plausible year', () => {
    expect(validateBirthday(EMPTY_BIRTHDAY, today)).toEqual({ name: '请填写是谁的生日。', date: '请选择生日的日期。' });
    expect(validateBirthday({ ...mom, birthYearText: '2030' }, today)).toEqual({ birthYear: '出生年份需要在 1900 到今年之间。' });
    expect(validateBirthday(mom, today)).toEqual({});
  });
});
