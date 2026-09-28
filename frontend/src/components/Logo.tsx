import { Flame } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-leather-900 ring-1 ring-ember-500/60">
        <Flame className="h-4 w-4 text-ember-500" strokeWidth={2.2} />
      </span>
      <span className="text-[17px] font-semibold tracking-tight">
        ez<span className="text-ember-400">wallet</span>
      </span>
    </div>
  );
}
