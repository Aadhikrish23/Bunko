interface BookCoverProps {
  title: string;
  coverImageUrl?: string | null;
  className?: string;
}

const PLACEHOLDER_PALETTE = ['bg-moss-500', 'bg-ember-500', 'bg-paper-700'];

function paletteIndex(title: string): number {
  let sum = 0;
  for (let i = 0; i < title.length; i += 1) sum += title.charCodeAt(i);
  return sum % PLACEHOLDER_PALETTE.length;
}

export function BookCover({ title, coverImageUrl, className = '' }: BookCoverProps) {
  if (coverImageUrl) {
    return (
      <img
        src={coverImageUrl}
        alt={`Cover of ${title}`}
        className={`aspect-[2/3] w-full rounded-md object-cover shadow-card ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex aspect-[2/3] w-full items-center justify-center rounded-md shadow-card ${PLACEHOLDER_PALETTE[paletteIndex(title)]} ${className}`}
    >
      <span className="font-display text-3xl text-paper-50/90">{title.charAt(0).toUpperCase()}</span>
    </div>
  );
}
