import { useState, useRef, useEffect, forwardRef } from 'react';
import './ScrubberInput.css';

interface ScrubberInputProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  className?: string;
  step?: number;
  disabled?: boolean;
}

export const ScrubberInput = forwardRef<HTMLInputElement, ScrubberInputProps>(({
  value,
  min,
  max,
  onChange,
  onMouseDown,
  className = '',
  step = 1,
  disabled = false,
}, ref) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const startXRef = useRef(0);
  const startValueRef = useRef(0);
  const dragThreshold = useRef(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

  // Update editValue when value prop changes and we're not editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(String(value));
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      
      // If we've moved more than 3 pixels, consider it a drag
      if (Math.abs(deltaX) > 3) {
        dragThreshold.current = true;
        document.body.style.cursor = 'ew-resize';
      }
      
      if (dragThreshold.current) {
        const sensitivity = 0.5;
        const valueDelta = Math.round(deltaX * sensitivity);
        const newValue = Math.max(min, Math.min(max, startValueRef.current + valueDelta));
        onChange(newValue);
      }
    };

    const handleMouseUp = () => {
      // If we didn't drag, enter edit mode
      if (!dragThreshold.current) {
        setIsEditing(true);
        setTimeout(() => {
          inputRef.current?.select();
        }, 0);
      }
      
      setIsDragging(false);
      dragThreshold.current = false;
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, min, max, onChange]);

  const handleMouseDownOnInput = (e: React.MouseEvent<HTMLInputElement>) => {
    // Stop propagation to prevent node dragging
    if (onMouseDown) {
      onMouseDown(e);
    }
    
    // If already editing or disabled, don't interfere
    if (isEditing || disabled) return;

    // Start tracking for potential drag
    setIsDragging(true);
    dragThreshold.current = false;
    startXRef.current = e.clientX;
    startValueRef.current = value;
  };

  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Allow clicking inside the input to position cursor when editing
    if (isEditing) {
      e.stopPropagation();
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    
    // Apply the edited value with clamping
    const numValue = parseInt(editValue, 10);
    if (!isNaN(numValue)) {
      const clampedValue = Math.max(min, Math.min(max, numValue));
      onChange(clampedValue);
      // Update to clamped value
      setEditValue(String(clampedValue));
    } else {
      // If invalid, reset to current value
      setEditValue(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Stop propagation of Delete and Backspace to prevent node deletion while editing
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.stopPropagation();
    }
    
    // Allow Cmd+A / Ctrl+A to select all (handle both 'a' and 'A')
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      e.stopPropagation();
      // Don't prevent default - let the browser handle select all naturally
      return;
    }
    
    if (e.key === 'Enter' || e.key === 'Escape') {
      setIsEditing(false);
      inputRef.current?.blur();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Allow empty string (for deletion)
    if (val === '') {
      setEditValue(val);
      return;
    }
    
    // Allow just a minus sign (for typing negative numbers)
    if (val === '-') {
      setEditValue(val);
      return;
    }
    
    // Allow negative sign and digits only, max 3 digits (plus optional negative sign)
    // This allows for values like -10, 360, etc.
    val = val.replace(/[^\d-]/g, ''); // Remove non-digit, non-minus characters
    
    // Only allow minus at the start
    if (val.includes('-')) {
      const parts = val.split('-');
      val = '-' + parts.join('');
    }
    
    // Limit to 3 digits (not counting the minus sign)
    const numericPart = val.replace('-', '');
    if (numericPart.length > 3) {
      val = val.startsWith('-') ? '-' + numericPart.slice(0, 3) : numericPart.slice(0, 3);
    }
    
    // Allow input while editing - don't clamp or update parent until blur
    setEditValue(val);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Enter edit mode when focused (either by click or keyboard shortcut)
    if (!isEditing) {
      setIsEditing(true);
      setEditValue(String(value));
      // Select all text after entering edit mode
      setTimeout(() => {
        e.target.select();
      }, 0);
    } else {
      e.target.select();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={isEditing ? editValue : value}
      onChange={handleChange}
      onMouseDown={handleMouseDownOnInput}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      data-slot="input"
      className={`scrubber-input ${!isEditing ? 'scrubber-input-scrubbing' : 'scrubber-input-editing'} ${className}`}
    />
  );
});

ScrubberInput.displayName = 'ScrubberInput';