import { useEffect } from 'react';

const SCROLLBAR_ACTIVE_CLASS = 'app-dialog-scrollbar--active';
const SCROLLABLE_DIALOG_SELECTOR = [
  '.app-td-dialog .t-dialog__body',
  '.app-td-dialog .app-confirm-dialog__message',
  '.app-td-dialog .page-list--scroll',
  '.app-td-dialog .backup-code-list',
].join(', ');
const DIALOG_SELECTOR = '.t-dialog';
const DIALOG_ORIGIN_MAX_AGE = 1200;
const DIALOG_OPENING_CLASSES = [
  't-dialog-zoom-enter',
  't-dialog-zoom-enter-from',
  't-dialog-zoom-enter-active',
  't-dialog-zoom-appear',
  't-dialog-zoom-appear-from',
  't-dialog-zoom-appear-active',
];
const DIALOG_LEAVING_CLASSES = ['t-dialog-zoom-exit', 't-dialog-zoom-exit-from', 't-dialog-zoom-exit-active'];

interface DialogPointerOrigin {
  x: number;
  y: number;
  timestamp: number;
  token: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hasAnyClass = (element: HTMLElement, classNames: string[]) => classNames.some((className) => element.classList.contains(className));

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

  useEffect(() => {
    let originToken = 0;
    let lastPointerOrigin: DialogPointerOrigin | null = null;
    let disposed = false;

    const applyDialogMotionOrigin = (dialog: HTMLElement, retryCount = 0) => {
      if (disposed || hasAnyClass(dialog, DIALOG_LEAVING_CLASSES)) return;

      const rect = dialog.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        if (retryCount < 4) {
          window.requestAnimationFrame(() => applyDialogMotionOrigin(dialog, retryCount + 1));
        }
        return;
      }

      const now = Date.now();
      const freshOrigin = lastPointerOrigin && now - lastPointerOrigin.timestamp <= DIALOG_ORIGIN_MAX_AGE
        ? lastPointerOrigin
        : null;
      const token = freshOrigin?.token ?? 0;

      if (dialog.dataset.appDialogMotionToken === String(token) && dialog.style.getPropertyValue('--app-dialog-fly-x')) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const rawOriginX = freshOrigin?.x ?? centerX;
      const rawOriginY = freshOrigin?.y ?? centerY + 18;
      const maxFlyX = Math.max(160, Math.min(window.innerWidth * 0.45, 420));
      const maxFlyY = Math.max(140, Math.min(window.innerHeight * 0.45, 340));
      const flyX = clamp(rawOriginX - centerX, -maxFlyX, maxFlyX);
      const flyY = clamp(rawOriginY - centerY, -maxFlyY, maxFlyY);
      const originX = clamp(rawOriginX - rect.left, 0, rect.width);
      const originY = clamp(rawOriginY - rect.top, 0, rect.height);

      dialog.dataset.appDialogMotionToken = String(token);
      dialog.style.setProperty('--app-dialog-origin-x', `${originX}px`);
      dialog.style.setProperty('--app-dialog-origin-y', `${originY}px`);
      dialog.style.setProperty('--app-dialog-fly-x', `${flyX}px`);
      dialog.style.setProperty('--app-dialog-fly-y', `${flyY}px`);
      dialog.style.setProperty('--app-dialog-exit-x', `${clamp(flyX * 0.18, -52, 52)}px`);
      dialog.style.setProperty('--app-dialog-exit-y', `${clamp(flyY * 0.18, -42, 42)}px`);
    };

    const prepareDialog = (dialog: HTMLElement) => {
      applyDialogMotionOrigin(dialog);
    };

    const prepareDialogsFrom = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;

      if (node.matches(DIALOG_SELECTOR)) {
        prepareDialog(node);
      }

      node.querySelectorAll<HTMLElement>(DIALOG_SELECTOR).forEach(prepareDialog);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;

      originToken += 1;
      lastPointerOrigin = {
        x: event.clientX,
        y: event.clientY,
        timestamp: Date.now(),
        token: originToken,
      };
    };

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(prepareDialogsFrom);
          return;
        }

        if (
          mutation.type === 'attributes'
          && mutation.target instanceof HTMLElement
          && mutation.target.matches(DIALOG_SELECTOR)
          && hasAnyClass(mutation.target, DIALOG_OPENING_CLASSES)
        ) {
          prepareDialog(mutation.target);
        }
      });
    });

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR).forEach(prepareDialog);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      disposed = true;
      document.removeEventListener('pointerdown', handlePointerDown, true);
      observer.disconnect();
    };
  }, []);
}
