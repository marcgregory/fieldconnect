import { Spinner } from '@fieldconnect/ui';

export default function MobileLoading() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-slate-500">Loading...</p>
    </div>
  );
}