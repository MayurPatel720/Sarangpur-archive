'use client';

import { useState } from 'react';
import { dateTime12, severityMark } from '@/lib/format';
import { PrimaryButton, Textarea } from '@/components/ui/Form';
import type { TaskComment, TaskHistoryEntry } from '@/types/task';

type Item =
  | { type: 'comment'; at: string; id: string; comment: TaskComment }
  | { type: 'event'; at: string; id: string; event: TaskHistoryEntry };

/**
 * One chronological timeline (oldest first) merging comments and history, with the
 * comment box at the bottom. The history's own "comment added" rows are dropped — the
 * comment itself is already in the timeline.
 */
export function TaskActivity({
  comments,
  history,
  canComment,
  pending,
  onPost,
}: {
  comments: TaskComment[];
  history: TaskHistoryEntry[];
  canComment: boolean;
  pending: boolean;
  onPost: (text: string, reset: () => void) => void;
}) {
  const [text, setText] = useState('');

  const items: Item[] = [
    ...comments.map((c): Item => ({ type: 'comment', at: c.at, id: `c-${c.id}`, comment: c })),
    ...history
      .filter((h) => h.kind !== 'task_comment_added')
      .map((h): Item => ({ type: 'event', at: h.at, id: `h-${h.id}`, event: h })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No activity yet.</p> : null}
      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {items.map((item) =>
          item.type === 'comment' ? (
            <li key={item.id} className="flex flex-col gap-0.5 min-w-0 pl-3 border-l-2 border-line-strong">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold text-ink">{item.comment.authorName}</span>
                <span className="text-[11px] text-ink-3">{dateTime12(item.at)}</span>
              </div>
              <p className="m-0 text-[13px] text-ink-2 whitespace-pre-wrap break-words">{item.comment.text}</p>
            </li>
          ) : (
            <li key={item.id} className="flex items-start gap-2 min-w-0 text-[12px] text-ink-3">
              <span
                aria-hidden
                className={`mt-[6px] w-[7px] h-[7px] rounded-full flex-shrink-0 ${severityMark[item.event.severity]}`}
              />
              <span className="min-w-0 break-words">
                <span className="font-medium text-ink-2">{item.event.actorName}</span> · {item.event.title}
                {item.event.detail ? <span> — {item.event.detail}</span> : null}
                <span className="whitespace-nowrap"> · {dateTime12(item.at)}</span>
              </span>
            </li>
          ),
        )}
      </ul>
      {canComment ? (
        <form
          className="flex flex-col gap-2 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onPost(text.trim(), () => setText(''));
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            maxLength={2000}
            rows={2}
            aria-label="New comment"
          />
          <div className="flex justify-end">
            <PrimaryButton type="submit" disabled={pending || text.trim() === ''}>
              {pending ? 'Posting…' : 'Comment'}
            </PrimaryButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
