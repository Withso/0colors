"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import "./switch.css";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={className}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
