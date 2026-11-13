import { useEffect, useRef } from 'react';

const ACCEPTED = /\.(rw|json)$/i;

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

/** Lets the user drop a `.rw` / `.json` file anywhere on the window. */
export function useFileDrop(onFile: (file: File) => void): void {
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && ACCEPTED.test(file.name)) onFileRef.current(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
