import { Skeleton } from "./ui";

export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "table" }) {
  return (
    <div className="mx-auto max-w-[1320px] px-page pb-16 pt-8 md:pt-14" aria-busy="true" aria-label="Carregando">
      <Skeleton className="mb-4 size-12 rounded-[10px]" />
      <Skeleton className="h-10 w-56" />
      <Skeleton className="mt-4 h-4 w-[min(420px,80%)]" />
      {variant === "table" ? (
        <div className="mt-12 space-y-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-12 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-[10px]" />
            ))}
          </div>
          <div className="mt-12 grid gap-10 xl:grid-cols-[1.5fr_1fr]">
            <Skeleton className="h-96 rounded-[10px]" />
            <div className="space-y-3">
              <Skeleton className="h-32 rounded-[10px]" />
              <Skeleton className="h-32 rounded-[10px]" />
              <Skeleton className="h-32 rounded-[10px]" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
