// Journal de la partie et chat : panneau latéral sur grand écran, fenêtre sur téléphone.
import { Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LogEntry } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { send } from '../net';

export function FeedList({ log }: { log: LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  const lastId = log.length ? log[log.length - 1].id : 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [lastId]);
  return (
    <div className="feed-list" role="log" aria-label="Journal de la partie">
      {log.map((l) => (
        <p key={l.id} className={cls('feed-line', `is-${l.kind}`)}>
          {l.text}
        </p>
      ))}
      <div ref={end} />
    </div>
  );
}

export function ChatInput() {
  const [text, setText] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    await send('chat', { text: value });
  };
  return (
    <form className="chat-input" onSubmit={submit}>
      <input className="input" placeholder="Un message pour la table…" value={text} maxLength={160} aria-label="Message" onChange={(e) => setText(e.target.value)} />
      <button type="submit" className="icon-btn is-solid" aria-label="Envoyer" disabled={!text.trim()}>
        <Send size={18} />
      </button>
    </form>
  );
}
