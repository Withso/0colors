// ConnectedColorCanvas — thin wrapper; ColorCanvas now reads from the Zustand store directly.
import { ColorCanvas } from './ColorCanvas';

interface ConnectedColorCanvasProps {
  /** Only props that can't come from the store */
  onNavigateToProjects: () => void;
}

export function ConnectedColorCanvas({ onNavigateToProjects }: ConnectedColorCanvasProps) {
  return (
    <ColorCanvas
      onNavigateToProjects={onNavigateToProjects}
    />
  );
}
