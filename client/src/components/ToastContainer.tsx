import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToasts } from '../hooks/useToast';

const icons = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error: <XCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

const borders = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  info: 'border-l-blue-500',
};

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={`flex items-start gap-3 bg-white border border-gray-200 border-l-4 ${borders[toast.type]} rounded-lg shadow-lg px-4 py-3 min-w-[280px] max-w-sm transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm text-gray-700">{toast.message}</p>
      <button onClick={onRemove} className="text-gray-400 hover:text-gray-600 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToasts();
  // Just render — removal is handled by the timeout in useToast
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onRemove={() => {}} />
        </div>
      ))}
    </div>
  );
}
