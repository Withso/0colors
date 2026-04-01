import { Palette, RefreshCw, Type, Wand2, Film, Grid, Menu } from 'lucide-react';
import { Button } from '../ui/button';

interface ModeSidebarProps {
  activeMode: 'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout';
  onModeChange: (mode: 'color' | 'variables' | 'text' | 'components' | 'animation' | 'layout') => void;
  onNavigateToProjects: () => void;
}

export function ModeSidebar({ activeMode, onModeChange, onNavigateToProjects }: ModeSidebarProps) {
  const modes = [
    { id: 'color' as const, icon: Palette, label: 'Color' },
    { id: 'variables' as const, icon: RefreshCw, label: 'Variables' },
    { id: 'text' as const, icon: Type, label: 'Text' },
    { id: 'components' as const, icon: Wand2, label: 'Components' },
    { id: 'animation' as const, icon: Film, label: 'Animation' },
    { id: 'layout' as const, icon: Grid, label: 'Layout' },
  ];

  return null;
}