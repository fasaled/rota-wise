import { useCallback, useEffect, useRef } from 'react';
import { useLanguage } from '@/context/language-context';
import type { Driver } from 'driver.js';

export function useMetadataModeTour(): () => Promise<void> {
  const { t } = useLanguage();
  const driverRef = useRef<Driver | null>(null);

  const destroy = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
      driverRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return useCallback(async () => {
    destroy();

    const [{ driver }] = await Promise.all([
      import('driver.js'),
      import('driver.js/dist/driver.css'),
    ]);

    const skipLabel = t('page.metadataTour.skip');

    const driverObj = driver({
      showProgress: true,
      allowClose: true,
      smoothScroll: true,
      overlayColor: 'black',
      overlayOpacity: 0.55,
      stageRadius: 8,
      stagePadding: 4,
      popoverOffset: 12,
      nextBtnText: t('page.metadataTour.next'),
      prevBtnText: t('page.metadataTour.back'),
      doneBtnText: t('page.metadataTour.done'),
      progressText: t('page.metadataTour.progress'),
      popoverClass: 'rotawise-metadata-tour',
      onPopoverRender: (popover) => {
        popover.closeButton.setAttribute('aria-label', skipLabel);
        popover.closeButton.setAttribute('title', skipLabel);
      },
      steps: [
        {
          popover: {
            title: t('page.metadataTour.welcome.title'),
            description: t('page.metadataTour.welcome.description'),
          },
        },
        {
          element: '[data-tour="metadata-header"]',
          popover: {
            title: t('page.metadataTour.header.title'),
            description: t('page.metadataTour.header.description'),
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="month-nav"]',
          popover: {
            title: t('page.metadataTour.monthNav.title'),
            description: t('page.metadataTour.monthNav.description'),
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '[data-tour="filter-bar"]',
          popover: {
            title: t('page.metadataTour.filterBar.title'),
            description: t('page.metadataTour.filterBar.description'),
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '[data-tour="calendar-grid"]',
          popover: {
            title: t('page.metadataTour.grid.title'),
            description: t('page.metadataTour.grid.description'),
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '[data-tour="calendar-chip"]',
          popover: {
            title: t('page.metadataTour.chip.title'),
            description: t('page.metadataTour.chip.description'),
            side: 'top',
            align: 'center',
          },
        },
        {
          element: '[data-tour="legend"]',
          popover: {
            title: t('page.metadataTour.legend.title'),
            description: t('page.metadataTour.legend.description'),
            side: 'top',
            align: 'center',
          },
        },
        {
          popover: {
            title: t('page.metadataTour.farewell.title'),
            description: t('page.metadataTour.farewell.description'),
          },
        },
      ],
    });

    driverRef.current = driverObj;
    driverObj.drive();
  }, [t, destroy]);
}
