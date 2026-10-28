import { markTitles, toBlocks } from './thread';

/** Prose with the reader's own book titles set in the book face (DESIGN.md: serif names it). */
export function Prose({ text, titles }: { text: string; titles: string[] }) {
  const runs = (line: string) =>
    markTitles(line, titles).map((run, i) =>
      run.title ? (
        <span key={i} className="font-display font-medium text-paper-900">
          {run.text}
        </span>
      ) : (
        <span key={i}>{run.text}</span>
      ),
    );
  return (
    <div className="flex flex-col gap-2">
      {toBlocks(text).map((block, i) =>
        block.kind === 'p' ? (
          <p key={i}>{runs(block.text)}</p>
        ) : (
          <ul key={i} className="flex flex-col gap-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-moss-600" />
                <span>{runs(item)}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
