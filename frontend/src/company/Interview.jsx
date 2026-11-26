import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GraduationCap, ListChecks, Pencil, Phone, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { STATUS, api, experienceText, useInfo } from '../lib.jsx';
import { Avatar, Brand, Button, Card, ErrorNote, Input, PageLoader, Textarea, TokenBadge, cx, useToast } from '../ui.jsx';

// How an answer went, from 1 to 5. Every question is optional.
export const SCALE = [
  { value: 1, label: 'Poor', on: 'bg-rose-600 text-white ring-rose-600' },
  { value: 2, label: 'Not satisfied', on: 'bg-orange-500 text-white ring-orange-500' },
  { value: 3, label: 'Average', on: 'bg-slate-700 text-white ring-slate-700' },
  { value: 4, label: 'Good', on: 'bg-sky-600 text-white ring-sky-600' },
  { value: 5, label: 'Excellent', on: 'bg-emerald-600 text-white ring-emerald-600' },
];
const RESULTS = ['interviewed', 'shortlisted', 'selected', 'rejected'];

export const scoreText = (score) => (score == null ? '' : `${Number.isInteger(score) ? score : score.toFixed(1)}/5`);

function scoreWord(score) {
  if (score == null) return 'Not rated yet';
  return SCALE[Math.min(4, Math.max(0, Math.round(score) - 1))].label;
}

// The company's own question list, used for all its interviews.
function QuestionEditor({ questions, custom, onSaved, onCancel }) {
  const toast = useToast();
  const [list, setList] = useState(() => questions.map((q) => ({ ...q })));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');

  const add = () => {
    const text = draft.trim();
    if (text.length < 3) return;
    setList((old) => [...old, { id: '', text }]);
    setDraft('');
  };

  async function save(body, kind) {
    setBusy(kind);
    try {
      const result = await api('/recruiter/questions', { method: 'PUT', body });
      toast(kind === 'reset' ? 'Suggested questions are back' : 'Questions saved for all your interviews');
      onSaved(result.company);
    } catch (err) {
      toast(err.message, 'error');
      setBusy('');
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">These questions are used for every interview at your desk. Ratings already saved keep the wording they had.</p>
      <ol className="space-y-2">
        {list.map((q, i) => (
          <li key={q.id || `new-${i}`} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-slate-400">{i + 1}</span>
            <Input
              value={q.text}
              onChange={(e) => setList((old) => old.map((item, j) => (j === i ? { ...item, text: e.target.value } : item)))}
              maxLength={200}
              aria-label={`Question ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => setList((old) => old.filter((_, j) => j !== i))}
              aria-label={`Remove question ${i + 1}`}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-slate-500 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a question, e.g. Can you use MS Excel?"
          maxLength={200}
          aria-label="New question"
        />
        <Button variant="secondary" onClick={add} disabled={draft.trim().length < 3} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" /> Add
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        {custom ? (
          <Button variant="ghost" size="sm" onClick={() => save({ reset: true }, 'reset')} loading={busy === 'reset'}>
            {busy !== 'reset' && <RotateCcw className="size-4" aria-hidden="true" />} Use the suggested questions
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              // A question typed in the box but not added yet is saved too.
              const typed = draft.trim().length >= 3 ? [{ id: '', text: draft.trim() }] : [];
              save({ questions: [...list, ...typed].map((q) => ({ id: q.id || undefined, text: q.text })) }, 'save');
            }}
            loading={busy === 'save'}
          >
            Save questions
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

function ScoreBox({ score, rated, total, className }) {
  return (
    <div className={cx('rounded-2xl bg-blue-50 px-4 py-3 text-slate-900 ring-1 ring-inset ring-blue-200', className)} aria-live="polite">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Overall score</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold leading-none tabular-nums">{score == null ? '–' : scoreText(Math.round(score * 10) / 10)}</span>
        <span className="text-sm font-semibold text-slate-600">{scoreWord(score)}</span>
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {rated} of {total} questions rated
      </p>
    </div>
  );
}

// The interview of one candidate, on its own page: the questions to rate (all optional), notes and
// the result. Opened from the company dashboard by Start interview, which has called the candidate in.
export default function Interview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { info } = useInfo();
  const [company, setCompany] = useState(null);
  const [row, setRow] = useState(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState({});
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState('interviewed');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/recruiter/me'), api(`/recruiter/applications/${id}`)])
      .then(([me, one]) => {
        setCompany(me.company);
        setRow(one.row);
        setRatings(Object.fromEntries((one.row.interview?.ratings ?? []).map((r) => [r.id, r.rating])));
        setNotes(one.row.interview?.notes ?? '');
        setResult(one.row.status === 'applied' ? 'interviewed' : one.row.status);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // Questions rated earlier that are no longer in the list are still shown, so nothing is lost.
  const questions = company?.questions ?? [];
  const earlier = useMemo(() => (row?.interview?.ratings ?? []).filter((r) => !questions.some((q) => q.id === r.id)), [row, questions]);

  if (error) return <ErrorNote message={error} onRetry={() => window.location.reload()} />;
  if (!company || !row) return <PageLoader />;

  const all = [...questions, ...earlier.map((r) => ({ id: r.id, text: r.text, earlier: true }))];
  const rated = all.filter((q) => ratings[q.id]);
  const score = rated.length ? rated.reduce((sum, q) => sum + ratings[q.id], 0) / rated.length : null;

  async function save() {
    setBusy(true);
    try {
      const body = { ratings: rated.map((q) => ({ id: q.id, text: q.text, rating: ratings[q.id] })), notes, status: result };
      const answer = await api(`/recruiter/applications/${row.id}/interview`, { method: 'PUT', body });
      toast(`${row.full_name}: ${STATUS[answer.status].label}${answer.interview.score != null ? ` · ${scoreText(answer.interview.score)}` : ''}`);
      navigate('/company/candidates');
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  const saveLabel = `Save · ${STATUS[result].label}`;

  return (
    <div className="min-h-dvh bg-slate-50 pb-32 lg:pb-12">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/company/candidates" className="inline-flex min-h-11 items-center gap-2 rounded-full pr-3 text-sm font-bold text-slate-700 hover:text-slate-900">
            <ArrowLeft className="size-5" aria-hidden="true" /> Candidates
          </Link>
          <Brand name={info.fair_name} to="/company" />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* The candidate, the score and the result: on the right on a big screen, first on a phone */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2">
          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <Avatar name={row.full_name} round className="size-14 text-lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Interview</p>
                <h1 className="text-xl font-extrabold leading-tight tracking-tight text-slate-900">{row.full_name}</h1>
                <p className="text-sm text-slate-500">
                  {row.reg_no}
                  {row.role ? ` · ${row.role}` : ''}
                </p>
              </div>
              <TokenBadge token={row.token_no} className="shrink-0" />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
              <div className="col-span-2">
                <Fact label="Qualification">{[row.qualification, row.specialization].filter(Boolean).join(' · ')}</Fact>
              </div>
              <Fact label="Experience">
                {experienceText(row)}
                {row.experience_type === 'experienced' && (row.last_role || row.last_company) ? ` · ${[row.last_role, row.last_company].filter(Boolean).join(' at ')}` : ''}
              </Fact>
              <Fact label="Marks">{row.percentage}</Fact>
              <div className="col-span-2">
                <Fact label="College">{[row.college, row.passing_year].filter(Boolean).join(' · ')}</Fact>
              </div>
              <div className="col-span-2">
                <Fact label="Skills">{row.skills}</Fact>
              </div>
              <Fact label="Languages">{row.languages}</Fact>
              <Fact label="City">{row.city}</Fact>
            </dl>
            <a href={`tel:${row.mobile}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">
              <Phone className="size-4" aria-hidden="true" /> {row.mobile}
            </a>
          </Card>

          <ScoreBox score={score} rated={rated.length} total={all.length} className="hidden lg:block" />

          <Card className="p-5">
            <fieldset>
              <legend className="mb-2.5 flex items-center gap-1.5 font-extrabold text-slate-900">
                <GraduationCap className="size-5 text-slate-400" aria-hidden="true" /> Result
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {RESULTS.map((key) => (
                  <label
                    key={key}
                    className={cx(
                      'flex min-h-12 cursor-pointer items-center justify-center rounded-2xl px-2 text-center text-sm font-bold ring-1 ring-inset transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600',
                      result === key ? cx(STATUS[key].cls, 'ring-2') : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <input type="radio" name="result" value={key} checked={result === key} onChange={() => setResult(key)} className="sr-only" />
                    {STATUS[key].label}
                  </label>
                ))}
              </div>
            </fieldset>
            {/* On a phone, Save is in the bar at the bottom of the screen instead */}
            <div className="mt-4 hidden lg:block">
              <Button size="lg" onClick={save} loading={busy} className="w-full">
                {saveLabel}
              </Button>
            </div>
          </Card>
        </aside>

        <div className="space-y-5 lg:order-1">
          <Card className="p-5">
            {editing ? (
              <>
                <h2 className="mb-3 flex items-center gap-1.5 text-lg font-extrabold text-slate-900">
                  <Pencil className="size-5 text-slate-400" aria-hidden="true" /> Interview questions
                </h2>
                <QuestionEditor
                  questions={questions}
                  custom={company.questions_custom}
                  onCancel={() => setEditing(false)}
                  onSaved={(updated) => {
                    setCompany(updated);
                    setEditing(false);
                  }}
                />
              </>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-slate-900">
                    <ListChecks className="size-5 text-slate-400" aria-hidden="true" /> Questions
                    <span className="text-sm font-semibold text-slate-500">· optional</span>
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="size-4" aria-hidden="true" /> Edit questions
                  </Button>
                </div>
                {all.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">No questions. Tap Edit questions to add yours, or just set the result.</p>
                ) : (
                  <ol className="divide-y divide-slate-100">
                    {all.map((q, i) => (
                      <li key={q.id} className="py-4 first:pt-1 last:pb-1">
                        <fieldset>
                          <legend className="flex w-full items-start justify-between gap-2 text-base font-bold text-slate-900">
                            <span>
                              <span className="mr-1.5 tabular-nums text-slate-400">{i + 1}.</span>
                              {q.text}
                              {q.earlier && <span className="ml-1.5 text-xs font-semibold text-slate-400">(earlier question)</span>}
                            </span>
                            {ratings[q.id] && (
                              <button
                                type="button"
                                onClick={() => setRatings((old) => ({ ...old, [q.id]: undefined }))}
                                className="min-h-8 shrink-0 cursor-pointer rounded-full px-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                              >
                                Clear
                              </button>
                            )}
                          </legend>
                          <div className="mt-2.5 grid grid-cols-5 gap-1.5 sm:gap-2">
                            {SCALE.map((s) => {
                              const on = ratings[q.id] === s.value;
                              return (
                                <label
                                  key={s.value}
                                  className={cx(
                                    'flex min-h-12 cursor-pointer items-center justify-center rounded-xl px-1 text-center text-xs font-bold leading-tight ring-1 ring-inset transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 sm:text-sm',
                                    on ? s.on : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`q-${q.id}`}
                                    value={s.value}
                                    checked={on}
                                    onChange={() => setRatings((old) => ({ ...old, [q.id]: s.value }))}
                                    className="sr-only"
                                  />
                                  {s.label}
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </Card>

          <Card className="p-5">
            <label className="block">
              <span className="mb-2 block text-lg font-extrabold text-slate-900">Notes</span>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={2000} placeholder="Anything to remember about this candidate" />
            </label>
          </Card>
        </div>
      </main>

      {/* On a phone the score and the save button stay at the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="shrink-0 rounded-2xl bg-blue-50 px-3.5 py-1.5 text-center text-slate-900 ring-1 ring-inset ring-blue-200" aria-live="polite">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Score</p>
            <p className="text-lg font-extrabold leading-tight tabular-nums">{score == null ? '–' : scoreText(Math.round(score * 10) / 10)}</p>
          </div>
          <Button size="lg" onClick={save} loading={busy} className="flex-1">
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
