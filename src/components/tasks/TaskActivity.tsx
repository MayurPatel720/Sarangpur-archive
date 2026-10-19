'use client';

import { useRef, useState } from 'react';
import { dateTime12, severityMark } from '@/lib/format';
import { photoLargeUrl, photoThumbUrl } from '@/lib/project-photos';
import { useCommentImages } from '@/hooks/useCommentImages';
import { GhostButton, PrimaryButton, Textarea } from '@/components/ui/Form';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { MAX_COMMENT_IMAGES, type TaskAttachment, type TaskComment, type TaskHistoryEntry } from '@/types/task';

type Item =
  | { type: 'comment'; at: string; id: string; comment: TaskComment }
  | { type: 'event'; at: string; id: string; event: TaskHistoryEntry };

/** Thumbnails of a comment's images; a tap opens the viewer on that picture. */
function CommentImages({ items, onOpen }: { items: TaskAttachment[]; onOpen: (index: number) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="m-0 mt-1 p-0 list-none grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-w-[420px]">
      {items.map((a, i) => (
        <li key={a.publicId} className="min-w-0">
          <button
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Open image ${i + 1} of ${items.length}: ${a.fileName}`}
            className="block w-full aspect-square p-0 border border-line rounded-[6px] overflow-hidden bg-surface-sunken cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoThumbUrl(a.url)} alt={a.fileName} loading="lazy" className="w-full h-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One timeline (newest first) merging comments and history, with the comment box on top
 * so a new comment lands right under it. The box takes text, images, or both: pick files,
 * drop them on the box, or paste a screenshot. The history's own "comment added" rows are
 * dropped — the comment itself is already in the timeline.
 */
export function TaskActivity({
  taskId,
  comments,
  history,
  canComment,
  pending,
  onPost,
}: {
  taskId: string;
  comments: TaskComment[];
  history: TaskHistoryEntry[];
  canComment: boolean;
  pending: boolean;
  onPost: (body: { text: string; attachments: TaskAttachment[] }, reset: () => void) => void;
}) {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewer, setViewer] = useState<{ images: TaskAttachment[]; index: number } | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const images = useCommentImages(taskId);

  const items: Item[] = [
    ...comments.map((c): Item => ({ type: 'comment', at: c.at, id: `c-${c.id}`, comment: c })),
    ...history
      .filter((h) => h.kind !== 'task_comment_added')
      .map((h): Item => ({ type: 'event', at: h.at, id: `h-${h.id}`, event: h })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const addFiles = (list: FileList | File[] | null) => {
    const picked = list ? Array.from(list) : [];
    if (picked.length > 0) setNote(images.add(picked));
  };
  const canPost = !pending && !images.uploading && (text.trim() !== '' || images.attachments.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {canComment ? (
        <form
          className={`flex flex-col gap-2 rounded-[8px] ${dragging ? 'outline outline-2 outline-accent outline-offset-2' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!canPost) return;
            onPost({ text: text.trim(), attachments: images.attachments }, () => {
              setText('');
              setNote(null);
              images.reset();
            });
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
              if (pasted.length > 0) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            placeholder="Write a comment… (you can paste or drop images)"
            maxLength={2000}
            rows={2}
            aria-label="New comment"
          />

          {images.items.length > 0 ? (
            <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Images to attach">
              {images.items.map((img) => (
                <li key={img.key} className="relative w-[72px] h-[72px] rounded-[6px] overflow-hidden border border-line bg-surface-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt={img.name} className={`w-full h-full object-cover ${img.status === 'done' ? '' : 'opacity-50'}`} />
                  {img.status === 'uploading' ? (
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-ink">Uploading…</span>
                  ) : null}
                  {img.status === 'failed' ? (
                    <span title={img.error} className="absolute inset-x-0 bottom-0 bg-danger text-white text-[10.5px] text-center py-0.5">
                      Failed
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => img.status !== 'uploading' && images.remove(img.key)}
                    aria-label={`Remove ${img.name}`}
                    className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-black/65 text-white border-0 text-[13px] leading-none cursor-pointer"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {note || images.hasFailed ? (
            <p role="alert" className="m-0 text-[12px] text-danger">
              {note ?? 'Some images failed to upload — remove them or try again.'}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={files}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label="Choose images to attach"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <GhostButton type="button" onClick={() => files.current?.click()} disabled={images.items.length >= MAX_COMMENT_IMAGES}>
                Attach images
              </GhostButton>
              {images.items.length > 0 ? (
                <span className="text-[12px] text-ink-3 tabular-nums">
                  {images.items.length}/{MAX_COMMENT_IMAGES}
                </span>
              ) : null}
            </div>
            <PrimaryButton type="submit" disabled={!canPost}>
              {pending ? 'Posting…' : images.uploading ? 'Uploading…' : 'Comment'}
            </PrimaryButton>
          </div>
        </form>
      ) : null}
      {items.length === 0 ? <p className="m-0 text-[12.5px] text-ink-3">No activity yet.</p> : null}
      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {items.map((item) =>
          item.type === 'comment' ? (
            <li key={item.id} className="flex flex-col gap-0.5 min-w-0 pl-3 border-l-2 border-line-strong">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[12.5px] font-semibold text-ink">{item.comment.authorName}</span>
                <span className="text-[11px] text-ink-3">{dateTime12(item.at)}</span>
              </div>
              {item.comment.text ? (
                <p className="m-0 text-[13px] text-ink-2 whitespace-pre-wrap break-words">{item.comment.text}</p>
              ) : null}
              <CommentImages
                items={item.comment.attachments}
                onOpen={(index) => setViewer({ images: item.comment.attachments, index })}
              />
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
      {viewer ? (
        <ImageLightbox
          images={viewer.images.map((a) => ({ src: photoLargeUrl(a.url), alt: a.fileName, href: a.url }))}
          index={viewer.index}
          onIndex={(index) => setViewer({ ...viewer, index })}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </div>
  );
}
