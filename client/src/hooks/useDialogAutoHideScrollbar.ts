import { useEffect } from 'react';

const SCROLLBAR_ACTIVE_CLASS = 'app-dialog-scrollbar--active';
const SCROLLABLE_DIALOG_SELECTOR = [
  '.app-td-dialog .t-dialog__body',
  '.app-td-dialog .app-confirm-dialog__message',
  '.app-td-dialog .page-list--scroll',
  '.app-td-dialog .backup-code-list',
].join(', ');

export function useDialogAutoHideScrollbar() {
  useEffect(() => {
    const timers = new WeakMap<HTMLElement, number>();
    const activeElements = new Set<HTMLElement>();

    const hideScrollbar = (element: HTMLElement) => {
      element.classList.remove(SCROLLBAR_ACTIVE_CLASS);
      activeElements.delete(element);
      timers.delete(element);
    };

    const showScrollbar = (element: HTMLElement) => {
      if (element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth) return;

      element.classList.add(SCROLLBAR_ACTIVE_CLASS);
      activeElements.add(element);

      const existingTimer = timers.get(element);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const timer = window.setTimeout(() => hideScrollbar(element), 110);
      timers.set(element, timer);
    };

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const scrollArea = target.matches(SCROLLABLE_DIALOG_SELECTOR)
        ? target
        : target.closest(SCROLLABLE_DIALOG_SELECTOR);

      if (scrollArea instanceof HTMLElement) {
        showScrollbar(scrollArea);
      }
    };

    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      activeElements.forEach((element) => {
        const timer = timers.get(element);
        if (timer) window.clearTimeout(timer);
        hideScrollbar(element);
      });
    };
  }, []);
}
