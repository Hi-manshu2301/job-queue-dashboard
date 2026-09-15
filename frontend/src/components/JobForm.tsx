import { useState } from 'react';
import type { FormEvent } from 'react';

interface JobFormProps {
  onCreate: (title: string, type: string) => Promise<boolean>;
}

export function JobForm({ onCreate }: JobFormProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !type.trim()) return;

    setIsSubmitting(true);
    const ok = await onCreate(title.trim(), type.trim());
    setIsSubmitting(false);
    if (ok) {
      setTitle('');
      setType('');
    }
  };

  return (
    <form className="job-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Job title (e.g. Send welcome emails)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        required
        aria-label="Job title"
      />
      <input
        type="text"
        placeholder="Job type (e.g. email)"
        value={type}
        onChange={(e) => setType(e.target.value)}
        maxLength={100}
        required
        aria-label="Job type"
      />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create job'}
      </button>
    </form>
  );
}
