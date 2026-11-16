import type { FunctionalComponent as FC, JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { AGES, FILTER_SECTIONS, LISTS, SEASONS, STATUSES, TRANSLATES, TYPES } from '~/data/catalog';
import { cachedRequest, peekRequest } from '~/lib/api';
import {
  filterCount,
  filterQuery,
  parseCatalogQuery,
  validateFilters,
  type CatalogFilters,
  type FilterKey,
} from '~/lib/filters';
import { useResource, useSession } from '~/lib/hooks';

import {
  Button,
  ButtonLink,
  Field,
  Form,
  FormActions,
  FormError,
  Icon,
  Input,
  SEARCH_INPUT_PROPS,
  Select,
  Sheet,
} from '~/ui';

interface Genre {
  title: string;
  href: string;
  value: number;
  group_id: number;
}

const values = (value: string) => value.split(',').filter(Boolean);

export type TFilterSheetProps = {
  query: string;
  close: () => void;
  initialSection?: string;
};

export const FilterSheet: FC<TFilterSheetProps> = ({ query, close, initialSection = 'main' }) => {
  const session = useSession();
  const [draft, setDraft] = useState(() => parseCatalogQuery(query));
  const [section, setSection] = useState(initialSection);
  const [genreMode, setGenreMode] = useState<'include' | 'exclude'>('include');
  const [error, setError] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const genres = useResource(
    signal => cachedRequest<{ genres: Genre[] }>('/anime/genres', {}, signal),
    [],
    () => peekRequest<{ genres: Genre[] }>('/anime/genres')
  );

  useEffect(() => {
    form.current?.parentElement?.scrollTo?.({ top: 0 });
  }, [section]);

  const set = useCallback((key: keyof CatalogFilters, value: string) => {
    setError('');
    setDraft(previous => ({ ...previous, [key]: value }));
  }, []);

  const toggle = useCallback(
    (key: FilterKey, value: string) => {
      const selected = values(draft[key]);

      set(
        key,
        (selected.includes(value)
          ? selected.filter(item => item !== value)
          : [...selected, value]
        ).join(',')
      );
    },
    [draft, set]
  );

  const choices = useCallback(
    (title: string, key: FilterKey, options: string[][]) => (
      <fieldset class="filter-group">
        <legend>{title}</legend>
        <div class="filter-options">
          {options.map(([value, label]) => (
            <button
              type="button"
              key={value}
              class={
                values(draft[key]).includes(value) ? 'filter-option included' : 'filter-option'
              }
              aria-pressed={values(draft[key]).includes(value)}
              onClick={() => toggle(key, value)}
            >
              {values(draft[key]).includes(value) && <Icon name="check" size={14} />} {label}
            </button>
          ))}
        </div>
      </fieldset>
    ),
    [draft, toggle]
  );

  const range = useCallback(
    (title: string, from: FilterKey, to: FilterKey, min: number, max: number, step = 1) => (
      <fieldset class="filter-group">
        <legend>{title}</legend>
        <div class="filter-range">
          <Field label="От">
            <Input
              aria-label={`${title} от`}
              type="number"
              inputMode={step < 1 ? 'decimal' : 'numeric'}
              min={min}
              max={max}
              step={step}
              value={draft[from]}
              onInput={event => set(from, event.currentTarget.value)}
              placeholder={String(min)}
            />
          </Field>
          <span>—</span>
          <Field label="До">
            <Input
              aria-label={`${title} до`}
              type="number"
              inputMode={step < 1 ? 'decimal' : 'numeric'}
              min={min}
              max={max}
              step={step}
              value={draft[to]}
              onInput={event => set(to, event.currentTarget.value)}
              placeholder={String(max)}
            />
          </Field>
        </div>
      </fieldset>
    ),
    [draft, set]
  );

  const count = useMemo(() => filterCount(draft), [draft]);
  const genreChoices = useMemo(() => {
    const included = new Set(values(draft.genres));
    const excluded = new Set(values(draft.exclude_genres));

    return (genres.value?.data.genres || []).map(genre => ({
      ...genre,
      included: included.has(genre.href) || included.has(String(genre.value)),
      excluded: excluded.has(genre.href) || excluded.has(String(genre.value)),
    }));
  }, [genres.value, draft.genres, draft.exclude_genres]);
  const selectedGenres = useMemo(
    () => genreChoices.filter(genre => genre.included || genre.excluded),
    [genreChoices]
  );
  const visibleGenres = useMemo(
    () =>
      genreChoices.filter(genre =>
        genre.title.toLocaleLowerCase().includes(genreSearch.toLocaleLowerCase())
      ),
    [genreChoices, genreSearch]
  );

  const submit = useCallback(
    (event: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
      event.preventDefault();

      const validation = validateFilters(draft);

      if (validation) {
        setError(validation);
        setSection(
          validation.startsWith('Рейтинг') || validation.startsWith('Количество оценок')
            ? 'rating'
            : 'main'
        );

        return;
      }
      if (draft.exclude_list && !session?.verified) {
        setError('Войди в аккаунт или убери исключение списков.');
        setSection('lists');

        return;
      }

      const next = filterQuery({ ...draft, q: parseCatalogQuery(query).q });

      location.hash = `/catalog${next ? `?${next}` : ''}`;
      close();
    },
    [draft, session?.verified, query, close]
  );

  const resetFilters = useCallback(() => {
    setDraft(previous => ({ ...parseCatalogQuery(''), q: previous.q }));
    setError('');
  }, []);

  const recentYears = useCallback(
    () => setDraft(previous => ({ ...previous, from_year: '2020', to_year: '' })),
    []
  );

  const includeGenres = useCallback(() => setGenreMode('include'), []);

  const excludeGenres = useCallback(() => setGenreMode('exclude'), []);

  const changeGenreSearch = useCallback(
    (event: JSX.TargetedInputEvent<HTMLInputElement>) => setGenreSearch(event.currentTarget.value),
    []
  );

  const changeSort = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) => set('sort', event.currentTarget.value),
    [set]
  );

  const changeDirection = useCallback(
    (event: JSX.TargetedEvent<HTMLSelectElement>) => set('sort_forward', event.currentTarget.value),
    [set]
  );

  const includeAllLists = useCallback(() => set('exclude_list', ''), [set]);

  return (
    <Sheet
      title="Фильтры аниме"
      subtitle={count ? `Выбрано условий: ${count}` : 'Подбери аниме под себя'}
      close={close}
      className="filters-screen"
      actions={
        <Button onClick={resetFilters} variant="text">
          Сбросить
        </Button>
      }
      navigation={
        <nav class="filter-categories" aria-label="Разделы фильтров">
          {FILTER_SECTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              class={section === value ? 'active' : ''}
              aria-pressed={section === value}
              onClick={() => setSection(value)}
            >
              {label}
              {value === 'genres' && selectedGenres.length > 0 && (
                <span>{selectedGenres.length}</span>
              )}
            </button>
          ))}
        </nav>
      }
      footer={
        <>
          {error && <FormError class="sheet-validation">{error}</FormError>}
          <FormActions class="filter-apply-row">
            <span>{count ? `${count} условий` : 'Все аниме'}</span>
            <Button type="submit" form="catalog-filters-form" variant="primary">
              Показать аниме
              <Icon name="arrow" size={17} />
            </Button>
          </FormActions>
        </>
      }
    >
      <Form ref={form} id="catalog-filters-form" noValidate onSubmit={submit}>
        {section === 'main' && (
          <>
            {choices('Статус', 'status', STATUSES)}
            {choices('Формат', 'types', TYPES)}
            {range('Год выхода', 'from_year', 'to_year', 1900, 2100)}
            <div class="year-presets">
              {[new Date().getFullYear(), new Date().getFullYear() - 1].map(year => (
                <button
                  type="button"
                  key={year}
                  onClick={() =>
                    setDraft(previous => ({
                      ...previous,
                      from_year: String(year),
                      to_year: String(year),
                    }))
                  }
                >
                  {year}
                </button>
              ))}
              <button type="button" onClick={recentYears}>
                2020 и новее
              </button>
            </div>
            {choices('Сезон', 'season', SEASONS)}
            {range('Количество серий', 'ep_from', 'ep_to', 0, 10000)}
            {choices('Озвучка и субтитры', 'translates', TRANSLATES)}
            {choices('Возрастной рейтинг', 'min_age', AGES)}
          </>
        )}
        {section === 'genres' && (
          <>
            <div class="genre-mode">
              <button
                type="button"
                aria-pressed={genreMode === 'include'}
                class={genreMode === 'include' ? 'active' : ''}
                onClick={includeGenres}
              >
                Включить жанры
              </button>
              <button
                type="button"
                aria-pressed={genreMode === 'exclude'}
                class={genreMode === 'exclude' ? 'active excluded' : ''}
                onClick={excludeGenres}
              >
                Исключить жанры
              </button>
            </div>
            <p class="filter-help">
              {genreMode === 'include'
                ? 'Покажем аниме с выбранными жанрами.'
                : 'Спрячем аниме с выбранными жанрами.'}{' '}
              Повторное нажатие снимает выбор.
            </p>
            {selectedGenres.length > 0 && (
              <div class="selected-genre-chips">
                {selectedGenres.map(genre => (
                  <button
                    type="button"
                    key={genre.value}
                    class={
                      values(draft.exclude_genres).some(
                        value => value === genre.href || value === String(genre.value)
                      )
                        ? 'excluded'
                        : ''
                    }
                    onClick={() =>
                      setDraft(previous => ({
                        ...previous,
                        genres: values(previous.genres)
                          .filter(value => value !== genre.href && value !== String(genre.value))
                          .join(','),
                        exclude_genres: values(previous.exclude_genres)
                          .filter(value => value !== genre.href && value !== String(genre.value))
                          .join(','),
                      }))
                    }
                  >
                    {genre.title}
                    <Icon name="close" size={14} />
                  </button>
                ))}
              </div>
            )}
            <div class="genre-search-field">
              <Icon name="search" size={19} />
              <Input
                type="search"
                {...SEARCH_INPUT_PROPS}
                value={genreSearch}
                onInput={changeGenreSearch}
                placeholder="Найти жанр или тег"
                aria-label="Найти жанр"
              />
            </div>
            {genres.loading ? (
              <p class="filter-help">Загружаем жанры…</p>
            ) : genres.error ? (
              <div class="account-error">
                {genres.error}
                <Button type="button" onClick={genres.retry} variant="text">
                  Повторить
                </Button>
              </div>
            ) : (
              <div class="filter-options all-genres">
                {visibleGenres.map(genre => {
                  const { included, excluded } = genre;

                  return (
                    <button
                      type="button"
                      key={genre.value}
                      class={`filter-option ${included ? 'included' : excluded ? 'excluded' : ''}`}
                      aria-pressed={excluded ? 'mixed' : included}
                      aria-label={`${genre.title}: ${included ? 'включён' : excluded ? 'исключён' : 'не выбран'}`}
                      onClick={() => {
                        const include = values(draft.genres).filter(
                          value => value !== genre.href && value !== String(genre.value)
                        );
                        const exclude = values(draft.exclude_genres).filter(
                          value => value !== genre.href && value !== String(genre.value)
                        );

                        if (genreMode === 'include' && !included) include.push(genre.href);
                        else if (genreMode === 'exclude' && !excluded) exclude.push(genre.href);
                        setDraft(previous => ({
                          ...previous,
                          genres: include.join(','),
                          exclude_genres: exclude.join(','),
                        }));
                      }}
                    >
                      {included ? (
                        <Icon name="check" size={14} />
                      ) : excluded ? (
                        <span>−</span>
                      ) : null}
                      {genre.title}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {section === 'rating' && (
          <>
            {range('Рейтинг', 'min_rating', 'max_rating', 0, 10, 0.1)}
            <div class="year-presets">
              {[7, 8, 9].map(value => (
                <button type="button" key={value} onClick={() => set('min_rating', String(value))}>
                  От {value} ★
                </button>
              ))}
            </div>
            {range(
              'Количество оценок',
              'min_rating_counters',
              'max_rating_counters',
              0,
              1000000000
            )}
            <fieldset class="filter-group">
              <legend>Сортировка</legend>
              <Field label="Порядок">
                <Select value={draft.sort} onChange={changeSort}>
                  <option value="views">По просмотрам</option>
                  <option value="top">По месту в топе</option>
                  <option value="rating">По рейтингу</option>
                  <option value="rating_counters">По числу оценок</option>
                  <option value="year">По году выхода</option>
                  <option value="title">По названию</option>
                  <option value="id">По добавлению</option>
                  <option value="random">Случайно</option>
                </Select>
              </Field>
              <Field class="sort-direction" label="Направление">
                <Select value={draft.sort_forward} onChange={changeDirection}>
                  <option value="">По умолчанию</option>
                  <option value="true">По возрастанию</option>
                  <option value="false">По убыванию</option>
                </Select>
              </Field>
            </fieldset>
          </>
        )}
        {section === 'lists' && (
          <>
            {session?.verified ? (
              <>
                <p class="filter-help">
                  Не показывать аниме, которые уже есть в выбранных списках твоего аккаунта.
                </p>
                {choices('Исключить списки', 'exclude_list', LISTS)}
              </>
            ) : (
              <div class="filter-account-prompt">
                <Icon name="bookmark" size={34} />
                <h3>Свой каталог без повторов</h3>
                <p>Войди, чтобы скрывать просмотренное и аниме из других твоих списков.</p>
                <ButtonLink href="#/account" onClick={close} variant="primary">
                  Войти в YummyAnime
                </ButtonLink>
                {draft.exclude_list && (
                  <Button type="button" onClick={includeAllLists} variant="text">
                    Убрать исключение списков
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </Form>
    </Sheet>
  );
};
