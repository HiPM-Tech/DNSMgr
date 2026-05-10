import { useEffect, useState } from 'react';
import { Alert, Button } from 'tdesign-react';
import { CloseIcon } from 'tdesign-icons-react';
import { useToasts } from '../hooks/useToast';
import './ToastContainer.css';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const alertTheme = {
  success: 'success',
  error: 'error',
  info: 'info',
} as const;

function ToastItem({ toast }: { toast: Toast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div className={`app-toast ${visible ? 'app-toast--visible' : ''}`}>
      <Alert
        theme={alertTheme[toast.type]}
        message={toast.message}
        close={(
          <Button shape="square" variant="text" size="small" icon={<CloseIcon />} />
        )}
      />
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToasts();

  return (
    <div className="app-toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
