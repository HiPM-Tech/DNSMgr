import { useState, type ReactNode } from 'react';
import { Dialog } from 'tdesign-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnOverlayClick?: boolean;
}

export function Modal({ title, onClose, children, size = 'md', closeOnOverlayClick = false }: ModalProps) {
  const widths = { sm: 420, md: 560, lg: 760 };
  const [visible, setVisible] = useState(true);

  const requestClose = () => {
    setVisible(false);
  };

  return (
    <Dialog
      visible={visible}
      destroyOnClose
      placement="center"
      header={title}
      footer={false}
      width={widths[size]}
      dialogClassName="app-td-dialog"
      closeOnOverlayClick={closeOnOverlayClick}
      onCancel={requestClose}
      onClose={requestClose}
      onClosed={onClose}
    >
      <div className="app-td-dialog__body">{children}</div>
    </Dialog>
  );
}
