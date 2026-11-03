// Confirmation for restoring the demo canvas to its original state.
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { resetSample } from '../persist';
import { useUI } from '../ui-store';
import { Button, Dialog } from '../ui';

export function ResetDemoDialog() {
  const open = useUI((s) => s.resetOpen);
  const setOpen = useUI((s) => s.setResetOpen);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Reset the demo?"
      description="Everything on the demo canvas goes back to how it started. Your other canvases aren’t touched."
      className="w-[min(92vw,420px)]"
    >
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button
          variant="primary"
          autoFocus
          onClick={() => {
            setOpen(false);
            resetSample()
              .then(() => toast.success('Demo reset'))
              .catch((err: unknown) => toast.error('Could not reset the demo', { description: err instanceof Error ? err.message : String(err) }));
          }}
        >
          <RotateCcw size={13} /> Reset demo
        </Button>
      </div>
    </Dialog>
  );
}
