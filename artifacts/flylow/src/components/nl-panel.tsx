import { useState } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { type Answers, type ParseResult, parseRequest } from '@/lib/nlParse';
import { draftToJsonText, validatePolicyJson } from '@/lib/policyJson';
import { type PolicyDraft } from '@/lib/policy';
import { Pill } from './shell';

const EXAMPLE = 'Find me a cheap flight from Chicago to Dublin in late May, returning mid August, under $650, one checked bag, no basic economy.';
const SRC_TONE = { text: 'ok', answer: 'ok', assumed: 'warn', missing: 'bad' } as const;

export function NlPanel({ onApply }: { onApply: (d: PolicyDraft) => void }) {
  const [text, setText] = useState(EXAMPLE);
  const [answers, setAnswers] = useState<Answers>({});
  const [res, setRes] = useState<ParseResult | null>(null);
  const [json, setJson] = useState('');
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState(false);

  const run = (a: Answers, t = text) => {
    const r = parseRequest(t, a);
    setRes(r); setAnswers(a); setJson(draftToJsonText(r.draft)); setJsonErrors([]); setApplied(false);
  };
  const answer = (id: keyof Answers, v: string) => run({ ...answers, [id]: v });
  const check = validatePolicyJson(json);

  return (
    <section className="fl-card p-5" data-testid="panel-nl">
      <h2 className="font-serif text-xl flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Tell FlyLow what you want</h2>
      <p className="text-xs text-muted-foreground mt-1">A transparent rule-based parser, not a model. It fills a visible draft; nothing is approved or booked.</p>
      <textarea className="fl-input mt-3 min-h-[92px]" value={text} onChange={(e) => { setText(e.target.value); }} data-testid="input-nl" />
      <div className="mt-2 flex gap-2">
        <button className="fl-btn amber" onClick={() => run({})} data-testid="button-parse">Extract rules</button>
        <button className="fl-btn ghost" onClick={() => { setText(''); setRes(null); setAnswers({}); }} data-testid="button-clear-nl">Clear</button>
      </div>

      {res && (
        <div className="mt-4 space-y-4">
          {res.clarifications.length > 0 && (
            <div className="rounded-xl border border-accent/60 bg-accent/10 p-3 space-y-3" data-testid="panel-clarify">
              <p className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> A few things need your answer first</p>
              {res.clarifications.map((c) => (
                <div key={c.id} data-testid={`clarify-${c.id}`}>
                  <p className="text-sm">{c.question}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                    {c.options.map((o) => (
                      <button key={o.value} className="fl-btn ghost !py-1 !text-xs" onClick={() => answer(c.id, o.value)} data-testid={`button-answer-${c.id}-${o.value}`}>{o.label}</button>
                    ))}
                    {c.custom && (
                      <>
                        <input className="fl-input !w-28 !py-1" placeholder={c.custom === 'year' ? 'YYYY' : 'USD'} value={custom[c.id] ?? ''} onChange={(e) => setCustom({ ...custom, [c.id]: e.target.value })} data-testid={`input-answer-${c.id}`} />
                        <button className="fl-btn !py-1 !text-xs" onClick={() => answer(c.id, (custom[c.id] ?? '').trim())} data-testid={`button-answer-custom-${c.id}`}>Use</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="fl-label">Extracted, with where each value came from</p>
            <ul className="grid sm:grid-cols-2 gap-x-4 text-sm" data-testid="list-fields">
              {res.fields.map((f) => (
                <li key={`${f.key}-${f.label}`} className="flex justify-between gap-2 border-b border-border/70 py-1">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="flex items-center gap-1.5 font-mono text-xs">{f.value || '-'} <Pill tone={SRC_TONE[f.source]}>{f.source}{f.snippet ? `: ${f.snippet}` : ''}</Pill></span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="fl-label">Editable JSON (validated on every change)</p>
            <textarea className="fl-input font-mono text-xs min-h-[220px]" value={json} onChange={(e) => { setJson(e.target.value); setApplied(false); }} spellCheck={false} data-testid="input-json" />
            {check.ok
              ? <p className="text-xs text-primary mt-1 flex items-center gap-1" data-testid="status-json"><CheckCircle2 className="h-3.5 w-3.5" /> Valid. Not approved: this only fills the search form.</p>
              : <ul className="text-xs text-destructive mt-1 list-disc pl-4" data-testid="status-json">{check.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
            <button className="fl-btn mt-2" disabled={!check.ok || res.clarifications.length > 0} onClick={() => {
              const v = validatePolicyJson(json);
              if (!v.ok) { setJsonErrors(v.errors); return; }
              onApply(v.draft); setApplied(true);
            }} data-testid="button-apply-json">Use these rules in the search form</button>
            {res.clarifications.length > 0 && <span className="text-xs text-muted-foreground ml-2">Answer the questions above first.</span>}
            {applied && <span className="text-xs text-primary ml-2" data-testid="status-applied">Applied to the form. Review it, then search.</span>}
            {jsonErrors.length > 0 && <p className="text-xs text-destructive">{jsonErrors.join(' ')}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
