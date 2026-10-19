import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DatePicker({
  value,
  onChange,
  label = "Data",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-[180px]"
      />
    </div>
  );
}