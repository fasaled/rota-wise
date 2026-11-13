import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/language-context';

interface State {
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i.test(
    `${error.name} ${error.message}`,
  );
}

function ErrorScreen({ error }: { error: Error }) {
  const { t } = useLanguage();
  const outdated = isChunkLoadError(error);

  return (
    <div role="alert" className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">
          {outdated ? t('error.outdated.title') : t('error.unexpected.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {outdated ? t('error.outdated.description') : t('error.unexpected.description')}
        </p>
        {!outdated && (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <Button onClick={() => window.location.reload()}>{t('error.reload')}</Button>
      </div>
    </div>
  );
}

/**
 * Last line of defence: a render error anywhere below shows a recoverable
 * screen instead of unmounting the whole app. The working copy in IndexedDB is
 * untouched, so reloading restores the last saved state.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Rotawise] Unhandled render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) return <ErrorScreen error={this.state.error} />;
    return this.props.children;
  }
}
