import { useEffect, useState, type FormEvent } from 'react';
import { api, errorText } from '../api/client';
import type { Brand } from '../api/types';
import { Button, Field, LoadError, PageHead, Spinner } from '../components/common';
import { useLoad } from '../lib/hooks';
import { useWorkspace } from '../workspace';

const EMPTY: Brand = { name: '', handle: '', description: '', audience: '', voice: '', avoid: '' };

export function BrandView() {
  const ws = useWorkspace();
  const brand = useLoad(api.brand.get, []);
  const [base, setBase] = useState<Brand>(EMPTY);
  const [form, setForm] = useState<Brand>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (brand.data) { setBase(brand.data); setForm(brand.data); }
  }, [brand.data]);

  const dirty = (Object.keys(EMPTY) as (keyof Brand)[]).some(key => form[key] !== base[key]);
  const bind = (key: keyof Brand) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }) });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await api.brand.save(form);
      setBase(saved);
      setForm(saved);
      ws.toast('Brand saved. The generator uses it from the next call.');
    } catch (e) {
      ws.toast(errorText(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="Configure" title="Brand">Sent to the generator on every call.</PageHead>
      {brand.error && <LoadError message={brand.error} onRetry={brand.reload} />}
      {!brand.data && brand.loading && <Spinner />}
      {brand.data && (
        <form className="card narrow" onSubmit={e => void save(e)}>
          <div className="form-row">
            <Field label="Name"><input maxLength={120} {...bind('name')} /></Field>
            <Field label="Handle"><input maxLength={120} {...bind('handle')} /></Field>
          </div>
          <Field label="Description" hint="What the brand does, in plain words."><textarea rows={3} maxLength={2000} {...bind('description')} /></Field>
          <Field label="Audience"><textarea rows={2} maxLength={1000} {...bind('audience')} /></Field>
          <Field label="Voice"><textarea rows={2} maxLength={1000} {...bind('voice')} /></Field>
          <Field label="Avoid" hint="Topics or phrasing generated content must stay away from."><textarea rows={2} maxLength={2000} {...bind('avoid')} /></Field>
          <div className="row row-end">
            <Button disabled={!dirty || busy} onClick={() => setForm(base)}>Discard</Button>
            <Button variant="primary" type="submit" busy={busy} disabled={!dirty}>Save brand</Button>
          </div>
        </form>
      )}
    </>
  );
}
