/**
 * useCanvasEvents — extracted from App.tsx
 *
 * Handles window event listeners for:
 *   1. Drag selection from ColorCanvas (dragSelectNodes)
 *   2. Batch node shifts from canvas auto-layout (batchShiftNodes)
 *   3. Dev Mode webhook apply (devModeWebhookApply)
 *   4. Figma plugin message handler
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import { useNodeUpdate } from '../store/useNodeUpdate';
import { isInFigma } from '../utils/app-helpers';

export function useCanvasEvents() {
  const setSelectedNodeId = useStore(s => s.setSelectedNodeId);
  const setSelectedNodeIds = useStore(s => s.setSelectedNodeIds);
  const setAllNodes = useStore(s => s.setAllNodes);
  const { updateNode } = useNodeUpdate();

  // Handle drag selection from ColorCanvas
  useEffect(() => {
    const handleDragSelect = (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeIds: string[], addToSelection: boolean, isRealtime?: boolean }>;
      const { nodeIds } = customEvent.detail;

      if (nodeIds && nodeIds.length > 0) {
        // The ColorCanvas already calculated the final selection state
        // Just apply it directly
        setSelectedNodeId(nodeIds[0]);
        setSelectedNodeIds(nodeIds);
      }
    };

    window.addEventListener('dragSelectNodes', handleDragSelect);
    return () => window.removeEventListener('dragSelectNodes', handleDragSelect);
  }, []);

  // Handle batch node shifts from canvas auto-layout (expand/collapse, theme switch)
  useEffect(() => {
    const handleBatchShift = (evt: Event) => {
      const entries = (evt as CustomEvent<{ id: string; dy: number }[]>).detail;
      if (!entries || entries.length === 0) return;
      setAllNodes(prev => {
        const shiftMap = new Map(entries.map(e => [e.id, e.dy]));
        return prev.map(node => {
          const dy = shiftMap.get(node.id);
          if (dy === undefined) return node;
          return { ...node, position: { x: node.position.x, y: node.position.y + dy } };
        });
      });
    };
    window.addEventListener('batchShiftNodes', handleBatchShift);
    return () => window.removeEventListener('batchShiftNodes', handleBatchShift);
  }, []);

  // ── Dev Mode: Webhook apply listener ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.nodeId && detail?.hue !== undefined) {
        updateNode(detail.nodeId, {
          hue: detail.hue,
          saturation: detail.saturation,
          lightness: detail.lightness,
        });
      }
    };
    window.addEventListener('devModeWebhookApply', handler);
    return () => window.removeEventListener('devModeWebhookApply', handler);
  }, [updateNode]);

  // ── Figma plugin message handler ──
  useEffect(() => {
    if (!isInFigma) return;

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'styles-created') {
        // Styles created successfully
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);
}
