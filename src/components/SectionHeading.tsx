export function SectionHeading({
  label,
  title,
  description,
  center = true,
}: {
  label?: string;
  title: string;
  description?: string;
  center?: boolean;
}) {
  return (
    <div className={`max-w-3xl ${center ? "mx-auto text-center" : ""} mb-12 md:mb-16`}>
      {label && (
        <span className="inline-block text-xs font-medium uppercase tracking-[0.15em] text-primary mb-4 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          {label}
        </span>
      )}
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight leading-tight font-[var(--font-heading)]">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base md:text-lg text-grey leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
