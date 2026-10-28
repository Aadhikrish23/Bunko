import { BookOpenCheck, Library, MessageCircleQuestion } from 'lucide-react';
import type { ReactNode } from 'react';

export function Starters({ onPick, sample }: { onPick: (text: string) => void; sample: { reading?: string; next?: string } }) {
  const reading = sample.reading ?? 'Piranesi';
  const next = sample.next ?? 'Circe';
  const groups: { icon: ReactNode; label: string; examples: string[] }[] = [
    {
      icon: <BookOpenCheck strokeWidth={1.5} className="h-4 w-4" />,
      label: 'Log your reading',
      examples: [`I started ${next}`, `finished ${reading}, 5 stars`],
    },
    {
      icon: <Library strokeWidth={1.5} className="h-4 w-4" />,
      label: 'Tidy your shelves',
      examples: [`put ${next} on my comfort reads shelf`, 'create a shelf called book club'],
    },
    {
      icon: <MessageCircleQuestion strokeWidth={1.5} className="h-4 w-4" />,
      label: 'Ask about your library',
      examples: ["what's on my want to read list?", 'what should I read next?'],
    },
  ];
  return (
    <div className="flex flex-col gap-8 py-6 sm:py-10">
      <div className="max-w-lg">
        <h2 className="font-display text-2xl text-paper-900 text-balance">What happened in your reading?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-paper-700">
          Tell me in your own words and I’ll update your library: what you started, finished or gave up on, how you’d
          rate it, notes, shelves. Or ask me anything about your books.
        </p>
      </div>
      <dl className="grid gap-6 sm:grid-cols-3 sm:gap-5">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-2.5 border-t border-paper-200 pt-4">
            <dt className="flex items-center gap-2 text-sm font-medium text-paper-800">
              <span className="text-moss-600" aria-hidden="true">
                {group.icon}
              </span>
              {group.label}
            </dt>
            {group.examples.map((example) => (
              <dd key={example}>
                <button
                  type="button"
                  onClick={() => onPick(example)}
                  className="focus-visible:focus-ring w-full rounded-md px-2 py-1.5 -mx-2 text-left text-sm text-paper-700 transition-colors duration-150 hover:bg-paper-100 hover:text-paper-900"
                >
                  “{example}”
                </button>
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </div>
  );
}
