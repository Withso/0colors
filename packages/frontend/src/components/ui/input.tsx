import * as React from "react";

import "./input.css";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={className}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

export { Input };
