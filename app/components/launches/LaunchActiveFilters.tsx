import { X } from "lucide-react";
import type { LaunchFilters } from "@/app/types/launches";
import { activeFilterLabels } from "@/app/utils/launches";

export function LaunchActiveFilters({
  filters,
  onRemove,
  onClear,
}: {
  filters: LaunchFilters;
  onRemove: (key: keyof LaunchFilters) => void;
  onClear: () => void;
}) {
  const labels = activeFilterLabels(filters);
  if (!labels.length) return null;
  return (
    <div className="launchActiveFilters" aria-label="Active filters">
      {labels.map((item) => (
        <button key={String(item.key)} onClick={() => onRemove(item.key)}>
          {item.label}
          <X size={11} />
        </button>
      ))}
      <button className="clearLaunchFilters" onClick={onClear}>
        Clear all
      </button>
    </div>
  );
}
