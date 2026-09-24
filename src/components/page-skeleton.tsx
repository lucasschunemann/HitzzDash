import { Skeleton } from "./ui";

export function PageSkeleton({ variant = "dashboard" }: { variant?: "dashboard" | "table" }) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-6 md:px-8 md:pt-9" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-80" />
      {variant === "table" ? (
        <div className="mt-8 space-y-2">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
            <Skeleton className="h-96" />
            <div className="space-y-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
