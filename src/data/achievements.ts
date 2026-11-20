export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', title: 'Первая искра', desc: 'Победить первого врага' },
  { id: 'slime_bane', title: 'Гроза слизней', desc: 'Уничтожить 15 слизней' },
  { id: 'bone_breaker', title: 'Костолом', desc: 'Разбить 15 скелетов' },
  { id: 'exorcist', title: 'Изгоняющий', desc: 'Развеять 10 пепельных духов' },
  { id: 'treasure', title: 'Кладоискатель', desc: 'Открыть 8 сундуков' },
  { id: 'rich', title: 'Звон монет', desc: 'Иметь 150 монет одновременно' },
  { id: 'tempered', title: 'Закалённый', desc: 'Купить 6 улучшений' },
  { id: 'veteran', title: 'Ветеран', desc: 'Достичь 6 уровня персонажа' },
  { id: 'first_beacon', title: 'Первый свет', desc: 'Зажечь первый маяк' },
  { id: 'untouchable', title: 'Неуязвимый', desc: 'Пройти уровень, не получив урона' },
  { id: 'kingslayer', title: 'Цареубийца', desc: 'Сразить Пепельного Короля' },
  { id: 'swift', title: 'Быстрый свет', desc: 'Пройти игру быстрее чем за 25 минут' },
];
